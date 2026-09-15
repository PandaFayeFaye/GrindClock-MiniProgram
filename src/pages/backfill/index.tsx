import { useState, useEffect } from "react";
import { View, Text, Input, Textarea, Picker, Button, Image, Switch } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { fetchEmployers, addManualEntry, fetchTimeEntryById, updateTimeEntry, deleteTimeEntry } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { todaysSchedule, scheduleDurationHours } from "../../lib/schedule";
import { currencySymbol } from "../../lib/currency";
import type { Adjustment, Employer, Mood } from "../../lib/types";
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Backfill() {
  const router = useRouter();
  const workerId = router.params.workerId;
  const editId = router.params.editId;
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [employerIdx, setEmployerIdx] = useState(0);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [mode, setMode] = useState<"duration" | "range">("duration");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [startTimeStr, setStartTimeStr] = useState("09:00");
  const [endTimeStr, setEndTimeStr] = useState("18:00");
  const [isOvertime, setIsOvertime] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [orderCount, setOrderCount] = useState("");
  const [mood, setMood] = useState<Mood | undefined>(undefined);
  const [note, setNote] = useState("");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [overtimeHoursStr, setOvertimeHoursStr] = useState("");
  const [overtimeTouched, setOvertimeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadedEdit, setLoadedEdit] = useState(!editId);
  const [prefilledDefaults, setPrefilledDefaults] = useState(false);

  useEffect(() => {
    // When editing, the effect below owns loading employers (it needs to
    // include a possibly-archived one) -- running both risks this one's
    // resolution racing past that one's and clobbering it with a shorter,
    // active-only list that the already-set employerIdx no longer matches.
    if (editId) return;
    fetchEmployers().then((docs) => {
      const active = docs.map(toEmployer).filter((e) => !e.archived);
      setEmployers(active);
    });
  }, [editId]);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const doc = await fetchTimeEntryById(editId);
      if (!doc) {
        setLoadedEdit(true);
        return;
      }
      const entry = toTimeEntry(doc);
      const allEmployers = await fetchEmployers();
      const emp = allEmployers.map(toEmployer).find((e) => e.id === entry.employerId);
      const active = allEmployers.map(toEmployer).filter((e) => !e.archived);
      const fullList = emp && !active.some((e) => e.id === emp.id) ? [...active, emp] : active;
      setEmployers(fullList);
      const idx = fullList.findIndex((e) => e.id === entry.employerId);
      if (idx >= 0) setEmployerIdx(idx);

      const start = new Date(entry.startTime);
      const end = new Date(entry.endTime ?? entry.startTime);
      setDate(toDateInputValue(start));
      setMode("range");
      setStartTimeStr(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
      setEndTimeStr(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
      setIsOvertime(!!entry.isOvertime);
      setIsHoliday(!!entry.isHoliday);
      if (entry.overtimeHours) {
        setOvertimeTouched(true);
        setOvertimeHoursStr(String(entry.overtimeHours));
      }
      setOrderCount(entry.orderCount ? String(entry.orderCount) : "");
      setMood(entry.mood);
      setNote(entry.note ?? "");
      setAdjustments(entry.adjustment ?? []);
      setPrefilledDefaults(true); // editing an existing entry -- never overwrite with the employer's current defaults
      setLoadedEdit(true);
      Taro.setNavigationBarTitle({ title: "编辑记录" });
    })();
    // Only ever re-run if editId itself changes -- this is a one-time load into local form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const employer = employers[employerIdx];
  const isPerOrder = employer?.payType === "per-order";

  useEffect(() => {
    if (prefilledDefaults || !employer) return;
    setAdjustments(employer.defaultAdjustments ?? []);
    setPrefilledDefaults(true);
  }, [prefilledDefaults, employer]);

  function computeRange(): { start: number; end: number } | null {
    const dayStart = new Date(`${date}T00:00:00`).getTime();
    if (mode === "duration") {
      const h = Number(hours) || 0;
      const m = Number(minutes) || 0;
      if (h === 0 && m === 0) return null;
      const start = dayStart + 9 * 3_600_000;
      return { start, end: start + h * 3_600_000 + m * 60_000 };
    }
    const [sh, sm] = startTimeStr.split(":").map(Number);
    const [eh, em] = endTimeStr.split(":").map(Number);
    const start = dayStart + sh * 3_600_000 + sm * 60_000;
    let end = dayStart + eh * 3_600_000 + em * 60_000;
    if (end <= start) end += 24 * 3_600_000;
    return { start, end };
  }

  const previewRange = computeRange();
  const enteredHours = previewRange ? (previewRange.end - previewRange.start) / 3_600_000 : 0;
  const schedule = employer ? todaysSchedule(employer, new Date(`${date}T00:00:00`)) : null;
  const scheduledHours = schedule ? scheduleDurationHours(schedule) : 0;
  const supportsAutoOvertime = !!schedule && !!employer && (employer.payType === "monthly" || employer.payType === "comprehensive");
  const detectedOvertimeHours = supportsAutoOvertime ? Math.max(0, enteredHours - scheduledHours) : 0;
  const showOvertimeSection = supportsAutoOvertime && detectedOvertimeHours > 0.05;
  const overtimeHoursValue = showOvertimeSection
    ? Number(overtimeTouched ? overtimeHoursStr : detectedOvertimeHours.toFixed(1)) || 0
    : undefined;

  async function handleSave() {
    if (!employer) {
      Taro.showToast({ title: "先添加一个打工副本吧", icon: "none" });
      return;
    }
    const range = computeRange();
    if (!range) {
      Taro.showToast({ title: "填一下工时时长", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const base = {
        employerId: employer.id,
        startTime: range.start,
        endTime: range.end,
        status: "confirmed" as const,
        source: "manual" as const,
        isOvertime,
        isHoliday,
        ...(workerId ? { workerId } : {}),
      };
      if (editId) {
        const removeCmd = Taro.cloud.database().command.remove();
        await updateTimeEntry(editId, {
          ...base,
          mood: mood ?? (removeCmd as unknown as Mood),
          note: note.trim() ? note.trim() : (removeCmd as unknown as string),
          adjustment: adjustments.length > 0 ? adjustments : (removeCmd as unknown as Adjustment[]),
          overtimeHours: overtimeHoursValue ?? (removeCmd as unknown as number),
          orderCount: isPerOrder && orderCount ? Number(orderCount) : (removeCmd as unknown as number),
        });
      } else {
        await addManualEntry({
          ...base,
          ...(mood ? { mood } : {}),
          ...(overtimeHoursValue ? { overtimeHours: overtimeHoursValue } : {}),
          ...(isPerOrder && orderCount ? { orderCount: Number(orderCount) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(adjustments.length > 0 ? { adjustment: adjustments } : {}),
        });
      }
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to save backfill entry", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      Taro.showToast({ title: "再点一次，确认删除这条记录", icon: "none" });
      return;
    }
    setDeleting(true);
    try {
      await deleteTimeEntry(editId);
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to delete entry", err);
      Taro.showToast({ title: "删除失败，重试一下", icon: "none" });
    } finally {
      setDeleting(false);
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
        <Text className="field-label">录入方式</Text>
        <View className="mode-tabs">
          <View className={`mode-tab${mode === "duration" ? " active" : ""}`} onClick={() => setMode("duration")}>
            <Text>时长</Text>
          </View>
          <View className={`mode-tab${mode === "range" ? " active" : ""}`} onClick={() => setMode("range")}>
            <Text>时间段</Text>
          </View>
        </View>
      </View>

      {mode === "duration" ? (
        <View className="field">
          <Text className="field-label">工时时长</Text>
          <View className="time-row">
            <Input
              className="time-input"
              type="digit"
              placeholder="小时"
              value={hours}
              onInput={(e) => { setHours(e.detail.value); setOvertimeTouched(false); }}
            />
            <Text className="time-sep">小时</Text>
            <Input
              className="time-input"
              type="digit"
              placeholder="分钟"
              value={minutes}
              onInput={(e) => { setMinutes(e.detail.value); setOvertimeTouched(false); }}
            />
            <Text className="time-sep">分钟</Text>
          </View>
        </View>
      ) : (
        <View className="field">
          <Text className="field-label">上下班时间</Text>
          <View className="time-row">
            <Picker mode="time" value={startTimeStr} onChange={(e) => { setStartTimeStr(e.detail.value); setOvertimeTouched(false); }}>
              <View className="picker-value time-range-value">{startTimeStr}</View>
            </Picker>
            <Text className="time-sep">→</Text>
            <Picker mode="time" value={endTimeStr} onChange={(e) => { setEndTimeStr(e.detail.value); setOvertimeTouched(false); }}>
              <View className="picker-value time-range-value">{endTimeStr}</View>
            </Picker>
          </View>
        </View>
      )}

      <View className="ot-toggle-row">
        <Text>整段按加班工资计算</Text>
        <Switch checked={isOvertime} onChange={(e) => setIsOvertime(e.detail.value)} />
      </View>
      <View className="ot-toggle-row">
        <Text>整段按节假日工资计算</Text>
        <Switch checked={isHoliday} onChange={(e) => setIsHoliday(e.detail.value)} />
      </View>

      {showOvertimeSection && employer && (
        <View className="overtime-detected">
          <View className="ot-title-row">
            <Image className="ot-title-icon" src="/icons/flame-coral.png" mode="aspectFit" />
            <Text className="ot-title">检测到加班</Text>
          </View>
          <Text className="overtime-detected-note">排班 {scheduledHours.toFixed(1)} 小时，实际填写 {enteredHours.toFixed(1)} 小时</Text>
          <View className="ot-block">
            <Text className="ot-block-label">额外超出时长（加班）</Text>
            <View className="overtime-detected-row">
              <Input
                className="ot-hours-input"
                type="digit"
                value={overtimeTouched ? overtimeHoursStr : detectedOvertimeHours.toFixed(1)}
                onInput={(e) => { setOvertimeTouched(true); setOvertimeHoursStr(e.detail.value); }}
              />
              <Text className="overtime-detected-unit">小时</Text>
            </View>
          </View>
          <View className="ot-block">
            <Text className="ot-block-label">加班计算规则</Text>
            <Text className="overtime-detected-mult">
              {employer.overtimeRateMode === "fixed" && employer.overtimeHourlyRate
                ? `按固定加班时薪 ${currencySymbol(employer.currency)}${employer.overtimeHourlyRate}/小时计算`
                : `按 ${(employer.overtimeMultiplier ?? 1.5).toFixed(1)}x 加班工资计算`}
            </Text>
          </View>
        </View>
      )}

      {isPerOrder && (
        <View className="field">
          <Text className="field-label">单量</Text>
          <Input
            className="hours-input"
            type="digit"
            placeholder="比如：12"
            value={orderCount}
            onInput={(e) => setOrderCount(e.detail.value)}
          />
        </View>
      )}

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

      <View className="field">
        <Text className="field-label">补贴/扣款（可选，已带入副本默认规则）</Text>
        {adjustments.map((adj, i) => (
          <View className="adj-row" key={i}>
            <Picker
              mode="selector"
              range={["奖励", "扣款"]}
              value={adj.type === "bonus" ? 0 : 1}
              onChange={(e) => setAdjustments(adjustments.map((a, j) => (j === i ? { ...a, type: Number(e.detail.value) === 0 ? "bonus" : "deduction" } : a)))}
            >
              <View className="picker-value compact">{adj.type === "bonus" ? "奖励" : "扣款"}</View>
            </Picker>
            <Input
              className="text-input compact"
              type="digit"
              placeholder="金额"
              value={adj.amount ? String(adj.amount) : ""}
              onInput={(e) => setAdjustments(adjustments.map((a, j) => (j === i ? { ...a, amount: Number(e.detail.value) || 0 } : a)))}
            />
            <Input
              className="text-input compact"
              placeholder="备注（如：夜班补贴）"
              value={adj.note ?? ""}
              onInput={(e) => setAdjustments(adjustments.map((a, j) => (j === i ? { ...a, note: e.detail.value } : a)))}
            />
            <View className="remove-adj-btn" onClick={() => setAdjustments(adjustments.filter((_, j) => j !== i))}>
              <Text>×</Text>
            </View>
          </View>
        ))}
        <View className="add-adj-btn" onClick={() => setAdjustments([...adjustments, { type: "bonus", amount: 0 }])}>
          <Text>+ 添加规则</Text>
        </View>
      </View>

      <View className="field">
        <Text className="field-label">备注（可选）</Text>
        <Textarea className="note-input" placeholder="想记点什么都可以写这里" value={note} onInput={(e) => setNote(e.detail.value)} />
      </View>

      {editId && (
        <View className="danger-zone">
          <Button className={`delete-entry-btn${confirmDelete ? " confirming" : ""}`} loading={deleting} onClick={handleDelete}>
            {confirmDelete ? "再点一次，确认删除这条记录" : "删除这条记录"}
          </Button>
        </View>
      )}

      <View className="save-btn-bar">
        <Button className="save-btn" loading={saving} disabled={!loadedEdit} onClick={handleSave}>
          保存
        </Button>
      </View>
    </View>
  );
}
