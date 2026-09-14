import { useState } from "react";
import { View, Text } from "@tarojs/components";
import { markCoachTourSeen } from "../lib/onboarding";
import "./CoachTour.scss";

export interface CoachStep {
  title: string;
  body: string;
}

export const HOME_COACH_STEPS: CoachStep[] = [
  { title: "打工人晋级路线", body: "根据累计搬砖时长晋级称号，点头衔能看到完整的成就墙和进阶路线。" },
  { title: "今日 / 本周收入", body: "点击左边卡片可以切换看今日还是本周赚了多少，超出排班的加班时长和收入也会一起显示。" },
  { title: "本月已赚", body: "右边这张卡片固定统计本月至今的总工时和总收入，跨所有副本汇总，同样会算上加班收入。" },
  { title: "一键打卡", body: "点按钮记录上下班时间，多个副本可以分别打卡、互不影响。" },
  { title: "每个副本的当日战绩", body: "今天打过卡的副本下面会显示当天的工时、收入，超出排班的部分会标为加班。" },
  { title: "你的搬砖搭子", body: "工作时长会喂养它成长，点击它能看到当前状态和喂养进度。" },
  { title: "AI记工 / 补录 / 开副本", body: "首页下方按钮可以拍照/语音记工、批量补录搬砖时长、或者开启新副本。" },
  { title: "统计页：趋势 / 日历 / 排行", body: "能看每天的工时收入趋势、加班统计，以及完整明细。" },
  { title: "我的：心情记录 & 数据洞察", body: "能记录每天的心情曲线、查看净收益对比和本月战绩总结，还能管理成就徽章墙。" },
];

export function CoachTour({ steps, onDone }: { steps: CoachStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  function finish() {
    markCoachTourSeen();
    onDone();
  }

  return (
    <View className="coach-tour-backdrop" onClick={finish}>
      <View className="coach-tour-card" onClick={(e) => e.stopPropagation()}>
        <Text className="coach-tour-progress">{index + 1} / {steps.length}</Text>
        <Text className="coach-tour-title">{step.title}</Text>
        <Text className="coach-tour-body">{step.body}</Text>
        <View className="coach-tour-actions">
          <View className="coach-tour-skip" onClick={finish}>
            <Text>跳过教程</Text>
          </View>
          <View className="coach-tour-next" onClick={() => (isLast ? finish() : setIndex(index + 1))}>
            <Text>{isLast ? "知道啦" : "下一个"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
