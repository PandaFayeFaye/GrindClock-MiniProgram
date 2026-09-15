import { useState, useCallback, useMemo } from "react";
import { View, Text, Button, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, fetchUserProfile, clockIn, clockOut, addManualEntry } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryOvertimePay, entryPay, mergedHoursToday } from "../../lib/pay";
import { formatGroupedPay, DEFAULT_CURRENCY, currencySymbol } from "../../lib/currency";
import { startOfWeek, startOfMonth, latestMoodOrFallback } from "../../lib/stats";
import { PET_STAGES, currentPetStageIndex, hoursSinceFed, isPetHungry } from "../../lib/pet";
import { todaysSchedule, scheduleDurationHours, combineDateAndTime } from "../../lib/schedule";
import { SETTINGS_KEYS, getLocalToggle } from "../../lib/settings";
import { hasOnboarded, markOnboarded, hasSeenCoachTour } from "../../lib/onboarding";
import { TIERS, TIER_COLORS, currentTierIndex } from "../../lib/tiers";
import { characterImageSrc, mbtiGroupColor, type AnimalKey } from "../../lib/avatar";
import { CompanionWidget } from "../../components/CompanionWidget";
import { PunchConfirmModal, type PunchConfirmData } from "../../components/PunchConfirmModal";
import { RetroClockInModal } from "../../components/RetroClockInModal";
import { ScheduleConfirmModal } from "../../components/ScheduleConfirmModal";
import { CoachTour, HOME_COACH_STEPS } from "../../components/CoachTour";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Module-level so the onboarding/coach-tour gate only ever runs once per app
// launch, not on every Home re-show (switching tabs back and forth, etc.).
let hasCheckedFirstRunGate = false;

