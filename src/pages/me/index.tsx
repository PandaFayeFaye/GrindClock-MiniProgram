import { useState, useCallback } from "react";
import { View, Text, Input } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, fetchUserProfile, setUserProfile, reactivateEmployer } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours } from "../../lib/pay";
import { currentStreak } from "../../lib/stats";
import { TIERS, TIER_COLORS, currentTierIndex } from "../../lib/tiers";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

export default function Me() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [nickname, setNickname] = useState("");
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs, profile] = await Promise.all([fetchEmployers(), fetchTimeEntries(), fetchUserProfile()]);
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
      setNickname(profile?.nickname ?? "");
    } catch (err) {
      console.error("Failed to load me page", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    reload();
  });

  const personalConfirmed = entries.filter((e) => !e.workerId && e.status === "confirmed" && e.endTime != null);
  const totalHours = personalConfirmed.reduce((s, e) => s + entryHours(e), 0);
  const tierIdx = currentTierIndex(totalHours);
  const tier = TIERS[tierIdx];
  const nextTier = TIERS[tierIdx + 1];
  const tierProgressPct = nextTier
    ? Math.min(100, Math.round(((totalHours - tier.threshold) / (nextTier.threshold - tier.threshold)) * 100))
    : 100;
  const streak = currentStreak(entries);
  const archivedEmployers = employers.filter((e) => e.archived);

  async function saveNickname() {
    const trimmed = nicknameDraft.trim().slice(0, 20);
    setEditingNickname(false);
    if (!trimmed || trimmed === nickname) return;
    setNickname(trimmed);
    try {
      await setUserProfile({ nickname: trimmed });
    } catch (err) {
      console.error("Failed to save nickname", err);
    }
  }

  async function handleReactivate(employerId: string) {
    try {
      await reactivateEmployer(employerId);
      Taro.showToast({ title: "已重新启用", icon: "success" });
      reload();
    } catch (err) {
      console.error("Failed to reactivate employer", err);
      Taro.showToast({ title: "操作失败，重试一下", icon: "none" });
    }
  }

  return (
    <View className="me-page">
      <Text className="me-title">我的</Text>

      <View className="profile-hero">
        {editingNickname ? (
          <Input
            className="nickname-input"
            focus
            maxlength={20}
            value={nicknameDraft}
            onInput={(e) => setNicknameDraft(e.detail.value)}
            onBlur={saveNickname}
            onConfirm={saveNickname}
          />
        ) : (
          <Text
            className={`nickname${nickname ? "" : " placeholder"}`}
            onClick={() => { setNicknameDraft(nickname); setEditingNickname(true); }}
          >
            {nickname || "点击设置昵称"}
          </Text>
        )}
        <View className="tier-row" onClick={() => Taro.navigateTo({ url: "/pages/badges/index" })}>
          <Text className="tier-chip" style={{ background: TIER_COLORS[tierIdx] }}>{tier.label}</Text>
          {streak > 0 && <Text className="streak-chip">连续 {streak} 天</Text>}
          <Text className="tier-arrow">成就墙 ›</Text>
        </View>
        <View className="tier-track">
          <View className="tier-fill" style={{ width: `${tierProgressPct}%`, background: TIER_COLORS[tierIdx] }} />
        </View>
        {nextTier && <Text className="tier-next-hint">距离「{nextTier.label}」还差 {(nextTier.threshold - totalHours).toFixed(0)} 小时</Text>}
      </View>

      <View className="section">
        <Text className="section-label">数据洞察</Text>
        <View className="nav-row" onClick={() => Taro.navigateTo({ url: "/pages/net-pay/index" })}>
          <Text>净收益对比</Text>
          <Text className="nav-arrow">›</Text>
        </View>
      </View>

      <View className="section">
        <Text className="section-label">团队</Text>
        <View className="nav-row" onClick={() => Taro.navigateTo({ url: "/pages/team/index" })}>
          <Text>团队代记搬砖时长（组长模式）</Text>
          <Text className="nav-arrow">›</Text>
        </View>
      </View>

      {archivedEmployers.length > 0 && (
        <View className="section">
          <Text className="section-label">已停用的副本</Text>
          <View className="archived-list">
            {archivedEmployers.map((emp) => (
              <View className="archived-row" key={emp.id}>
                <View className="dot" style={{ background: emp.color }} />
                <Text className="archived-name">{emp.name}</Text>
                <View className="reactivate-chip" onClick={() => handleReactivate(emp.id)}>
                  <Text>重新启用</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="section">
        <Text className="section-label">关于</Text>
        <Text className="about-note">
          牛马打卡机 GrindClock 小程序版 · 数据独立存储在微信云开发，和网页版不互通
        </Text>
      </View>

      {loading && <Text className="empty-hint">加载中...</Text>}
    </View>
  );
}
