import { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  fetchTownProfile,
  townCheckin,
  feedCompanionInTown,
  sendToWork,
  collectJob,
  promote,
} from "../../lib/cloudTown";
import { TOWN_JOBS, TOWN_LEVELS, ITEM_LABEL, FEED_COST, canPromote, isNightNow, type TownProfile } from "../../lib/town";
import "./index.scss";

function formatDuration(ms: number): string {
  if (ms <= 0) return "已完成";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

export default function TownPage() {
  const [profile, setProfile] = useState<TownProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    fetchTownProfile()
      .then((res) => setProfile(res.profile))
      .catch(() => Taro.showToast({ title: "加载失败", icon: "none" }))
      .finally(() => setLoading(false));
  }, []);

  useDidShow(() => {
    load();
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const titleIndex = profile?.titleIndex ?? 0;
  const level = TOWN_LEVELS[titleIndex];
  const nextLevel = TOWN_LEVELS[titleIndex + 1];

  const inventory = profile?.inventory ?? {};
  const inventoryEntries = useMemo(
    () => Object.entries(inventory).filter(([, qty]) => (qty ?? 0) > 0),
    [inventory],
  );

  const jobRemainingMs = profile?.currentJob ? profile.currentJob.endsAt - now : 0;
  const jobReady = !!profile?.currentJob && jobRemainingMs <= 0;

  const todayClaimed = useMemo(() => {
    if (!profile?.lastDailyRationAt) return false;
    const key = (t: number) => new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
    return key(profile.lastDailyRationAt) === key(now);
  }, [profile, now]);

  async function handleCheckin() {
    try {
      const res = await townCheckin();
      setProfile(res.profile);
      Taro.showToast({ title: `领到 ${res.gained} 牛马粮`, icon: "none" });
    } catch (err) {
      Taro.showToast({ title: (err as Error).message === "already_claimed_today" ? "今天已经领过啦" : "领取失败", icon: "none" });
    }
  }

  async function handleFeed() {
    try {
      const res = await feedCompanionInTown();
      setProfile(res.profile);
      Taro.showToast({ title: "喂饱啦～", icon: "none" });
    } catch (err) {
      Taro.showToast({ title: (err as Error).message === "insufficient_oxfeed" ? "牛马粮不够了" : "喂食失败", icon: "none" });
    }
  }

  async function handleSendToWork(jobKey: string) {
    try {
      const res = await sendToWork(jobKey);
      setProfile(res.profile);
      setPickerOpen(false);
      Taro.showToast({ title: "搭子出发打工啦", icon: "none" });
    } catch (err) {
      const msg = (err as Error).message;
      const text =
        msg === "insufficient_oxfeed" ? "牛马粮不够" :
        msg === "level_too_low" ? "职级还不够" :
        msg === "night_only" ? "这个岗位只在夜间开放" :
        msg === "already_working" ? "搭子还在上班中" : "出发失败";
      Taro.showToast({ title: text, icon: "none" });
    }
  }

  async function handleCollect() {
    try {
      const res = await collectJob();
      setProfile(res.profile);
      Taro.showToast({ title: `收获 ${ITEM_LABEL[res.itemGained as keyof typeof ITEM_LABEL]} x${res.amountGained}`, icon: "none" });
    } catch {
      Taro.showToast({ title: "收工失败", icon: "none" });
    }
  }

  async function handlePromote() {
    try {
      const res = await promote();
      setProfile(res.profile);
      Taro.showModal({ title: "晋升成功！", content: `搭子已升职为「${res.newTitle}」`, showCancel: false });
    } catch {
      Taro.showToast({ title: "晋升条件还没凑齐", icon: "none" });
    }
  }

  if (loading || !profile) {
    return (
      <View className="town-page">
        <Text className="town-loading">加载中...</Text>
      </View>
    );
  }

  return (
    <View className="town-page">
      <View className="town-status-card">
        <Text className="town-title-badge">{level.title}</Text>
        <Text className="town-exp">摸鱼资历 {profile.companionExp}{nextLevel ? ` / ${nextLevel.expThreshold}` : "（已到顶）"}</Text>
        <View className="town-resource-row">
          <Text className="town-resource">🌾 牛马粮 {profile.oxFeed}</Text>
          <Button className="town-mini-btn" size="mini" disabled={todayClaimed} onClick={handleCheckin}>
            {todayClaimed ? "今日已签到" : "每日领粮"}
          </Button>
        </View>
      </View>

      <View className="town-companion-block">
        {profile.currentJob ? (
          <>
            <Text className="town-job-status">
              {TOWN_JOBS.find((j) => j.key === profile.currentJob!.jobKey)?.name} 打工中...
            </Text>
            <Text className="town-job-eta">{jobReady ? "已经打完卡啦，快去收工！" : `还需 ${formatDuration(jobRemainingMs)}`}</Text>
            <Button className="town-primary-btn" disabled={!jobReady} onClick={handleCollect}>
              {jobReady ? "收工结算" : "打工中"}
            </Button>
          </>
        ) : (
          <>
            <Text className="town-job-status">搭子正闲着呢</Text>
            <View className="town-action-row">
              <Button className="town-secondary-btn" onClick={handleFeed} disabled={profile.oxFeed < FEED_COST}>
                喂食（{FEED_COST}粮）
              </Button>
              <Button className="town-primary-btn" onClick={() => setPickerOpen(true)}>
                送去打工
              </Button>
            </View>
          </>
        )}
      </View>

      <View className="town-section">
        <Text className="town-section-title">仓库</Text>
        {inventoryEntries.length === 0 ? (
          <Text className="town-empty">还没有任何小镇特产，去打工赚一点吧</Text>
        ) : (
          <View className="town-inventory-grid">
            {inventoryEntries.map(([item, qty]) => (
              <View className="town-inventory-chip" key={item}>
                <Text>{ITEM_LABEL[item as keyof typeof ITEM_LABEL] ?? item}</Text>
                <Text className="town-inventory-qty">x{qty}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {nextLevel && (
        <View className="town-section">
          <Text className="town-section-title">晋升到「{nextLevel.title}」</Text>
          <Text className="town-empty">
            {Object.entries(nextLevel.materials ?? {})
              .map(([item, need]) => `${ITEM_LABEL[item as keyof typeof ITEM_LABEL]} ${inventory[item as keyof typeof inventory] ?? 0}/${need}`)
              .join("　") || "无需额外材料"}
          </Text>
          <Button className="town-secondary-btn" disabled={!canPromote(profile)} onClick={handlePromote}>
            申请晋升
          </Button>
        </View>
      )}

      <Button className="town-world-link" onClick={() => Taro.navigateTo({ url: "/pages/town-world/index" })}>
        🌍 去世界逛逛
      </Button>

      {pickerOpen && (
        <View className="town-picker-mask" onClick={() => setPickerOpen(false)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="town-picker-title">选择工作</Text>
            <View className="town-picker-list">
              {TOWN_JOBS.map((job) => {
                const locked = titleIndex < job.unlockLevel;
                const nightBlocked = !!job.nightOnly && !isNightNow();
                const cantAfford = profile.oxFeed < job.feedCost;
                const disabled = locked || nightBlocked || cantAfford;
                return (
                  <View className={`town-job-card${disabled ? " disabled" : ""}`} key={job.key} onClick={() => !disabled && handleSendToWork(job.key)}>
                    <Text className="town-job-name">{job.name}</Text>
                    <Text className="town-job-meta">
                      班车费 {job.feedCost}粮 · {formatDuration(job.durationMs)} · 产出 {ITEM_LABEL[job.item]}x{job.itemAmount}
                    </Text>
                    {locked && <Text className="town-job-lock">需要「{TOWN_LEVELS[job.unlockLevel].title}」及以上</Text>}
                    {!locked && nightBlocked && <Text className="town-job-lock">仅 22:00-6:00 开放</Text>}
                    {!locked && !nightBlocked && cantAfford && <Text className="town-job-lock">牛马粮不够</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
