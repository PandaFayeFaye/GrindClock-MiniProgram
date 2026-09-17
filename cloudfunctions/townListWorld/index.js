// Lists every unlocked player for the "世界" screen. Small population for
// now (see MOYU_TOWN_SPEC.md 8.1) so this returns everyone in one page --
// revisit with real pagination once the unlocked count gets large.
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const TOWN_LEVEL_TITLES = [
  "实习生", "新人专员", "资深员工", "组长", "主管", "经理",
  "高级经理", "总监", "VP副总裁", "总经理", "CEO", "董事长",
];

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  const res = await db.collection("townProfiles").where({ unlocked: true }).limit(100).get();
  const profiles = res.data || [];

  const openids = profiles.map((p) => p._id);
  let nicknameByOpenid = {};
  if (openids.length > 0) {
    const profileRes = await db.collection("userProfile").where({ _openid: _.in(openids) }).limit(100).get();
    nicknameByOpenid = (profileRes.data || []).reduce((acc, row) => {
      acc[row._openid] = row.nickname;
      return acc;
    }, {});
  }

  const list = profiles
    .filter((p) => p._id !== OPENID)
    .map((p) => ({
      openid: p._id,
      nickname: nicknameByOpenid[p._id] || "神秘打工人",
      companionTitle: TOWN_LEVEL_TITLES[p.titleIndex || 0],
      titleIndex: p.titleIndex || 0,
      companionExp: p.companionExp || 0,
      lastActiveAt: p.lastActiveAt || null,
      inventoryCount: Object.values(p.inventory || {}).reduce((s, n) => s + n, 0),
      decorations: p.decorations || [],
    }))
    .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));

  return { ok: true, list };
};
