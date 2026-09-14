import { useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { EXPORT_COLUMNS, exportEntriesCsv, type ExportColumn } from "../lib/exportCsv";
import type { Employer, TimeEntry } from "../lib/types";
import "./ExportPanel.scss";

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
  const [exporting, setExporting] = useState(false);

  function toggle(col: ExportColumn) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  }

  const activeColumns = EXPORT_COLUMNS.filter((c) => selected.has(c.key));

  async function handleExport() {
    if (activeColumns.length === 0) return;
    setExporting(true);
    try {
      await exportEntriesCsv(entries, employerById, `${filenameBase}.csv`, activeColumns.map((c) => c.key), activeColumns.map((c) => c.label));
    } catch (err) {
      console.error("Export failed", err);
      Taro.showToast({ title: "导出失败，重试一下", icon: "none" });
    } finally {
      setExporting(false);
      onClose();
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
        <Text className="export-panel-hint">导出为CSV文件，可以转发给好友或"文件传输助手"保存</Text>
        <View className={`export-action-btn${exporting || activeColumns.length === 0 ? " disabled" : ""}`} onClick={handleExport}>
          <Text>{exporting ? "导出中..." : "导出CSV"}</Text>
        </View>
      </View>
    </View>
  );
}
