import { useState, useCallback } from "react";
import { View, Text, Button, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchTownProfile, fetchWorld, stealFrom, skimFrom, type WorldEntry } from "../../lib/cloudTown";
import { ITEM_LABEL, TOWN_SCENE_BG, HUD_ICON_TROPHY } from "../../lib/town";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchWorld(), fetchTownProfile()])
      .then(([world, mine]) => {
        setList(world.list);
        setMyTitleIndex(mine.profile.titleIndex);
      })
      .catch(() => Taro.showToast({ title: "加载失败", icon: "none" }))
      .finally(() => setLoading(false));
  }, []);

  useDidShow(() => load());

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
        {loading ? (
          <Text className="world-loading">加载中...</Text>
        ) : list.length === 0 ? (
          <Text className="world-loading">还没有别人开启摸鱼小镇，快去拉朋友一起玩吧</Text>
        ) : (
          list.map((entry) => {
            const isHigher = myTitleIndex > entry.titleIndex;
            const isLower = myTitleIndex < entry.titleIndex;
            return (
              <View className="world-card" key={entry.openid}>
                <View className="world-card-head">
                  <Text className="world-nickname">{entry.nickname}</Text>
                  <View className="world-title-badge" aria-label={`职级 ${entry.companionTitle}`}>
                    <Image className="world-title-icon" src={HUD_ICON_TROPHY} mode="aspectFit" />
                    <Text>{entry.companionTitle}</Text>
                  </View>
                </View>
                <Text className="world-meta">仓库里有 {entry.inventoryCount} 件特产 · {relativeTime(entry.lastActiveAt)}</Text>
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
