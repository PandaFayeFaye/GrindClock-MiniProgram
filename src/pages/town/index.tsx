import { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, Button, Image, ScrollView } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  fetchTownProfile,
  townCheckin,
  feedCompanionInTown,
  sendToWork,
  collectJob,
  promote,
  cancelJob,
  buyDecoration,
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
  HUD_WOOD_STRIP,
  HUD_ICON_CHEST,
  HUD_ICON_TROPHY,
  HUD_ICON_FLAG,
  HUD_ICON_COIN,
  TOWN_IDLE_SPOT,
  TOWN_DECORATIONS,
  ALL_SUBSCRIBE_TEMPLATE_IDS,
  type TownJob,
  type TownProfile,
} from "../../lib/town";
import "./index.scss";

function cnDateKey(t: number): string {
  return new Date(t + 8 * 3_600_000).toISOString().slice(0, 10);
}

function isClaimedToday(lastDailyRationAt: number | null, now: number): boolean {
  if (!lastDailyRationAt) return false;
  return cnDateKey(lastDailyRationAt) === cnDateKey(now);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "已完成";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

type Drawer = "inventory" | "promote" | "actions" | "checkinPrompt" | "jobReadyPrompt" | null;

export default function TownPage() {
  const [profile, setProfile] = useState<TownProfile | null>(null);
  const [animal, setAnimal] = useState<AnimalKey>("cat");
  const [mbti, setMbti] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<TownJob | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [now, setNow] = useState(Date.now());
  const [flicker, setFlicker] = useState(false);
  const [tapPulse, setTapPulse] = useState(false);

  const load = useCallback(() => {
    fetchTownProfile()
      .then((res) => {
        setProfile(res.profile);
        // A finished shift takes priority over the check-in nudge -- it's
        // an actual reward waiting to be claimed, not just a reminder.
        if (res.profile.currentJob && res.profile.currentJob.endsAt <= Date.now()) {
          setDrawer("jobReadyPrompt");
        } else if (res.profile.unlocked && !isClaimedToday(res.profile.lastDailyRationAt, Date.now())) {
          setDrawer("checkinPrompt");
        }
      })
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

  // The bbq stall's campfire alternates between two flame frames for a
  // simple flicker -- WXSS can't do sprite-sheet frame animation, so this
  // just swaps the <Image> src on a timer.
  useEffect(() => {
    const timer = setInterval(() => setFlicker((f) => !f), 450);
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

  const todayClaimed = useMemo(
    () => isClaimedToday(profile?.lastDailyRationAt ?? null, now),
    [profile, now],
  );

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

  async function handleCancelJob() {
    Taro.showModal({
      title: "召回搭子？",
      content: "已经花掉的班车费不会退还，且这一趟不会有任何产出，确定要提前召回吗？",
      confirmText: "召回",
      cancelText: "再等等",
      success: (res) => {
        if (!res.confirm) return;
        setDrawer(null);
        cancelJob()
          .then((r) => {
            setProfile(r.profile);
            Taro.showToast({ title: "搭子回来了", icon: "none" });
          })
          .catch(() => Taro.showToast({ title: "召回失败", icon: "none" }));
      },
    });
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
    } catch (err) {
      // The generic "收工失败" toast gave no way to tell what actually went
      // wrong -- surface the real error code so it shows up next to the
      // transport/result errors already logged in lib/cloudTown.ts's call().
      console.error("[town] collectJob failed:", err);
      Taro.showToast({ title: `收工失败：${(err as Error).message || "未知错误"}`, icon: "none" });
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

  async function handleBuyDecoration(key: string) {
    try {
      const res = await buyDecoration(key);
      setProfile(res.profile);
      Taro.showToast({ title: "兑换成功，去世界页面展示一下吧～", icon: "none" });
    } catch (err) {
      const msg = (err as Error).message;
      Taro.showToast({ title: msg === "insufficient_materials" ? "材料不够" : msg === "already_owned" ? "已经拥有啦" : "兑换失败", icon: "none" });
    }
  }

  function handleGoToWorld() {
    // Piggyback the subscribe-message ask on this real tap -- WeChat only
    // shows the permission popup when requestSubscribeMessage is called
    // directly inside a genuine user gesture, never from a lifecycle hook,
    // so this is the most "automatic-feeling" reliable place to ask.
    Taro.requestSubscribeMessage({ tmplIds: ALL_SUBSCRIBE_TEMPLATE_IDS } as Taro.requestSubscribeMessage.Option).catch(() => {});
    Taro.navigateTo({ url: "/pages/town-world/index" });
  }

  function handleSpriteTap() {
    setTapPulse(true);
    setTimeout(() => setTapPulse(false), 500);
    setDrawer("actions");
  }

  function handleBuildingTap(job: TownJob) {
    if (titleIndex < job.unlockLevel) {
      Taro.showToast({ title: `需要「${TOWN_LEVELS[job.unlockLevel].title}」及以上才能解锁`, icon: "none" });
      return;
    }
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

  // Companion stands just beside its work building (offset sideways, not
  // stacked directly under it where it could overlap whatever building sits
  // in the row below) while a job is running, otherwise idles at the fixed
  // clearing -- tapping it always opens quick actions.
  const spriteX = workingJob ? workingJob.x + (workingJob.x < 50 ? 9 : -9) : TOWN_IDLE_SPOT.x;
  const spriteY = workingJob ? workingJob.y - 2 : TOWN_IDLE_SPOT.y;

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
            aria-label={`${job.name}${locked ? "，未解锁" : isWorkingHere ? (jobReady ? "，打工已完成可收工" : "，打工中") : ""}`}
          >
            <View
              className={`town-building-imgwrap${job.effect ? ` effect-${job.effect}` : ""}`}
              style={{ animationDelay: `${(job.x % 10) * 0.15}s` }}
            >
              <Image
                className="town-building-img"
                src={job.key === "bbqStall" && flicker ? "/town/bbqStall-b.png" : buildingImageSrc(job.key)}
                mode="aspectFit"
              />
              {job.effect === "steam" && (
                <View className="town-steam">
                  <View className="steam-puff puff-1" />
                  <View className="steam-puff puff-2" />
                </View>
              )}
            </View>
            {locked && <Text className="town-building-lock">未解锁</Text>}
            <Text className="town-building-label">{job.name}</Text>
            {isWorkingHere && (
              <Text className={`town-building-badge${jobReady ? " ready" : ""}`}>{jobReady ? "完成" : "打工中"}</Text>
            )}
          </View>
        );
      })}

      <View
        className={`town-sprite${tapPulse ? " tap-pulse" : ""}${workingJob && !jobReady ? " working" : ""}`}
        style={{ left: `${spriteX}%`, top: `${spriteY}%` }}
        onClick={handleSpriteTap}
        aria-label="搬砖搭子，点击查看状态和喂食"
      >
        <View className={`town-sprite-bubble${jobReady ? " ready" : ""}`}>
          <Text>{workingJob ? (jobReady ? "打完卡啦！" : formatDuration(jobRemainingMs)) : "点我看看～"}</Text>
        </View>
        {workingJob && !jobReady && (
          <Image className="town-sprite-activity" src={buildingImageSrc(workingJob.key)} mode="aspectFit" />
        )}
        <View className="town-sprite-glow" />
        <Image className="town-sprite-img" src={characterImageSrc(animal, mbti)} mode="aspectFit" />
        <View className="town-sprite-shadow" />
        {tapPulse && <View className="town-sprite-ripple" />}
      </View>

      <View className="town-hud-top">
        <Image className="town-hud-wood" src={HUD_WOOD_STRIP} mode="scaleToFill" />
        <View className="town-hud-top-content">
          <Text className="town-title-badge">{level.title}</Text>
          <Text className="town-exp">资历 {profile.companionExp}{nextLevel ? `/${nextLevel.expThreshold}` : "满"}</Text>
          <View className="town-hud-spacer" />
          <View className="town-resource" aria-label={`牛马粮 ${profile.oxFeed}`}>
            <Image className="town-resource-icon" src={HUD_ICON_COIN} mode="aspectFit" />
            <Text>牛马粮 {profile.oxFeed}</Text>
          </View>
          <View
            className={`town-ration-btn${todayClaimed ? " claimed" : ""}`}
            onClick={todayClaimed ? undefined : handleCheckin}
            aria-label={todayClaimed ? "今日已签到领取牛马粮" : "领取每日牛马粮"}
          >
            <Text>{todayClaimed ? "已签到" : "领粮"}</Text>
          </View>
        </View>
      </View>

      <View className="town-hud-bottom">
        <View className="town-hud-btn" onClick={() => setDrawer("inventory")} aria-label="打开仓库">
          <Image className="town-hud-btn-wood" src={HUD_WOOD_STRIP} mode="scaleToFill" />
          <View className="town-hud-btn-content">
            <Image className="town-hud-btn-icon" src={HUD_ICON_CHEST} mode="aspectFit" />
            <Text>仓库</Text>
          </View>
        </View>
        <View className="town-hud-btn" onClick={() => setDrawer("promote")} aria-label="查看晋升条件">
          <Image className="town-hud-btn-wood" src={HUD_WOOD_STRIP} mode="scaleToFill" />
          <View className="town-hud-btn-content">
            <Image className="town-hud-btn-icon" src={HUD_ICON_TROPHY} mode="aspectFit" />
            <Text>晋升</Text>
          </View>
        </View>
        <View className="town-hud-btn" onClick={handleGoToWorld} aria-label="前往世界页面">
          <Image className="town-hud-btn-wood" src={HUD_WOOD_STRIP} mode="scaleToFill" />
          <View className="town-hud-btn-content">
            <Image className="town-hud-btn-icon" src={HUD_ICON_FLAG} mode="aspectFit" />
            <Text>世界</Text>
          </View>
        </View>
      </View>

      {drawer === "jobReadyPrompt" && workingJob && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <View className="town-picker-header">
              <Image className="town-picker-icon" src={buildingImageSrc(workingJob.key)} mode="aspectFit" />
              <Text className="town-picker-title">「{workingJob.name}」打完卡啦！</Text>
            </View>
            <Text className="town-empty">搭子在等你去收工领取 {ITEM_LABEL[workingJob.item]} 呢</Text>
            <Button
              className="town-primary-btn"
              onClick={() => {
                setDrawer(null);
                handleCollect();
              }}
            >
              立即收工
            </Button>
            <Button className="town-secondary-btn" onClick={() => setDrawer(null)}>
              等会再说
            </Button>
          </View>
        </View>
      )}

      {drawer === "checkinPrompt" && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet checkin-prompt" onClick={(e) => e.stopPropagation()}>
            <Text className="town-picker-title">今天还没签到哦</Text>
            <Text className="town-empty">搭子在等着摸鱼呢～先领一份牛马粮再开工吧</Text>
            <Button
              className="town-primary-btn"
              onClick={() => {
                setDrawer(null);
                handleCheckin();
              }}
            >
              立即签到
            </Button>
            <Button className="town-secondary-btn" onClick={() => setDrawer(null)}>
              先逛逛小镇
            </Button>
          </View>
        </View>
      )}

      {drawer === "actions" && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="town-picker-title">搭子在干嘛</Text>
            <Text className="town-empty">{workingJob ? `正在「${workingJob.name}」打工` : "正闲着呢"}</Text>
            {workingJob && !jobReady ? (
              <Button className="town-secondary-btn" onClick={handleCancelJob}>
                提前召回（不领工资）
              </Button>
            ) : (
              <Button className="town-secondary-btn" onClick={handleFeed} disabled={profile.oxFeed < FEED_COST}>
                喂食（{FEED_COST}粮）
              </Button>
            )}
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

            <Text className="town-picker-title deco-title">用特产兑换装饰（去世界页面展示）</Text>
            <ScrollView scrollY className="town-deco-shop-scroll">
              <View className="town-deco-shop">
                {TOWN_DECORATIONS.map((deco) => {
                  const owned = (profile.decorations || []).includes(deco.key);
                  const have = inventory[deco.costItem] ?? 0;
                  return (
                    <View className={`town-deco-item${owned ? " owned" : ""}`} key={deco.key}>
                      <Image className="town-deco-item-icon" src={deco.icon} mode="aspectFit" />
                      <Text className="town-deco-item-name">{deco.name}</Text>
                      <Text className="town-deco-item-cost">{ITEM_LABEL[deco.costItem]} {have}/{deco.costAmount}</Text>
                      <Button
                        className="town-secondary-btn"
                        size="mini"
                        disabled={owned || have < deco.costAmount}
                        onClick={() => handleBuyDecoration(deco.key)}
                      >
                        {owned ? "已拥有" : "兑换"}
                      </Button>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {drawer === "promote" && (
        <View className="town-picker-mask" onClick={() => setDrawer(null)}>
          <View className="town-picker-sheet" onClick={(e) => e.stopPropagation()}>
            <Text className="town-picker-title">职场晋升之路</Text>
            <ScrollView scrollY className="town-ladder">
              {TOWN_LEVELS.map((lvl, i) => {
                const state = i < titleIndex ? "done" : i === titleIndex ? "current" : "locked";
                const isNext = i === titleIndex + 1;
                return (
                  <View className={`town-ladder-row ${state}`} key={lvl.title}>
                    <Text className="town-ladder-title">{lvl.title}</Text>
                    <Text className="town-ladder-exp">资历{lvl.expThreshold}</Text>
                    {isNext && Object.keys(lvl.materials ?? {}).length > 0 && (
                      <Text className="town-ladder-materials">
                        {Object.entries(lvl.materials ?? {})
                          .map(([item, need]) => `${ITEM_LABEL[item as keyof typeof ITEM_LABEL]} ${inventory[item as keyof typeof inventory] ?? 0}/${need}`)
                          .join("　")}
                      </Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            {nextLevel ? (
              <Button className="town-secondary-btn" disabled={!canPromote(profile)} onClick={handlePromote}>
                申请晋升到「{nextLevel.title}」
              </Button>
            ) : (
              <Text className="town-empty">已经是最高职级啦，摸鱼资历天花板！</Text>
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
