import { useEffect, useMemo, useState } from "react";
import { View, Text, Input, Button, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { updateTimeEntry } from "../lib/cloud";
import { dateKey, moodDetailByDay, payByDay } from "../lib/stats";
import { MOOD_KEYS, MOOD_Y, MOOD_COLOR, MOOD_ICON } from "../lib/moods";
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

  const [curveSize, setCurveSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    Taro.createSelectorQuery()
      .select(".mood-curve")
      .boundingClientRect((rect) => {
        if (rect && "width" in rect && rect.width) setCurveSize({ w: rect.width, h: rect.height });
      })
      .exec();
  }, []);

  const moodLineSegments = useMemo(() => {
    const points = last7Days
      .map((d, i) => ({ x: (i / 6) * 100, y: d.mood ? MOOD_Y[d.mood] : null }))
      .filter((p): p is { x: number; y: number } => p.y !== null);
    if (!curveSize.w || points.length < 2) return [];
    const segs: { x: number; y: number; length: number; angle: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const ax = (a.x / 100) * curveSize.w;
      const ay = (a.y / 100) * curveSize.h;
      const bx = (b.x / 100) * curveSize.w;
      const by = (b.y / 100) * curveSize.h;
      const dx = bx - ax;
      const dy = by - ay;
      segs.push({ x: ax, y: ay, length: Math.sqrt(dx * dx + dy * dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI });
    }
    return segs;
  }, [last7Days, curveSize]);

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
      <Text className="title">本周心情曲线（仅自己可见）</Text>
      <View className="mood-curve">
        {moodLineSegments.map((seg, i) => (
          <View
            key={i}
            className="mood-line-segment"
            style={{
              left: `${seg.x}px`,
              top: `${seg.y}px`,
              width: `${seg.length}px`,
              transform: `rotate(${seg.angle}deg)`,
            }}
          />
        ))}
        {last7Days.map((d, i) => {
          const x = (i / 6) * 100;
          const y = d.mood ? MOOD_Y[d.mood] : 52;
          const loggable = !d.mood && entriesByDayMap.has(d.key);
          return (
            <View
              key={d.key}
              className={`mood-point${d.mood ? "" : " empty"}${loggable ? " loggable" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => openMoodEditor(d)}
            >
              {d.mood ? (
                <View className="mood-point-fill" style={{ background: MOOD_COLOR[d.mood] }}>
                  <Image className="mood-point-icon" src={MOOD_ICON[d.mood]} mode="aspectFit" />
                </View>
              ) : (
                <View className="mood-dot" />
              )}
            </View>
          );
        })}
        <View className="mood-x-labels">
          {last7Days.map((d) => <Text key={d.key} className="mood-x-label">{d.label}</Text>)}
        </View>
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
