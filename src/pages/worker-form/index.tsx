import { useState } from "react";
import { View, Text, Input, Textarea, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { addWorker } from "../../lib/cloud";
import "./index.scss";

export default function WorkerForm() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      Taro.showToast({ title: "先填个名字吧", icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await addWorker({
        name: name.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to add worker", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="worker-form">
      <View className="avatar-circle"><Text>{name.slice(0, 1) || "?"}</Text></View>

      <View className="field">
        <Text className="field-label">姓名</Text>
        <Input className="text-input" placeholder="团队成员的名字" value={name} onInput={(e) => setName(e.detail.value)} />
      </View>

      <View className="field">
        <Text className="field-label">备注（可选）</Text>
        <Textarea className="note-input" placeholder="联系方式之类都可以写这里" value={note} onInput={(e) => setNote(e.detail.value)} />
      </View>

      <View className="info-card">
        <Text>这个人的搬砖记录会完全独立统计，不会出现在你自己的首页/统计页数据里</Text>
      </View>

      <Button className="save-btn" loading={saving} onClick={handleSave}>
        保存
      </Button>
    </View>
  );
}
