import { useState, useCallback } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries, clockIn, clockOut } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryPay } from "../../lib/pay";
import { formatGroupedPay, DEFAULT_CURRENCY } from "../../lib/currency";
import { PunchConfirmModal, type PunchConfirmData } from "../../components/PunchConfirmModal";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function Index() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [empDocs, entryDocs] = await Promise.all([fetchEmployers(), fetchTimeEntries()]);
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
    } catch (err) {
      console.error("Failed to load home data", err);
      Taro.showToast({ title: "加载失败，下拉重试", icon: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch every time Home becomes visible (e.g. coming back from "add job"
  // or after a punch) -- simplest correct approach before Phase 2 wires up a
  // live watch() subscription.
  useDidShow(() => {
    reload();
  });

  const activeEmployers = employers.filter((e) => !e.archived);
  const employerById = new Map(employers.map((e) => [e.id, e]));
  const activeByEmployer = new Map<string, TimeEntry>();
  for (const e of entries) {
    if (e.endTime == null) activeByEmployer.set(e.employerId, e);
  }

  const todaysEntries = entries.filter((e) => e.status === "confirmed" && e.endTime != null && e.startTime >= startOfToday());
  const todaysHours = todaysEntries.reduce((s, e) => s + entryHours(e), 0);
  const todaysPayByCurrency = new Map<string, number>();
  for (const e of todaysEntries) {
    const emp = employerById.get(e.employerId);
    if (!emp) continue;
    const cur = emp.currency ?? DEFAULT_CURRENCY;
    todaysPayByCurrency.set(cur, (todaysPayByCurrency.get(cur) ?? 0) + entryPay(emp, e));
  }

  const [confirming, setConfirming] = useState<{ employer: Employer; entry: TimeEntry } | null>(null);

  async function handlePunch(employer: Employer) {
    const active = activeByEmployer.get(employer.id);
    if (active) {
      setConfirming({ employer, entry: active });
      return;
    }
    try {
      await clockIn(employer.id, Date.now());
      reload();
    } catch (err) {
      console.error("Clock-in failed", err);
      Taro.showToast({ title: "打卡失败，重试一下", icon: "none" });
    }
  }

  async function handleConfirmClockOut(data: PunchConfirmData) {
    if (!confirming) return;
    try {
      await clockOut(confirming.entry.id, {
        endTime: data.endTime,
        ...(data.mood ? { mood: data.mood } : {}),
        ...(data.moodNote ? { moodNote: data.moodNote } : {}),
        ...(data.note ? { note: data.note } : {}),
        ...(data.adjustment ? { adjustment: data.adjustment } : {}),
        isOvertime: data.isOvertime,
        isHoliday: data.isHoliday,
        ...(data.orderCount !== undefined ? { orderCount: data.orderCount } : {}),
        ...(data.overtimeHours !== undefined ? { overtimeHours: data.overtimeHours } : {}),
      });
      setConfirming(null);
      reload();
    } catch (err) {
      console.error("Clock-out failed", err);
      Taro.showToast({ title: "打卡失败，重试一下", icon: "none" });
    }
  }

  return (
    <View className="home-page">
      <Text className="home-title">首页</Text>

      <View className="income-card">
        <Text className="income-label">今日已赚</Text>
        <Text className="income-value">{formatGroupedPay(todaysPayByCurrency, 1)}</Text>
        <Text className="income-note">今日已工作 {todaysHours.toFixed(1)} 小时</Text>
      </View>

      {loading ? (
        <Text className="empty-hint">加载中...</Text>
      ) : activeEmployers.length === 0 ? (
        <View className="empty-state">
          <Text className="empty-hint">还没有打工副本，先去添加一个吧</Text>
          <Button className="add-btn" onClick={() => Taro.navigateTo({ url: "/pages/employer-form/index" })}>
            + 添加打工副本
          </Button>
        </View>
      ) : (
        <View className="list">
          {activeEmployers.map((emp) => {
            const active = activeByEmployer.get(emp.id);
            return (
              <View className="row" key={emp.id}>
                <View className="dot" style={{ background: emp.color }} />
                <View
                  className="row-name"
                  onClick={() => Taro.navigateTo({ url: `/pages/employer-form/index?id=${emp.id}` })}
                >
                  <Text className="row-title">{emp.name}</Text>
                </View>
                <Button
                  className={`punch-btn${active ? " working" : ""}`}
                  onClick={() => handlePunch(emp)}
                >
                  {active ? "下班打卡" : "上班打卡"}
                </Button>
              </View>
            );
          })}
          <Button className="add-btn secondary" onClick={() => Taro.navigateTo({ url: "/pages/backfill/index" })}>
            补录搬砖时长
          </Button>
          <Button className="add-btn secondary" onClick={() => Taro.navigateTo({ url: "/pages/employer-form/index" })}>
            + 添加打工副本
          </Button>
        </View>
      )}

      {confirming && (
        <PunchConfirmModal
          employer={confirming.employer}
          entry={confirming.entry}
          onCancel={() => setConfirming(null)}
          onConfirm={handleConfirmClockOut}
        />
      )}
    </View>
  );
}
