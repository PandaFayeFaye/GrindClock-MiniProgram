import { useState, useMemo } from "react";
import { View, Text } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours } from "../../lib/pay";
import { consecutiveWeeksMeetingGoal, currentStreak, dateKey } from "../../lib/stats";
import { getWeeklyGoal } from "../../lib/settings";
import { DEFAULT_CURRENCY, currencySymbol } from "../../lib/currency";
import { TIER_COLORS, TIERS, currentTierIndex } from "../../lib/tiers";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

interface Badge {
  name: string;
  cond: string;
  unlocked: boolean;
  color: string;
}

export default function Badges() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const weeklyGoal = getWeeklyGoal();

  useDidShow(() => {
    Promise.all([fetchEmployers(), fetchTimeEntries()]).then(([empDocs, entryDocs]) => {
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
    });
  });

  const employerById = useMemo(() => new Map(employers.map((e) => [e.id, e])), [employers]);
  const personalConfirmed = useMemo(() => entries.filter((e) => !e.workerId && e.status === "confirmed" && e.endTime != null), [entries]);
  const totalHours = personalConfirmed.reduce((s, e) => s + entryHours(e), 0);

  const currentTierIdx = currentTierIndex(totalHours);
  const currentTier = TIERS[currentTierIdx];
  const nextTier = TIERS[currentTierIdx + 1];
  const progressPct = nextTier
    ? Math.min(100, Math.round(((totalHours - currentTier.threshold) / (nextTier.threshold - currentTier.threshold)) * 100))
    : 100;

  const tierBadges: Badge[] = TIERS.map((tier, i) => ({
    name: tier.label,
    cond: tier.threshold === 0 ? "0小时" : `满${tier.threshold}小时`,
    unlocked: totalHours >= tier.threshold,
    color: TIER_COLORS[i],
  }));

  const hasComboDay = useMemo(() => {
    const byDay = new Map<string, Set<string>>();
    for (const e of personalConfirmed) {
      const key = dateKey(e.startTime);
      const set = byDay.get(key) ?? new Set<string>();
      set.add(e.employerId);
      byDay.set(key, set);
    }
    return [...byDay.values()].some((set) => set.size >= 2);
  }, [personalConfirmed]);

  const nightShiftCount = personalConfirmed.filter((e) => new Date(e.startTime).getHours() >= 22).length;
  const streak = currentStreak(personalConfirmed);
  const goalStreak = useMemo(() => consecutiveWeeksMeetingGoal(personalConfirmed, employerById, weeklyGoal), [personalConfirmed, employerById, weeklyGoal]);

  const funBadges: Badge[] = [
    { name: "双开达人", cond: "同一天内为2个及以上副本打卡", unlocked: hasComboDay, color: "#FFD93D" },
    { name: "不灭火苗", cond: "连续打卡满30天", unlocked: streak >= 30, color: "#FF6B6B" },
    { name: "深夜战士", cond: "完成10次22点后打卡", unlocked: nightShiftCount >= 10, color: "#4361EE" },
    { name: "省钱达人", cond: `连续${goalStreak >= 3 ? goalStreak : 3}周达成${currencySymbol(DEFAULT_CURRENCY)}${weeklyGoal}目标`, unlocked: goalStreak >= 3, color: "#39C97A" },
  ];

  return (
    <View className="badge-page">
      <View className="hero">
        <Text className="hero-title">{currentTier.label}</Text>
        <View className="hero-track">
          <View className="hero-fill" style={{ width: `${progressPct}%`, background: TIER_COLORS[currentTierIdx] }} />
        </View>
        <Text className="hero-note">
          {nextTier ? `距离「${nextTier.label}」还差${(nextTier.threshold - totalHours).toFixed(0)}小时` : "已达到最高称号！"}
        </Text>
      </View>

      <View className="section">
        <Text className="section-label">称号进阶之路</Text>
        <View className="tier-list">
          {TIERS.map((tier, i) => {
            const b = tierBadges[i];
            const isCurrent = i === currentTierIdx;
            return (
              <View className={`tier-item${b.unlocked ? " unlocked" : " locked"}${isCurrent ? " current" : ""}`} key={tier.label}>
                <View className="tier-icon" style={b.unlocked ? { background: TIER_COLORS[i] } : undefined} />
                <View className="tier-info">
                  <Text className="tier-name">{tier.label}</Text>
                  <Text className="tier-cond">{b.unlocked ? "已解锁 · " : "未解锁 · "}{b.cond}</Text>
                </View>
                {isCurrent && <Text className="tier-current-tag">当前</Text>}
              </View>
            );
          })}
        </View>
      </View>

      <View className="section">
        <Text className="section-label">隐藏成就</Text>
        <View className="badge-grid">
          {funBadges.map((b) => (
            <View className={`badge${b.unlocked ? " unlocked" : " locked"}`} key={b.name}>
              <View className="badge-ic" style={b.unlocked ? { background: b.color } : undefined} />
              <Text className="badge-name">{b.name}</Text>
              <Text className="badge-cond">{b.unlocked ? "已解锁" : "未解锁"} · {b.cond}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
