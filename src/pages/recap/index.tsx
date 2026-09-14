import { useState, useMemo } from "react";
import { View, Text, Canvas } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, fetchUserProfile } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryOvertimePay, entryPay, lumpSumForPeriod } from "../../lib/pay";
import { DEFAULT_CURRENCY, formatGroupedPay } from "../../lib/currency";
import { currentStreak, dateKey, leaderboard, startOfMonth } from "../../lib/stats";
import { TIERS, currentTierIndex } from "../../lib/tiers";
import { renderRecapShareImage, RECAP_CANVAS_SIZE } from "../../lib/renderRecapImage";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

const SLIDE_COUNT = 6;
const SHARE_CANVAS_ID = "recapShareCanvas";

export default function Recap() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [slide, setSlide] = useState(0);
  const [generatingShare, setGeneratingShare] = useState(false);

  useDidShow(() => {
    Promise.all([fetchEmployers(), fetchTimeEntries(), fetchUserProfile()]).then(([empDocs, entryDocs]) => {
      setEmployers(empDocs.map(toEmployer));
      setAllEntries(entryDocs.map(toTimeEntry));
    });
  });

  const entries = useMemo(() => allEntries.filter((e) => !e.workerId), [allEntries]);
  const monthStart = startOfMonth();
  const monthEntries = useMemo(
    () => entries.filter((e) => e.status === "confirmed" && e.endTime != null && e.startTime >= monthStart),
    [entries, monthStart],
  );
  const employerById = useMemo(() => new Map(employers.map((e) => [e.id, e])), [employers]);

  const totalHours = monthEntries.reduce((s, e) => s + entryHours(e), 0);
  const totalPayByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    const add = (cur: string, amount: number) => map.set(cur, (map.get(cur) ?? 0) + amount);
    for (const e of monthEntries) {
      const emp = employerById.get(e.employerId);
      if (emp) add(emp.currency ?? DEFAULT_CURRENCY, entryPay(emp, e));
    }
    for (const emp of employers) add(emp.currency ?? DEFAULT_CURRENCY, lumpSumForPeriod(emp, monthEntries));
    return map;
  }, [monthEntries, employerById, employers]);

  const totalOvertimeHours = monthEntries.reduce((s, e) => s + (e.overtimeHours ?? 0), 0);
  const totalOvertimePayByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthEntries) {
      const emp = employerById.get(e.employerId);
      if (!emp) continue;
      const otPay = entryOvertimePay(emp, e);
      if (otPay > 0) {
        const cur = emp.currency ?? DEFAULT_CURRENCY;
        map.set(cur, (map.get(cur) ?? 0) + otPay);
      }
    }
    return map;
  }, [monthEntries, employerById]);

  const board = useMemo(() => leaderboard(monthEntries, employers, monthStart, true), [monthEntries, employers, monthStart]);
  const topEmployer = board[0]?.employer.name ?? "—";
  const streak = useMemo(() => currentStreak(entries), [entries]);

  const hardestDay = useMemo(() => {
    const crashEntry = monthEntries.find((e) => e.mood === "crash");
    const heartbeatEntry = monthEntries.find((e) => e.mood === "heartbeat");
    const pick = crashEntry ?? heartbeatEntry;
    if (pick) {
      const d = new Date(pick.startTime);
      return `${d.getMonth() + 1}月${d.getDate()}日（${pick.mood === "crash" ? "最累的一天" : "最有感觉的一天"}）`;
    }
    const byDay = new Map<string, number>();
    for (const e of monthEntries) {
      const key = dateKey(e.startTime);
      byDay.set(key, (byDay.get(key) ?? 0) + entryHours(e));
    }
    let bestKey = "";
    let bestHours = 0;
    for (const [k, h] of byDay) if (h > bestHours) { bestHours = h; bestKey = k; }
    if (!bestKey) return "还没有数据";
    const [, m, d] = bestKey.split("-");
    return `${Number(m)}月${Number(d)}日（工时最长的一天）`;
  }, [monthEntries]);

  const heatCells = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const byDay = new Map<string, number>();
    for (const e of monthEntries) {
      const key = dateKey(e.startTime);
      const emp = employerById.get(e.employerId);
      if (!emp) continue;
      byDay.set(key, (byDay.get(key) ?? 0) + entryPay(emp, e));
    }
    const values = Array.from({ length: daysInMonth }, (_, i) => {
      const key = dateKey(new Date(now.getFullYear(), now.getMonth(), i + 1).getTime());
      return byDay.get(key) ?? 0;
    });
    const max = Math.max(1, ...values);
    return values.map((v) => (v === 0 ? 0 : v / max > 0.66 ? 3 : v / max > 0.33 ? 2 : 1));
  }, [monthEntries, employerById]);

  const heatHex = ["rgba(255,255,255,.08)", "rgba(255,217,61,.35)", "rgba(255,217,61,.65)", "#FFD93D"];
  const now = new Date();
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;

  const allTimeHours = useMemo(
    () => entries.filter((e) => e.status === "confirmed" && e.endTime != null).reduce((s, e) => s + entryHours(e), 0),
    [entries],
  );
  const tier = TIERS[currentTierIndex(allTimeHours)];

  function goTo(next: number) {
    setSlide(Math.max(0, Math.min(SLIDE_COUNT - 1, next)));
  }

  async function handleGenerateShare() {
    setGeneratingShare(true);
    try {
      const tempPath = await renderRecapShareImage(SHARE_CANVAS_ID, {
        monthLabel,
        totalHours: totalHours.toFixed(0),
        totalPayText: formatGroupedPay(totalPayByCurrency),
        streak,
        topEmployer,
        hardestDay,
        heatCells,
        tierLabel: tier.label,
      });
      await Taro.previewImage({ urls: [tempPath], current: tempPath });
    } catch (err) {
      console.error("Failed to generate recap share image", err);
      Taro.showToast({ title: "生成分享图失败，重试一下", icon: "none" });
    } finally {
      setGeneratingShare(false);
    }
  }

  return (
    <View className="recap-page">
      <View className="story-dots">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => (
          <View key={i} className={`story-dot${i === slide ? " active" : i < slide ? " done" : ""}`} />
        ))}
      </View>

      <View className="recap-tap-zone">
        <View className="tap-left" onClick={() => goTo(slide - 1)} />
        <View className="tap-right" onClick={() => goTo(slide + 1)} />

        {slide === 0 && (
          <View className="slide slide-cover">
            <Text className="eyebrow">{monthLabel} 战绩总结</Text>
            <Text className="cover-headline">这个月你搬了多少砖？</Text>
            <Text className="tap-hint">点击屏幕左右两侧翻页 →</Text>
          </View>
        )}

        {slide === 1 && (
          <View className="slide">
            <Text className="eyebrow">总工时</Text>
            <Text className="big-number">{totalHours.toFixed(0)}<Text className="big-number-unit">小时</Text></Text>
            <Text className="slide-caption">跨 {employers.length} 个副本的工时总和</Text>
            {totalOvertimeHours > 0.05 && <Text className="recap-ot-note">其中加班 {totalOvertimeHours.toFixed(1)}h</Text>}
          </View>
        )}

        {slide === 2 && (
          <View className="slide">
            <Text className="eyebrow">总收入</Text>
            <Text className="big-number">{formatGroupedPay(totalPayByCurrency)}</Text>
            <Text className="slide-caption">「{topEmployer}」是本月主力副本</Text>
            {totalOvertimePayByCurrency.size > 0 && <Text className="recap-ot-note">其中加班收入 {formatGroupedPay(totalOvertimePayByCurrency)}</Text>}
          </View>
        )}

        {slide === 3 && (
          <View className="slide">
            <Text className="eyebrow">本月高光时刻</Text>
            <View className="grid">
              <View className="stat-tile"><Text className="n">{streak}天</Text><Text className="l">当前连续打卡</Text></View>
              <View className="stat-tile"><Text className="n">{topEmployer}</Text><Text className="l">最赚钱副本</Text></View>
              <View className="stat-tile"><Text className="n">{hardestDay}</Text><Text className="l">难忘的一天</Text></View>
              <View className="stat-tile"><Text className="n">{formatGroupedPay(totalPayByCurrency)}</Text><Text className="l">跨{employers.length}个副本合计</Text></View>
              {totalOvertimeHours > 0.05 && (
                <View className="stat-tile stat-tile-ot">
                  <Text className="n">{totalOvertimeHours.toFixed(1)}h · {formatGroupedPay(totalOvertimePayByCurrency)}</Text>
                  <Text className="l">加班时长 · 加班收入</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {slide === 4 && (
          <View className="slide">
            <Text className="eyebrow">本月活跃度</Text>
            <View className="heat-grid">
              {heatCells.map((level, i) => (
                <View className="heat-cell" style={{ background: heatHex[level] }} key={i} />
              ))}
            </View>
            <Text className="slide-caption">颜色越深，当天赚得越多</Text>
          </View>
        )}

        {slide === 5 && (
          <View className="slide slide-finale">
            <Text className="eyebrow">当前称号</Text>
            <Text className="tier-reveal">{tier.label}</Text>
            <View className="actions">
              <View className={`share-btn${generatingShare ? " disabled" : ""}`} onClick={generatingShare ? undefined : handleGenerateShare}>
                <Text>{generatingShare ? "生成中..." : "生成分享图"}</Text>
              </View>
              <View className="detail-link" onClick={() => Taro.switchTab({ url: "/pages/stats/index" })}>
                <Text>查看完整明细</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <Canvas
        canvasId={SHARE_CANVAS_ID}
        style={{ position: "fixed", left: "-9999px", top: "0", width: `${RECAP_CANVAS_SIZE.width}px`, height: `${RECAP_CANVAS_SIZE.height}px` }}
      />
    </View>
  );
}
