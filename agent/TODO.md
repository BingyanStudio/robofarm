# TODO

此处放置所有待办事项

## V1.0.2 Milestone

- [x] Enhancement: 排行榜 UI 和后端改动:
    1. 排行榜 API 语义修改: 
        1. 不携带任何参数, 则返回前 50 名的用户名和得分
        2. 携带参数 "user", 则查询指定玩家的得分，返回得分和该玩家在整个榜单上的位置
    2. 前端显示修改: 
        1. 始终显示前 50 名
        2. 如果前端已经登录，则也查询登录玩家的排名
        3. 若登录玩家在 50 名内，则直接高亮标记
        4. 若登录玩家不在，则在排行榜最下方添加显示登录玩家的排名和分数并高亮
        5. 无论哪种情况，已登录玩家的那一行都必须始终可见，吸附在弹窗底端
    - 结果: ① API: `GET /single/leaderboard` 无参 → `{ entries }` 前 50 名 (登录用户带 me); `?user=<用户名>` → `{ user: { name, score, rank } }` (全榜 1-based 名次, db.ts 新增 `userRank`); 原按大版本 Tab 的返回结构移除 (迁移快照数据保留但不再展示); ② 前端: 始终展示前 50 (前三名奖牌), 登录后查询个人排名——在 50 名内原位高亮, 同时排名行固定吸附弹窗底端 (`.lb-pinned` 位于滚动区外, 列表内部滚动 `.lb-scroll`), 未登录不显示底端行; 已端到端验证 (50 条/rank 正确/榜尾用户/不存在用户返回 null)

- [x] Enhancement: 将网站的 Favicon 修改为 `packages/frontend/public/favicon.svg`
    - 结果: index.html 增加 `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` (public/ 已被 vite 复制, 开发与发布版均生效)