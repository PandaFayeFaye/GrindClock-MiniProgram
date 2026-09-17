import { useState, useCallback } from "react";
import { View, Text, Button, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchTownProfile, fetchWorld, stealFrom, skimFrom, criticizeForNotCheckingIn, type WorldEntry } from "../../lib/cloudTown";
import { fetchUserProfile } from "../../lib/cloud";
import { ITEM_LABEL, TOWN_SCENE_BG, HUD_ICON_TROPHY, TOWN_DECORATIONS, TOWN_LEVELS, SUBSCRIBE_TEMPLATE_ID } from "../../lib/town";
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

export default function TownWorldPage() {
  const [list, setList] = useState<WorldEntry[]>([]);
  const [myTitleIndex, setMyTitleIndex] = useState(0);
  const [myExp, setMyExp] = useState(0);
  const [myDecorations, setMyDecorations] = useState<string[]>([]);
  const [myNickname, setMyNickname] = useState("我");
  const [myRank, setMyRank] = useState<number | null>(null);
  const [totalRanked, setTotalRanked] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchWorld(), fetchTownProfile(), fetchUserProfile()])
      .then(([world, mine, userProfile]) => {
        setList(world.list);
        setMyRank(world.myRank);
        setTotalRanked(world.totalRanked);
        setMyTitleIndex(mine.profile.titleIndex);
        setMyExp(mine.profile.companionExp);
        setMyDecorations(mine.profile.decorations || []);
        if (userProfile?.nickname) setMyNickname(userProfile.nickname);
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

  return (
    <View className="world-page">
      <Image className="world-bg" src={TOWN_SCENE_BG} mode="aspectFill" aria-label="小镇世界背景" />
      <View className="world-content">
        <Text className="world-hint">所有开启了摸鱼小镇的搭子都在这里，互相可见互相可逛～</Text>
        {myRank && (
          <View className="world-my-rank" aria-label={`你的摸鱼资历排名第${myRank}名，共${totalRanked}人`}>
            <Text className="world-my-rank-label">你的排名</Text>
            <Text className="world-my-rank-value">第 {myRank} 名</Text>
            <Text className="world-my-rank-total">/ 共{totalRanked}人</Text>
          </View>
        )}
        {!loading && (
          <View className="world-card world-self-card">
            <View className="world-card-head">
              <Text className="world-self-tag">我的展示</Text>
              <Text className="world-nickname">{myNickname}</Text>
              <View className="world-title-badge" aria-label={`职级 ${TOWN_LEVELS[myTitleIndex]?.title}`}>
                <Image className="world-title-icon" src={HUD_ICON_TROPHY} mode="aspectFit" />
                <Text>{TOWN_LEVELS[myTitleIndex]?.title}</Text>
              </View>
            </View>
            <Text className="world-exp-line">摸鱼资历 {myExp}</Text>
            {myDecorations.length > 0 ? (
              <View className="world-deco-row" aria-label={`我拥有的装饰：${myDecorations.map((k) => TOWN_DECORATIONS.find((d) => d.key === k)?.name ?? k).join("、")}`}>
                {myDecorations.map((key) => {
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
    </View>
  );
}
