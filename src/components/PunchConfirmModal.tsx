import { useState } from "react";
import { View, Text, Input, Textarea, Picker } from "@tarojs/components";
import type { Adjustment, Employer, Mood, TimeEntry } from "../lib/types";
import { entryHours, entryPay } from "../lib/pay";
import { currencySymbol } from "../lib/currency";
import { scheduleDurationHours, todaysSchedule } from "../lib/schedule";
import "./PunchConfirmModal.scss";

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

export interface PunchConfirmData {
  mood?: Mood;
  moodNote?: string;
  note?: string;
  adjustment?: Adjustment[];
  isOvertime: boolean;
  isHoliday: boolean;
  orderCount?: number;
  endTime: number;
  overtimeHours?: number;
}

export function PunchConfirmModal({
  employer,
  entry,
  onCancel,
  onConfirm,
}: {
  employer: Employer;
  entry: TimeEntry;
  onCancel: () => void;
  onConfirm: (data: PunchConfirmData) => void;
}) {
  const now = new Date();
  const [endTimeStr, setEndTimeStr] = useState(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  const [mood, setMood] = useState<Mood | undefined>(undefined);
  const [moodNote, setMoodNote] = useState("");
  const [note, setNote] = useState("");
  const [adjType, setAdjType] = useState<"none" | "bonus" | "deduction">("none");
  const [adjAmount, setAdjAmount] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [orderCount, setOrderCount] = useState("");
  const [overtimeHoursStr, setOvertimeHoursStr] = useState("");
  const [overtimeTouched, setOvertimeTouched] = useState(false);

  const adjustment: Adjustment[] | undefined =
    adjType !== "none" && Number(adjAmount) > 0 ? [{ type: adjType, amount: Number(adjAmount) }] : undefined;

  const recurringAdjustment = employer.defaultAdjustments ?? [];
  const showRateFlags = employer.overtimeMultiplier !== undefined || employer.holidayMultiplier !== undefined || employer.payType === "base+overtime";
  const isPerOrder = employer.payType === "per-order";

  const schedule = todaysSchedule(employer, new Date(entry.startTime));
  const scheduledHours = schedule ? scheduleDurationHours(schedule) : 0;
  const supportsAutoOvertime = schedule !== null && (employer.payType === "monthly" || employer.payType === "comprehensive");

  const computedEndTime = (() => {
    const [h, m] = endTimeStr.split(":").map(Number);
    const startDate = new Date(entry.startTime);
    let candidate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), h, m).getTime();
    if (candidate < entry.startTime) candidate += 24 * 3_600_000;
    return Math.min(candidate, Date.now());
  })();

  const hours = entryHours({ ...entry, endTime: computedEndTime });
  const detectedOvertimeHours = supportsAutoOvertime ? Math.max(0, hours - scheduledHours) : 0;
  const showOvertimeSection = supportsAutoOvertime && detectedOvertimeHours > 0.05;
  const overtimeHours = showOvertimeSection
    ? Number(overtimeTouched ? overtimeHoursStr : detectedOvertimeHours.toFixed(1)) || 0
    : undefined;

  const previewEntry: TimeEntry = {
    ...entry,
    endTime: computedEndTime,
    adjustment: [...recurringAdjustment, ...(adjustment ?? [])],
    isOvertime,
    isHoliday,
    orderCount: isPerOrder ? Number(orderCount) || 0 : entry.orderCount,
    overtimeHours,
  };
  const pay = entryPay(employer, previewEntry);

  return (
    <View className="punch-modal-backdrop" catchMove onClick={onCancel}>
      <View className="punch-modal-sheet" onClick={(e) => e.stopPropagation()} catchMove>
        <View className="punch-modal-handle" />

        <View className="punch-modal-summary">
          <Text className="emp">{employer.name} · 本次工时</Text>
          <View className="end-time-row">
            <Text>实际下班时间</Text>
            <Picker mode="time" value={endTimeStr} onChange={(e) => setEndTimeStr(e.detail.value)}>
              <View className="end-time-value">{endTimeStr}</View>
            </Picker>
          </View>
          <Text className="dur">{hours.toFixed(1)}小时</Text>
          <Text className="pay">预估收入 {currencySymbol(employer.currency)}{pay.toFixed(1)}</Text>
          {recurringAdjustment.length > 0 && (
            <Text className="recurring-adj-note">已自动套用{recurringAdjustment.length}条该副本的默认补贴/扣款规则</Text>
          )}
        </View>

        {isPerOrder && (
          <View className="section">
            <Text className="section-label">跑了几单？</Text>
            <Input className="adj-input" type="number" placeholder="单数" value={orderCount} onInput={(e) => setOrderCount(e.detail.value)} />
          </View>
        )}

        <View className="section">
          <Text className="section-label">今天感觉怎么样？<Text className="opt">（可跳过）</Text></Text>
          <View className="mood-tags">
            {MOOD_OPTIONS.map((m) => (
              <View key={m.key} className={`mood-tag${mood === m.key ? " selected" : ""}`} onClick={() => setMood(mood === m.key ? undefined : m.key)}>
                <Text>{m.label}</Text>
              </View>
            ))}
          </View>
          {mood && (
            <Input className="adj-input" maxlength={20} placeholder="想补一句吗？（可跳过）" value={moodNote} onInput={(e) => setMoodNote(e.detail.value)} />
          )}
        </View>

        {showRateFlags && (
          <View className="section">
            <Text className="section-label">加班 / 节假日？<Text className="opt">（影响倍率计算）</Text></Text>
            <View className="adj-row">
              <View className={`adj-toggle${isOvertime ? " selected" : ""}`} onClick={() => setIsOvertime(!isOvertime)}><Text>加班</Text></View>
              <View className={`adj-toggle${isHoliday ? " selected" : ""}`} onClick={() => setIsHoliday(!isHoliday)}><Text>节假日</Text></View>
            </View>
          </View>
        )}

        {showOvertimeSection && (
          <View className="overtime-detected">
            <Text className="section-label">检测到加班</Text>
            <Text className="overtime-detected-note">排班 {scheduledHours.toFixed(1)} 小时，实际工作 {hours.toFixed(1)} 小时</Text>
            <View className="overtime-detected-row">
              <Input
                className="adj-input"
                type="digit"
                value={overtimeTouched ? overtimeHoursStr : detectedOvertimeHours.toFixed(1)}
                onInput={(e) => { setOvertimeTouched(true); setOvertimeHoursStr(e.detail.value); }}
              />
              <Text className="overtime-detected-unit">小时加班</Text>
            </View>
            <Text className="overtime-detected-mult">
              {employer.overtimeRateMode === "fixed" && employer.overtimeHourlyRate
                ? `按固定加班时薪 ${currencySymbol(employer.currency)}${employer.overtimeHourlyRate}/小时计算`
                : `按 ${(employer.overtimeMultiplier ?? 1.5).toFixed(1)}x 加班工资计算`}
            </Text>
          </View>
        )}

        <View className="section">
          <Text className="section-label">临时补贴/扣款<Text className="opt">（仅本次）</Text></Text>
          <View className="adj-row">
            <View className={`adj-toggle${adjType === "none" ? " selected" : ""}`} onClick={() => setAdjType("none")}><Text>无</Text></View>
            <View className={`adj-toggle${adjType === "bonus" ? " selected" : ""}`} onClick={() => setAdjType("bonus")}><Text>奖励</Text></View>
            <View className={`adj-toggle${adjType === "deduction" ? " selected" : ""}`} onClick={() => setAdjType("deduction")}><Text>扣款</Text></View>
          </View>
          {adjType !== "none" && (
            <Input className="adj-input" type="digit" placeholder="金额" value={adjAmount} onInput={(e) => setAdjAmount(e.detail.value)} />
          )}
        </View>

        <View className="section">
          <Text className="section-label">备注<Text className="opt">（可选）</Text></Text>
          <Textarea className="note-input" placeholder="随便写点什么" value={note} onInput={(e) => setNote(e.detail.value)} />
        </View>

        <View
          className="confirm-btn"
          onClick={() => onConfirm({
            mood,
            moodNote: mood ? (moodNote.trim() || undefined) : undefined,
            note: note.trim() || undefined,
            adjustment,
            isOvertime,
            isHoliday,
            orderCount: isPerOrder ? Number(orderCount) || 0 : undefined,
            endTime: computedEndTime,
            overtimeHours,
          })}
        >
          <Text>确认，保存</Text>
        </View>
      </View>
    </View>
  );
}
