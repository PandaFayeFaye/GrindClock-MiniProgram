import { useState, useMemo } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchEmployers, fetchTimeEntries } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryPay } from "../../lib/pay";
import { currencySymbol } from "../../lib/currency";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

interface Row {
  employer: Employer;
  nominal: number;
  actual: number;
}

export default function NetPay() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  const reload = () => {
    Promise.all([fetchEmployers(), fetchTimeEntries()]).then(([empDocs, entryDocs]) => {
      setEmployers(empDocs.map(toEmployer));
      setEntries(entryDocs.map(toTimeEntry));
    });
  };

  useDidShow(() => reload());

  const activeEmployers = useMemo(() => employers.filter((e) => !e.archived), [employers]);

  const rows: Row[] = useMemo(() => {
    const personalConfirmed = entries.filter((e) => !e.workerId && e.status === "confirmed" && e.endTime != null);
    return activeEmployers
      .map((emp) => {
        const empEntries = personalConfirmed.filter((e) => e.employerId === emp.id);
        const totalHours = empEntries.reduce((s, e) => s + entryHours(e), 0);
        const totalPay = empEntries.reduce((s, e) => s + entryPay(emp, e), 0);
        const nominal = emp.hourlyRate ?? (totalHours > 0 ? totalPay / totalHours : 0);
        const commuteHoursPerShift = (emp.commuteMinutes ?? 0) / 60;
        const shiftsCount = Math.max(1, empEntries.length);
        const totalCommuteHours = commuteHoursPerShift * shiftsCount;
        const totalCommuteCost = (emp.commuteCost ?? 0) * shiftsCount;
        const idlePct = Math.min(95, Math.max(0, emp.idleTimePct ?? 0));
        const idleHours = totalHours * (idlePct / (100 - idlePct));
        const netHours = totalHours + totalCommuteHours + idleHours;
        const netPay = totalPay - totalCommuteCost;
        const actual = netHours > 0 ? netPay / netHours : nominal;
        return { employer: emp, nominal, actual };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [activeEmployers, entries]);

  const hasAnyEntries = entries.some((e) => !e.workerId && e.status === "confirmed" && e.endTime != null);

  if (activeEmployers.length < 2) {
    return (
      <View className="netpay-page">
        <View className="empty">
          <Text className="empty-text">至少添加2个副本才能开始比较，去添加一个？</Text>
          <Button className="empty-cta" onClick={() => Taro.navigateTo({ url: "/pages/employer-form/index" })}>
            + 添加打工副本
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="netpay-page">
      <View className="note-card">
        <Text>
          扣除预估通勤时间/费用、加上预估摸鱼时间后的"实际到手时薪"，帮你看清哪个副本真正更划算——都是副本设置里填的一次性预估，仅供参考。不同币种之间没有做汇率换算，混合币种时排名仅供参考。
        </Text>
      </View>

      {!hasAnyEntries && <Text className="empty-hint">还没有工时记录</Text>}

      {rows.map((row, i) => (
        <View className={`rank-row${i === 0 ? " top" : ""}`} key={row.employer.id}>
          <View className="rank-num"><Text>{i + 1}</Text></View>
          <View className="rank-info">
            <Text className="rank-name">{row.employer.name}</Text>
            <Text className="rank-detail">
              名义时薪 {currencySymbol(row.employer.currency)}{row.nominal.toFixed(1)}
              {(row.employer.commuteMinutes || row.employer.commuteCost) ? ` · 通勤 ${row.employer.commuteMinutes ?? 0}分/${currencySymbol(row.employer.currency)}${row.employer.commuteCost ?? 0}` : ""}
              {row.employer.idleTimePct ? ` · 摸鱼 ${row.employer.idleTimePct}%` : ""}
            </Text>
          </View>
          <View className="rank-actual">
            <Text className="n">{currencySymbol(row.employer.currency)}{row.actual.toFixed(1)}</Text>
            <Text className="l">实际到手时薪</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