export default function Index() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftRange, setLeftRange] = useState<"today" | "week">("today");
  const [animal, setAnimal] = useState<AnimalKey | undefined>(undefined);
  const [mbti, setMbti] = useState<string | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [simpleMode, setSimpleMode] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs, profile] = await Promise.all([fetchEmployers(), fetchTimeEntries(), fetchUserProfile()]);
      const emps = empDocs.map(toEmployer);
      const allEnts = entryDocs.map(toTimeEntry);
      setEmployers(emps);
      setAllEntries(allEnts);
      setAnimal(profile?.animal as AnimalKey | undefined);
      setMbti(profile?.mbti);
      setNickname(profile?.nickname ?? "");

      if (!hasCheckedFirstRunGate) {
        hasCheckedFirstRunGate = true;
        if (!hasOnboarded()) {
          if (emps.length === 0 && allEnts.length === 0) {
            Taro.navigateTo({ url: "/pages/onboarding/index" });
          } else {
            markOnboarded();
          }
        } else if (!hasSeenCoachTour()) {
          setTimeout(() => setShowTour(true), 600);
        }
      }
    } catch (err) {
      console.error("Failed to load home data", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    reload();
    setSimpleMode(getLocalToggle(SETTINGS_KEYS.simpleMode, false));
    Taro.eventCenter.trigger("tabBarChange", 0);
  });

  // Team-logged entries (workerId set) belong to a delegated worker, not the
  // signed-in user -- they must never mix into the personal totals below.
  const entries = useMemo(() => allEntries.filter((e) => !e.workerId), [allEntries]);

  const activeEmployers = employers.filter((e) => !e.archived);
  const employerById = useMemo(() => new Map(employers.map((e) => [e.id, e])), [employers]);
  const activeByEmployer = new Map<string, TimeEntry>();
  for (const e of entries) {
    if (e.endTime == null) activeByEmployer.set(e.employerId, e);
  }

  const todaysEntries = entries.filter((e) => e.status === "confirmed" && e.endTime != null && e.startTime >= startOfToday());
  const todaysHours = mergedHoursToday(entries);
  const todaysHoursByEmployer = new Map<string, number>();
  const todaysOvertimeByEmployer = new Map<string, number>();
  const todaysPayByEmployer = new Map<string, number>();
  for (const e of todaysEntries) {
    todaysHoursByEmployer.set(e.employerId, (todaysHoursByEmployer.get(e.employerId) ?? 0) + entryHours(e));
    if (e.overtimeHours) todaysOvertimeByEmployer.set(e.employerId, (todaysOvertimeByEmployer.get(e.employerId) ?? 0) + e.overtimeHours);
    const emp = employerById.get(e.employerId);
    if (emp) todaysPayByEmployer.set(e.employerId, (todaysPayByEmployer.get(e.employerId) ?? 0) + entryPay(emp, e));
  }
  const employerIdsWithEntryToday = new Set(todaysEntries.map((e) => e.employerId));

  const summarizeRange = useCallback((rangeStart: number, isToday: boolean) => {
    const rangeEntries = entries.filter((e) => e.status === "confirmed" && e.startTime >= rangeStart);
    const hours = isToday ? todaysHours : rangeEntries.reduce((s, e) => s + entryHours(e), 0);
    const overtimeHours = rangeEntries.reduce((s, e) => s + (e.overtimeHours ?? 0), 0);
    const payByCurrency = new Map<string, number>();
    const overtimePayByCurrency = new Map<string, number>();
    for (const e of rangeEntries) {
      const emp = employerById.get(e.employerId);
      if (!emp) continue;
      const cur = emp.currency ?? DEFAULT_CURRENCY;
      payByCurrency.set(cur, (payByCurrency.get(cur) ?? 0) + entryPay(emp, e));
      const otPay = entryOvertimePay(emp, e);
      if (otPay > 0) overtimePayByCurrency.set(cur, (overtimePayByCurrency.get(cur) ?? 0) + otPay);
    }
    return { hours, overtimeHours, payByCurrency, overtimePayByCurrency };
  }, [entries, employerById, todaysHours]);

  const leftRangeStart = leftRange === "week" ? startOfWeek() : startOfToday();
  const monthStart = startOfMonth();
  const leftSummary = useMemo(() => summarizeRange(leftRangeStart, leftRange === "today"), [summarizeRange, leftRangeStart, leftRange]);
  const monthSummary = useMemo(() => summarizeRange(monthStart, false), [summarizeRange, monthStart]);

  const totalHoursAllTime = useMemo(
    () => entries.filter((e) => e.status === "confirmed" && e.endTime != null).reduce((s, e) => s + entryHours(e), 0),
    [entries],
  );
  const currentTierIdx = currentTierIndex(totalHoursAllTime);
  const currentTier = TIERS[currentTierIdx];
  const nextTier = TIERS[currentTierIdx + 1];
  const tierProgressPct = nextTier
    ? Math.min(100, Math.round(((totalHoursAllTime - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100))
    : 100;
  const workingCount = activeByEmployer.size;
  const lastFedAt = useMemo(() => {
    const fedTimes = entries.filter((e) => e.status === "confirmed" && e.endTime != null).map((e) => e.endTime as number);
    return fedTimes.length > 0 ? Math.max(...fedTimes) : null;
  }, [entries]);
  const petStageIdx = currentPetStageIndex(totalHoursAllTime);
  const petStage = PET_STAGES[petStageIdx];
  const nextPetStage = PET_STAGES[petStageIdx + 1];
  const petHungry = isPetHungry(lastFedAt);
  const hungryHours = Math.floor(hoursSinceFed(lastFedAt));
  const companionMood = useMemo(() => latestMoodOrFallback(entries), [entries]);
  const petProgressPct = nextPetStage
    ? Math.min(100, Math.round(((totalHoursAllTime - petStage.threshold) / (nextPetStage.threshold - petStage.threshold)) * 100))
    : 100;
  const petProgressCaption = nextPetStage
    ? `还差 ${(nextPetStage.threshold - totalHoursAllTime).toFixed(0)} 小时喂到下一阶段`
    : "TA已经进化成传说形态啦！";
  const petMoodCaption = lastFedAt == null
    ? "TA还饿着肚子，打第一次卡喂养TA吧！"
    : petHungry
      ? `TA已经 ${hungryHours} 小时没吃饭了，打卡喂养TA吧～`
      : "TA刚吃饱，很满足地趴着～";

  const [confirming, setConfirming] = useState<{ employer: Employer; entry: TimeEntry } | null>(null);
  const [retroEmployer, setRetroEmployer] = useState<Employer | null>(null);
  const [scheduleConfirmEmployer, setScheduleConfirmEmployer] = useState<Employer | null>(null);

  async function handlePunch(employer: Employer) {
    const active = activeByEmployer.get(employer.id);
    if (active) {
      setConfirming({ employer, entry: active });
      return;
    }
    try {
      await clockIn(employer.id, Date.now());
      reload();
    } catch (err) {
      console.error("Clock-in failed", err);
      Taro.showToast({ title: "打卡失败，重试一下", icon: "none" });
    }
  }

  async function handleConfirmClockOut(data: PunchConfirmData) {
    if (!confirming) return;
    try {
      await clockOut(confirming.entry.id, {
        endTime: data.endTime,
        ...(data.mood ? { mood: data.mood } : {}),
        ...(data.moodNote ? { moodNote: data.moodNote } : {}),
        ...(data.note ? { note: data.note } : {}),
        ...(data.adjustment ? { adjustment: data.adjustment } : {}),
        isOvertime: data.isOvertime,
        isHoliday: data.isHoliday,
        ...(data.orderCount !== undefined ? { orderCount: data.orderCount } : {}),
        ...(data.overtimeHours !== undefined ? { overtimeHours: data.overtimeHours } : {}),
      });
      setConfirming(null);
      reload();
    } catch (err) {
      console.error("Clock-out failed", err);
      Taro.showToast({ title: "打卡失败，重试一下", icon: "none" });
    }
  }

  async function handleRetroConfirm(startTime: number) {
    if (!retroEmployer) return;
    setRetroEmployer(null);
    if (activeByEmployer.has(retroEmployer.id)) return;
    try {
      await clockIn(retroEmployer.id, startTime);
      reload();
    } catch (err) {
      console.error("Retro clock-in failed", err);
      Taro.showToast({ title: "补打卡失败，重试一下", icon: "none" });
    }
  }

  async function handleScheduleConfirm(start: string, end: string) {
    if (!scheduleConfirmEmployer) return;
    const today = new Date();
    const startTime = combineDateAndTime(today, start);
    let endTime = combineDateAndTime(today, end);
    if (endTime <= startTime) endTime += 24 * 3_600_000;

    const scheduled = todaysSchedule(scheduleConfirmEmployer, today);
    const supportsAutoOvertime = scheduled !== null
      && (scheduleConfirmEmployer.payType === "monthly" || scheduleConfirmEmployer.payType === "comprehensive");
    const enteredHours = (endTime - startTime) / 3_600_000;
    const overtimeHours = supportsAutoOvertime && scheduled ? Math.max(0, enteredHours - scheduleDurationHours(scheduled)) : 0;

    setScheduleConfirmEmployer(null);
    try {
      await addManualEntry({
        employerId: scheduleConfirmEmployer.id,
        startTime,
        endTime,
        status: "confirmed",
        source: "manual",
        ...(overtimeHours > 0.05 ? { overtimeHours } : {}),
      });
      reload();
    } catch (err) {
      console.error("Schedule confirm failed", err);
      Taro.showToast({ title: "打卡失败，重试一下", icon: "none" });
    }
  }

  return (
    <View className="home-page">
      <View className="banner">
        <View className="banner-avatar">
          <View className="banner-avatar-outer">
            <View className="banner-avatar-inner" style={{ borderColor: mbti ? mbtiGroupColor(mbti) : "#1A1A1A" }}>
              <View
                className="banner-avatar-img"
                style={{ backgroundImage: `url(${characterImageSrc(animal ?? "cow", mbti)})` }}
              />
            </View>
            {mbti && <Text className="avatar-mbti-tag">{mbti}</Text>}
          </View>
        </View>
        <View className="banner-text">
          <Text className="banner-title">{nickname ? `${nickname}，牛马辛苦了` : "牛马辛苦了，今天也要加油搬砖"}</Text>
          <View className="home-tier-chip" onClick={() => Taro.navigateTo({ url: "/pages/badges/index" })}>
            <Text className="home-tier-name" style={{ color: TIER_COLORS[currentTierIdx] }}>{currentTier.label}</Text>
            <View className="home-tier-track">
              <View className="home-tier-fill" style={{ width: `${tierProgressPct}%`, background: TIER_COLORS[currentTierIdx] }} />
            </View>
            {nextTier && <Text className="home-tier-next">{nextTier.label}</Text>}
          </View>
        </View>
      </View>

      {workingCount >= 2 && (
        <View className="combo-badge">
          <Text className="combo-badge-text">同时打{workingCount}份工中，牛马附体！</Text>
        </View>
      )}

      <View className="income-cards-row">
        <View className="income-card">
          <View className="income-range-tabs">
            <View className={`income-range-tab${leftRange === "today" ? " active" : ""}`} onClick={() => setLeftRange("today")}>
              <Text>今日</Text>
            </View>
            <View className={`income-range-tab${leftRange === "week" ? " active" : ""}`} onClick={() => setLeftRange("week")}>
              <Text>本周</Text>
            </View>
          </View>
          <Text className="income-label">{leftRange === "week" ? "本周已赚" : "今日已赚"}</Text>
          <Text className="income-value">{formatGroupedPay(leftSummary.payByCurrency, 1)}</Text>
          <Text className="income-note">已工作 {leftSummary.hours.toFixed(1)} 小时</Text>
          {leftSummary.overtimeHours > 0.05 && (
            <Text className="income-overtime-note">其中加班 {leftSummary.overtimeHours.toFixed(1)}h · {formatGroupedPay(leftSummary.overtimePayByCurrency, 1)}</Text>
          )}
        </View>

        <View className="income-card income-card-month">
          <View className="income-range-tabs">
            <View className="income-range-tab active"><Text>本月</Text></View>
          </View>
          <Text className="income-label">本月已赚</Text>
          <Text className="income-value">{formatGroupedPay(monthSummary.payByCurrency, 1)}</Text>
          <Text className="income-note">已工作 {monthSummary.hours.toFixed(1)} 小时</Text>
          {monthSummary.overtimeHours > 0.05 && (
            <Text className="income-overtime-note">其中加班 {monthSummary.overtimeHours.toFixed(1)}h · {formatGroupedPay(monthSummary.overtimePayByCurrency, 1)}</Text>
          )}
        </View>
      </View>

      {loading ? (
        <Text className="empty-hint">加载中...</Text>
      ) : activeEmployers.length === 0 ? (
        <View className="empty-state">
          <Text className="empty-hint">还没有打工副本，先去添加一个吧</Text>
          <Button className="add-btn" onClick={() => Taro.navigateTo({ url: "/pages/employer-form/index" })}>
            + 添加打工副本
          </Button>
        </View>
      ) : (
        <View className="list">
          {activeEmployers.map((emp) => {
            const active = activeByEmployer.get(emp.id);
            const doneToday = !active && employerIdsWithEntryToday.has(emp.id);
            const empHours = todaysHoursByEmployer.get(emp.id) ?? 0;
            const empOvertime = todaysOvertimeByEmployer.get(emp.id) ?? 0;
            const empPay = todaysPayByEmployer.get(emp.id) ?? 0;
            const schedule = todaysSchedule(emp);
            const showScheduleCard = !!schedule && !active && !employerIdsWithEntryToday.has(emp.id);
            const longShift = active && Date.now() - active.startTime > 14 * 3_600_000;

            if (showScheduleCard && schedule) {
              return (
                <View className="row-wrap schedule-card" key={emp.id}>
                  <View className="row">
                    <View className="dot" style={{ background: emp.color }} />
                    <View
                      className="row-name"
                      onClick={() => Taro.navigateTo({ url: `/pages/employer-form/index?id=${emp.id}` })}
                    >
                      <Text className="row-title">{emp.name}</Text>
                      <Text className="row-schedule-note">今日排班 {schedule.start}-{schedule.end}</Text>
                    </View>
                    <Button className="punch-btn schedule-btn" onClick={() => setScheduleConfirmEmployer(emp)}>
                      确认打卡
                    </Button>
                  </View>
                </View>
              );
            }

            return (
              <View className={`row-wrap${active ? " is-working" : ""}`} key={emp.id}>
                <View className="row">
                  <View className="dot" style={{ background: emp.color }} />
                  <View
                    className="row-name"
                    onClick={() => Taro.navigateTo({ url: `/pages/employer-form/index?id=${emp.id}` })}
                  >
                    <Text className="row-title">{emp.name}</Text>
                  </View>
                  <Button
                    className={`punch-btn${active ? " working" : ""}`}
                    onClick={() => handlePunch(emp)}
                  >
                    {active ? "下班打卡" : "上班打卡"}
                  </Button>
                </View>
                {doneToday && (
                  <View className="done-today-footer">
                    <Image className="done-today-check" src="/icons/check.png" mode="aspectFit" />
                    <Text>
                      今日已工作 {empHours.toFixed(1)}h · 已赚 {currencySymbol(emp.currency)}{empPay.toFixed(1)}
                      {empOvertime > 0.05 ? `（含加班${empOvertime.toFixed(1)}h）` : ""}
                    </Text>
                  </View>
                )}
                {!active && !employerIdsWithEntryToday.has(emp.id) && (
                  <View className="retro-row-btn" onClick={() => setRetroEmployer(emp)}>
                    <Text>忘记打卡了？补一个</Text>
                  </View>
                )}
                {longShift && active && (
                  <View className="retro-row-btn long-shift" onClick={() => handlePunch(emp)}>
                    <Text>已经上班 {Math.floor((Date.now() - active.startTime) / 3_600_000)} 小时了，记得下班打卡</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {activeEmployers.length > 0 && (
        <View className="fab-wrap">
          {menuOpen && (
            <>
              <View className="fab-menu-item" onClick={() => { setMenuOpen(false); Taro.navigateTo({ url: "/pages/ai-capture/index" }); }}>
                <Text className="fab-menu-label">AI 记工</Text>
                <View className="fab-mini" style={{ background: "#B084F5" }}><Image className="fab-mini-icon" src="/icons/star.png" mode="aspectFit" /></View>
              </View>
              <View className="fab-menu-item" onClick={() => { setMenuOpen(false); Taro.navigateTo({ url: "/pages/backfill/index" }); }}>
                <Text className="fab-menu-label">补录搬砖时长</Text>
                <View className="fab-mini" style={{ background: "#FFD93D" }}><Image className="fab-mini-icon" src="/icons/pencil.png" mode="aspectFit" /></View>
              </View>
              <View className="fab-menu-item" onClick={() => { setMenuOpen(false); Taro.navigateTo({ url: "/pages/batch-backfill/index" }); }}>
                <Text className="fab-menu-label">批量补录</Text>
                <View className="fab-mini" style={{ background: "#39C97A" }}><Image className="fab-mini-icon" src="/icons/grid.png" mode="aspectFit" /></View>
              </View>
              <View className="fab-menu-item" onClick={() => { setMenuOpen(false); Taro.navigateTo({ url: "/pages/employer-form/index" }); }}>
                <Text className="fab-menu-label">添加打工副本</Text>
                <View className="fab-mini" style={{ background: "#5AC8FA" }}><Image className="fab-mini-icon" src="/icons/plus.png" mode="aspectFit" /></View>
              </View>
            </>
          )}
          <View className={`fab${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(!menuOpen)}>
            <Text className="fab-plus">+</Text>
          </View>
        </View>
      )}

      {!simpleMode && animal && (
        <CompanionWidget
          animal={animal}
          mbti={mbti}
          stageName={petStage.name}
          stageAccessory={petStage.accessory}
          hungry={petHungry}
          progressPct={petProgressPct}
          progressCaption={petProgressCaption}
          moodCaption={petMoodCaption}
          userMood={companionMood}
        />
      )}

      {confirming && (
        <PunchConfirmModal
          employer={confirming.employer}
          entry={confirming.entry}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirmClockOut}
        />
      )}

      {retroEmployer && (
        <RetroClockInModal
          employer={retroEmployer}
          onCancel={() => setRetroEmployer(null)}
          onConfirm={handleRetroConfirm}
        />
      )}

      {scheduleConfirmEmployer && (() => {
        const schedule = todaysSchedule(scheduleConfirmEmployer);
        if (!schedule) return null;
        return (
          <ScheduleConfirmModal
            employer={scheduleConfirmEmployer}
            scheduled={schedule}
            onCancel={() => setScheduleConfirmEmployer(null)}
            onConfirm={handleScheduleConfirm}
          />
        );
      })()}

      {showTour && <CoachTour steps={HOME_COACH_STEPS} onDone={() => setShowTour(false)} />}
    </View>
  );
}
