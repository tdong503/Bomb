# 炸弹猫(Exploding Kittens Variant) – 在线实时对战原型

该项目是基于你提供的中文规则说明的在线多人实时对战原型，实现了核心的房间管理、基础游戏循环、部分功能牌与组合牌逻辑，使用 **Node.js + Express + Socket.io + TypeScript**，前端使用最简单的静态页面（后续可替换为 React/Vue 等）。

## 已实现功能概览
- 房间创建 / 加入 / 复制邀请链接
- 房主开始游戏（当前房间至少 2 人）
- 基础发牌流程：
  - 每位玩家 5 张普通/功能牌 + 1 张拆除（Defuse）
  - 抽牌堆插入 (玩家人数 - 1) 张炸弹 (Bomb)
  - 抽牌堆插入剩余 2 张拆除
- 回合与出牌 / 摸牌顺序管理（支持跳过 / 攻击 / 反转 等基础效果的一部分）
- 牌堆、弃牌堆、玩家手牌状态维护
- 炸弹与拆除逻辑（无拆除则淘汰；有拆除则重新插入炸弹）
- 黑洞(Imploding) 卡的双阶段（首次曝光再插入 / 第二次淘汰）
- 攻击 / 定向攻击（Targeted Attack）堆叠剩余回合数模型
- Skip、Shuffle、Draw From Bottom、See/Alter the Future（Alter 可按给定顺序重排前 N 张）
- Salvage 打捞：随机取弃牌堆一张（炸弹/黑洞返回到牌堆随机位置，其他进手牌）
- Favor（基础版本：立即从指定或随机目标转移 1 张牌）
- 组合牌（当前原型内实现）：
  - 两张相同：随机抽一名其他玩家 1 张手牌
  - 三张相同：指定一名玩家并声明一种普通猫牌名，若命中则获得该牌
  - 四张相同：所有其他玩家随机弃 1 张牌
  - 五张不同普通牌：可从弃牌堆声明取回一张具体卡（若存在）（前端可浏览弃牌堆并按 ID 后四位输入）
- 断线重连（同 playerId 重新 joinRoom 即视为重连）
- 座位交换（游戏未开始时）
- 结束后房主可重开（restartGame）
- 基础测试：炸弹/拆除、攻击、跳过、两张组合等单元测试 (Jest + ts-jest)

## 尚未完成 / 简化点
- Favor 交互的“被索取玩家自主选择”版本（当前为自动选择）
- Reverse 作为响应 Attack 的复杂规则链（仅实现简单方向翻转）
- 更复杂攻击链 / 多层嵌套（当前 remainingTurns 简化）
- 弃牌堆仍完整暴露（调试用）——正式版需限制或仅显示顶牌
- 更细粒度事件与操作日志重放
- 随机数种子（下一阶段 D）

## 目录结构
```
/ src
  /game        核心游戏逻辑（类型、牌堆、引擎）
  /server      房间与 Socket.io 入口
/public        简单静态前端页面
/tests         Jest 测试
```

## 本地运行
### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式启动（含自动重启）
```bash
npm run dev
```
访问: http://localhost:3000

### 3. 运行测试
```bash
npm test
```

### 4. 构建与生产运行
```bash
npm run build
npm start
```

## 关键服务端事件 (Socket.io)
| 事件 | 方向 | 参数 | 说明 |
|------|------|------|------|
| createRoom | 客户端->服务端 | { playerId, name, avatar?, options } | 创建房间并自动加入 |
| joinRoom | 客户端->服务端 | { roomId, playerId, name, avatar? } | 加入/重连房间 |
| startGame | 客户端->服务端 | { roomId, playerId } | 房主开始游戏 |
| playCard | 客户端->服务端 | { roomId, playerId, cardId, extra? } | 出单张牌 |
| playCombo | 客户端->服务端 | { roomId, playerId, cardIds, params? } | 出组合牌 |
| draw | 客户端->服务端 | { roomId, playerId } | 摸牌 |
| swapSeat | 客户端->服务端 | { roomId, playerId, targetSeat } | 调整座位（未开始） |
| restartGame | 客户端->服务端 | { roomId, playerId } | 结束后重开 |
| roomUpdate | 服务端->客户端 | { roomId, state } | 房间（未开始或座位变化）同步 |
| gameState | 服务端->客户端 | GameStateSnapshot | 游戏状态广播 |

