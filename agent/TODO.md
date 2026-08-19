# TODO

此处放置所有待办事项

## V1.0.1 Milestone

- [x] Enhancement: 第一次编译会下载编译器, 请将这个事件在日志中打出, 而不是直接打 "编译中"
    - 结果: shared `compile.ts` 导出 `isCompilerInitialized()`; single.ts / simulate.ts 首次编译时日志显示 "[系统] 首次编译, 正在下载编译器…", 之后显示 "正在编译代码…"

- [x] Enhancement: 多人竞技界面的左侧面板:
    1. 左侧 "出战状态: 尚未上传代码" 放到上方 "出战代码" 栏 右对齐
    2. "上传出战代码" 改为 "上传代码", 且加上绿色 accent
    3. "模拟竞技" 和 "上传代码" 按钮也放到上方 "出战代码" 栏 右对齐
    - 结果: match.ts 重构左侧头部: `.match-head` ("出战代码" 标题 + 出战状态右对齐), `.match-head-actions` (模拟竞技 + 绿色 `btn-start` 的 "上传代码" 按钮, 右对齐), 提示文字右对齐保留; 原 `.match-actions` 样式移除

- [x] Performance: 检查性能: 
    1. 当前单人种植模式的服务器校验是否能承受较多的流量? 如果有优化空间，请进行优化
    2. 请预留限流接口, 后续可能需要单人种植模式每个用户一分钟最多提交 xx 次
    - 结果: ① services/single.ts 增加全局并发上限 (`SINGLE_MAX_CONCURRENT` 默认 4, 超限返回 409"服务器繁忙"), 防止大量提交同时占用 NodeProgram worker 拖垮服务器; esbuild 初始化本身已是进程级单次 (compile.ts ensureInit 缓存); ② 新增 `services/ratelimit.ts` (固定窗口, 进程内存, 每 key 每分钟 N 次), `POST /single/validate` 预留接入 (`SINGLE_SUBMIT_LIMIT_PER_MIN` 默认 0 不限流, 超限返回 429 + retryAfter), 冒烟验证通过 (200 → 409 → 429)