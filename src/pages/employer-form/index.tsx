import { useEffect, useState } from "react";
import { View, Text, Input, Textarea, Picker, Button, Image } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { addEmployer, updateEmployer, archiveEmployer, reactivateEmployer, fetchEmployerById, fetchEmployers } from "../../lib/cloud";
import { toEmployer } from "../../lib/adapt";
import { WEEKDAYS, type WeekdayKey } from "../../lib/schedule";
import { CURRENCIES, DEFAULT_CURRENCY } from "../../lib/currency";
import type { Adjustment, Employer, PayType } from "../../lib/types";
import "./index.scss";

const PALETTE = ["#FFD93D", "#4361EE", "#FF6B6B", "#39C97A", "#B084F5", "#5AC8FA"];

const INDUSTRY_PRESETS = ["餐饮", "外卖配送", "网约车", "咖啡店", "零售", "家教辅导", "办公室"];

const MODES: { key: PayType; label: string; icon: string }[] = [
  { key: "hourly", label: "时薪", icon: "/icons/paytype-hourly.png" },
  { key: "daily", label: "日结", icon: "/icons/paytype-daily.png" },
  { key: "base+overtime", label: "底薪+加班", icon: "/icons/paytype-base_overtime.png" },
  { key: "comprehensive", label: "综合工时", icon: "/icons/paytype-comprehensive.png" },
  { key: "monthly", label: "月薪", icon: "/icons/paytype-monthly.png" },
  { key: "per-order", label: "按单计费", icon: "/icons/paytype-per_order.png" },
];

const RATE_LABEL: Record<PayType, string> = {
  hourly: "时薪",
  comprehensive: "时薪",
  "base+overtime": "加班时薪",
  daily: "日薪",
  monthly: "月薪",
  "per-order": "单价",
};

const OVERTIME_OPTIONS = [1.5, 2, 3];
const HOLIDAY_OPTIONS = [2, 3];
const BREAK_OPTIONS = [0, 30, 60];
const CYCLES: { key: NonNullable<Employer["settlementCycle"]>; label: string }[] = [
  { key: "daily", label: "日结" },
  { key: "weekly", label: "周结" },
  { key: "monthly", label: "月结" },
];

const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  "0": "周日", "1": "周一", "2": "周二", "3": "周三", "4": "周四", "5": "周五", "6": "周六",
};

