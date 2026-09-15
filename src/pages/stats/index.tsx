import { useState, useCallback, useMemo } from "react";
import { View, Text, Input, Image } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryOvertimePay, entryPay, lumpSumAllTime, lumpSumForPeriod } from "../../lib/pay";
import { currencySymbol, formatGroupedPay, DEFAULT_CURRENCY } from "../../lib/currency";
import { currentStreak, dateKey, hoursByDay, leaderboard, payByDay, startOfWeek, startOfMonth } from "../../lib/stats";
import { getWeeklyGoal, setWeeklyGoal } from "../../lib/settings";
import { ExportPanel } from "../../components/ExportPanel";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

type Viz = "trend" | "calendar" | "rank";
type RangeKey = "today" | "week" | "month" | "all";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "all", label: "全部" },
];
const HEAT_HEX = ["#FBF7EC", "#FFEFA8", "#FFD93D", "#E8B400"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatCnDate(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function Stats() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("month");
  const [exportOpen, setExportOpen] = useState(false);
  const [viz, setViz] = useState<Viz>("trend");
  const [filterEmployerIds, setFilterEmployerIds] = useState<Set<string>>(new Set());
  const [weeklyGoal, setWeeklyGoalState] = useState(() => getWeeklyGoal());
  const [editingGoal, setEditingGoal] = useState(false);
  const [selectedCalDay, setSelectedCalDay] = useState<number | null>(() => new Date().getDate());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs] = await Promise.all([fetchEmployers(), fetchTimeEntries()]);
      setEmployers(empDocs.map(toEmployer));
      setAllEntries(entryDocs.map(toTimeEntry));
    } catch (err) {
      console.error("Failed to load stats", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    reload();
    Taro.eventCenter.trigger("tabBarChange", 1);
  });

  const entries = useMemo(() => allEntries.filter((e) => !e.workerId), [allEntries]);
  const personalConfirmed = useMemo(
    () => entries.filter((e) => e.status === "confirmed" && e.endTime != null),
    [entries],
  );
  const employerById = useMemo(() => new Map(employers.map((e) => [e.id, e])), [employers]);

  function toggleFilterEmployer(id: string) {
    setFilterEmployerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const rangeStart = range === "today" ? startOfToday() : range === "week" ? startOfWeek() : range === "month" ? startOfMonth() : 0;
  const filteredEntries = useMemo(
    () => personalConfirmed.filter((e) => e.startTime >= rangeStart && (filterEmployerIds.size === 0 || filterEmployerIds.has(e.employerId))),
    [personalConfirmed, rangeStart, filterEmployerIds],
  );
  const visibleEmployers = useMemo(
    () => employers.filter((emp) => filterEmployerIds.size === 0 || filterEmployerIds.has(emp.id)),
    [employers, filterEmployerIds],
  );

  const totalHours = filteredEntries.reduce((s, e) => s + entryHours(e), 0);
  const totalOvertimeHours = filteredEntries.reduce((s, e) => s + (e.overtimeHours ?? 0), 0);
  const totalOvertimePayByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredEntries) {
      const emp = employerById.get(e.employerId);
      if (!emp) continue;
      const otPay = entryOvertimePay(emp, e);
      if (otPay > 0) map.set(emp.currency ?? DEFAULT_CURRENCY, (map.get(emp.currency ?? DEFAULT_CURRENCY) ?? 0) + otPay);
    }
    return map;
  }, [filteredEntries, employerById]);
  const totalPayByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    const add = (emp: Employer, amount: number) => map.set(emp.currency ?? DEFAULT_CURRENCY, (map.get(emp.currency ?? DEFAULT_CURRENCY) ?? 0) + amount);
    for (const e of filteredEntries) {
      const emp = employerById.get(e.employerId);
      if (emp) add(emp, entryPay(emp, e));
    }
    if (range === "all") {
      for (const emp of visibleEmployers) add(emp, lumpSumAllTime(emp, personalConfirmed));
    } else if (range === "month") {
      for (const emp of visibleEmployers) add(emp, lumpSumForPeriod(emp, filteredEntries));
    }
    return map;
  }, [filteredEntries, employerById, range, visibleEmployers, personalConfirmed]);

  const last7Days = useMemo(() => {
    const days: { key: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: dateKey(d.getTime()), label: WEEKDAY_LABELS[d.getDay()] });
    }
    return days;
  }, []);
  const dailyPay = useMemo(() => payByDay(personalConfirmed, employerById), [personalConfirmed, employerById]);
  const dailyHours = useMemo(() => hoursByDay(personalConfirmed), [personalConfirmed]);
  const maxDailyPay = Math.max(1, ...last7Days.map((d) => dailyPay.get(d.key) ?? 0));

  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const calendarLeadingBlanks = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1).getDay(), []);
  const heatCells = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const values = Array.from({ length: daysInMonth }, (_, i) => {
      const key = dateKey(new Date(year, month, i + 1).getTime());
      return { pay: dailyPay.get(key) ?? 0, hours: dailyHours.get(key) ?? 0 };
    });
    const max = Math.max(1, ...values.map((v) => v.pay));
    return values.map((v, i) => ({
      day: i + 1,
      level: v.pay === 0 ? 0 : v.pay / max > 0.66 ? 3 : v.pay / max > 0.33 ? 2 : 1,
      pay: v.pay,
      hours: v.hours,
    }));
  }, [dailyPay, dailyHours]);
  const selectedCalDayInfo = useMemo(() => heatCells.find((c) => c.day === selectedCalDay) ?? null, [heatCells, selectedCalDay]);

  const streak = useMemo(() => currentStreak(personalConfirmed), [personalConfirmed]);
  const streakCells = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysWithEntry = new Set(personalConfirmed.map((e) => dateKey(e.startTime)));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const key = dateKey(new Date(year, month, i + 1).getTime());
      return { day: i + 1, punched: daysWithEntry.has(key) };
    });
  }, [personalConfirmed]);

  const weekStart = startOfWeek();
  const board = useMemo(() => leaderboard(personalConfirmed, employers, weekStart), [personalConfirmed, employers, weekStart]);
  const weekPay = board.reduce((s, r) => s + r.pay, 0);
  const weekHours = board.reduce((s, r) => s + r.hours, 0);
  const weekPayByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of board) map.set(r.employer.currency ?? DEFAULT_CURRENCY, (map.get(r.employer.currency ?? DEFAULT_CURRENCY) ?? 0) + r.pay);
    return map;
  }, [board]);
  const goalPct = weeklyGoal > 0 ? Math.min(100, Math.round((weekPay / weeklyGoal) * 100)) : 0;
  const maxBoardPay = Math.max(1, ...board.map((r) => r.pay));

  function jumpToDetail() {
    Taro.pageScrollTo({ selector: "#detail-list-section", duration: 300 });
  }

  return (
    <View className="stats-page">
      <Text className="stats-title">统计</Text>

      <View className="range-row-wrap">
        <View className="range-row">
          {RANGES.map((r) => (
            <View key={r.key} className={`range-chip${range === r.key ? " active" : ""}`} onClick={() => setRange(r.key)}>
              <Text>{r.label}</Text>
            </View>
          ))}
        </View>
        <View className="jump-detail-btn" onClick={jumpToDetail}>
          <Text>看明细 ↓</Text>
        </View>
      </View>

      {employers.length > 1 && (
        <View className="filter-row">
          {employers.map((emp) => {
            const active = filterEmployerIds.has(emp.id);
            return (
              <View
                key={emp.id}
                className={`filter-chip${active ? " active" : ""}`}
                style={active ? { borderColor: emp.color } : undefined}
                onClick={() => toggleFilterEmployer(emp.id)}
              >
                <View className="dot" style={{ background: emp.color }} />
                <Text>{emp.name}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View className="summary-card">
        <View className="summary-card-header">
          <Text className="summary-card-title">工时收入汇总</Text>
        </View>
        <View className="summary-card-row">
          <View className="stat">
            <Text className="num">{totalHours.toFixed(1)}h</Text>
            <Text className="lb">{range === "all" ? "累计总工时" : "本时段工时"}</Text>
          </View>
          <View className="stat">
            <Text className="num">{formatGroupedPay(totalPayByCurrency)}</Text>
            <Text className="lb">{range === "all" ? "累计总收入" : "本时段收入"}</Text>
          </View>
        </View>
      </View>

      {totalOvertimeHours > 0.05 && (
        <View className="overtime-summary-card">
          <View className="overtime-summary-title-row">
          <Image className="overtime-summary-title-icon" src="/icons/flame-coral.png" mode="aspectFit" />
          <Text className="overtime-summary-title">加班统计</Text>
        </View>
          <View className="overtime-summary-row">
            <View className="stat">
              <Text className="num">{totalOvertimeHours.toFixed(1)}h</Text>
              <Text className="lb">加班时长</Text>
            </View>
            <View className="stat">
              <Text className="num">{formatGroupedPay(totalOvertimePayByCurrency)}</Text>
              <Text className="lb">加班收入</Text>
            </View>
          </View>
        </View>
      )}

      <View className="viz-tabs">
        <View className={`viz-tab${viz === "trend" ? " active" : ""}`} onClick={() => setViz("trend")}><Text>趋势</Text></View>
        <View className={`viz-tab${viz === "calendar" ? " active" : ""}`} onClick={() => setViz("calendar")}><Text>日历</Text></View>
        <View className={`viz-tab${viz === "rank" ? " active" : ""}`} onClick={() => setViz("rank")}><Text>排行</Text></View>
      </View>

      {viz === "trend" && (
        <View className="chart-card">
          <Text className="chart-title">最近7天</Text>
          <View className="bars">
            {last7Days.map((d) => {
              const pay = dailyPay.get(d.key) ?? 0;
              const hours = dailyHours.get(d.key) ?? 0;
              return (
                <View className="bar-col" key={d.key}>
                  <Text className="bar-pay">{pay > 0 ? `${currencySymbol(DEFAULT_CURRENCY)}${pay.toFixed(0)}` : ""}</Text>
                  <View className="bar-track">
                    <View className="bar-stack" style={{ height: `${Math.max(4, (pay / maxDailyPay) * 100)}%` }} />
                  </View>
                  <Text className="bar-day">{d.label}</Text>
                  <Text className="bar-hours">{hours > 0 ? `${hours.toFixed(1)}h` : "–"}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {viz === "calendar" && (
        <View className="chart-card">
          <View className="streak-chip">
            <Image className="streak-chip-icon" src="/icons/flame-coral.png" mode="aspectFit" />
            <Text>连续打卡 {streak} 天</Text>
          </View>
          <Text className="chart-title">{monthLabel} 收入日历</Text>
          <View className="weekday-header">
            {WEEKDAY_LABELS.map((k) => <Text key={k} className="weekday-header-label">{k}</Text>)}
          </View>
          <View className="heatmap">
            {Array.from({ length: calendarLeadingBlanks }).map((_, i) => <View className="heat-cell blank" key={`b${i}`} />)}
            {heatCells.map(({ day, level, pay, hours }) => (
              <View
                key={day}
                className={`heat-cell${selectedCalDay === day ? " selected" : ""}`}
                style={{ background: HEAT_HEX[level] }}
                onClick={() => setSelectedCalDay(day)}
              >
                <Text className="cell-day">{day}</Text>
                {(pay > 0 || hours > 0) && <View className="cell-dot" />}
              </View>
            ))}
          </View>
          <View className="heat-legend">
            <Text>少</Text>
            {HEAT_HEX.map((hex) => <View key={hex} className="legend-swatch" style={{ background: hex }} />)}
            <Text>多</Text>
          </View>
          {selectedCalDayInfo && (
            <Text className="cal-day-detail">
              {now.getMonth() + 1}月{selectedCalDay}日：工作 {selectedCalDayInfo.hours.toFixed(1)}h，赚了 {currencySymbol(DEFAULT_CURRENCY)}{selectedCalDayInfo.pay.toFixed(0)}
            </Text>
          )}

          <Text className="chart-title chart-title-spaced">{monthLabel} 打卡日历</Text>
          <View className="weekday-header">
            {WEEKDAY_LABELS.map((k) => <Text key={k} className="weekday-header-label">{k}</Text>)}
          </View>
          <View className="heatmap">
            {Array.from({ length: calendarLeadingBlanks }).map((_, i) => <View className="streak-cell blank" key={`sb${i}`} />)}
            {streakCells.map(({ day, punched }) => (
              <View key={day} className={`streak-cell${punched ? " lit" : ""}`}>
                {punched
                  ? <Image className="cell-flame" src="/icons/flame-white.png" mode="aspectFit" />
                  : <Text className="cell-day">{day}</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      {viz === "rank" && (
        <View className="chart-card">
          <Text className="chart-title">本周目标</Text>
          <View className="ring-wrap">
            <View className="ring-center">
              <View
                className="goal-ring"
                style={{
                  background: `conic-gradient(var(--accent-purple) ${goalPct * 3.6}deg, var(--bg-base) ${goalPct * 3.6}deg)`,
                }}
              >
                <View className="goal-ring-inner">
                  <Text className="goal-pct">{goalPct}%</Text>
                </View>
              </View>
            </View>
            <View className="ring-note-col">
              {editingGoal ? (
                <Input
                  className="goal-input"
                  type="number"
                  value={String(weeklyGoal)}
                  focus
                  onBlur={(e) => { const v = Number(e.detail.value) || 0; setWeeklyGoalState(v); setWeeklyGoal(v); setEditingGoal(false); }}
                />
              ) : (
                <Text className="goal-note" onClick={() => setEditingGoal(true)}>
                  目标 {currencySymbol(DEFAULT_CURRENCY)}{weeklyGoal}，已赚 {formatGroupedPay(weekPayByCurrency)}，点击修改目标
                </Text>
              )}
              <Text className="ring-hours-note">本周已工作 {weekHours.toFixed(1)} 小时</Text>
            </View>
          </View>

          <Text className="chart-title chart-title-spaced">本周排行榜</Text>
          {board.length === 0 && <Text className="empty-hint">本周还没有记录</Text>}
          {new Set(board.map((row) => row.employer.currency)).size > 1 && (
            <Text className="lb-currency-note">不同币种之间没有做汇率换算，排名仅供参考</Text>
          )}
          <View className="leaderboard">
            {board.map((row, i) => (
              <View className="lb-row" key={row.employer.id}>
                <View className="lb-rank" style={{ background: i === 0 ? "#FFD93D" : "#fff" }}><Text>{i + 1}</Text></View>
                <View className="lb-bar-track">
                  <View className="lb-bar-fill" style={{ width: `${(row.pay / maxBoardPay) * 100}%`, background: row.employer.color }} />
                  <Text className="lb-name">{row.employer.name}</Text>
                </View>
                <View className="lb-amount-col">
                  <Text className="lb-amount">{currencySymbol(row.employer.currency)}{row.pay.toFixed(0)}</Text>
                  <Text className="lb-hours">{row.hours.toFixed(1)}h</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="recap-teaser" onClick={() => Taro.navigateTo({ url: "/pages/recap/index" })}>
        <Text className="t1">本月战绩总结出炉啦</Text>
        <Text className="t2">看看你这个月搬了多少砖 ›</Text>
      </View>

      <View className="list-title-row" id="detail-list-section">
        <Text className="list-title">明细{range !== "all" ? `（${RANGES.find((r) => r.key === range)!.label}）` : ""}</Text>
        <View className={`export-btn${filteredEntries.length === 0 ? " disabled" : ""}`} onClick={() => filteredEntries.length > 0 && setExportOpen(true)}>
          <Text>导出</Text>
        </View>
      </View>

      {exportOpen && (
        <ExportPanel
          entries={filteredEntries}
          employerById={employerById}
          filenameBase={`grindclock-明细-${range}`}
          onClose={() => setExportOpen(false)}
        />
      )}

      {loading ? (
        <Text className="empty-hint">加载中...</Text>
      ) : (
        <View className="entry-list">
          {filteredEntries.length === 0 && <Text className="empty-hint">还没有打卡记录</Text>}
          {filteredEntries
            .slice()
            .sort((a, b) => b.startTime - a.startTime)
            .map((e) => {
              const emp = employerById.get(e.employerId);
              if (!emp) return null;
              const otPay = entryOvertimePay(emp, e);
              return (
                <View
                  className="entry"
                  key={e.id}
                  hoverClass="pressed"
                  hoverStayTime={0}
                  onClick={() => Taro.navigateTo({ url: `/pages/backfill/index?editId=${e.id}` })}
                >
                  <View className="dot" style={{ background: emp.color }} />
                  <View className="info">
                    <Text className="n">{emp.name}</Text>
                    <Text className="d">
                      {formatCnDate(e.startTime)} · {entryHours(e).toFixed(1)}小时
                      {e.overtimeHours && e.overtimeHours > 0.05 ? ` · 含加班${e.overtimeHours.toFixed(1)}h` : ""}
                    </Text>
                  </View>
                  <View className="pay-col">
                    <Text className="pay">{currencySymbol(emp.currency)}{entryPay(emp, e).toFixed(1)}</Text>
                    {otPay > 0 && (
                      <View className="pay-ot-sub-row">
                        <Image className="pay-ot-sub-icon" src="/icons/flame-coral.png" mode="aspectFit" />
                        <Text className="pay-ot-sub">其中加班{currencySymbol(emp.currency)}{otPay.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
        </View>
      )}
    </View>
  );
}
