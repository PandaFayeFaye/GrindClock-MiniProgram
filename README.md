# 牛马打卡机 GrindClock · 微信小程序

网页版（Firebase + React + Vite，仓库见 [GrindClock 网页版](https://github.com/PandaFayeFaye/GrindClock)）的微信小程序移植版。

**这是一个独立项目**，不是网页版的一部分——技术栈完全不同（Taro + React，编译到微信小程序原生环境），后端也不同（微信云开发，不是 Firebase）。两边数据不实时互通，迁移靠 CSV 导入导出（见 `docs/DATA_MODEL.md`）。

## 当前状态：Phase 1（脚手架）

- [x] Taro 项目初始化（React + TypeScript + Sass + Webpack5）
- [x] AppID 已配置（`project.config.json`）
- [x] `src/lib/` 下的纯计算逻辑已从网页版搬运：`types.ts`、`currency.ts`、`pay.ts`（工资/加班计算）、`schedule.ts`（排班）、`stats.ts`（统计聚合）、`pet.ts`（搭子成长阶段）
- [x] 设计 token 已从网页版 CSS 移植为 WXSS 兼容的 `src/styles/tokens.scss`
- [x] 云开发数据库结构规划见 `docs/DATA_MODEL.md`
- [ ] 云开发环境 ID 还没填（`src/app.ts` 里的 `CLOUD_ENV_ID`）—— 需要先在小程序后台开通云开发，把环境 ID 填进去
- [ ] 页面 UI 还没开始写（Phase 2）

## 开发

```bash
npm install
npm run dev:weapp   # 监听模式，用微信开发者工具打开 dist/ 目录预览
npm run build:weapp # 生产构建
```

## 尚未搬运的部分（有意为之，等对应 UI 页面开发时再处理）

- `tiers.tsx`（称号等级）—— 混了 JSX 图标，等徽章墙页面写的时候一起做
- `moods.tsx`（心情图标）—— 用的是内联 SVG，小程序原生环境不支持 `<svg>` 标签，图标需要重做成图片资源或 canvas 绘制
- 完整的 i18n 字典 —— 小程序面向的是国内微信用户，多语言优先级低于网页版，`src/lib/i18n.ts` 目前只是个类型占位
