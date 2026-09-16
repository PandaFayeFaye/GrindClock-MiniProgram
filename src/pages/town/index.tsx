import { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, Button, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  fetchTownProfile,
  townCheckin,
  feedCompanionInTown,
  sendToWork,
  collectJob,
  promote,
} from "../../lib/cloudTown";
import { fetchUserProfile } from "../../lib/cloud";
import { characterImageSrc, type AnimalKey } from "../../lib/avatar";
import {
  TOWN_JOBS,
  TOWN_LEVELS,
  ITEM_LABEL,
  FEED_COST,
  canPromote,
  isNightNow,
  buildingImageSrc,
  TOWN_SCENE_BG,
  TOWN_DECO,
  type TownJob,
  type TownProfile,
} from "../../lib/town";
import "./index.scss";

function formatDuration(ms: number): string {
  if (ms <= 0) return "已完成";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

type Drawer = "inventory" | "promote" | "actions" | null;

export default function TownPage() {
  const [profile, setProfile] = useState<TownProfile | null>(null);
  const [animal, setAnimal] = useState<AnimalKey>("cat");
  const [mbti, setMbti] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<TownJob | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    fetchTownProfile()
      .then((res) => setProfile(res.profile))
      .catch(() => Taro.showToast({ title: "加载失败", icon: "none" }))
      .finally(() => setLoading(false));
    fetchUserProfile().then((p) => {
      if (p?.animal) setAnimal(p.animal as AnimalKey);
      setMbti(p?.mbti);
    });
  }, []);

  useDidShow(() => load());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
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
  const workingJob = profile?.currentJob ? TOWN_JOBS.find((j) => j.key === profile.currentJob!.jobKey) : null;

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
    setDrawer(null);
    try {
      const res = await feedCompanionInTown();
      setProfile(res.profile);
      Taro.showToast({ title: "喂饱啦～", icon: "none" });
    } catch (err) {
      Taro.showToast({ title: (err as Error).message === "insufficient_oxfeed" ? "牛马粮不够了" : "喂食失败", icon: "none" });
    }
  }

  async function handleSendToWork(job: TownJob) {
    try {
      const res = await sendToWork(job.key);
      setProfile(res.profile);
      setActiveJob(null);
      Taro.showToast({ title: `搭子出发去「${job.name}」啦`, icon: "none" });
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

  function handleBuildingTap(job: TownJob) {
    if (profile?.currentJob) {
      if (profile.currentJob.jobKey === job.key) {
        if (jobReady) handleCollect();
        else Taro.showToast({ title: `还需 ${formatDuration(jobRemainingMs)}`, icon: "none" });
      } else {
        Taro.showToast({ title: "搭子正在别处打工呢", icon: "none" });
      }
      return;
    }
    setActiveJob(job);
  }

  if (loading || !profile) {
    return (
      <View className="town-page">
        <Text className="town-loading">加载中...</Text>
      </View>
    );
  }

  // Companion sits at its work building while a job is running, otherwise
  // idles in the town square center -- tapping it always opens quick actions.
  const spriteX = workingJob ? workingJob.x : 50;
  const spriteY = workingJob ? workingJob.y + 6 : 55;

  return (
    <View className="town-page">
      <Image className="town-scene-bg" src={TOWN_SCENE_BG} mode="aspectFill" />

      {TOWN_DECO.map((d, i) => (
        <Image
          key={i}
          className={`town-deco sway-${i % 3}`}
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${d.size}rpx`, height: `${d.size}rpx`, animationDelay: `${d.delay}s` }}
          src={d.src}
          mode="aspectFit"
        />
      ))}

      {TOWN_JOBS.map((job) => {
        const locked = titleIndex < job.unlockLevel;
        const isWorkingHere = profile.currentJob?.jobKey === job.key;
        return (
          <View
            key={job.key}
            className={`town-building${locked ? " locked" : ""}${isWorkingHere ? " active" : ""}`}
            style={{ left: `${job.x}%`, top: `${job.y}%` }}
            onClick={() => handleBuildingTap(job)}
          >
            <Image className="town-building-img" src={buildingImageSrc(job.key)} mode="aspectFit" />
            <Text className="town-building-label">{locked ? "未解锁" : job.name}</Text>
            {isWorkingHere && (
              <Text className={`town-building-badge${jobReady ? " ready" : ""}`}>{jobReady ? "完成" : "打工中"}</Text>
            )}
          </View>
        );
      })}

      <View className="town-sprite" style={{ left: `${spriteX}%`, top: `${spriteY}%` }} onClick={() => setDrawer("actions")}>
        {workingJob && (
          <View className={`town-sprite-bubble${jobReady ? " ready" : ""}`}>
            <Text>{jobReady ? "打完卡啦！" : formatDuration(jobRemainingMs)}</Text>
          </View>
        )}
        <Image className="town-sprite-img" src={characterImageSrc(animal, mbti)} mode="aspectFit" />
        <View className="town-sprite-shadow" />
      </View>

      <View className="town-hud-top">
        <Text className="town-title-badge">{level.title}</Text>
        <Text className="town-exp">资历 {profile.companionExp}{nextLevel ? `/${nextLevel.expThreshold}` : "满"}</Text>
        <View className="town-hud-spacer" />
        <Text className="town-resource">牛马粮 {profile.oxFeed}</Text>
        <Button className="town-mini-btn" size="mini" disabled={todayClaimed} onClick={handleCheckin}>
          {todayClaimed ? "已签到" : "领粮"}
        </Button>
      </View>

      <View className="town-hud-bottom">
        <View className="town-hud-btn" onClick={() => setDrawer("inventory")}>
          <Text>仓库</Text>
        </View>
        <View className="town-hud-btn" onClick={() => setDrawer("promote")}>
          <Text>晋升</Text>
        </View>
        <View className="town-hud-btn" onClick={() => Taro.navigateTo({ url: "/pages/town-world/index" })}>
          <Text>世界</Text>
        </View>
      </View>

      {drawer === "actions" && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="town-picker-title">搭子在干嘛</Text>
            <Text className="town-empty">{workingJob ? `正在「${workingJob.name}」打工` : "正闲着呢"}</Text>
            <Button className="town-secondary-btn" onClick={handleFeed} disabled={profile.oxFeed < FEED_COST}>
              喂食（{FEED_COST}粮）
            </Button>
          </View>
        </View>
      )}

      {drawer === "inventory" && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="town-picker-title">仓库</Text>
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
        </View>
      )}

      {drawer === "promote" && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            {nextLevel ? (
              <>
                <Text className="town-picker-title">晋升到「{nextLevel.title}」</Text>
                <Text className="town-empty">
                  资历 {profile.companionExp}/{nextLevel.expThreshold}
                  {Object.keys(nextLevel.materials ?? {}).length > 0 ? "　·　" : ""}
                  {Object.entries(nextLevel.materials ?? {})
                    .map(([item, need]) => `${ITEM_LABEL[item as keyof typeof ITEM_LABEL]} ${inventory[item as keyof typeof inventory] ?? 0}/${need}`)
                    .join("　")}
                </Text>
                <Button className="town-secondary-btn" disabled={!canPromote(profile)} onClick={handlePromote}>
                  申请晋升
                </Button>
              </>
            ) : (
              <Text className="town-picker-title">已经是最高职级「{level.title}」啦</Text>
            )}
          </View>
        </View>
      )}

      {activeJob && (
        <View className="town-picker-mask" onClick={() => setActiveJob(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="town-picker-header">
              <Image className="town-picker-icon" src={buildingImageSrc(activeJob.key)} mode="aspectFit" />
              <Text className="town-picker-title">{activeJob.name}</Text>
            </View>
            <Text className="town-empty">
              班车费 {activeJob.feedCost}粮 · {formatDuration(activeJob.durationMs)} · 产出 {ITEM_LABEL[activeJob.item]}x{activeJob.itemAmount}
            </Text>
            {activeJob.nightOnly && !isNightNow() && <Text className="town-job-lock">仅 22:00-6:00 开放，现在还不能去</Text>}
            {profile.oxFeed < activeJob.feedCost && <Text className="town-job-lock">牛马粮不够</Text>}
            <Button
              className="town-primary-btn"
              disabled={(activeJob.nightOnly && !isNightNow()) || profile.oxFeed < activeJob.feedCost}
              onClick={() => handleSendToWork(activeJob)}
            >
              送搭子出发
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
