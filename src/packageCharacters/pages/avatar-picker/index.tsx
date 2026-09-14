import { useState } from "react";
import { View, Text, Image, Button } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { ANIMALS, MBTI_TYPES, characterImageSrc, mbtiGroupColor, type AnimalKey } from "../../../lib/avatar";
import { setUserProfile } from "../../../lib/cloud";
import "./index.scss";

export default function AvatarPicker() {
  const router = useRouter();
  const initialAnimal = (router.params.animal as AnimalKey | undefined) ?? "cow";
  const initialMbti = router.params.mbti || undefined;
  const [animal, setAnimal] = useState<AnimalKey>(initialAnimal);
  const [mbti, setMbti] = useState<string | undefined>(initialMbti);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await setUserProfile({ animal, mbti: mbti ?? "" });
      Taro.showToast({ title: "已保存", icon: "success" });
      Taro.navigateBack();
    } catch (err) {
      console.error("Failed to save avatar", err);
      Taro.showToast({ title: "保存失败，重试一下", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  const ringColor = mbti ? mbtiGroupColor(mbti) : "#1A1A1A";

  return (
    <View className="avatar-picker-page">
      <View className="avatar-preview" style={{ borderColor: ringColor }}>
        <Image className="avatar-preview-img" src={characterImageSrc(animal, mbti)} mode="aspectFit" />
      </View>

      <Text className="avatar-section-label">选择动物</Text>
      <View className="avatar-animal-grid">
        {ANIMALS.map((a) => (
          <View
            key={a.key}
            className={`avatar-animal-btn${animal === a.key ? " selected" : ""}`}
            onClick={() => setAnimal(a.key)}
          >
            <Image className="avatar-animal-thumb" src={characterImageSrc(a.key)} mode="aspectFit" />
            <Text>{a.label}</Text>
          </View>
        ))}
      </View>

      <Text className="avatar-section-label">选择性格（可选，MBTI）</Text>
      <View className="avatar-mbti-grid">
        {MBTI_TYPES.map((m) => (
          <View
            key={m}
            className={`avatar-mbti-btn${mbti === m ? " selected" : ""}`}
            onClick={() => setMbti(mbti === m ? undefined : m)}
          >
            <Text>{m}</Text>
          </View>
        ))}
      </View>

      <View className="avatar-picker-actions">
        <View className="avatar-cancel-btn" onClick={() => Taro.navigateBack()}>
          <Text>取消</Text>
        </View>
        <Button className="avatar-save-btn" loading={saving} onClick={handleSave}>
          保存
        </Button>
      </View>
    </View>
  );
}
