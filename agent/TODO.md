# TODO

此处放置所有待办事项

## V1.0.8 Milestone

- [x] Bug: 浏览器本地运行单人模式时，最后下载回放发现 rounds 数组是空的
  修复: GameRunner 新增 `onTurn` 回合结束回调 (每回合 step 后触发, 带回合号),
  single.ts 在回调中调用 `recorder.afterStep(events, round)` (与后端单文件
  服务一致), 本地下载的回放现在包含完整 rounds (1..maxTurns)。
- [x] Bug: 回合数映射问题:
    1. 各个游戏模式运行结束时, 回合数其实是 501 而不是 500
    2. 结果数据统计时，500 回合的金钱与最终金钱对不上 (可能因为实际最终回合是 501)
    3. 回放时，最后一个回合也是 501
  修复: 根因是 `snapshotOf()` 返回 `world.turn + 1`, 而 `GameController.step()`
  在生成快照**之前**已执行 `world.turn += 1` → 快照回合号 = 已完成回合 + 1
  (末回合 501)。改为 `snapshotOf()` 直接返回 `world.turn` (刚完成的回合号),
  与 turn 事件 / 玩家视图回合 (view.turn) 一致; 状态栏、统计金钱曲线
  (turns 1..maxTurns, 末点金钱 = 最终金钱)、回放末回合全部归位。
  game-controller.test.ts 增加快照回合与 turn 事件一致的回归断言。