import { useState, useCallback, useMemo } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, fetchUserProfile, clockIn, clockOut } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryOvertimePay, entryPay, mergedHoursToday } from "../../lib/pay";
import { formatGroupedPay, DEFAULT_CURRENCY, currencySymbol } from "../../lib/currency";
import { startOfWeek, startOfMonth, latestMoodOrFallback } from "../../lib/stats";
import { PET_STAGES, currentPetStageIndex, hoursSinceFed, isPetHungry } from "../../lib/pet";
import type { AnimalKey } from "../../lib/avatar";
import { CompanionWidget } from "../../components/CompanionWidget";
import { PunchConfirmModal, type PunchConfirmData } from "../../components/PunchConfirmModal";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function Index() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftRange, setLeftRange] = useState<"today" | "week">("today");
  const [animal, setAnimal] = useState<AnimalKey | undefined>(undefined);
  const [mbti, setMbti] = useState<string | undefined>(undefined);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs, profile] = await Promise.all([fetchEmployers(), fetchTimeEntries(), fetchUserProfile()]);
      setEmployers(empDocs.map(toEmployer));
      setAllEntries(entryDocs.map(toTimeEntry));
      setAnimal(profile?.animal as AnimalKey | undefined);
      setMbti(profile?.mbti);
    } catch (err) {
      console.error("Failed to load home data", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    reload();
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

  return (
    <View className="home-page">
      <Text className="home-title">首页</Text>

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
            return (
              <View className="row-wrap" key={emp.id}>
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
                    <Text>
                      今日已工作 {empHours.toFixed(1)}h · 已赚 {currencySymbol(emp.currency)}{empPay.toFixed(1)}
                      {empOvertime > 0.05 ? `（含加班${empOvertime.toFixed(1)}h）` : ""}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          <Button className="add-btn secondary" onClick={() => Taro.navigateTo({ url: "/pages/ai-capture/index" })}>
            AI 记工（拍照/语音）
          </Button>
          <Button className="add-btn secondary" onClick={() => Taro.navigateTo({ url: "/pages/backfill/index" })}>
            补录搬砖时长
          </Button>
          <Button className="add-btn secondary" onClick={() => Taro.navigateTo({ url: "/pages/batch-backfill/index" })}>
            批量补录搬砖时长
          </Button>
          <Button className="add-btn secondary" onClick={() => Taro.navigateTo({ url: "/pages/employer-form/index" })}>
            + 添加打工副本
          </Button>
        </View>
      )}

      {animal && (
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
    </View>
  );
}
