# 云开发数据库结构规划

对照网页版 Firestore 的 `users/{uid}/employers` 和 `users/{uid}/timeEntries`，云开发用集合（collection）+ `_openid` 字段做数据隔离（云开发的数据库权限规则可以设成"仅创建者可读写"，不需要自己在每条查询里手写 uid 过滤，`_openid` 会自动注入）。

## 集合设计

### `employers`
对应网页版 `Employer`（src/lib/types.ts）。字段基本照抄，只加一个 `_openid`（云开发自动写入，不用手动处理）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_openid` | string | 云开发自动填充，等价于网页版的 uid |
| `name` | string | |
| `color` | string | |
| `payType` | string | hourly / daily / base+overtime / comprehensive / monthly / per-order |
| `currency` | string? | 默认 CNY |
| `scheduleMode` | string? | flexible / fixed |
| `fixedSchedule` | object? | 同网页版结构 |
| `hourlyRate` / `dailyRate` / `baseSalary` / `monthlySalary` / `pricePerOrder` | number? | |
| `overtimeMultiplier` / `overtimeRateMode` / `overtimeHourlyRate` | | 加班规则，同网页版 |
| `holidayMultiplier` / `breakMinutes` / `settlementCycle` | | |
| `commuteMinutes` / `commuteCost` / `idleTimePct` | | 净收益对比用 |
| `defaultAdjustments` | array? | |
| `note` | string? | |
| `archived` | bool? | 停用标记，和网页版一致 |

### `timeEntries`
对应网页版 `TimeEntry`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_openid` | string | |
| `employerId` | string | 对应 employers 集合的 `_id` |
| `startTime` / `endTime` | number (ms) | |
| `status` | string | confirmed 等 |
| `source` | string | manual / clock |
| `mood` / `moodNote` | string? | 8 种心情，同网页版 `Mood` 类型 |
| `overtimeHours` | number? | |
| `isOvertime` / `isHoliday` | bool? | |
| `adjustment` | array? | |
| `orderCount` | number? | |
| `clockInLocation` | object? | |

### `userProfile`
对应网页版 `users/{uid}/profile/main`。一个用户一条记录（用 `_openid` 当唯一键，或者直接查询自己的那条）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_openid` | string | |
| `animal` | string? | 头像动物 |
| `mbti` | string? | |
| `nickname` | string? | |

### `workers`
对应网页版 `users/{uid}/workers`——组长模式下代记录的团队成员（不是登录用户，只是组长手动建的名单）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `_openid` | string | 属于哪个组长账号 |
| `name` | string | |
| `note` | string? | |
| `defaultHourlyRate` | number? | |

代记录产生的 `timeEntries` 会带上 `workerId`（指向这个集合的 `_id`），首页/统计页统计时要过滤掉 `workerId` 存在的记录，不能混进组长自己的个人数据。

## 权限规则

云开发数据库默认权限规则选 **"仅创建者可读写"**（`{"read": "doc._openid == auth.openid", "write": "doc._openid == auth.openid"}`），这样每个集合都不需要在业务代码里手写权限判断，云端会自动拦截别人读写你的数据——效果等价于网页版 `firestore.rules` 里那条 `request.auth.uid == uid` 规则。

## 和网页版的关系（重要）

**这是一套独立的数据**，不是共享的。云开发的 `_openid` 是"这个用户在这个小程序里"的身份标识，和网页版 Firebase Auth 的 uid 是两套完全不相关的体系，没法直接互通。

网页版 ⇄ 小程序数据迁移走 **CSV 导入/导出**（Phase 4 做）：
1. 网页版"我的"页面已有"导出全部数据"功能，导出 CSV
2. 小程序做一个"导入数据"向导，解析 CSV 按上面这套字段结构写入云数据库

## 后续要做的事（不在本次范围内）

- 云函数（cloud functions）：目前 v1 计划里几乎所有读写可以直接用小程序端 SDK 操作数据库（云开发允许客户端直连，配合权限规则即可，不强制要求云函数），只有涉及"团队代记"这种跨用户写入场景（组长帮组员记录，需要写到别人的 openid 下）才必须用云函数（云函数用管理员权限跳过权限规则）。这个等 Phase 3 团队功能时再设计。
