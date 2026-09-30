# TODO

此处放置所有待办事项

- [x] Bug: 主菜单游戏界面的 Tooltip 与浅色圆角矩形容器没有对齐
    - 修复: `.render-tooltip` 共享样式是 `top:10px; right:12px`, 在游戏页 (无 padding 的 canvas 宿主) 里正好贴画布角; 但菜单 showcase 的宿主 `.menu-showcase` 有 20px padding, Tooltip 被定位到画布外。新增 `.menu-showcase .render-tooltip { top:30px; right:30px }` 让 Tooltip 进入画布内 10px, 与左上角回合/金钱状态条 (`top:30px; left:30px`) 两侧对称, 且与画布边缘保持一定距离 (非贴边)。

- [x] 漏洞: 后端 TS 执行沙箱 (vm) 可经 `getSelf.constructor.constructor` 等 constructor 链取得主 realm 的 Function 构造器, 进而访问 `process` → RCE; 且 vm timeout 对异步 / Promise 死循环无效
    - 修复 (`runner.worker.ts` / `node-program.ts`):
        - 沙箱不再直接注入宿主函数/对象 (那会泄漏主 realm 原型): 改为在上下文内用 bootstrap 脚本定义 API / 操作类 / console / performance (上下文 realm), 宿主实现只经闭包持有, 返回值深拷贝为上下文对象, 宿主异常转为上下文 Error; 上下文全局对象原型置空
        - `vm.createContext` 设置 `codeGeneration: { strings: false, wasm: false }` 禁止上下文内 eval / Function / wasm
        - `microtaskMode: 'afterEvaluate'` 让微任务在 runInContext 返回前排空并计入 timeout
        - `NodeProgram.runTurn` 增加每回合宿主看门狗, 超时即 terminate worker 兜底
