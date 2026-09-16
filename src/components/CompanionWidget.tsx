import { useState } from "react";
import { View, Text, Image } from "@tarojs/components";
import { characterImageSrc, type AnimalKey } from "../lib/avatar";
import type { PetAccessory } from "../lib/pet";
import type { Mood } from "../lib/types";
import { getCompanionHintSeen, setCompanionHintSeen } from "../lib/settings";
import "./CompanionWidget.scss";

const MOOD_BUBBLE_TEXT: Record<Mood, string> = {
  crash: "崩溃中...",
  normal: "搬砖中",
  great: "太爽了!",
  heartbeat: "心动ing~",
  slack: "摸鱼中~",
  grind: "爆肝冲鸭!",
  ox: "好社畜...",
  flat: "躺平中 ZZZ...",
};

const MOOD_LABEL: Record<Mood, string> = {
  crash: "崩溃",
  ox: "社畜",
  flat: "躺平",
  normal: "普通",
  slack: "摸鱼",
  great: "爽",
  grind: "爆肝",
  heartbeat: "心动",
};

// 10 taps within this window triggers the hidden 摸鱼小镇 unlock prompt --
// see MOYU_TOWN_SPEC.md section 2. Reset if the gap between taps is too long
// so an idle user slowly tapping over minutes never accidentally triggers it.
const SECRET_TAP_COUNT = 10;
const SECRET_TAP_WINDOW_MS = 3000;

export function CompanionWidget({
  animal,
  mbti,
  stageName,
  stageAccessory,
  hungry,
  progressPct,
  progressCaption,
  moodCaption,
  userMood,
  onSecretTap,
}: {
  animal: AnimalKey;
  mbti?: string;
  stageName: string;
  stageAccessory?: PetAccessory;
  hungry: boolean;
  progressPct: number;
  progressCaption: string;
  moodCaption: string;
  userMood?: Mood;
  onSecretTap?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hintSeen, setHintSeenState] = useState(getCompanionHintSeen);
  const [, setTapTimes] = useState<number[]>([]);

  function handleTap() {
    setOpen((o) => !o);
    if (!hintSeen) {
      setHintSeenState(true);
      setCompanionHintSeen(true);
    }
    if (onSecretTap) {
      const now = Date.now();
      setTapTimes((prev) => {
        const recent = [...prev.filter((t) => now - t < SECRET_TAP_WINDOW_MS), now];
        if (recent.length >= SECRET_TAP_COUNT) {
          onSecretTap();
          return [];
        }
        return recent;
      });
    }
  }

  return (
    <View className="companion-widget">
      {open && (
        <View className="companion-popover">
          <Text className="companion-popover-label">搬砖搭子</Text>
          <Text className="companion-popover-stage">{stageName}</Text>
          <View className="companion-popover-track">
            <View className="companion-popover-fill" style={{ width: `${progressPct}%` }} />
          </View>
          <Text className="companion-popover-caption">{progressCaption}</Text>
          <Text className={hungry ? "companion-popover-mood hungry" : "companion-popover-mood"}>{moodCaption}</Text>
          {userMood && (
            <Text className="companion-popover-usermood">跟着你的心情「{MOOD_LABEL[userMood]}」动起来了</Text>
          )}
        </View>
      )}

      {!hintSeen && !open && (
        <View className="companion-hint" onClick={handleTap}>
          <Text>这是你的搬砖搭子，点它看看～</Text>
        </View>
      )}

      {userMood && !open && (
        <View className={`companion-mood-bubble mood-${userMood}`}>
          <Text>{MOOD_BUBBLE_TEXT[userMood]}</Text>
        </View>
      )}

      <View className={`companion-avatar-btn${userMood ? ` mood-${userMood}` : ""}`} onClick={handleTap}>
        <Image className={hungry ? "companion-img hungry" : "companion-img"} src={characterImageSrc(animal, mbti)} mode="aspectFit" />
        {stageAccessory === "star" && (
          <View className="companion-accessory companion-accessory-star">
            <Text>进阶</Text>
          </View>
        )}
        {stageAccessory === "crown" && (
          <View className="companion-accessory companion-accessory-crown">
            <Text>传说</Text>
          </View>
        )}
        {hungry && (
          <View className="companion-status-badge">
            <Text>饿</Text>
          </View>
        )}
      </View>
      <View className="companion-shadow" />
    </View>
  );
}