## 数据结构简述
- GameStateSnapshot：提供前端 UI 所需基础状态（抽牌堆仅给长度，不泄露内容）
- PlayerState：包括手牌数组（原型里直接下发；后续正式版应对其他玩家隐藏）
- remainingTurns：处理 Attack / Targeted Attack 的叠加；每完成一次摸牌阶段减 1，至 0 后切换玩家

## 重要逻辑约定
- 玩家出牌阶段可出 0~多张；目前原型未强制“出牌后才能摸牌”顺序的中间多步交互（前端由按钮驱动）
- Skip/Attack/Targ.Attack 在当前实现中：立即结束该玩家回合（不摸牌）并推进 turn。
- Salvage 抽到炸弹/黑洞时：不进手牌而重新插入/放回抽牌堆，避免直接给到玩家。
- Imploding (黑洞)：第一次抽到仅标记 exposed，再次被任意玩家抽到即淘汰，不能用 Defuse。

## 后续可扩展建议 (Next Steps)
1. 否决 (Nope) 响应窗口：
   - 采用事件堆栈 + 倒计时（如 3~5 秒） + 链式否决（Nope -> Nope）
2. Favor 交互：服务端指令要求目标玩家选择一张牌回传
3. Reverse 响应 Attack：在攻击指向自己时可以打出进行方向反转并把攻击转移
4. 更严格的权限/隐藏信息：仅向对应玩家下发其手牌内容；其他玩家看到牌数量与公共信息
5. 重放与日志：保存操作序列（时间戳、随机数种子）实现观战/回放
6. UI/UX：
   - 动画：爆炸、出牌、顺序箭头、倒计时圈
   - 移动端适配与触控优化
7. 历史战绩与 Elo 排名或天梯模式
8. 更丰富的测试：边界（单人即失败 / 只剩两人时炸弹处理 / Attack 链嵌套 + Reverse）
9. 防作弊：服务端验证出牌合法性（当前部分仅前端约束）
10. 部署：Dockerfile + CI（GitHub Actions）+ 生产监控 (Prometheus/Grafana)

## 运行中的注意事项
- 当前直接广播包含所有玩家手牌（便于快速原型调试），正式版本需裁剪
- 随机数使用 `Math.random()`，若需确定性测试或重放应引入种子 PRNG
- 组合牌逻辑仅支持普通猫牌；功能牌暂未参与组合

## 前端近期新增（本迭代改动）
- game.html 支持：
  - 普通猫牌多选并出“组合牌”
  - 三张相同时弹出目标/声明输入
  - 五张全异时支持查看弃牌堆并输入尾号取回
  - TARGETED_ATTACK 与 Favor 出牌时可选择目标玩家
  - 查看/隐藏弃牌堆（调试用，正式版应隐藏信息）

## 安全与隐藏信息
- 当前已对广播进行按玩家定制：其他玩家的 hand 仅保留长度（数组由空对象占位）。
- 弃牌堆 discardPile 仍全部发送（便于调试组合牌与五异功能），后续可裁剪为只发送顶牌或摘要。
- NOPE 待决动作 pendingNope 不含敏感手牌，仅描述牌类型与发起人。

## 许可证
原型示例代码（不包含任何官方美术）可在个人/内部学习用途使用。如需商用或发布，请注意与原版 Exploding Kittens IP 相关的版权与商标限制。

---
欢迎根据需要继续扩展，如果你告诉我下一步想聚焦的模块（例如：Nope 响应、UI 动效、服务端隐藏信息重构、或种子随机），我可以直接在此基础上迭代。祝开发顺利！
