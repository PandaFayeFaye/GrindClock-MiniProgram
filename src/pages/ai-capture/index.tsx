import { useEffect, useState } from "react";
import { View, Text, Input, Picker, Button, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { fetchEmployers, addManualEntry, addManualEntries } from "../../lib/cloud";
import { toEmployer } from "../../lib/adapt";
import { parseSpeechToDraft } from "../../lib/parseSpeechToDraft";
import { parseScheduleTable, WEEKDAY_LABELS, type ScheduleRow } from "../../lib/parseScheduleTable";
import { MOOD_ICON } from "../../lib/moods";
import type { Employer, Mood, TimeEntry } from "../../lib/types";
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

type Mode = "idle" | "recording" | "recognizing";
type ReviewMode = "none" | "single" | "batch";

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AICapture() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [mode, setMode] = useState<Mode>("idle");
  const [recognizedText, setRecognizedText] = useState("");
  const [captureSource, setCaptureSource] = useState<"manual" | "ocr" | "voice">("manual");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("none");

  const [employerIdx, setEmployerIdx] = useState(0);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [hours, setHours] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [mood, setMood] = useState<Mood | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const [batchRows, setBatchRows] = useState<ScheduleRow[]>([]);

  useEffect(() => {
    fetchEmployers().then((docs) => {
      setEmployers(docs.map(toEmployer).filter((e) => !e.archived));
    });
  }, []);

  function applyDraft(text: string) {
    const table = parseScheduleTable(text, employers);
    if (table.rows.length > 0) {
      if (table.employerId) {
        const idx = employers.findIndex((e) => e.id === table.employerId);
        if (idx >= 0) setEmployerIdx(idx);
      }
      setBatchRows(table.rows);
      setRecognizedText(text);
      setReviewMode("batch");
      return;
    }

    const draft = parseSpeechToDraft(text, employers);
    if (draft.employerId) {
      const idx = employers.findIndex((e) => e.id === draft.employerId);
      if (idx >= 0) setEmployerIdx(idx);
    }
    if (draft.hours != null) {
      const totalHours = draft.hours + (draft.minutes ?? 0) / 60;
      setHours(totalHours ? totalHours.toFixed(1) : "");
    }
    setStartTimeStr(draft.startTimeStr ?? "");
    setEndTimeStr(draft.endTimeStr ?? "");
    setRecognizedText(text);
    setReviewMode("single");
  }

  async function handleChoosePhoto() {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ["compressed"] });
      const filePath = res.tempFilePaths[0];
      if (!filePath) return;
      setMode("recognizing");
      const uploadRes = await Taro.cloud.uploadFile({
        cloudPath: `ai-capture/${Date.now()}.jpg`,
        filePath,
      });
      const callRes = await Taro.cloud.callFunction({
        name: "ocrRecognize",
        data: { fileID: uploadRes.fileID },
      });
      console.log("ocrRecognize result", callRes.result);
      const text = (callRes.result as any)?.text ?? "";
      if (!text) {
        const errMsg = (callRes.result as any)?.error;
        Taro.showToast({ title: errMsg ? "识别出错，看控制台日志" : "没识别出文字，试试手动填", icon: "none" });
        setMode("idle");
        return;
      }
      setCaptureSource("ocr");
      applyDraft(text);
    } catch (err) {
      console.error("Photo recognition failed", err);
      Taro.showToast({ title: "识别失败，云函数可能还没部署", icon: "none" });
    } finally {
      setMode("idle");
    }
  }

  function handleStartRecording() {
    const recorder = Taro.getRecorderManager();
    recorder.onStop(async (res) => {
      setMode("recognizing");
      try {
        const uploadRes = await Taro.cloud.uploadFile({
          cloudPath: `ai-capture/${Date.now()}.mp3`,
          filePath: res.tempFilePath,
        });
        const callRes = await Taro.cloud.callFunction({
          name: "asrRecognize",
          data: { fileID: uploadRes.fileID },
        });
        console.log("asrRecognize result", callRes.result);
        const text = (callRes.result as any)?.text ?? "";
        if (!text) {
          const errMsg = (callRes.result as any)?.error;
          Taro.showToast({ title: errMsg ? "识别出错，看控制台日志" : "没听清，试试手动填", icon: "none" });
          setMode("idle");
          return;
        }
        setCaptureSource("voice");
        applyDraft(text);
      } catch (err) {
        console.error("Voice recognition failed", err);
        Taro.showToast({ title: "识别失败，云函数可能还没部署", icon: "none" });
      } finally {
        setMode("idle");
      }
    });
    recorder.onError(() => {
      Taro.showToast({ title: "录音失败", icon: "none" });
      setMode("idle");
    });
    recorder.start({ format: "mp3", duration: 30000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 96000 });
    setMode("recording");
  }

  function handleStopRecording() {
    Taro.getRecorderManager().stop();
  }

  function handleManualEntry() {
    setRecognizedText("");
    setCaptureSource("manual");
    setStartTimeStr("");
    setEndTimeStr("");
    setHours("");
    setReviewMode("single");
  }

  async function handleSave() {
    const employer = employers[employerIdx];
    if (!employer) {
      Taro.showToast({ title: "先添加一个打工副本吧", icon: "none" });
      return;
    }
    const h = Number(hours);
    if (!h || h <= 0) {
      Taro.showToast({ title: "填一下工时时长", icon: "none" });
      return;
    }
    if (h > 24) {
      Taro.showToast({ title: "识别结果可能有误，单次工时超过24小时，检查一下", icon: "none" });
      return;
    }
    let startTime: number;
    let endTime: number;
    if (startTimeStr && endTimeStr) {
      startTime = new Date(`${date}T${startTimeStr}:00`).getTime();
      endTime = new Date(`${date}T${endTimeStr}:00`).getTime();
      if (endTime <= startTime) endTime += 24 * 3_600_000;
    } else {
      startTime = new Date(`${date}T09:00:00`).getTime();
      endTime = startTime + h * 3_600_000;
    }
    setSaving(true);
    try {
      await addManualEntry({
        employerId: employer.id,
        startTime,
        endTime,
        status: "confirmed",
        source: captureSource,
        ...(mood ? { mood } : {}),
        ...(recognizedText ? { note: `AI记工识别原文：${recognizedText}` } : {}),
      });
      Taro.showToast({ title: "已保存", icon: "success" });
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to save AI-captured entry", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  function updateBatchRow(idx: number, patch: Partial<ScheduleRow>) {
    setBatchRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeBatchRow(idx: number) {
    setBatchRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleSaveBatch() {
    const employer = employers[employerIdx];
    if (!employer) {
      Taro.showToast({ title: "先添加一个打工副本吧", icon: "none" });
      return;
    }
    if (batchRows.length === 0) {
      Taro.showToast({ title: "没有可保存的记录", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      const entries: Omit<TimeEntry, "id">[] = batchRows.map((row) => {
        let startTime = new Date(`${row.date}T${row.startTimeStr}:00`).getTime();
        let endTime = new Date(`${row.date}T${row.endTimeStr}:00`).getTime();
        if (endTime <= startTime) endTime += 24 * 3_600_000;
        return {
          employerId: employer.id,
          startTime,
          endTime,
          status: "confirmed",
          source: captureSource,
          note: `AI记工识别原文：${recognizedText}`,
        };
      });
      await addManualEntries(entries);
      Taro.showToast({ title: `已保存 ${entries.length} 条记录`, icon: "success" });
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to save batch AI-captured entries", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  if (reviewMode === "batch") {
    return (
      <View className="ai-capture-page">
        <Text className="page-title">确认识别结果（{batchRows.length} 条排班）</Text>
        <View className="recognized-block">
          <Text className="recognized-label">识别原文</Text>
          <Text className="recognized-text">{recognizedText}</Text>
        </View>

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
              <View className="picker-value">{employers[employerIdx]?.name}</View>
            </Picker>
          )}
        </View>

        <View className="batch-list">
          {batchRows.map((row, idx) => (
            <View className="batch-row" key={idx}>
              <View className="batch-row-header">
                <Text className="batch-row-day">{WEEKDAY_LABELS[row.weekday]} · {row.date}</Text>
                <View className="batch-row-remove" onClick={() => removeBatchRow(idx)}>
                  <Text>删除</Text>
                </View>
              </View>
              <View className="batch-row-fields">
                <Picker mode="date" value={row.date} onChange={(e) => updateBatchRow(idx, { date: e.detail.value })}>
                  <View className="batch-mini-value">{row.date}</View>
                </Picker>
                <Picker mode="time" value={row.startTimeStr} onChange={(e) => updateBatchRow(idx, { startTimeStr: e.detail.value })}>
                  <View className="batch-mini-value">{row.startTimeStr}</View>
                </Picker>
                <Text className="batch-row-sep">-</Text>
                <Picker mode="time" value={row.endTimeStr} onChange={(e) => updateBatchRow(idx, { endTimeStr: e.detail.value })}>
                  <View className="batch-mini-value">{row.endTimeStr}</View>
                </Picker>
                <Input
                  className="batch-hours-input"
                  type="digit"
                  value={String(row.hours)}
                  onInput={(e) => updateBatchRow(idx, { hours: Number(e.detail.value) || 0 })}
                />
                <Text className="batch-row-unit">h</Text>
              </View>
            </View>
          ))}
          {batchRows.length === 0 && <Text className="empty-hint">已全部删除，返回重新识别</Text>}
        </View>

        <View className="save-btn-bar">
          <Button className="save-btn" loading={saving} onClick={handleSaveBatch}>
            保存全部 {batchRows.length} 条
          </Button>
          <View className="back-link" onClick={() => setReviewMode("none")}>
            <Text>返回重新识别</Text>
          </View>
        </View>
      </View>
    );
  }

  if (reviewMode === "single") {
    return (
      <View className="ai-capture-page">
        <Text className="page-title">确认识别结果</Text>
        {recognizedText && (
          <View className="recognized-block">
            <Text className="recognized-label">识别原文</Text>
            <Text className="recognized-text">{recognizedText}</Text>
          </View>
        )}

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
              <View className="picker-value">{employers[employerIdx]?.name}</View>
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
          <Text className="field-label">上下班时间（可选，识别到才会显示）</Text>
          <View className="time-range-row">
            <Picker
              mode="time"
              value={startTimeStr || "09:00"}
              onChange={(e) => setStartTimeStr(e.detail.value)}
            >
              <View className="picker-value time-range-value">{startTimeStr || "未识别"}</View>
            </Picker>
            <Text className="time-range-sep">-</Text>
            <Picker
              mode="time"
              value={endTimeStr || "18:00"}
              onChange={(e) => setEndTimeStr(e.detail.value)}
            >
              <View className="picker-value time-range-value">{endTimeStr || "未识别"}</View>
            </Picker>
            {(startTimeStr || endTimeStr) && (
              <View className="time-range-clear" onClick={() => { setStartTimeStr(""); setEndTimeStr(""); }}>
                <Text>清除</Text>
              </View>
            )}
          </View>
        </View>

        <View className="field">
          <Text className="field-label">工时时长（小时）</Text>
          <Input
            className="hours-input"
            type="digit"
            placeholder="比如：6"
            value={hours}
            onInput={(e) => setHours(e.detail.value)}
          />
        </View>

        <View className="field">
          <Text className="field-label">今天感觉怎么样？（可选）</Text>
          <View className="mood-grid">
            {MOOD_OPTIONS.map((m) => (
              <View
                key={m.key}
                className={`mood-tag${mood === m.key ? " selected" : ""}`}
                onClick={() => setMood(mood === m.key ? undefined : m.key)}
              >
                <Image className="mood-tag-icon" src={MOOD_ICON[m.key]} mode="aspectFit" />
                <Text>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="save-btn-bar">
          <Button className="save-btn" loading={saving} onClick={handleSave}>
            保存
          </Button>
          <View className="back-link" onClick={() => setReviewMode("none")}>
            <Text>返回重新识别</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="ai-capture-page">
      <Text className="page-title">AI 记工</Text>
      <Text className="page-hint">拍一张排班表照片，或者说一句话，AI 帮你识别工时信息，保存前你都可以修改确认。整周排班表会自动拆成多条记录。</Text>

      <View className="capture-actions">
        <View className={`capture-card${mode === "recognizing" ? " disabled" : ""}`} onClick={mode === "idle" ? handleChoosePhoto : undefined}>
          <View className="capture-icon-circle">
            <Image className="capture-icon-img" src="/icons/capture-camera.png" mode="aspectFit" />
          </View>
          <Text className="capture-card-title">拍照识别</Text>
          <Text className="capture-card-sub">排班表 / 打卡截图</Text>
        </View>

        <View
          className={`capture-card${mode === "recognizing" ? " disabled" : ""}${mode === "recording" ? " recording" : ""}`}
          onClick={mode === "recording" ? handleStopRecording : mode === "idle" ? handleStartRecording : undefined}
        >
          <View className="capture-icon-circle">
            <Image className="capture-icon-img" src="/icons/capture-mic.png" mode="aspectFit" />
          </View>
          <Text className="capture-card-title">{mode === "recording" ? "点击结束录音" : "语音记工"}</Text>
          <Text className="capture-card-sub">{mode === "recording" ? "正在录音…" : "说一句今天上班的情况"}</Text>
        </View>
      </View>

      {mode === "recognizing" && (
        <View className="status-hint-row">
          <View className="mic-spinner" />
          <Text className="status-hint">识别中，请稍候…</Text>
        </View>
      )}

      <View className="manual-link" onClick={handleManualEntry}>
        <Text>不用 AI，手动填一笔 ›</Text>
      </View>

      <Text className="disclaimer">
        识别结果基于云端语音/图像识别服务，可能不完全准确，保存前请务必核对。
      </Text>
    </View>
  );
}
