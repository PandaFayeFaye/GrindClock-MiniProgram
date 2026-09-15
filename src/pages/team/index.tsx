import { useMemo, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { fetchWorkers, fetchTimeEntries, fetchEmployers } from "../../lib/cloud";
import { toEmployer, toTimeEntry } from "../../lib/adapt";
import { entryHours, entryPay } from "../../lib/pay";
import { DEFAULT_CURRENCY, formatGroupedPay } from "../../lib/currency";
import { dateKey, startOfWeek } from "../../lib/stats";
import type { CloudWorker } from "../../lib/cloud";
import type { Employer, TimeEntry } from "../../lib/types";
import "./index.scss";

export default function Team() {
  const [workers, setWorkers] = useState<CloudWorker[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);

  useDidShow(() => {
    Promise.all([fetchWorkers(), fetchTimeEntries(), fetchEmployers()]).then(([workerDocs, entryDocs, empDocs]) => {
      setWorkers(workerDocs);
      setEntries(entryDocs.map(toTimeEntry));
      setEmployers(empDocs.map(toEmployer));
    });
  });

  const employerById = useMemo(() => new Map(employers.map((e) => [e.id, e])), [employers]);
  const teamEntries = useMemo(() => entries.filter((e) => e.workerId && e.status === "confirmed" && e.endTime != null), [entries]);
  const todayKey = dateKey(Date.now());
  const weekStart = startOfWeek();

  const rows = useMemo(() => workers.map((w) => {
    const own = teamEntries.filter((e) => e.workerId === w._id);
    const todayHours = own.filter((e) => dateKey(e.startTime) === todayKey).reduce((s, e) => s + entryHours(e), 0);
    const weekHours = own.filter((e) => e.startTime >= weekStart).reduce((s, e) => s + entryHours(e), 0);
    return { worker: w, todayHours, weekHours };
  }), [workers, teamEntries, todayKey, weekStart]);

  const teamWeekHours = rows.reduce((s, r) => s + r.weekHours, 0);
  const teamWeekPayByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of teamEntries) {
      if (e.startTime < weekStart) continue;
      const emp = employerById.get(e.employerId);
      if (!emp) continue;
      const cur = emp.currency ?? DEFAULT_CURRENCY;
      map.set(cur, (map.get(cur) ?? 0) + entryPay(emp, e));
    }
    return map;
  }, [teamEntries, weekStart, employerById]);

  return (
    <View className="team-page">
      <View className="team-header">
        <Text className="mode-pill">组长模式</Text>
      </View>
      {workers.length > 0 ? (
        <>
          <Text className="isolation-note">这里记录的搬砖时长归属于被代记录人，和你自己的个人打工记录完全分开统计，不会混进你的首页数据</Text>

          <View className="team-total">
            <View className="stat">
              <Text className="n">{teamWeekHours.toFixed(1)}h</Text>
              <Text className="l">团队本周总搬砖时长</Text>
            </View>
            <View className="stat">
              <Text className="n">{formatGroupedPay(teamWeekPayByCurrency)}</Text>
              <Text className="l">本周团队收入</Text>
            </View>
          </View>

          <View className="worker-list">
            {rows.map(({ worker, todayHours, weekHours }) => (
              <View className="worker-row" key={worker._id}>
                <View className="worker-avatar"><Text>{worker.name.slice(0, 1)}</Text></View>
                <View className="worker-info">
                  <Text className="worker-name">{worker.name}</Text>
                  <Text className="worker-detail">今日{todayHours.toFixed(1)}h · 本周{weekHours.toFixed(1)}h</Text>
                </View>
                <View className="worker-btn" onClick={() => Taro.navigateTo({ url: `/pages/backfill/index?workerId=${worker._id}` })}>
                  <Text>记一笔</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View className="empty">
          <Text>还没有团队成员，点右下角加一个吧</Text>
        </View>
      )}

      <View className="fab" onClick={() => Taro.navigateTo({ url: "/pages/worker-form/index" })}>
        <Text>+</Text>
      </View>
    </View>
  );
}
