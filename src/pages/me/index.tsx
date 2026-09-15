import { useState, useCallback } from "react";
import { View, Text, Input, Image, Switch } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, fetchUserProfile, setUserProfile, reactivateEmployer } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours } from "../../lib/pay";
import { currentStreak } from "../../lib/stats";
import { TIERS, TIER_COLORS, currentTierIndex } from "../../lib/tiers";
import { characterImageSrc, mbtiGroupColor, type AnimalKey } from "../../lib/avatar";
import { SETTINGS_KEYS, getLocalToggle, setLocalToggle } from "../../lib/settings";
import { MoodCurveCard } from "../../components/MoodCurveCard";
import { ExportPanel } from "../../components/ExportPanel";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

export default function Me() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [nickname, setNickname] = useState("");
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [animal, setAnimal] = useState<AnimalKey | undefined>(undefined);
  const [mbti, setMbti] = useState<string | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);
  const [locationPunch, setLocationPunchState] = useState(() => getLocalToggle(SETTINGS_KEYS.locationPunch, false));
  const [dailyRecapPush, setDailyRecapPushState] = useState(() => getLocalToggle(SETTINGS_KEYS.dailyRecapPush, true));
  const [aiPhoto, setAiPhotoState] = useState(() => getLocalToggle(SETTINGS_KEYS.aiPhoto, true));
  const [aiVoice, setAiVoiceState] = useState(() => getLocalToggle(SETTINGS_KEYS.aiVoice, true));
  const [simpleMode, setSimpleModeState] = useState(() => getLocalToggle(SETTINGS_KEYS.simpleMode, false));

  function toggleSetting(key: string, setter: (v: boolean) => void, value: boolean) {
    setLocalToggle(key, value);
    setter(value);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs, profile] = await Promise.all([fetchEmployers(), fetchTimeEntries(), fetchUserProfile()]);
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
      setNickname(profile?.nickname ?? "");
      setAnimal(profile?.animal as AnimalKey | undefined);
      setMbti(profile?.mbti);
    } catch (err) {
      console.error("Failed to load me page", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useDidShow(() => {
    reload();
    Taro.eventCenter.trigger("tabBarChange", 2);
  });

  const personalConfirmed = entries.filter((e) => !e.workerId && e.status === "confirmed" && e.endTime != null);
  const employerById = new Map(employers.map((e) => [e.id, e]));
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
        <View
          className="avatar-btn"
          style={{ borderColor: mbti ? mbtiGroupColor(mbti) : "#1A1A1A" }}
          onClick={() => Taro.navigateTo({ url: `/pages/avatar-picker/index?animal=${animal ?? "cow"}${mbti ? `&mbti=${mbti}` : ""}` })}
        >
          <Image className="avatar-btn-img" src={characterImageSrc(animal ?? "cow", mbti)} mode="aspectFit" />
          {mbti && <Text className="avatar-mbti-tag">{mbti}</Text>}
        </View>
        <View className="profile-info">
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
          <View className="profile-meta">
            <Text className="tier-chip">{tier.label}</Text>
            {streak > 0 && <Text className="streak-chip-mini">连续 {streak} 天</Text>}
          </View>
        </View>
        <View className="badge-wall-link" onClick={() => Taro.navigateTo({ url: "/pages/badges/index" })}>
          <Text>成就墙 ›</Text>
        </View>
      </View>

      <View className="tier-progress-card">
        <View className="tier-track">
          <View className="tier-fill" style={{ width: `${tierProgressPct}%`, background: TIER_COLORS[tierIdx] }} />
        </View>
        {nextTier && <Text className="tier-next-hint">距离「{nextTier.label}」还差 {(nextTier.threshold - totalHours).toFixed(0)} 小时</Text>}
      </View>

      <MoodCurveCard personalConfirmed={personalConfirmed} employerById={employerById} onSaved={reload} />

      <View className="section">
        <Text className="section-label">数据洞察</Text>
        <View className="nav-row" onClick={() => Taro.navigateTo({ url: "/pages/net-pay/index" })}>
          <Text>净收益对比</Text>
          <Text className="nav-arrow">›</Text>
        </View>
        <View className="nav-row" onClick={() => Taro.navigateTo({ url: "/pages/recap/index" })}>
          <Text>本月战绩总结</Text>
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
        <Text className="section-label">打卡设置</Text>
        <View className="toggle-row">
          <View className="toggle-label">
            <Text className="t">打卡时记录位置</Text>
            <Text className="s">打卡时附带当前定位，方便核对是否在岗</Text>
          </View>
          <Switch checked={locationPunch} onChange={(e) => toggleSetting(SETTINGS_KEYS.locationPunch, setLocationPunchState, e.detail.value)} />
        </View>
        <View className="toggle-row">
          <View className="toggle-label">
            <Text className="t">每日小结推送</Text>
            <Text className="s">每天下班后收到一条当日战绩小结</Text>
          </View>
          <Switch checked={dailyRecapPush} onChange={(e) => toggleSetting(SETTINGS_KEYS.dailyRecapPush, setDailyRecapPushState, e.detail.value)} />
        </View>
      </View>

      <View className="section">
        <Text className="section-label">AI 功能</Text>
        <View className="toggle-row">
          <View className="toggle-label">
            <Text className="t">拍照记工</Text>
            <Text className="s">在"AI 记工"里显示拍照识别入口</Text>
          </View>
          <Switch checked={aiPhoto} onChange={(e) => toggleSetting(SETTINGS_KEYS.aiPhoto, setAiPhotoState, e.detail.value)} />
        </View>
        <View className="toggle-row">
          <View className="toggle-label">
            <Text className="t">语音记工</Text>
            <Text className="s">在"AI 记工"里显示语音识别入口</Text>
          </View>
          <Switch checked={aiVoice} onChange={(e) => toggleSetting(SETTINGS_KEYS.aiVoice, setAiVoiceState, e.detail.value)} />
        </View>
      </View>

      <View className="section">
        <Text className="section-label">数据</Text>
        <View className="nav-row" onClick={() => setExportOpen(true)}>
          <Text>导出全部数据</Text>
          <Text className="nav-arrow">›</Text>
        </View>
      </View>

      <View className="section">
        <Text className="section-label">趣味</Text>
        <View className="toggle-row">
          <View className="toggle-label">
            <Text className="t">简洁模式</Text>
            <Text className="s">首页隐藏搬砖搭子，界面更简洁</Text>
          </View>
          <Switch checked={simpleMode} onChange={(e) => toggleSetting(SETTINGS_KEYS.simpleMode, setSimpleModeState, e.detail.value)} />
        </View>
      </View>

      <View className="section">
        <Text className="section-label">关于</Text>
        <Text className="about-note">
          牛马打卡机 GrindClock 小程序版 · 数据独立存储在微信云开发，和网页版不互通
        </Text>
      </View>

      {loading && <Text className="empty-hint">加载中...</Text>}

      {exportOpen && (
        <ExportPanel
          entries={personalConfirmed}
          employerById={employerById}
          filenameBase="grindclock-all-data"
          onClose={() => setExportOpen(false)}
        />
      )}
    </View>
  );
}
