import { useState } from "react";
import { View, Text, Picker, Button } from "@tarojs/components";
import type { Employer } from "../lib/types";
import "./RetroClockInModal.scss";

export function ScheduleConfirmModal({
  employer,
  scheduled,
  onCancel,
  onConfirm,
}: {
  employer: Employer;
  scheduled: { start: string; end: string };
  onCancel: () => void;
  onConfirm: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(scheduled.start);
  const [end, setEnd] = useState(scheduled.end);

  return (
    <View className="retro-clockin-backdrop" onClick={onCancel}>
      <View className="retro-clockin-sheet" onClick={(e) => e.stopPropagation()}>
        <View className="punch-modal-handle" />
        <Text className="retro-title">确认排班：{employer.name}</Text>
        <Text className="retro-sub">今天有固定排班，确认一下实际的上下班时间（可以微调）。</Text>
        <View className="retro-fields">
          <View className="retro-field-col">
            <Text className="ws-time-label">实际上班时间</Text>
            <Picker mode="time" value={start} onChange={(e) => setStart(e.detail.value)}>
              <View className="retro-input">{start}</View>
            </Picker>
          </View>
          <View className="retro-field-col">
            <Text className="ws-time-label">实际下班时间</Text>
            <Picker mode="time" value={end} onChange={(e) => setEnd(e.detail.value)}>
              <View className="retro-input">{end}</View>
            </Picker>
          </View>
        </View>
        <View className="retro-actions">
          <View className="retro-cancel" onClick={onCancel}>
            <Text>取消</Text>
          </View>
          <Button className="retro-confirm" onClick={() => onConfirm(start, end)}>
            确认打卡
          </Button>
        </View>
      </View>
    </View>
  );
}
