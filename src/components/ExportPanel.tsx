import { useState } from "react";
import { View, Text, Canvas } from "@tarojs/components";
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

  function toggle(col: ExportColumn) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  }

  const activeColumns = EXPORT_COLUMNS.filter((c) => selected.has(c.key));

  async function handleExportCsv() {
    if (activeColumns.length === 0) return;
    setExporting("csv");
    try {
      await exportEntriesCsv(entries, employerById, `${filenameBase}.csv`, activeColumns.map((c) => c.key), activeColumns.map((c) => c.label));
      onClose();
    } catch (err) {
      console.error("CSV export failed", err);
      Taro.showToast({ title: "导出失败，重试一下", icon: "none" });
    } finally {
      setExporting(null);
    }
  }

  async function handleExportImage() {
    if (activeColumns.length === 0) return;
    if (entries.length > MAX_IMAGE_ROWS) {
      Taro.showToast({ title: "记录太多，图片导出建议改用CSV", icon: "none" });
      return;
    }
    if (entries.length === 0) {
      Taro.showToast({ title: "没有可导出的记录", icon: "none" });
      return;
    }
    setExporting("image");
    try {
      const tempPath = await exportEntriesImage(
        IMAGE_EXPORT_CANVAS_ID,
        setCanvasSize,
        entries,
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
