import { useState, useCallback } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryPay } from "../../lib/pay";
import { currencySymbol, formatGroupedPay, DEFAULT_CURRENCY } from "../../lib/currency";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

export default function Stats() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  const employerById = new Map(employers.map((e) => [e.id, e]));
  const confirmed = entries
    .filter((e) => e.status === "confirmed" && e.endTime != null)
    .sort((a, b) => b.startTime - a.startTime);

  const totalHours = confirmed.reduce((s, e) => s + entryHours(e), 0);
  const totalPayByCurrency = new Map<string, number>();
  for (const e of confirmed) {
    const emp = employerById.get(e.employerId);
    if (!emp) continue;
    const cur = emp.currency ?? DEFAULT_CURRENCY;
    totalPayByCurrency.set(cur, (totalPayByCurrency.get(cur) ?? 0) + entryPay(emp, e));
  }

  return (
    <View className="stats-page">
      <Text className="stats-title">统计</Text>

      <View className="summary-card">
        <View className="stat">
          <Text className="num">{totalHours.toFixed(1)}h</Text>
          <Text className="lb">累计总工时</Text>
        </View>
        <View className="stat">
          <Text className="num">{formatGroupedPay(totalPayByCurrency)}</Text>
          <Text className="lb">累计总收入</Text>
        </View>
      </View>

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
            return (
              <View className="entry" key={e.id}>
                <View className="dot" style={{ background: emp.color }} />
                <View className="info">
                  <Text className="n">{emp.name}</Text>
                  <Text className="d">
                    {new Date(e.startTime).toLocaleDateString()} · {entryHours(e).toFixed(1)}小时
                  </Text>
                </View>
                <Text className="pay">
                  {currencySymbol(emp.currency)}
                  {entryPay(emp, e).toFixed(1)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
