import { useState, useCallback } from "react";
import { View, Text, Button, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchTownProfile, fetchWorld, stealFrom, skimFrom, criticizeForNotCheckingIn, type WorldEntry } from "../../lib/cloudTown";
import { fetchUserProfile } from "../../lib/cloud";
import { characterImageSrc, type AnimalKey } from "../../lib/avatar";
import { ITEM_LABEL, TOWN_SCENE_BG, HUD_ICON_TROPHY, TOWN_DECORATIONS, SUBSCRIBE_TEMPLATE_ID, buildingImageSrc } from "../../lib/town";
import "./index.scss";

function relativeTime(ts: number | null): string {
  if (!ts) return "很久没来过";
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "刚刚在线";
  if (diffMin < 60) return `${diffMin} 分钟前来过`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前来过`;
  return `${Math.floor(diffH / 24)} 天前来过`;
}

// Deterministic pseudo-random 0..1 from a string, so the same player always
// starts roaming from the same spot/pace on every load instead of jumping
// around each refresh.
function seededFraction(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

const WANDER_VARIANTS = 6;

export default function TownWorldPage() {
  const [list, setList] = useState<WorldEntry[]>([]);
  const [meEntry, setMeEntry] = useState<WorldEntry | null>(null);
  const [myTitleIndex, setMyTitleIndex] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [totalRanked, setTotalRanked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeEntry, setActiveEntry] = useState<WorldEntry | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchWorld(), fetchTownProfile(), fetchUserProfile()])
      .then(([world, mine, userProfile]) => {
        setList(world.list);
        setMeEntry(world.me ? { ...world.me, nickname: userProfile?.nickname || world.me.nickname } : null);
        setMyRank(world.myRank);
        setTotalRanked(world.totalRanked);
        setMyTitleIndex(mine.profile.titleIndex);
      })
      .catch(() => Taro.showToast({ title: "加载失败", icon: "none" }))
      .finally(() => setLoading(false));
  }, []);

  useDidShow(() => {
    load();
    // Best-effort opt-in so friends can actually reach this viewer with a
    // "批评" push later -- a one-time subscribe grant is consumed per send,
    // so re-asking on every visit here keeps them reachable. No-ops until
    // SUBSCRIBE_TEMPLATE_ID is filled in (see cloudfunctions/townCriticize).
    if (SUBSCRIBE_TEMPLATE_ID) {
      // `entityIds` is an Alipay-only field that Taro's weapp types still
      // require structurally -- harmless empty placeholder on this target.
      Taro.requestSubscribeMessage({ tmplIds: [SUBSCRIBE_TEMPLATE_ID], entityIds: [] }).catch(() => {});
    }
  });

  async function handleSteal(entry: WorldEntry) {
    try {
      const res = await stealFrom(entry.openid);
      Taro.showToast({ title: `偷到 ${ITEM_LABEL[res.item as keyof typeof ITEM_LABEL] ?? res.item} x${res.amount}`, icon: "none" });
      load();
    } catch (err) {
      const msg = (err as Error).message;
      const text =
        msg === "steal_cooldown" ? "今天偷TA偷够啦，明天再来" :
        msg === "nothing_to_steal" ? "TA的仓库空空如也" : "偷菜失败";
      Taro.showToast({ title: text, icon: "none" });
    }
  }

  async function handleCriticize(entry: WorldEntry) {
    try {
      const res = await criticizeForNotCheckingIn(entry.openid);
      Taro.showToast({ title: res.pushed ? "已经批评TA，微信通知发过去了" : "已经批评TA啦（对方打开小程序会看到）", icon: "none" });
    } catch (err) {
      const msg = (err as Error).message;
      const text =
        msg === "already_checked_in" ? "TA已经打卡了，冤枉TA了" :
        msg === "criticize_cooldown" ? "已经批评过了，再等等" : "批评失败";
      Taro.showToast({ title: text, icon: "none" });
    }
  }

  async function handleSkim(entry: WorldEntry) {
    try {
      const res = await skimFrom(entry.openid);
      Taro.showToast({ title: `画饼成功，抽成 ${ITEM_LABEL[res.item as keyof typeof ITEM_LABEL] ?? res.item} x${res.amount}`, icon: "none" });
      load();
    } catch (err) {
      const msg = (err as Error).message;
      const text =
        msg === "skim_cooldown" ? "这个饼刚画过，过会儿再来" :
        msg === "nothing_to_skim" ? "TA的仓库空空如也" : "摊派失败";
      Taro.showToast({ title: text, icon: "none" });
    }
  }

  const plazaEntries = meEntry ? [...list, meEntry] : list;

  return (
    <View className="world-page">
      <Image className="world-bg" src={TOWN_SCENE_BG} mode="aspectFill" aria-label="小镇世界背景" />
      <View className="world-content">
        <Text className="world-hint">所有开启了摸鱼小镇的搭子都在这里，互相可见互相可逛～点搭子可以直接操作</Text>

        {!loading && plazaEntries.length > 0 && (
          <View className="world-plaza">
            {plazaEntries.map((entry, i) => {
              const isMe = meEntry && entry.openid === meEntry.openid;
              const seed = seededFraction(entry.openid);
              const startX = 12 + seed * 76;
              const startY = 15 + seededFraction(entry.openid + "y") * 60;
              const variant = i % WANDER_VARIANTS;
              const duration = 14 + (i % 5) * 3;
              const delay = seededFraction(entry.openid + "d") * -duration;
              const working = entry.isWorking;
              return (
                <View
                  key={entry.openid}
                  className={`world-roamer${working ? " working" : ` wander-${variant}`}${isMe ? " is-me" : ""}`}
                  style={
                    working
                      ? { left: `${startX}%`, top: `${startY}%` }
                      : { left: `${startX}%`, top: `${startY}%`, animationDuration: `${duration}s`, animationDelay: `${delay}s` }
                  }
                  onClick={() => (isMe ? null : setActiveEntry(entry))}
                  aria-label={`${entry.nickname}，职级${entry.companionTitle}${isMe ? "，这是你自己" : ""}，${entry.checkedInToday ? "今日已打卡" : "今日未打卡"}，${entry.isWorking ? "正在打工" : "空闲"}，仓库${entry.inventoryCount > 0 ? `有${entry.inventoryCount}件特产` : "是空的"}`}
                >
                  {working && entry.workingJobKey && (
                    <Image className="world-roamer-activity" src={buildingImageSrc(entry.workingJobKey)} mode="aspectFit" />
                  )}
                  <View className="world-roamer-deco">
                    {entry.decorations.slice(0, 3).map((key) => {
                      const deco = TOWN_DECORATIONS.find((d) => d.key === key);
                      return deco ? <Image key={key} className="world-roamer-deco-icon" src={deco.icon} mode="aspectFit" /> : null;
                    })}
                  </View>
                  <View className="world-roamer-status">
                    <Text className={`world-roamer-badge${entry.checkedInToday ? " ok" : " warn"}`}>
                      {entry.checkedInToday ? "签" : "未签"}
                    </Text>
                    {working && <Text className="world-roamer-badge working">打工</Text>}
                    {entry.inventoryCount > 0 ? (
                      <Text className="world-roamer-badge steal">可偷x{entry.inventoryCount}</Text>
                    ) : (
                      <Text className="world-roamer-badge empty">无货</Text>
                    )}
                  </View>
                  <Image
                    className="world-roamer-img"
                    src={characterImageSrc(entry.animal as AnimalKey, entry.mbti)}
                    mode="aspectFit"
                  />
                  <Text className="world-roamer-name">{isMe ? "我" : entry.nickname}</Text>
                </View>
              );
            })}
          </View>
        )}

        {myRank && (
          <View className="world-my-rank" aria-label={`你的摸鱼资历排名第${myRank}名，共${totalRanked}人`}>
            <Text className="world-my-rank-label">你的排名</Text>
            <Text className="world-my-rank-value">第 {myRank} 名</Text>
            <Text className="world-my-rank-total">/ 共{totalRanked}人</Text>
          </View>
        )}
        {!loading && meEntry && (
          <View className="world-card world-self-card">
            <View className="world-card-head">
              <Text className="world-self-tag">我的展示</Text>
              <Text className="world-nickname">{meEntry.nickname}</Text>
              <View className="world-title-badge" aria-label={`职级 ${meEntry.companionTitle}`}>
                <Image className="world-title-icon" src={HUD_ICON_TROPHY} mode="aspectFit" />
                <Text>{meEntry.companionTitle}</Text>
              </View>
            </View>
            <Text className="world-exp-line">摸鱼资历 {meEntry.companionExp}</Text>
            {meEntry.decorations.length > 0 ? (
              <View className="world-deco-row" aria-label={`我拥有的装饰：${meEntry.decorations.map((k) => TOWN_DECORATIONS.find((d) => d.key === k)?.name ?? k).join("、")}`}>
                {meEntry.decorations.map((key) => {
                  const deco = TOWN_DECORATIONS.find((d) => d.key === key);
                  return deco ? <Image key={key} className="world-deco-icon" src={deco.icon} mode="aspectFit" /> : null;
                })}
              </View>
            ) : (
              <Text className="world-meta">还没有任何装饰，去仓库里用特产兑换一个吧——兑换后别人逛到你的地盘就能看到</Text>
            )}
          </View>
        )}
        {loading ? (
          <Text className="world-loading">加载中...</Text>
        ) : list.length === 0 ? (
          <Text className="world-loading">还没有别人开启摸鱼小镇，快去拉朋友一起玩吧</Text>
        ) : (
          list.map((entry) => {
            const isHigher = myTitleIndex > entry.titleIndex;
            const isLower = myTitleIndex < entry.titleIndex;
            return (
              <View className={`world-card${entry.rank <= 3 ? " top-rank" : ""}`} key={entry.openid}>
                <View className="world-card-head">
                  <View className={`world-rank-badge${entry.rank <= 3 ? ` rank-${entry.rank}` : ""}`} aria-label={`排名第${entry.rank}名`}>
                    <Text>#{entry.rank}</Text>
                  </View>
                  <Text className="world-nickname">{entry.nickname}</Text>
                  <View className="world-title-badge" aria-label={`职级 ${entry.companionTitle}`}>
                    <Image className="world-title-icon" src={HUD_ICON_TROPHY} mode="aspectFit" />
                    <Text>{entry.companionTitle}</Text>
                  </View>
                </View>
                <Text className="world-exp-line">摸鱼资历 {entry.companionExp}</Text>
                <View className="world-checkin-row">
                  <Text className={`world-checkin-tag${entry.checkedInToday ? " done" : ""}`}>
                    {entry.checkedInToday ? "今日已打卡" : "今日未打卡"}
                  </Text>
                  {!entry.checkedInToday && (
                    <Button className="world-btn criticize" size="mini" onClick={() => handleCriticize(entry)}>
                      批评TA
                    </Button>
                  )}
                </View>
                <Text className="world-meta">仓库里有 {entry.inventoryCount} 件特产 · {relativeTime(entry.lastActiveAt)}</Text>
                {entry.decorations.length > 0 && (
                  <View className="world-deco-row" aria-label={`拥有装饰：${entry.decorations.map((k) => TOWN_DECORATIONS.find((d) => d.key === k)?.name ?? k).join("、")}`}>
                    {entry.decorations.map((key) => {
                      const deco = TOWN_DECORATIONS.find((d) => d.key === key);
                      return deco ? <Image key={key} className="world-deco-icon" src={deco.icon} mode="aspectFit" /> : null;
                    })}
                  </View>
                )}
                {isLower ? (
                  <Text className="world-blocked">老板的地盘，先憋着</Text>
                ) : (
                  <View className="world-actions">
                    <Button className="world-btn" size="mini" onClick={() => handleSteal(entry)}>
                      偷一点
                    </Button>
                    {isHigher && (
                      <Button className="world-btn skim" size="mini" onClick={() => handleSkim(entry)}>
                        画饼摊派
                      </Button>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {activeEntry && (
        <View className="world-picker-mask" onClick={() => setActiveEntry(null)}>
          <View className="world-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="world-card-head">
              <View className={`world-rank-badge${activeEntry.rank <= 3 ? ` rank-${activeEntry.rank}` : ""}`}>
                <Text>#{activeEntry.rank}</Text>
              </View>
              <Text className="world-nickname">{activeEntry.nickname}</Text>
              <View className="world-title-badge">
                <Image className="world-title-icon" src={HUD_ICON_TROPHY} mode="aspectFit" />
                <Text>{activeEntry.companionTitle}</Text>
              </View>
            </View>
            <Text className="world-exp-line">摸鱼资历 {activeEntry.companionExp}</Text>
            <Text className={`world-checkin-tag${activeEntry.checkedInToday ? " done" : ""}`}>
              {activeEntry.checkedInToday ? "今日已打卡" : "今日未打卡"}
            </Text>
            {myTitleIndex < activeEntry.titleIndex ? (
              <Text className="world-blocked">老板的地盘，先憋着</Text>
            ) : (
              <View className="world-actions">
                <Button className="world-btn" size="mini" onClick={() => { handleSteal(activeEntry); setActiveEntry(null); }}>
                  偷一点
                </Button>
                {myTitleIndex > activeEntry.titleIndex && (
                  <Button className="world-btn skim" size="mini" onClick={() => { handleSkim(activeEntry); setActiveEntry(null); }}>
                    画饼摊派
                  </Button>
                )}
                {!activeEntry.checkedInToday && (
                  <Button className="world-btn criticize" size="mini" onClick={() => { handleCriticize(activeEntry); setActiveEntry(null); }}>
                    批评TA
                  </Button>
                )}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