export default function EmployerForm() {
  const router = useRouter();
  const employerId = router.params.id;
  const isEdit = !!employerId;

  const [name, setName] = useState("");
  const [industryTag, setIndustryTag] = useState("");
  const [industryOther, setIndustryOther] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"flexible" | "fixed">("flexible");
  const [fixedSchedule, setFixedSchedule] = useState<Employer["fixedSchedule"]>({});
  const [colorIdx, setColorIdx] = useState(0);
  const [payType, setPayType] = useState<PayType>("hourly");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [baseSalary, setBaseSalary] = useState("");
  const [overtimeMultiplier, setOvertimeMultiplier] = useState<number | undefined>(undefined);
  const [overtimeRateMode, setOvertimeRateMode] = useState<"multiplier" | "fixed">("multiplier");
  const [overtimeHourlyRate, setOvertimeHourlyRate] = useState("");
  const [holidayMultiplier, setHolidayMultiplier] = useState<number | undefined>(undefined);
  const [breakMinutes, setBreakMinutes] = useState<number | undefined>(undefined);
  const [settlementCycle, setSettlementCycle] = useState<Employer["settlementCycle"]>(undefined);
  const [commuteOpen, setCommuteOpen] = useState(false);
  const [commuteMinutes, setCommuteMinutes] = useState("");
  const [commuteCost, setCommuteCost] = useState("");
  const [idleTimePct, setIdleTimePct] = useState("");
  const [defaultAdjustments, setDefaultAdjustments] = useState<Adjustment[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [existingEmployers, setExistingEmployers] = useState<Employer[]>([]);
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    fetchEmployers().then((docs) => setExistingEmployers(docs.map(toEmployer)));
  }, []);

  useEffect(() => {
    if (!employerId) return;
    fetchEmployerById(employerId).then((doc) => {
      if (doc) {
        const data = doc;
        setName(data.name);
        if (data.industryTag) {
          setIndustryTag(data.industryTag);
          if (!INDUSTRY_PRESETS.includes(data.industryTag)) setIndustryOther(true);
        }
        setScheduleMode(data.scheduleMode ?? "flexible");
        setFixedSchedule(data.fixedSchedule ?? {});
        setColorIdx(Math.max(0, PALETTE.indexOf(data.color)));
        setPayType(data.payType);
        setCurrency(data.currency ?? DEFAULT_CURRENCY);
        setRate(String(data.hourlyRate ?? data.dailyRate ?? data.monthlySalary ?? data.pricePerOrder ?? ""));
        setBaseSalary(data.baseSalary ? String(data.baseSalary) : "");
        setOvertimeMultiplier(data.overtimeMultiplier);
        setOvertimeRateMode(data.overtimeRateMode ?? "multiplier");
        setOvertimeHourlyRate(data.overtimeHourlyRate ? String(data.overtimeHourlyRate) : "");
        setHolidayMultiplier(data.holidayMultiplier);
        setBreakMinutes(data.breakMinutes);
        setSettlementCycle(data.settlementCycle);
        setCommuteMinutes(data.commuteMinutes ? String(data.commuteMinutes) : "");
        setCommuteCost(data.commuteCost ? String(data.commuteCost) : "");
        setIdleTimePct(data.idleTimePct ? String(data.idleTimePct) : "");
        setDefaultAdjustments(data.defaultAdjustments ?? []);
        setNote(data.note ?? "");
        setArchived(!!data.archived);
        if (data.commuteMinutes || data.commuteCost || data.idleTimePct) setCommuteOpen(true);
      }
      setLoaded(true);
    });
  }, [employerId]);

  function findDuplicate() {
    const trimmed = name.trim().toLowerCase();
    return existingEmployers.find((e) => e.id !== employerId && e.name.trim().toLowerCase() === trimmed);
  }

  function handleSaveClick() {
    if (!name.trim()) {
      Taro.showToast({ title: "先填个名字吧", icon: "none" });
      return;
    }
    if (findDuplicate() && !duplicateConfirm) {
      setDuplicateConfirm(true);
      Taro.showToast({ title: "已有同名副本，再点一次确认添加", icon: "none" });
      return;
    }
    handleSave();
  }

  async function handleSave() {
    setSaving(true);
    const rateNum = Number(rate) || 0;
    const data: Omit<Employer, "id"> = {
      name: name.trim(),
      color: PALETTE[colorIdx],
      payType,
      currency,
      ...(industryTag.trim() ? { industryTag: industryTag.trim() } : {}),
      scheduleMode,
      ...(scheduleMode === "fixed" ? { fixedSchedule: fixedSchedule ?? {} } : {}),
      ...(payType === "hourly" || payType === "comprehensive" || payType === "base+overtime" ? { hourlyRate: rateNum } : {}),
      ...(payType === "daily" ? { dailyRate: rateNum } : {}),
      ...(payType === "monthly" ? { monthlySalary: rateNum } : {}),
      ...(payType === "per-order" ? { pricePerOrder: rateNum } : {}),
      ...(payType === "base+overtime" ? { baseSalary: Number(baseSalary) || 0 } : {}),
      ...(overtimeMultiplier ? { overtimeMultiplier } : {}),
      overtimeRateMode,
      ...(overtimeRateMode === "fixed" && Number(overtimeHourlyRate) > 0 ? { overtimeHourlyRate: Number(overtimeHourlyRate) } : {}),
      ...(holidayMultiplier ? { holidayMultiplier } : {}),
      ...(breakMinutes ? { breakMinutes } : {}),
      ...(settlementCycle ? { settlementCycle } : {}),
      ...(commuteMinutes ? { commuteMinutes: Number(commuteMinutes) } : {}),
      ...(commuteCost ? { commuteCost: Number(commuteCost) } : {}),
      ...(idleTimePct ? { idleTimePct: Number(idleTimePct) } : {}),
      ...(defaultAdjustments.length > 0 ? { defaultAdjustments } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    try {
      if (isEdit && employerId) {
        await updateEmployer(employerId, data);
      } else {
        await addEmployer(data);
      }
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to save employer", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveClick() {
    if (!employerId) return;
    if (!confirmArchive) {
      setConfirmArchive(true);
      Taro.showToast({ title: "再点一次确认停用", icon: "none" });
      return;
    }
    setBusy(true);
    try {
      await archiveEmployer(employerId);
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to archive employer", err);
      Taro.showToast({ title: "操作失败，重试一下", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivateClick() {
    if (!employerId) return;
    setBusy(true);
    try {
      await reactivateEmployer(employerId);
      setArchived(false);
      Taro.showToast({ title: "已重新启用", icon: "success" });
    } catch (err) {
      console.error("Failed to reactivate employer", err);
      Taro.showToast({ title: "操作失败，重试一下", icon: "none" });
    } finally {
      setBusy(false);
    }
  }

  function setDay(key: WeekdayKey, patch: Partial<{ start: string; end: string }>) {
    setFixedSchedule((prev) => ({ ...prev, [key]: { ...(prev?.[key] ?? { start: "09:00", end: "18:00" }), ...patch } }));
  }

  function toggleDay(key: WeekdayKey) {
    setFixedSchedule((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        const existing = Object.values(prev ?? {})[0];
        next[key] = existing ? { ...existing } : { start: "09:00", end: "18:00" };
      }
      return next;
    });
  }

  const currencySym = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "¥";
  const dup = findDuplicate();

  if (!loaded) {
    return (
      <View className="employer-form">
        <Text className="loading">加载中...</Text>
      </View>
    );
  }

  return (
    <View className="employer-form">
      <View className="field">
        <Text className="field-label">BOSS大大 / 副本名称</Text>
        <Input className="text-input name-input" placeholder="比如：奶茶店老板" value={name} onInput={(e) => { setName(e.detail.value); setDuplicateConfirm(false); }} />
        {dup && <Text className="dup-warning">已有同名副本「{dup.name}」，再点一次保存即确认要重复添加</Text>}
      </View>

      <View className="field">
        <Text className="field-label">副本类型（可选）</Text>
        <View className="chip-row">
          {INDUSTRY_PRESETS.map((label) => (
            <View
              key={label}
              className={`chip${!industryOther && industryTag === label ? " selected" : ""}`}
              onClick={() => { setIndustryOther(false); setIndustryTag(industryTag === label ? "" : label); }}
            >
              <Text>{label}</Text>
            </View>
          ))}
          <View className={`chip${industryOther ? " selected" : ""}`} onClick={() => { setIndustryOther(true); setIndustryTag(""); }}>
            <Text>其他</Text>
          </View>
        </View>
        {industryOther && (
          <Input className="text-input compact" placeholder="输入副本类型" value={industryTag} onInput={(e) => setIndustryTag(e.detail.value)} />
        )}
      </View>

      <View className="field">
        <Text className="field-label">工作模式</Text>
        <View className="schedule-mode-row">
          <View className={`schedule-mode-card${scheduleMode === "flexible" ? " selected" : ""}`} onClick={() => setScheduleMode("flexible")}>
            <Text className="smc-title">灵活打卡</Text>
            <Text className="smc-sub">自己点上/下班打卡，随时也能补录</Text>
          </View>
          <View className={`schedule-mode-card${scheduleMode === "fixed" ? " selected" : ""}`} onClick={() => setScheduleMode("fixed")}>
            <Text className="smc-title">固定排班</Text>
            <Text className="smc-sub">设置每周上班时间，超出自动记加班</Text>
          </View>
        </View>

        {scheduleMode === "fixed" && (
          <View className="weekly-schedule">
            <Text className="ws-hint">点亮要上班的那几天，分别设置上下班时间</Text>
            {WEEKDAYS.map((d) => {
              const day = fixedSchedule?.[d.key];
              const on = !!day;
              return (
                <View className="ws-row" key={d.key}>
                  <View className={`ws-daybtn${on ? " on" : ""}`} onClick={() => toggleDay(d.key)}>
                    <Text>{WEEKDAY_LABEL[d.key]}</Text>
                  </View>
                  {on && (
                    <View className="ws-times">
                      <Picker mode="time" value={day.start} onChange={(e) => setDay(d.key, { start: e.detail.value })}>
                        <View className="ws-time-value">{day.start}</View>
                      </Picker>
                      <Text className="ws-sep">-</Text>
                      <Picker mode="time" value={day.end} onChange={(e) => setDay(d.key, { end: e.detail.value })}>
                        <View className="ws-time-value">{day.end}</View>
                      </Picker>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View className="field">
        <Text className="field-label">颜色</Text>
        <View className="swatches">
          {PALETTE.map((hex, i) => (
            <View key={hex} className={`swatch${colorIdx === i ? " selected" : ""}`} style={{ background: hex }} onClick={() => setColorIdx(i)} />
          ))}
        </View>
      </View>

      <View className="field">
        <Text className="field-label">结算方式</Text>
        <View className="mode-cards">
          {MODES.map((m) => (
            <View key={m.key} className={`mode-card${payType === m.key ? " selected" : ""}`} onClick={() => setPayType(m.key)}>
              <Image className="mode-card-icon" src={m.icon} mode="aspectFit" />
              <Text className="lb">{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <Text className="field-label">货币</Text>
        <Picker
          mode="selector"
          range={CURRENCIES.map((c) => `${c.symbol} ${c.code}`)}
          value={CURRENCIES.findIndex((c) => c.code === currency)}
          onChange={(e) => setCurrency(CURRENCIES[Number(e.detail.value)].code)}
        >
          <View className="picker-value">{currencySym} {currency}</View>
        </Picker>
      </View>

      {payType === "base+overtime" && (
        <View className="field">
          <Text className="field-label">底薪（月）</Text>
          <Input className="text-input" type="digit" placeholder={`${currencySym}`} value={baseSalary} onInput={(e) => setBaseSalary(e.detail.value)} />
        </View>
      )}

      <View className="field">
        <Text className="field-label">{RATE_LABEL[payType]}</Text>
        <Input className="text-input" type="digit" placeholder={currencySym} value={rate} onInput={(e) => setRate(e.detail.value)} />
      </View>

      <View className="field">
        <Text className="field-label">加班计算规则（可选）</Text>
        <View className="ot-rate-panel">
          <View className="ot-rate-row">
            <View className={`ot-rate-card${overtimeRateMode === "multiplier" ? " selected" : ""}`} onClick={() => setOvertimeRateMode("multiplier")}>
              <Text>按倍率</Text>
            </View>
            <View className={`ot-rate-card${overtimeRateMode === "fixed" ? " selected" : ""}`} onClick={() => setOvertimeRateMode("fixed")}>
              <Text>固定时薪</Text>
            </View>
          </View>
          {overtimeRateMode === "multiplier" ? (
            <View className="ot-rate-body">
              <Text className="ot-rate-body-label">加班倍率</Text>
              <View className="chip-row">
                {OVERTIME_OPTIONS.map((v) => (
                  <View key={v} className={`chip chip-ot${overtimeMultiplier === v ? " selected" : ""}`} onClick={() => setOvertimeMultiplier(overtimeMultiplier === v ? undefined : v)}>
                    <Text>{v}x</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View className="ot-rate-body">
              <Text className="ot-rate-body-label">固定加班时薪</Text>
              <Input className="text-input compact" type="digit" placeholder={currencySym} value={overtimeHourlyRate} onInput={(e) => setOvertimeHourlyRate(e.detail.value)} />
            </View>
          )}
        </View>
      </View>

      <View className="field">
        <Text className="field-label">节假日倍率（可选）</Text>
        <View className="chip-row">
          {HOLIDAY_OPTIONS.map((v) => (
            <View key={v} className={`chip${holidayMultiplier === v ? " selected" : ""}`} onClick={() => setHolidayMultiplier(holidayMultiplier === v ? undefined : v)}>
              <Text>{v}x</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <Text className="field-label">休息时长（可选）</Text>
        <View className="chip-row">
          {BREAK_OPTIONS.map((v) => (
            <View key={v} className={`chip${breakMinutes === v ? " selected" : ""}`} onClick={() => setBreakMinutes(v)}>
              <Text>{v === 0 ? "无休息" : `${v}分钟`}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <Text className="field-label">结算周期（可选）</Text>
        <View className="chip-row">
          {CYCLES.map((c) => (
            <View key={c.key} className={`chip${settlementCycle === c.key ? " selected" : ""}`} onClick={() => setSettlementCycle(settlementCycle === c.key ? undefined : c.key)}>
              <Text>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="field">
        <View className="collapse-header" onClick={() => setCommuteOpen(!commuteOpen)}>
          <Text>净收益设置（通勤/摸鱼时间）</Text>
          <Text className="collapse-arrow">{commuteOpen ? "▲" : "▼"}</Text>
        </View>
        {commuteOpen && (
          <View className="collapse-body">
            <Input className="text-input" type="digit" placeholder="预估通勤时长（分钟）" value={commuteMinutes} onInput={(e) => setCommuteMinutes(e.detail.value)} />
            <Input className="text-input" type="digit" placeholder="预估通勤交通费" value={commuteCost} onInput={(e) => setCommuteCost(e.detail.value)} />
            <Input className="text-input" type="digit" placeholder="预估摸鱼时间占比（%）" value={idleTimePct} onInput={(e) => setIdleTimePct(e.detail.value)} />
          </View>
        )}
      </View>

      <View className="field">
        <Text className="field-label">默认补贴/扣款规则（可选，每次打卡自动套用）</Text>
        {defaultAdjustments.map((adj, i) => (
          <View className="adj-row" key={i}>
            <Picker
              mode="selector"
              range={["奖励", "扣款"]}
              value={adj.type === "bonus" ? 0 : 1}
              onChange={(e) => setDefaultAdjustments(defaultAdjustments.map((a, j) => (j === i ? { ...a, type: Number(e.detail.value) === 0 ? "bonus" : "deduction" } : a)))}
            >
              <View className="picker-value compact">{adj.type === "bonus" ? "奖励" : "扣款"}</View>
            </Picker>
            <Input
              className="text-input compact"
              type="digit"
              placeholder="金额"
              value={adj.amount ? String(adj.amount) : ""}
              onInput={(e) => setDefaultAdjustments(defaultAdjustments.map((a, j) => (j === i ? { ...a, amount: Number(e.detail.value) || 0 } : a)))}
            />
            <Input
              className="text-input compact"
              placeholder="备注（如：夜班补贴）"
              value={adj.note ?? ""}
              onInput={(e) => setDefaultAdjustments(defaultAdjustments.map((a, j) => (j === i ? { ...a, note: e.detail.value } : a)))}
            />
            <View className="remove-adj-btn" onClick={() => setDefaultAdjustments(defaultAdjustments.filter((_, j) => j !== i))}>
              <Text>×</Text>
            </View>
          </View>
        ))}
        <View className="add-adj-btn" onClick={() => setDefaultAdjustments([...defaultAdjustments, { type: "bonus", amount: 0 }])}>
          <Text>+ 添加规则</Text>
        </View>
      </View>

      <View className="field">
        <Text className="field-label">备注（可选）</Text>
        <Textarea className="note-input" placeholder="工种、联系方式之类都可以写这里" value={note} onInput={(e) => setNote(e.detail.value)} />
      </View>

      <Button className="save-btn" loading={saving} onClick={handleSaveClick}>
        保存
      </Button>

      {isEdit && employerId && (
        <View className="danger-zone">
          <Text className="field-label">副本管理</Text>
          {archived ? (
            <>
              <Text className="danger-zone-hint">这份副本目前已停用，不会出现在首页。重新启用后就能继续打卡记录了。</Text>
              <Button className="reactivate-btn" loading={busy} onClick={handleReactivateClick}>
                重新启用这份打工副本
              </Button>
            </>
          ) : (
            <>
              <Text className="danger-zone-hint">停用后，首页将不再显示这份副本，以后也不会再记新的工时——但历史记录都会保留，随时可以重新启用。</Text>
              <Button className="archive-btn" loading={busy} onClick={handleArchiveClick}>
                {confirmArchive ? "再点一次，确认停用" : "停用这份打工副本"}
              </Button>
            </>
          )}
        </View>
      )}
    </View>
  );
}
