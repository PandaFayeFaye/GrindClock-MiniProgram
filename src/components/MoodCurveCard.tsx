import { useMemo, useState } from "react";
import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { updateTimeEntry } from "../lib/cloud";
import { dateKey, moodDetailByDay, payByDay } from "../lib/stats";
import { MOOD_KEYS, MOOD_Y, MOOD_COLOR } from "../lib/moods";
import type { Employer, Mood, TimeEntry } from "../lib/types";
import "./MoodCurveCard.scss";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function MoodCurveCard({
  personalConfirmed,
  employerById,
  onSaved,
}: {
  personalConfirmed: TimeEntry[];
  employerById: Map<string, Employer>;
  onSaved?: () => void;
}) {
  const moodDetailMap = useMemo(() => moodDetailByDay(personalConfirmed), [personalConfirmed]);
  const entriesByDayMap = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of personalConfirmed) {
      const key = dateKey(e.startTime);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [personalConfirmed]);

  const last7Days = useMemo(() => {
    const days: { key: string; label: string; mood?: Mood; note?: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d.getTime());
      const detail = moodDetailMap.get(key);
      days.push({ key, label: WEEKDAY_LABELS[d.getDay()], mood: detail?.mood, note: detail?.note });
    }
    return days;
  }, [moodDetailMap]);

  const [editingMoodDay, setEditingMoodDay] = useState<string | null>(null);
  const [draftMood, setDraftMood] = useState<Mood | undefined>(undefined);
  const [draftMoodNote, setDraftMoodNote] = useState("");
  const [saving, setSaving] = useState(false);

  function openMoodEditor(day: { key: string; mood?: Mood; note?: string }) {
    if (!entriesByDayMap.has(day.key)) return;
    setEditingMoodDay(day.key);
    setDraftMood(day.mood);
    setDraftMoodNote(day.note ?? "");
  }

  async function saveMoodEditor() {
    const dayEntries = entriesByDayMap.get(editingMoodDay!);
    if (!dayEntries || dayEntries.length === 0) return;
    const target = dayEntries.find((e) => e.mood) ?? dayEntries[0];
    setSaving(true);
    try {
      const removeCmd = Taro.cloud.database().command.remove();
      await updateTimeEntry(target.id, {
        mood: draftMood ?? (removeCmd as unknown as Mood),
        moodNote: draftMood && draftMoodNote.trim() ? draftMoodNote.trim() : (removeCmd as unknown as string),
      });
      setEditingMoodDay(null);
      onSaved?.();
    } catch (err) {
      console.error("Failed to save mood", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  const moodCounts = useMemo(() => {
    const counts: Record<Mood, number> = { crash: 0, normal: 0, great: 0, heartbeat: 0, slack: 0, grind: 0, ox: 0, flat: 0 };
    for (const d of last7Days) if (d.mood) counts[d.mood]++;
    return MOOD_KEYS.map((m) => ({ key: m.key, label: m.label, n: counts[m.key] })).filter((m) => m.n > 0);
  }, [last7Days]);

  const dailyPay = useMemo(() => payByDay(personalConfirmed, employerById), [personalConfirmed, employerById]);
  const moodPayInsight = useMemo(() => {
    const withMood = last7Days.filter((d) => d.mood);
    if (withMood.length === 0) return null;
    const best = withMood.reduce((a, b) => ((dailyPay.get(b.key) ?? 0) > (dailyPay.get(a.key) ?? 0) ? b : a));
    const pay = dailyPay.get(best.key) ?? 0;
    if (pay <= 0) return null;
    return best;
  }, [last7Days, dailyPay]);

  const bestMoodLabel = moodPayInsight?.mood ? MOOD_KEYS.find((m) => m.key === moodPayInsight.mood)?.label : undefined;

  return (
    <View className="mood-curve-card">
      <Text className="title">最近7天心情</Text>
      <View className="mood-curve">
        {last7Days.map((d) => {
          const y = d.mood ? MOOD_Y[d.mood] : 52;
          const loggable = !d.mood && entriesByDayMap.has(d.key);
          return (
            <View key={d.key} className="mood-point-col">
              <View className="mood-point-track">
                <View
                  className={`mood-point${d.mood ? "" : " empty"}${loggable ? " loggable" : ""}`}
                  style={{ top: `${y}%`, background: d.mood ? MOOD_COLOR[d.mood] : undefined }}
                  onClick={() => openMoodEditor(d)}
                />
              </View>
              <Text className="mood-x-label">{d.label}</Text>
            </View>
          );
        })}
      </View>

      {moodCounts.length > 0 && (
        <View className="mood-dist-row">
          {moodCounts.map(({ key, label, n }) => (
            <View className="mood-dist-chip" key={key}>
              <View className="mood-dist-dot" style={{ background: MOOD_COLOR[key] }} />
              <Text>{label} ×{n}</Text>
            </View>
          ))}
        </View>
      )}

      {editingMoodDay && (
        <View className="mood-editor">
          <View className="mood-edit-tags">
            {MOOD_KEYS.map((m) => (
              <View
                key={m.key}
                className={`mood-edit-tag${draftMood === m.key ? " selected" : ""}`}
                onClick={() => setDraftMood(draftMood === m.key ? undefined : m.key)}
              >
                <Text>{m.label}</Text>
              </View>
            ))}
          </View>
          {draftMood && (
            <Input
              className="mood-edit-note"
              maxlength={30}
              placeholder="加一句心情备注（可选）"
              value={draftMoodNote}
              onInput={(e) => setDraftMoodNote(e.detail.value)}
            />
          )}
          <View className="mood-editor-actions">
            <View className="mood-editor-cancel" onClick={() => setEditingMoodDay(null)}>
              <Text>取消</Text>
            </View>
            <Button className="mood-editor-save" loading={saving} onClick={saveMoodEditor}>
              保存
            </Button>
          </View>
        </View>
      )}

      <Text className="mood-companion">
        {moodPayInsight
          ? `周${moodPayInsight.label}心情是「${bestMoodLabel}」，也是这周赚得最多的一天`
          : "点一下某一天的圆点，记录/修改那天的心情"}
      </Text>
    </View>
  );
}
