import { useState } from "react";
import { View, Text, Picker, Button } from "@tarojs/components";
import type { Employer } from "../lib/types";
import "./RetroClockInModal.scss";

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RetroClockInModal({
  employer,
  onCancel,
  onConfirm,
}: {
  employer: Employer;
  onCancel: () => void;
  onConfirm: (startTime: number) => void;
}) {
  const now = new Date();
  const [date, setDate] = useState(toDateInputValue(now));
  const [time, setTime] = useState(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);

  function handleConfirm() {
    const [h, m] = time.split(":").map(Number);
    const start = new Date(`${date}T00:00:00`).getTime() + h * 3_600_000 + m * 60_000;
    onConfirm(Math.min(start, Date.now()));
  }

  return (
    <View className="retro-clockin-backdrop" onClick={onCancel}>
      <View className="retro-clockin-sheet" onClick={(e) => e.stopPropagation()}>
        <View className="punch-modal-handle" />
        <Text className="retro-title">补打卡：{employer.name}</Text>
        <Text className="retro-sub">忘记打卡了？选一个之前的上班开始时间，立即补上打卡。</Text>
        <View className="retro-fields">
          <Picker mode="date" value={date} end={toDateInputValue(now)} onChange={(e) => setDate(e.detail.value)}>
            <View className="retro-input">{date}</View>
          </Picker>
          <Picker mode="time" value={time} onChange={(e) => setTime(e.detail.value)}>
            <View className="retro-input">{time}</View>
          </Picker>
        </View>
        <View className="retro-actions">
          <View className="retro-cancel" onClick={onCancel}>
            <Text>取消</Text>
          </View>
          <Button className="retro-confirm" onClick={handleConfirm}>
            确认补打卡
          </Button>
        </View>
      </View>
    </View>
  );
}
