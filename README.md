# 牛马打卡机 GrindClock · 微信小程序

网页版（Firebase + React + Vite，仓库见 [GrindClock 网页版](https://github.com/PandaFayeFaye/GrindClock)）的微信小程序移植版。

**这是一个独立项目**，不是网页版的一部分——技术栈完全不同（Taro + React，编译到微信小程序原生环境），后端也不同（微信云开发，不是 Firebase）。两边数据不实时互通，迁移靠 CSV 导入导出（见 `docs/DATA_MODEL.md`）。

## 当前状态

网页版的核心功能已基本移植完成：

- [x] 首页（打卡/下班确认、今日与本周/本月收入卡片、加班检测）
- [x] 统计页（分时段汇总、加班收入、CSV 导出）
- [x] 打工副本表单（全部6种计费方式、固定/弹性排班、加班规则、净收益相关字段）
- [x] 补录 / 批量补录（含加班自动检测）
- [x] 我的页（昵称、称号进度、连续打卡、净收益对比入口、已停用副本重启）
- [x] 净收益对比（通勤时间/成本、空闲时间折算）
- [x] 徽章墙（称号进度 + 隐藏成就）
- [x] 团队代记（组长模式，代记他人工时不计入个人统计）
- [x] 月度战绩总结（故事卡片形式，暂不含分享图导出）
- [x] AI 记工（拍照 OCR / 语音 ASR，含整周排班表批量识别、云函数模板见 `cloudfunctions/`）

## 开发

```bash
npm install
npm run dev:weapp   # 监听模式，用微信开发者工具打开项目根目录预览（不是 dist/ 子目录）
npm run build:weapp # 生产构建
npx tsc --noEmit -p tsconfig.json   # 类型检查
```

云开发环境 ID 在 `src/app.ts` 的 `CLOUD_ENV_ID`，云函数部署和密钥配置见 `cloudfunctions/README.md`。

## 尚未搬运的部分

- **月度战绩总结的分享图生成**（网页版用 Canvas 绘制成图片分享）—— 小程序需要用 `wx.createCanvasContext`/`Taro.canvasToTempFilePath` 重新实现，还没做
- **CSV 导出的"图片导出"选项**（网页版除了CSV，也能导出表格截图）—— 同样需要 Canvas 方案，还没做
- `tiers.tsx` 的称号徽章图标 —— 徽章墙页面里简化成了竖排进度条，没有网页版的锯齿路径可视化
- 完整的 i18n 字典 —— 小程序面向的是国内微信用户，多语言优先级低于网页版，`src/lib/i18n.ts` 目前只是个类型占位（小程序界面固定中文）
