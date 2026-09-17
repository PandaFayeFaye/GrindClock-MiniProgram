// Lists every unlocked player for the "世界" screen, ranked by 摸鱼资历 so
// the World doubles as a leaderboard -- the actual "compare yourself to
// friends" motivation hook, not just a directory to steal from. Small
// population for now (see MOYU_TOWN_SPEC.md 8.1) so this returns everyone
// in one page -- revisit with real pagination once the unlocked count
// gets large.
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

  // Rank everyone (including the caller) by companionExp first -- ties
  // broken by titleIndex, then by who's been active more recently.
  const ranked = profiles
    .slice()
    .sort((a, b) =>
      (b.companionExp || 0) - (a.companionExp || 0) ||
      (b.titleIndex || 0) - (a.titleIndex || 0) ||
      (b.lastActiveAt || 0) - (a.lastActiveAt || 0),
    )
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const mine = ranked.find((p) => p._id === OPENID);
  const myRank = mine ? mine.rank : null;

  const list = ranked
    .filter((p) => p._id !== OPENID)
    .map((p) => ({
      openid: p._id,
      rank: p.rank,
      nickname: nicknameByOpenid[p._id] || "神秘打工人",
      companionTitle: TOWN_LEVEL_TITLES[p.titleIndex || 0],
      titleIndex: p.titleIndex || 0,
      companionExp: p.companionExp || 0,
      lastActiveAt: p.lastActiveAt || null,
      inventoryCount: Object.values(p.inventory || {}).reduce((s, n) => s + n, 0),
      decorations: p.decorations || [],
    }));

  return { ok: true, list, myRank, totalRanked: ranked.length };
};
