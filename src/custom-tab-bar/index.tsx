import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import "./index.scss";

// Native WeChat tabBar can't reproduce the web app's floating dark pill with
// per-tab accent colors and a pop animation on the active icon badge -- it
// only supports a flat background color, plain text/icon images, no custom
// shape. This custom-tab-bar component replaces the native one entirely so
// that look can actually be ported.
const TABS = [
  { index: 0, url: "/pages/index/index", label: "首页", accent: "#FF6B6B" },
  { index: 1, url: "/pages/stats/index", label: "统计", accent: "#4361EE" },
  { index: 2, url: "/pages/me/index", label: "我的", accent: "#B084F5" },
];

export default function CustomTabBar() {
  const [selected, setSelected] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handler = (idx: number) => setSelected(idx);
    Taro.eventCenter.on("tabBarChange", handler);
    return () => {
      Taro.eventCenter.off("tabBarChange", handler);
    };
  }, []);

  useEffect(() => {
    // Taro/wx.hideTabBar() only toggles the native tabBar container -- it
    // does nothing for a fully custom one, since this component's own
    // render is what actually paints the bar. A full-screen modal that
    // reaches the bottom of the screen has to ask this component directly
    // to stop rendering while it's open, or its buttons end up hidden
    // underneath the bar (the bar is a separate layer that always paints
    // above regular page content regardless of WXSS z-index).
    const handler = (v: boolean) => setVisible(v);
    Taro.eventCenter.on("tabBarVisibility", handler);
    return () => {
      Taro.eventCenter.off("tabBarVisibility", handler);
    };
  }, []);

  function handleTap(tab: (typeof TABS)[number]) {
    setSelected(tab.index);
    Taro.switchTab({ url: tab.url });
  }

  if (!visible) return null;

  return (
    <View className="tabbar-dock">
      <View className="tabbar">
        {TABS.map((tab) => {
          const active = selected === tab.index;
          return (
            <View key={tab.url} className={`tab${active ? " active" : ""}`} onClick={() => handleTap(tab)}>
              <View className="tab-icon-badge" style={active ? { background: tab.accent } : undefined}>
                <View className={`tab-icon tab-icon-${tab.index}${active ? " active" : ""}`}>
                  {tab.index === 1 && <View className="bar-mid" />}
                </View>
              </View>
              <Text className="tab-label">{tab.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
