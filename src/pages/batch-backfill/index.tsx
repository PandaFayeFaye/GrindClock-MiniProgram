import { useEffect, useMemo, useState } from "react";
import { View, Text, Picker, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, addManualEntries, deleteTimeEntries } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { WEEKDAYS, combineDateAndTime, scheduleDurationHours, type WeekdayKey } from "../../lib/schedule";
import { dateKey } from "../../lib/stats";
import { currencySymbol } from "../../lib/currency";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  "0": "周日", "1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六",
};

type DayTimes = Partial<Record<WeekdayKey, { start: string; end: string }>>;

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function BatchBackfill() {
  const [mode, setMode] = useState<"create" | "delete">("create");
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    Promise.all([fetchEmployers(), fetchTimeEntries()]).then(([empDocs, entryDocs]) => {
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
    });
  }, []);

  const activeEmployers = useMemo(() => employers.filter((e) => !e.archived), [employers]);
  const [employerIdx, setEmployerIdx] = useState(0);
  const selectedEmployer = activeEmployers[employerIdx];
  const supportsAutoOvertime = selectedEmployer?.scheduleMode === "fixed"
    && (selectedEmployer.payType === "monthly" || selectedEmployer.payType === "comprehensive");

  const today = toDateInputValue(new Date());
  const [rangeStart, setRangeStart] = useState(today);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [dayTimes, setDayTimes] = useState<DayTimes>({
    "1": { start: "09:00", end: "18:00" },
    "2": { start: "09:00", end: "18:00" },
    "3": { start: "09:00", end: "18:00" },
    "4": { start: "09:00", end: "18:00" },
    "5": { start: "09:00", end: "18:00" },
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeDays = useMemo(() => new Set(Object.keys(dayTimes) as WeekdayKey[]), [dayTimes]);

  function toggleDay(key: WeekdayKey) {
    setDayTimes((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        const existing = Object.values(prev)[0];
        next[key] = existing ? { ...existing } : { start: "09:00", end: "18:00" };
      }
      return next;
    });
    setConfirmDelete(false);
  }

  const matchingDateKeys = useMemo(() => {
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (start > end) return new Set<string>();
    const keys = new Set<string>();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (activeDays.has(String(d.getDay()) as WeekdayKey)) keys.add(dateKey(d.getTime()));
    }
    return keys;
  }, [rangeStart, rangeEnd, activeDays]);

  const matchingDates = useMemo(() => {
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (start > end) return [];
    const dates: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (activeDays.has(String(d.getDay()) as WeekdayKey)) dates.push(new Date(d));
    }
    return dates;
  }, [rangeStart, rangeEnd, activeDays]);

  const matchingEntries = useMemo(
    () => (selectedEmployer ? entries.filter((e) => !e.workerId && e.employerId === selectedEmployer.id && matchingDateKeys.has(dateKey(e.startTime))) : []),
    [entries, selectedEmployer, matchingDateKeys],
  );

  async function handleCreate() {
    if (!selectedEmployer || matchingDates.length === 0) return;
    setSaving(true);
    const newEntries: Omit<TimeEntry, "id">[] = matchingDates.map((date) => {
      const weekday = String(date.getDay()) as WeekdayKey;
      const day = dayTimes[weekday]!;
      const start = combineDateAndTime(date, day.start);
      let end = combineDateAndTime(date, day.end);
      if (end <= start) end += 24 * 3_600_000;
      const enteredHours = (end - start) / 3_600_000;

      const scheduledDay = selectedEmployer.fixedSchedule?.[weekday];
      const overtimeHours = supportsAutoOvertime && scheduledDay
        ? Math.max(0, enteredHours - scheduleDurationHours(scheduledDay))
        : 0;

      return {
        employerId: selectedEmployer.id,
        startTime: start,
        endTime: end,
        status: "confirmed",
        source: "manual",
        ...(overtimeHours > 0.05 ? { overtimeHours } : {}),
      } as Omit<TimeEntry, "id">;
    });
    try {
      await addManualEntries(newEntries);
      Taro.navigateBack();
    } catch (err) {
      console.error("Batch create failed", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (matchingEntries.length === 0) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      Taro.showToast({ title: `再点一次，确认删除${matchingEntries.length}条`, icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await deleteTimeEntries(matchingEntries.map((e) => e.id));
      Taro.navigateBack();
    } catch (err) {
      console.error("Batch delete failed", err);
      Taro.showToast({ title: "删除失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="batch-form">
      <View className="mode-tabs">
        <View className={`mode-tab${mode === "create" ? " active" : ""}`} onClick={() => { setMode("create"); setConfirmDelete(false); }}>
          <Text>批量创建</Text>
        </View>
        <View className={`mode-tab${mode === "delete" ? " active" : ""}`} onClick={() => { setMode("delete"); setConfirmDelete(false); }}>
          <Text>批量删除</Text>
        </View>
      </View>

      <View className="field">
        <Text className="field-label">打工副本</Text>
        {activeEmployers.length === 0 ? (
          <Text className="empty-hint">还没有打工副本</Text>
        ) : (
          <Picker mode="selector" range={activeEmployers.map((e) => e.name)} value={employerIdx} onChange={(e) => { setEmployerIdx(Number(e.detail.value)); setConfirmDelete(false); }}>
            <View className="picker-value">{selectedEmployer?.name}</View>
          </Picker>
        )}
      </View>

      <View className="field">
        <Text className="field-label">日期范围</Text>
        <View className="date-range-row">
          <Picker mode="date" value={rangeStart} onChange={(e) => { setRangeStart(e.detail.value); setConfirmDelete(false); }}>
            <View className="date-value">{rangeStart}</View>
          </Picker>
          <Text className="to-label">至</Text>
          <Picker mode="date" value={rangeEnd} onChange={(e) => { setRangeEnd(e.detail.value); setConfirmDelete(false); }}>
            <View className="date-value">{rangeEnd}</View>
          </Picker>
        </View>
      </View>

      {mode === "delete" && (
        <View className="field">
          <Text className="field-label">哪几天</Text>
          <View className="weekday-chip-row">
            {WEEKDAYS.map((d) => (
              <View key={d.key} className={`weekday-chip${activeDays.has(d.key) ? " selected" : ""}`} onClick={() => toggleDay(d.key)}>
                <Text>{WEEKDAY_LABEL[d.key]}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {mode === "create" && (
        <>
          <View className="field">
            <Text className="field-label">哪几天上班 · 每天的上下班时间</Text>
            <Text className="bws-hint">点击选中/取消某一天，每天的时间可以单独设置</Text>
            <View className="bws-schedule">
              {WEEKDAYS.map((d) => {
                const day = dayTimes[d.key];
                const on = !!day;
                return (
                  <View className="bws-row" key={d.key}>
                    <View className={`bws-daybtn${on ? " on" : ""}`} onClick={() => toggleDay(d.key)}>
                      <Text>{WEEKDAY_LABEL[d.key]}</Text>
                    </View>
                    {on && (
                      <View className="bws-times">
                        <Picker mode="time" value={day.start} onChange={(e) => setDayTimes((prev) => ({ ...prev, [d.key]: { ...prev[d.key]!, start: e.detail.value } }))}>
                          <View className="bws-time-value">{day.start}</View>
                        </Picker>
                        <Text className="bws-sep">-</Text>
                        <Picker mode="time" value={day.end} onChange={(e) => setDayTimes((prev) => ({ ...prev, [d.key]: { ...prev[d.key]!, end: e.detail.value } }))}>
                          <View className="bws-time-value">{day.end}</View>
                        </Picker>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          <Text className="batch-preview">将生成 {matchingDates.length} 条记录</Text>

          {supportsAutoOvertime && (
            <View className="batch-ot-panel">
              <Text className="ot-title">检测到加班</Text>
              <View className="ot-block">
                <Text className="ot-block-label">额外超出时长（加班）</Text>
                <Text className="batch-ot-note">超出排班的部分会自动记为加班</Text>
              </View>
              <View className="ot-block">
                <Text className="ot-block-label">加班计算规则</Text>
                <Text className="batch-ot-note">
                  {selectedEmployer?.overtimeRateMode === "fixed" && selectedEmployer.overtimeHourlyRate
                    ? `按固定加班时薪 ${currencySymbol(selectedEmployer.currency)}${selectedEmployer.overtimeHourlyRate}/小时计算`
                    : `按 ${(selectedEmployer?.overtimeMultiplier ?? 1.5).toFixed(1)}x 加班工资计算`}
                </Text>
              </View>
            </View>
          )}

          <Button className="save-btn" loading={saving} disabled={!selectedEmployer || matchingDates.length === 0} onClick={handleCreate}>
            一键生成
          </Button>
        </>
      )}

      {mode === "delete" && (
        <>
          <Text className="batch-preview danger">匹配到 {matchingEntries.length} 条记录</Text>
          <Button className="save-btn danger" loading={saving} disabled={matchingEntries.length === 0} onClick={handleDelete}>
            {confirmDelete ? `再点一次，确认删除${matchingEntries.length}条` : "全部删除"}
          </Button>
        </>
      )}
    </View>
  );
}
