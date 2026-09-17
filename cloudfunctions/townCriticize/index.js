// "批评" a friend who hasn't checked into the town today -- logs the call-out
// and, if a WeChat subscribe-message template has been configured (see
// SUBSCRIBE_TEMPLATE_ID below), pushes them an actual WeChat notification.
//
// IMPORTANT -- the push half needs one-time manual setup that only the mini
// program's own admin can do (no API for it):
//   1. In the WeChat mini program admin console (mp.weixin.qq.com) go to
//      "订阅消息" and select/create a one-time template, e.g. one with a
//      "thing" field (提醒内容) and a "time" field (提醒时间). Copy its
//      template id into SUBSCRIBE_TEMPLATE_ID below, and set the two
//      `.data` keys to match that template's actual field names (they vary
//      per template, e.g. "thing1"/"time2" -- check the template detail
//      page for the real key names).
//   2. The target user must have granted that template at least once via
//      wx.requestSubscribeMessage({tmplIds: [SUBSCRIBE_TEMPLATE_ID]}) on the
//      client -- each grant is single-use for a one-time template, so the
//      client should ask again next time they open the town if they want to
//      keep being reachable. Until SUBSCRIBE_TEMPLATE_ID is filled in, this
//      silently skips the push and only records the in-app callout.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SUBSCRIBE_TEMPLATE_ID = ""; // TODO: fill in once a template exists
const CRITICIZE_COOLDOWN_MS = 12 * 3_600_000;
const CN_TZ_OFFSET_MS = 8 * 3_600_000;

function cnDateKey(ts) {
  return new Date(ts + CN_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const targetOpenid = event && event.targetOpenid;
  if (!targetOpenid || targetOpenid === OPENID) return { ok: false, error: "invalid_target" };

  const [selfRes, targetRes] = await Promise.all([
    db.collection("townProfiles").doc(OPENID).get().catch(() => null),
    db.collection("townProfiles").doc(targetOpenid).get().catch(() => null),
  ]);
  const self = selfRes && selfRes.data;
  const target = targetRes && targetRes.data;
  if (!self || !self.unlocked) return { ok: false, error: "not_unlocked" };
  if (!target || !target.unlocked) return { ok: false, error: "target_not_found" };

  const alreadyCheckedIn = target.lastDailyRationAt && cnDateKey(target.lastDailyRationAt) === cnDateKey(Date.now());
  if (alreadyCheckedIn) return { ok: false, error: "already_checked_in" };

  const now = Date.now();
  const recent = await db
    .collection("townJobLog")
    .where({ openid: OPENID, targetOpenid, type: "criticize", createdAt: _.gte(now - CRITICIZE_COOLDOWN_MS) })
    .count();
  if (recent.total > 0) return { ok: false, error: "criticize_cooldown" };

  await db.collection("townJobLog").add({
    data: { openid: OPENID, targetOpenid, type: "criticize", expGained: 0, itemsGained: {}, createdAt: now },
  });

  let pushed = false;
  if (SUBSCRIBE_TEMPLATE_ID) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: targetOpenid,
        templateId: SUBSCRIBE_TEMPLATE_ID,
        page: "pages/town/index",
        data: {
          thing1: { value: "搭子今天还没来摸鱼小镇打卡哦" },
          time2: { value: new Date(now + CN_TZ_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") },
        },
      });
      pushed = true;
    } catch (err) {
      console.error("subscribeMessage.send failed", err);
    }
  }

  return { ok: true, pushed };
};
