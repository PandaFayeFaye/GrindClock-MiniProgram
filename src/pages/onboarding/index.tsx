import { useState } from "react";
import { View, Text, Image, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ANIMALS, characterImageSrc, type AnimalKey } from "../../lib/avatar";
import { setUserProfile } from "../../lib/cloud";
import { markOnboarded } from "../../lib/onboarding";
import "./index.scss";

const TOTAL_STEPS = 3;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [animal, setAnimal] = useState<AnimalKey>("cow");
  const [saving, setSaving] = useState(false);

  function finish(goToAddEmployer: boolean) {
    markOnboarded();
    if (goToAddEmployer) {
      Taro.redirectTo({ url: "/pages/employer-form/index" });
    } else {
      Taro.switchTab({ url: "/pages/index/index" });
    }
  }

  async function saveAvatarAndContinue() {
    setSaving(true);
    try {
      await setUserProfile({ animal });
    } catch (err) {
      console.error("Failed to save onboarding avatar", err);
    } finally {
      setSaving(false);
      setStep(2);
    }
  }

  return (
    <View className="onboarding-screen">
      <View className="onboarding-skip" onClick={() => finish(false)}>
        <Text>跳过</Text>
      </View>

      {step === 0 && (
        <View className="onboarding-card">
          <Text className="onboarding-title">牛马打卡机 GrindClock</Text>
          <Text className="onboarding-lead">一个小程序，管住你所有的兼职</Text>
          <Text className="onboarding-body">
            送外卖、跑网约车、发传单、代课……不管同时打几份工，这里都能一起记搬砖时长、算收入，不用来回切几个应用。
          </Text>
          <Button className="onboarding-next" onClick={() => setStep(1)}>
            下一步
          </Button>
        </View>
      )}

      {step === 1 && (
        <View className="onboarding-card onboarding-avatar-card">
          <View className="onboarding-dots">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View key={i} className={`onboarding-dot${i === 1 ? " active" : ""}`} />
            ))}
          </View>
          <Text className="onboarding-title-sm">选一个搬砖搭子</Text>
          <View className="onboarding-avatar-preview">
            <Image className="onboarding-avatar-preview-img" src={characterImageSrc(animal)} mode="aspectFit" />
          </View>
          <View className="onboarding-animal-grid">
            {ANIMALS.map((a) => (
              <View
                key={a.key}
                className={`onboarding-animal-btn${animal === a.key ? " selected" : ""}`}
                onClick={() => setAnimal(a.key)}
              >
                <View className="onboarding-animal-thumb-ring">
                  <View className="onboarding-animal-thumb" style={{ backgroundImage: `url(${characterImageSrc(a.key)})` }} />
                </View>
                <Text>{a.label}</Text>
              </View>
            ))}
          </View>
          <Button className="onboarding-next" loading={saving} onClick={saveAvatarAndContinue}>
            下一步
          </Button>
        </View>
      )}

      {step === 2 && (
        <View className="onboarding-card">
          <View className="onboarding-dots">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View key={i} className={`onboarding-dot${i === 2 ? " active" : ""}`} />
            ))}
          </View>
          <Text className="onboarding-title-sm">先添加第一个打工副本</Text>
          <Text className="onboarding-body">
            填一下副本名字（BOSS大大是谁）、结算方式（时薪/日结/按单……），马上就能开始打卡记搬砖时长了。
          </Text>
          <Button className="onboarding-next" onClick={() => finish(true)}>
            添加第一个副本 →
          </Button>
        </View>
      )}
    </View>
  );
}
