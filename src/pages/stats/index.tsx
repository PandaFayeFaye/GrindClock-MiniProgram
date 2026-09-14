import { useState, useCallback, useMemo } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryOvertimePay, entryPay } from "../../lib/pay";
import { currencySymbol, formatGroupedPay, DEFAULT_CURRENCY } from "../../lib/currency";
import { startOfWeek, startOfMonth } from "../../lib/stats";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

type RangeKey = "today" | "week" | "month" | "all";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "all", label: "全部" },
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function Stats() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("month");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs] = await Promise.all([fetchEmployers(), fetchTimeEntries()]);
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
    } catch (err) {
      console.error("Failed to load stats", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    reload();
  });

  const employerById = useMemo(() => new Map(employers.map((e) => [e.id, e])), [employers]);

  const rangeStart = range === "today" ? startOfToday() : range === "week" ? startOfWeek() : range === "month" ? startOfMonth() : 0;
  const confirmed = entries
    .filter((e) => e.status === "confirmed" && e.endTime != null && e.startTime >= rangeStart)
    .sort((a, b) => b.startTime - a.startTime);

  const totalHours = confirmed.reduce((s, e) => s + entryHours(e), 0);
  const totalOvertimeHours = confirmed.reduce((s, e) => s + (e.overtimeHours ?? 0), 0);
  const totalPayByCurrency = new Map<string, number>();
  const totalOvertimePayByCurrency = new Map<string, number>();
  for (const e of confirmed) {
    const emp = employerById.get(e.employerId);
    if (!emp) continue;
    const cur = emp.currency ?? DEFAULT_CURRENCY;
    totalPayByCurrency.set(cur, (totalPayByCurrency.get(cur) ?? 0) + entryPay(emp, e));
    const otPay = entryOvertimePay(emp, e);
    if (otPay > 0) totalOvertimePayByCurrency.set(cur, (totalOvertimePayByCurrency.get(cur) ?? 0) + otPay);
  }

  return (
    <View className="stats-page">
      <Text className="stats-title">统计</Text>

      <View className="range-row">
        {RANGES.map((r) => (
          <View key={r.key} className={`range-chip${range === r.key ? " active" : ""}`} onClick={() => setRange(r.key)}>
            <Text>{r.label}</Text>
          </View>
        ))}
      </View>

      <View className="summary-card">
        <View className="stat">
          <Text className="num">{totalHours.toFixed(1)}h</Text>
          <Text className="lb">{range === "all" ? "累计总工时" : "本时段工时"}</Text>
        </View>
        <View className="stat">
          <Text className="num">{formatGroupedPay(totalPayByCurrency)}</Text>
          <Text className="lb">{range === "all" ? "累计总收入" : "本时段收入"}</Text>
        </View>
      </View>

      {totalOvertimeHours > 0.05 && (
        <View className="overtime-summary-card">
          <Text className="overtime-summary-title">加班统计</Text>
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

      <Text className="list-title">明细</Text>
      {loading ? (
        <Text className="empty-hint">加载中...</Text>
      ) : confirmed.length === 0 ? (
        <Text className="empty-hint">还没有打卡记录</Text>
      ) : (
        <View className="entry-list">
          {confirmed.map((e) => {
            const emp = employerById.get(e.employerId);
            if (!emp) return null;
            const otPay = entryOvertimePay(emp, e);
            return (
              <View className="entry" key={e.id}>
                <View className="dot" style={{ background: emp.color }} />
                <View className="info">
                  <Text className="n">{emp.name}</Text>
                  <Text className="d">
                    {new Date(e.startTime).toLocaleDateString()} · {entryHours(e).toFixed(1)}小时
                    {e.overtimeHours && e.overtimeHours > 0.05 ? ` · 含加班${e.overtimeHours.toFixed(1)}h` : ""}
                  </Text>
                </View>
                <View className="pay-col">
                  <Text className="pay">
                    {currencySymbol(emp.currency)}
                    {entryPay(emp, e).toFixed(1)}
                  </Text>
                  {otPay > 0 && <Text className="pay-ot-sub">其中加班{currencySymbol(emp.currency)}{otPay.toFixed(1)}</Text>}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
