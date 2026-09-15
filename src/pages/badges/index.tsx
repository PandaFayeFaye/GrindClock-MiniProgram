import { useState, useMemo } from "react";
import { View, Text, Image } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, fetchUserProfile } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours } from "../../lib/pay";
import { consecutiveWeeksMeetingGoal, currentStreak, dateKey } from "../../lib/stats";
import { getWeeklyGoal } from "../../lib/settings";
import { DEFAULT_CURRENCY, currencySymbol } from "../../lib/currency";
import { TIER_COLORS, TIERS, currentTierIndex } from "../../lib/tiers";
import { characterImageSrc, type AnimalKey } from "../../lib/avatar";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

interface Badge {
  name: string;
  cond: string;
  unlocked: boolean;
  color: string;
}

// Zigzag x-position (% of track width) for each path node, matching the
// web app's Duolingo-style skill path -- the connecting line itself is SVG
// there, which native weapp has no equivalent for, so only the alternating
// left/right node placement is ported.
const PATH_X = [50, 22, 78, 22, 78, 50];

export default function Badges() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [animal, setAnimal] = useState<AnimalKey | undefined>(undefined);
  const [mbti, setMbti] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Badge | null>(null);
  const weeklyGoal = getWeeklyGoal();

  useDidShow(() => {
    Promise.all([fetchEmployers(), fetchTimeEntries(), fetchUserProfile()]).then(([empDocs, entryDocs, profile]) => {
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
      setAnimal(profile?.animal as AnimalKey | undefined);
      setMbti(profile?.mbti);
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
        <View className="hero-companion-wrap">
          <Image className="hero-companion" src={characterImageSrc(animal ?? "cow", mbti)} mode="aspectFit" />
        </View>
        <View className="hero-body">
          <Text className="hero-title">{currentTier.label}</Text>
          <View className="hero-track">
            <View className="hero-fill" style={{ width: `${progressPct}%`, background: TIER_COLORS[currentTierIdx] }} />
          </View>
          <Text className="hero-note">
            {nextTier ? `距离「${nextTier.label}」还差${(nextTier.threshold - totalHours).toFixed(0)}小时` : "已达到最高称号！"}
          </Text>
        </View>
      </View>

      <View className="section">
        <Text className="section-label">称号进阶之路</Text>
        <View className="tier-path">
          {TIERS.map((tier, i) => {
            const b = tierBadges[i];
            const isCurrent = i === currentTierIdx;
            return (
              <View
                key={tier.label}
                className={`tier-node${b.unlocked ? " unlocked" : " locked"}${isCurrent ? " current" : ""}`}
                style={{ left: `${PATH_X[i % PATH_X.length]}%` }}
                onClick={() => setSelected(b)}
              >
                {isCurrent && (
                  <View className="tier-mascot">
                    <Image className="tier-mascot-img" src={characterImageSrc(animal ?? "cow", mbti)} mode="aspectFit" />
                  </View>
                )}
                <View className="tier-node-circle" style={b.unlocked ? { background: TIER_COLORS[i] } : undefined} />
                <Text className="tier-node-label">{tier.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className="section">
        <Text className="section-label">隐藏成就</Text>
        <View className="badge-grid">
          {funBadges.map((b) => (
            <View className={`badge${b.unlocked ? " unlocked" : " locked"}`} key={b.name} onClick={() => setSelected(b)}>
              <View className="badge-ic" style={b.unlocked ? { background: b.color } : undefined} />
              <Text className="badge-name">{b.name}</Text>
              <Text className="badge-cond">{b.unlocked ? "已解锁" : "未解锁"} · {b.cond}</Text>
            </View>
          ))}
        </View>
      </View>

      {selected && (
        <View className="badge-backdrop" onClick={() => setSelected(null)}>
          <View className="badge-detail-card" onClick={(e) => e.stopPropagation()}>
            <View className="badge-detail-icon" style={selected.unlocked ? { background: selected.color } : undefined} />
            <Text className="badge-detail-name">{selected.name}</Text>
            <Text className={`badge-detail-status${selected.unlocked ? " on" : " off"}`}>
              {selected.unlocked ? "已解锁" : "未解锁"}
            </Text>
            <Text className="badge-detail-cond">解锁条件：{selected.cond}</Text>
            <View className="badge-detail-close" onClick={() => setSelected(null)}>
              <Text>知道了</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
