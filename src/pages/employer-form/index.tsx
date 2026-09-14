import { useState } from "react";
import { View, Text, Input, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { addEmployer } from "../../lib/cloud";
import type { PayType } from "../../lib/types";
import "./index.scss";

const PALETTE = ["#FFD93D", "#4361EE", "#FF6B6B", "#39C97A", "#B084F5", "#5AC8FA"];

// Phase 2 MVP: hourly-rate jobs only. The other pay types (daily/monthly/
// per-order/base+overtime/comprehensive) from the web app come once the
// employer-form UI grows past this first cut.
const PAY_TYPE: PayType = "hourly";

export default function EmployerForm() {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      Taro.showToast({ title: "先填个名字吧", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await addEmployer({
        name: trimmed,
        color: PALETTE[colorIdx],
        payType: PAY_TYPE,
        ...(rate ? { hourlyRate: Number(rate) } : {}),
      });
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to add employer", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="employer-form">
      <View className="field">
        <Text className="field-label">BOSS大大 / 副本名称</Text>
        <Input
          className="name-input"
          placeholder="比如：奶茶店老板"
          value={name}
          onInput={(e) => setName(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="field-label">时薪（元/小时，可选）</Text>
        <Input
          className="name-input"
          type="digit"
          placeholder="比如：25"
          value={rate}
          onInput={(e) => setRate(e.detail.value)}
        />
      </View>

      <View className="field">
        <Text className="field-label">颜色</Text>
        <View className="swatches">
          {PALETTE.map((hex, i) => (
            <View
              key={hex}
              className={`swatch${colorIdx === i ? " selected" : ""}`}
              style={{ background: hex }}
              onClick={() => setColorIdx(i)}
            />
          ))}
        </View>
      </View>

      <Button className="save-btn" loading={saving} onClick={handleSave}>
        保存
      </Button>
    </View>
  );
}
