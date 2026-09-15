import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { markCoachTourSeen } from "../lib/onboarding";
import "./CoachTour.scss";

export interface CoachStep {
  title: string;
  body: string;
  // A className (no leading dot) of the on-page element this step should
  // spotlight. Omitted for steps about a different page/tab -- those fall
  // back to a plain centered card since there's nothing on THIS page to
  // highlight.
  target?: string;
}

export const HOME_COACH_STEPS: CoachStep[] = [
  { title: "打工人晋级路线", body: "根据累计搬砖时长晋级称号，点头衔能看到完整的成就墙和进阶路线。", target: "home-tier-chip" },
  { title: "今日 / 本周收入", body: "点击左边卡片可以切换看今日还是本周赚了多少，超出排班的加班时长和收入也会一起显示。", target: "income-card-today" },
  { title: "本月已赚", body: "右边这张卡片固定统计本月至今的总工时和总收入，跨所有副本汇总，同样会算上加班收入。", target: "income-card-month" },
  { title: "一键打卡", body: "点按钮记录上下班时间，多个副本可以分别打卡、互不影响。", target: "punch-btn" },
  { title: "每个副本的当日战绩", body: "今天打过卡的副本下面会显示当天的工时、收入，超出排班的部分会标为加班。", target: "done-today-footer" },
  { title: "你的搬砖搭子", body: "工作时长会喂养它成长，点击它能看到当前状态和喂养进度。", target: "companion-widget" },
  { title: "AI记工 / 补录 / 开副本", body: "首页下方按钮可以拍照/语音记工、批量补录搬砖时长、或者开启新副本。", target: "fab-wrap" },
  { title: "统计页：趋势 / 日历 / 排行", body: "能看每天的工时收入趋势、加班统计，以及完整明细。" },
  { title: "我的：心情记录 & 数据洞察", body: "能记录每天的心情曲线、查看净收益对比和本月战绩总结，还能管理成就徽章墙。" },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

export function CoachTour({ steps, onDone }: { steps: CoachStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    setRect(null);
    if (!step.target) return;
    Taro.createSelectorQuery()
      .select(`.${step.target}`)
      .boundingClientRect((res) => {
        if (res && "width" in res && res.width) {
          setRect({ top: res.top, left: res.left, width: res.width, height: res.height });
        }
      })
      .exec();
  }, [index, step.target]);

  function finish() {
    markCoachTourSeen();
    onDone();
  }

  function next() {
    if (isLast) finish();
    else setIndex(index + 1);
  }

  const spotlightStyle = rect
    ? {
        top: `${rect.top - PADDING}px`,
        left: `${rect.left - PADDING}px`,
        width: `${rect.width + PADDING * 2}px`,
        height: `${rect.height + PADDING * 2}px`,
      }
    : undefined;

  const windowHeight = Taro.getSystemInfoSync().windowHeight;
  const tooltipStyle = rect
    ? rect.top < windowHeight * 0.55
      ? { top: `${rect.top + rect.height + PADDING + 24}px` }
      : { bottom: `${windowHeight - rect.top + PADDING + 24}px` }
    : undefined;

  return (
    <View className="coach-tour-backdrop" onClick={finish}>
      {rect && <View className="coach-spotlight" style={spotlightStyle} />}
      <View
        className={`coach-tour-card${rect ? " positioned" : ""}`}
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <Text className="coach-tour-progress">{index + 1} / {steps.length}</Text>
        <Text className="coach-tour-title">{step.title}</Text>
        <Text className="coach-tour-body">{step.body}</Text>
        <View className="coach-tour-actions">
          <View className="coach-tour-skip" onClick={finish}>
            <Text>跳过教程</Text>
          </View>
          <View className="coach-tour-next" onClick={next}>
            <Text>{isLast ? "知道啦" : "下一个"}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
