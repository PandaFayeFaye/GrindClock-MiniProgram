import { useEffect, useMemo, useState } from "react";
import { View, Text, Canvas, Picker } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { EXPORT_COLUMNS, exportEntriesCsv, exportEntriesImage, type ExportColumn } from "../lib/exportCsv";
import type { Employer, TimeEntry } from "../lib/types";
import "./ExportPanel.scss";

const IMAGE_EXPORT_CANVAS_ID = "exportTableCanvas";
const MAX_IMAGE_ROWS = 80;

export function ExportPanel({
  entries,
  employerById,
  filenameBase,
  onClose,
}: {
  entries: TimeEntry[];
  employerById: Map<string, Employer>;
  filenameBase: string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<ExportColumn>>(new Set(EXPORT_COLUMNS.map((c) => c.key)));
  const [exporting, setExporting] = useState<"csv" | "image" | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 300 });
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const rangedEntries = useMemo(() => {
    if (!rangeStart && !rangeEnd) return entries;
    const startMs = rangeStart ? new Date(`${rangeStart}T00:00:00`).getTime() : -Infinity;
    const endMs = rangeEnd ? new Date(`${rangeEnd}T23:59:59`).getTime() : Infinity;
    return entries.filter((e) => e.startTime >= startMs && e.startTime <= endMs);
  }, [entries, rangeStart, rangeEnd]);

  // The custom tab bar paints above regular page content regardless of WXSS
  // z-index, which would otherwise hide this bottom sheet's own buttons.
  // Taro/wx.hideTabBar() does nothing for a fully custom tab bar -- it has
  // to be told directly to stop rendering (see custom-tab-bar/index.tsx).
  useEffect(() => {
    Taro.eventCenter.trigger("tabBarVisibility", false);
    return () => { Taro.eventCenter.trigger("tabBarVisibility", true); };
  }, []);

  function toggle(col: ExportColumn) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  }

  const activeColumns = EXPORT_COLUMNS.filter((c) => selected.has(c.key));

  async function handleExportCsv() {
    if (exporting || activeColumns.length === 0) return;
    if (rangedEntries.length === 0) {
      Taro.showToast({ title: "没有可导出的记录", icon: "none" });
      return;
    }
    setExporting("csv");
    try {
      await exportEntriesCsv(rangedEntries, employerById, `${filenameBase}.csv`, activeColumns.map((c) => c.key), activeColumns.map((c) => c.label));
      onClose();
    } catch (err) {
      console.error("CSV export failed", err);
      Taro.showToast({ title: "导出失败，重试一下", icon: "none" });
    } finally {
      setExporting(null);
    }
  }

  async function handleExportImage() {
    if (exporting || activeColumns.length === 0) return;
    if (rangedEntries.length > MAX_IMAGE_ROWS) {
      Taro.showToast({ title: "记录太多，图片导出建议改用CSV", icon: "none" });
      return;
    }
    if (rangedEntries.length === 0) {
      Taro.showToast({ title: "没有可导出的记录", icon: "none" });
      return;
    }
    setExporting("image");
    try {
      const tempPath = await exportEntriesImage(
        IMAGE_EXPORT_CANVAS_ID,
        setCanvasSize,
        rangedEntries,
        employerById,
        activeColumns.map((c) => c.key),
        activeColumns.map((c) => c.label),
      );
      await Taro.previewImage({ urls: [tempPath], current: tempPath });
      onClose();
    } catch (err) {
      console.error("Image export failed", err);
      Taro.showToast({ title: "导出失败，重试一下", icon: "none" });
    } finally {
      setExporting(null);
    }
  }

  return (
    <View className="export-panel-backdrop" onClick={onClose}>
      <View className="export-panel-sheet" onClick={(e) => e.stopPropagation()}>
        <View className="export-panel-handle" />
        <Text className="export-panel-title">日期范围</Text>
        <View className="export-range-row">
          <Picker mode="date" value={rangeStart} end={rangeEnd || undefined} onChange={(e) => setRangeStart(e.detail.value)}>
            <View className="export-range-value">{rangeStart || "不限开始日期"}</View>
          </Picker>
          <Text className="export-range-sep">至</Text>
          <Picker mode="date" value={rangeEnd} start={rangeStart || undefined} onChange={(e) => setRangeEnd(e.detail.value)}>
            <View className="export-range-value">{rangeEnd || "不限结束日期"}</View>
          </Picker>
          {(rangeStart || rangeEnd) && (
            <View className="export-range-clear" onClick={() => { setRangeStart(""); setRangeEnd(""); }}>
              <Text>清除</Text>
            </View>
          )}
        </View>
        <Text className="export-range-count">共 {rangedEntries.length} 条记录符合范围</Text>

        <Text className="export-panel-title">选择要导出的字段</Text>
        <View className="export-col-grid">
          {EXPORT_COLUMNS.map((c) => (
            <View key={c.key} className={`export-col-chip${selected.has(c.key) ? " selected" : ""}`} onClick={() => toggle(c.key)}>
              <Text>{c.label}</Text>
            </View>
          ))}
        </View>
        <Text className="export-panel-hint">CSV可转发给好友或"文件传输助手"保存；图片导出会打开预览，长按即可保存到相册</Text>
        <View className="export-action-row">
          <View className={`export-action-btn${exporting || activeColumns.length === 0 ? " disabled" : ""}`} onClick={handleExportCsv}>
            <Text>{exporting === "csv" ? "导出中..." : "导出CSV"}</Text>
          </View>
          <View className={`export-action-btn secondary${exporting || activeColumns.length === 0 ? " disabled" : ""}`} onClick={handleExportImage}>
            <Text>{exporting === "image" ? "生成中..." : "导出图片"}</Text>
          </View>
        </View>

        <Canvas
          canvasId={IMAGE_EXPORT_CANVAS_ID}
          style={{ position: "fixed", left: "-9999px", top: "0", width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
        />
      </View>
    </View>
  );
}
