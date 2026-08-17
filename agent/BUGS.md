# Bugs

此处放置所有 Bug, 请将其修复后, 在本文档中打 x 并描述修复方式

- [x] Bug: 浇水后，植物贴图退化成了前一段生长时期的样子, 应当连贯
  - 修复: Thirsty 状态此前在快照中 `cyclesToGrown=0`, 渲染器只能用固定中间阶段占位,
    浇水恢复 Growing 后跳回按真实进度计算的较小阶段, 造成"退化"。
    现在 `cropInfo` (registry.ts) 让 Thirsty 也携带暂停时的剩余回合数,
    `cropStageIndex` (sprites.ts) 对 Growing/Thirsty 共用同一进度公式, 贴图保持连续
    (旧回放数据 cyclesToGrown=0 时仍回退到中间阶段占位)。docs.ts 与地块悬停提示同步更新。
- [x] Enhancement: 加速按钮给出选项:
    1. 0.8s: 正常速度
    2. 0.4s: 2倍速度
    3. 0.2s: 4倍速度，此时如果程序 0.2s 内没有执行完，则等待执行完后再进入下一回合
  - 实现: `config.ts` 用 `TURN_INTERVALS_MS = [800, 400, 200]` 取代单个快进常量;
    单人模式按钮由"快进: 开/关"改为三档循环"速度: 正常 / ×2 / ×4"。
    `scheduleNext` 本来就 `await stepOnce()` 完成 (含玩家代码执行) 后才排下一回合,
    因此 4 倍速下程序未执行完会等待, 不会产生回合重叠。