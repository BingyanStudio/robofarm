# TODO

此处放置所有待办事项

- [x] Balance: 浇水时机修改: 先将浇水回合均匀分布在总生长周期中，然后给每个浇水回合施加 2 回合以内的随机, 且保证两个浇水回合不重合
  改动: rng.ts `pickThirstPoints` 改为"均匀基准 (等分段中点) + 每点 ±2 回合随机偏移 + 就近探测去重",
  缺水次数不变; docs.ts 作物/灌溉章节同步 (均匀分布 + 2 回合内偏移)。

- [x] Enhancement: 单人模式验证: 取 5 个固定的种子，分别执行 5 次验证，取平均值作为最终结果
  改动: backend services/single.ts 用固定 5 种子 (VALIDATION_SEEDS) 各完整执行一局,
  平均分向上取整为成绩 (status.runs 返回各局得分); 每局独立 worker; 5 份回放全部入库,
  `/single/replay/:id?run=N` 取指定局, 历史接口返回 runs/has_replay (不再携带完整回放)。

- [x] Enhancement: 在网页UI的提交确认弹窗添加提示, 说明当前植物缺水为随机而非固定回合，可能导致服务器验证结果与本地不符; 并说明服务器端种子固定
  改动: single.ts 提交确认弹窗新增 hint (缺水时机随机 / 服务器固定 5 种子取平均);
  验证完成 toast 与"我的成绩"同时展示总得分与各局得分。

- [x] Enhancement: 在 llms.txt 和 mcp 向 Agent 强調当前植物缺水为随机而非固定回合，可能导致服务器验证结果与本地不符; 并说明服务器端种子固定
  改动: docs.ts 灌溉机制/单人模式章节 (llms.txt 与 MCP get_doc 同源)、MCP write_player_code
  prompt、api-docs 单人验证/历史/回放端点描述均强调缺水随机 + 固定种子验证。
