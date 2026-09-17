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

// "打卡超时通知" template (公共模板库 #74908), fields confirmed from its
// detail page: thing1=缺卡人, thing2=提醒原因, time3=最后打卡时间,
// thing4=处理建议. `thing` fields are capped at 20 chars by WeChat.
const SUBSCRIBE_TEMPLATE_ID = "eqyBvDNghz6B1MqTm1MluJ_ttKt9c811eQ3yZRIRGFw";
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
      const [selfProfileRes, targetProfileRes] = await Promise.all([
        db.collection("userProfile").where({ _openid: OPENID }).limit(1).get(),
        db.collection("userProfile").where({ _openid: targetOpenid }).limit(1).get(),
      ]);
      const selfNickname = (selfProfileRes.data[0] && selfProfileRes.data[0].nickname) || "牛马搭子";
      const targetNickname = (targetProfileRes.data[0] && targetProfileRes.data[0].nickname) || "打工人";
      const lastCheckin = target.lastDailyRationAt
        ? new Date(target.lastDailyRationAt + CN_TZ_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ")
        : "从未打卡";

      await cloud.openapi.subscribeMessage.send({
        touser: targetOpenid,
        templateId: SUBSCRIBE_TEMPLATE_ID,
        page: "pages/town/index",
        data: {
          thing1: { value: targetNickname.slice(0, 20) },
          thing2: { value: `被${selfNickname}批评啦`.slice(0, 20) },
          time3: { value: lastCheckin },
          thing4: { value: "快去摸鱼小镇签到" },
        },
      });
      pushed = true;
    } catch (err) {
      console.error("subscribeMessage.send failed", err);
    }
  }

  return { ok: true, pushed };
};
