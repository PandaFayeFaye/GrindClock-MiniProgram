import { useState, useEffect } from "react";
import { View, Text, Input, Picker, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { fetchEmployers, addManualEntry } from "../../lib/cloud";
import { toEmployer } from "../../lib/adapt";
import type { Employer, Mood } from "../../lib/types";
import "./index.scss";

const MOOD_OPTIONS: { key: Mood; label: string }[] = [
  { key: "crash", label: "崩溃" },
  { key: "ox", label: "社畜" },
  { key: "flat", label: "躺平" },
  { key: "normal", label: "普通" },
  { key: "slack", label: "摸鱼" },
  { key: "great", label: "爽" },
  { key: "grind", label: "爆肝" },
  { key: "heartbeat", label: "心动" },
];

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Backfill() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [employerIdx, setEmployerIdx] = useState(0);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [hours, setHours] = useState("");
  const [mood, setMood] = useState<Mood | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEmployers().then((docs) => {
      setEmployers(docs.map(toEmployer).filter((e) => !e.archived));
    });
  }, []);

  const employer = employers[employerIdx];

  async function handleSave() {
    if (!employer) {
      Taro.showToast({ title: "先添加一个打工副本吧", icon: "none" });
      return;
    }
    const h = Number(hours);
    if (!h || h <= 0) {
      Taro.showToast({ title: "填一下工时时长", icon: "none" });
      return;
    }
    const startTime = new Date(`${date}T09:00:00`).getTime();
    const endTime = startTime + h * 3_600_000;
    setSaving(true);
    try {
      await addManualEntry({
        employerId: employer.id,
        startTime,
        endTime,
        status: "confirmed",
        source: "manual",
        ...(mood ? { mood } : {}),
      });
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to backfill entry", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="backfill-form">
      <View className="field">
        <Text className="field-label">打工副本</Text>
        {employers.length === 0 ? (
          <Text className="empty-hint">还没有打工副本，先去首页添加一个</Text>
        ) : (
          <Picker
            mode="selector"
            range={employers.map((e) => e.name)}
            value={employerIdx}
            onChange={(e) => setEmployerIdx(Number(e.detail.value))}
          >
            <View className="picker-value">{employer?.name}</View>
          </Picker>
        )}
      </View>

      <View className="field">
        <Text className="field-label">日期</Text>
        <Picker mode="date" value={date} onChange={(e) => setDate(e.detail.value)}>
          <View className="picker-value">{date}</View>
        </Picker>
      </View>

      <View className="field">
        <Text className="field-label">工时时长（小时）</Text>
        <Input
          className="hours-input"
          type="digit"
          placeholder="比如：6"
          value={hours}
          onInput={(e) => setHours(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="field-label">今天感觉怎么样？（可选）</Text>
        <View className="mood-grid">
          {MOOD_OPTIONS.map((m) => (
            <View
              key={m.key}
              className={`mood-tag${mood === m.key ? " selected" : ""}`}
              onClick={() => setMood(mood === m.key ? undefined : m.key)}
            >
              <Text>{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Button className="save-btn" loading={saving} onClick={handleSave}>
        保存
      </Button>
    </View>
  );
}
