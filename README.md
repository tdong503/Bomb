# Bomb (Exploding Kittens Variant) – Multiplayer Prototype

## 当前进度 (Server + Client Prototype)
已完成的核心能力：
- 房间创建 / 加入 / 随机座位分配 / 房主开始游戏
- 初始化发牌（每人 5+1 拆除），根据玩家数构建剩余牌堆 + 炸弹数 + 额外扩展牌
- 基础公共状态同步（玩家手牌数量 / 回合玩家 / 方向 / 牌堆剩余）
- 私有手牌实时推送（仅自己收到）
- 出牌及效果(初版)：Skip, Attack, TargetedAttack, Reverse, SeeTheFuture, AlterTheFuture(仅展示), Favor, Shuffle, DrawFromBottom, Salvage, Defuse 处理，普通猫牌无效果
- Attack / TargetedAttack 叠加逻辑（pendingTurns）
- 抽牌：顶部 / 抽底（DrawFromBottom）
- 拆除炸弹：进入放置界面，可指定 0..N 位置（底/中/顶/随机快捷按钮）
- 预言 / 改变未来：查看未来 3 张（改变未来暂未允许重新排序，只展示）
- Salvage：随机打捞弃牌堆一张（含可能炸弹）
- 炸弹爆炸淘汰 / 排名顺序记录 / 最后一人胜利
- UI：房间大厅、手牌显示、当前回合标识、预言与拆除覆盖层、基础暗色主题
- 引擎冒烟测试脚本（`npm run test:engine`）

尚未实现 / TODO：
- Nope 否决链与时间窗口
- 组合出牌（2/3/4/5 牌效果）与可否决交互
- Imploding / 黑洞 特殊规则
- AlterTheFuture 实际排序提交交互
- Favor 指定玩家选择哪张牌（当前随机）
- 攻击链更复杂的多层转移（当前只做 pendingTurns 叠加）
- 断线重连 token 恢复（结构已留）
- 玩家座位调整 / 手动换座
- 头像上传 / 选择
- 房间分享链接（复制 / 深链）
- 游戏日志（已定义事件接口 placeholder）
- Restart / 新一局
- 更完善的动画 / 音效 / 牌面图资源
- 安全校验（服务器侧更严格的规则验证）
- 单元测试（当前仅烟雾测试）与集成测试
- 性能优化（大房间 10+ 玩家）
- 生产部署（反向代理 / HTTPS / 可扩展伸缩）

## 目录结构
```
server/  (Node.js + Socket.io + TypeScript 服务端)
  src/
    server.ts            Socket.io 事件入口
    roomManager.ts       房间与初始化逻辑
    deck.ts              牌堆生成算法
    gameEngine.ts        回合 / 出牌 / 抽牌 / 攻击 / 拆除核心逻辑
    types.ts             所有共享类型（服务端）
    tests/engineSmoke.ts 引擎冒烟测试
client/  (React + Vite 前端)
  src/
    socket.ts            socket.io 客户端封装
    ui/                  React 组件 (Lobby / Room / Hand / App ...)
    types.ts             前端轻量类型副本
    global.css           基础样式
```

## 快速运行
### 1. 启动服务端
```bash
cd server
npm install   # 首次
npm run dev   # 开发模式 (ts-node-dev)
# 或构建后运行
npm run build && npm start
```
服务默认端口：`4000`

### 2. 启动客户端
```bash
cd client
npm install   # 首次
npm run dev   # Vite 开发服务器 (默认 5173)
```
浏览器访问：http://localhost:5173

### 3. 运行引擎冒烟测试
```bash
cd server
npm run test:engine
```
输出中可见多回合模拟（出牌 / 抽牌 / 预言）。

## 玩法验证步骤（最小路径）
1. 打开两个浏览器窗口 (或两个不同浏览器)
2. 窗口 A：创建房间（输入昵称）
3. 复制房间号到窗口 B：加入房间
4. 房主点击“开始游戏”
5. 当前回合玩家可：
   - 点手牌按钮出牌（例如 Skip）
   - 点击“摸牌”结束回合（若未出 Skip/Attack）
6. 抽到炸弹并有拆除时会弹出放置界面
7. 使用某些功能牌（预言 / 抽底 / 洗牌）查看效果

## 技术要点
- 服务器内存状态：每个房间维护 `InternalRoomState`，通过 `room:update` 广播公共子集
- 隐私手牌：单播 `game:yourHand`
- 回合推进：pendingTurns 机制支持 Attack 堆叠
- Defuse：设置 `pendingDefuse` 锁定流程，等待客户端放置位置后继续
- 未来扩展：Nope/组合牌将需要 Action Stack + 超时窗口；当前类型里已预留 `nopeWindow`

## 重要设计决定
| 主题 | 决策 | 原因 |
|------|------|------|
| 牌堆顶表示 | 使用数组尾部 (pop) | push/pop 常数操作简单直观 |
| Attack 叠加 | pendingTurns 累加 | 统一处理“回合份额”概念 |
| 预言结果缓存 | 临时挂在 player 私有对象 | 避免污染公共状态与额外事件同步 |
| Defuse 放置 | 客户端选择 0..deck.length | 灵活模拟任意插入 |

## 下一阶段建议 (优先级顺序)
1. Nope 否决链 & 超时窗口 (交互 + 服务器裁决)
2. 组合出牌 (2 / 3 / 4 / 5) + 指定目标 / 指定牌类型逻辑
3. Imploding (黑洞) 特殊两阶段处理
4. 完善 AlterTheFuture 拖拽排序 / 提交重排
5. 日志系统 + 前端事件时间线
6. 断线重连 token 恢复 (登录态本地存储)
7. Restart 流程 Reset / 保留座位
8. 更安全的服务器校验（例如禁止越权放置炸弹 / 出不是自己手牌 / 回合外出牌）
9. 单元测试（shuffle 可替换 RNG、Attack 链、Defuse 边界）
10. 性能优化（分区消息 + 最少字段广播）

## 边界 & 已知问题
- AlterTheFuture 目前仅显示，不可重新排序
- Favor 随机给牌，未实现目标玩家选择
- 没有 Nope，故所有行动不可被打断
- 未处理“牌堆耗尽”终局判定（可加：最后一人仍存活胜利）
- Imploding / 黑洞 尚未放入流程
- 组合牌效果未接入

## 贡献 / 开发工作流建议
1. 为新功能添加最小单元/冒烟测试（放在 `server/src/tests`）
2. 变更公共状态结构时保持向后兼容或 bump 客户端处理
3. 大型规则（Nope/组合）先写伪代码 & 流程图

## 许可证
当前未指定许可证（private prototype）。如需开源请添加 LICENSE。

---
欢迎继续提出所需功能或直接指出下一个实现优先级，我会基于本 README 中的 TODO 继续迭代。

TODO:
实现 Nope 否决窗口（需要 action stack + 超时计时 + 链判奇偶）。
实现四张相同（全体随机弃一张）与五张不同（从弃牌堆声明取一张）。
AlterTheFuture 排序界面和提交事件。
Imploding Kitten 两阶段逻辑（第一次翻开公开并正面朝上放回；第二次爆炸且不可拆除）。
Favor 目标玩家界面：允许手动选择给出的牌。
重连 token：登录后恢复房间与手牌（服务器保存隐藏手牌，重新单播）。
Restart 流程：保留座位；重置状态、重新发牌。
服务器端规则校验补强（防止伪造 comboCardIds / 越权指定 target / 非己回合出牌）。
单元测试：Attack 链叠加、Defuse 插入位置正确性、Salvage 取牌概率/边界、组合逻辑等。

