// 后端 API 文档的单一数据来源: 结构化数据同时驱动
// - 纯 Markdown 输出 (GET /api-docs, 并入 GET /llm.txt)
// - 前端网页版文档页面 (#/api-docs, Tab 分类, 人类友好)
import { sectionMarkdown } from './docs';

export interface ApiDocResponse {
  /** HTTP 状态码, 如 200 / 400 */
  code: string;
  /** 响应体 (JSON 示例或说明) */
  body: string;
  /** 可选补充说明 */
  note?: string;
}

export interface ApiDocEndpoint {
  /** HTTP 方法 (或 WS) */
  method: string;
  /** 路径 */
  path: string;
  /** 是否需要登录 */
  auth?: boolean;
  title: string;
  description: string;
  /** 请求头 */
  headers?: string[];
  /** 请求体 Schema (JSON 示例); 无请求体则省略 */
  request?: string;
  responses: ApiDocResponse[];
}

export interface ApiDocGroup {
  id: string;
  title: string;
  description?: string;
  endpoints: ApiDocEndpoint[];
}

/** 通用约定 (页面顶部展示; Base URL 由接入方动态补充) */
export const API_DOC_CONVENTIONS: string[] = [
  '请求与响应均为 application/json (除特殊说明外)',
  '认证: Cookie 会话 (robofarm_session); 未配置 GITHUB_CLIENT_ID 时为开发模式, 自动登录本地账号',
  '🔒 标注的接口要求登录, 未登录返回 401 {"error":"unauthorized"}',
  '非 2xx 响应体统一为 {"error": string}',
];

export const API_DOC_GROUPS: ApiDocGroup[] = [
  {
    id: 'auth',
    title: '认证 Auth',
    description: 'GitHub OAuth 登录与会话。',
    endpoints: [
      {
        method: 'GET',
        path: '/auth/me',
        auth: true,
        title: '当前登录用户',
        description: '返回当前登录的用户信息。开发模式始终返回本地账号。',
        headers: ['Cookie: robofarm_session=<token> (可选; 开发模式无需)'],
        responses: [
          { code: '200', body: '{ "user": { "id": 1, "name": "local-dev", "dev": true } }' },
          { code: '401', body: '{ "error": "unauthorized" }' },
        ],
      },
      {
        method: 'GET',
        path: '/auth/github',
        title: 'GitHub 登录入口',
        description: '302 重定向到 GitHub 授权页 (生产); 开发模式直接重定向回前端菜单。',
        responses: [{ code: '302', body: '重定向 (Location 头)' }],
      },
      {
        method: 'GET',
        path: '/auth/github/callback',
        title: 'GitHub OAuth 回调',
        description: 'OAuth 回调, 登录成功后写入会话 Cookie 并重定向回前端。',
        headers: ['Query: code, state'],
        responses: [
          { code: '302', body: '重定向到 /#/menu (写入 Set-Cookie)' },
          { code: '400', body: 'OAuth 状态无效或已过期' },
        ],
      },
    ],
  },
  {
    id: 'single',
    title: '单人种植 Single',
    description: '代码提交、验证状态、历史、排行榜与回放下载。',
    endpoints: [
      {
        method: 'POST',
        path: '/single/validate',
        auth: true,
        title: '提交代码验证',
        description: '提交玩家代码, 启动服务器端验证执行 (同一用户同时只能运行一个; 全局并发受限时返回 409 繁忙; 可通过 env SINGLE_SUBMIT_LIMIT_PER_MIN 开启每用户每分钟提交限流, 超限返回 429)。',
        headers: ['Content-Type: application/json'],
        request: '{ "code": "function run(droneId) { ... }" }',
        responses: [
          { code: '200', body: '{ "ok": true }' },
          { code: '400', body: '{ "error": "缺少代码" }' },
          { code: '409', body: '{ "error": "已有程序正在运行, 请等待完成" }' },
          { code: '429', body: '{ "error": "提交过于频繁, 请 N 秒后再试" }' },
        ],
      },
      {
        method: 'GET',
        path: '/single/validate',
        auth: true,
        title: '查询验证状态',
        description: '查询当前用户的验证进度与结果。',
        responses: [{ code: '200', body: '{ "busy": false, "progress": 1, "score": 25, "error": null }' }],
      },
      {
        method: 'GET',
        path: '/single/history',
        auth: true,
        title: '提交历史',
        description: '当前用户的提交历史 (含回放字段, 下载见 /single/replay/:id)。',
        responses: [
          { code: '200', body: '{ "entries": [ { "id": 1, "score": 25, "error": null, "replay": "json", "created_at": 1720000000000 } ] }' },
        ],
      },
      {
        method: 'GET',
        path: '/single/leaderboard',
        title: '排行榜',
        description: '公开排行榜, 按大版本分 Tab (tabs): 历史冻结快照 + 当前版本实时榜前 50 名 (登录用户带 me 标记)。携带 ?user=<用户名> 查询指定玩家的最高分与其在当前版本全榜的名次。',
        responses: [
          { code: '200', body: '{ "tabs": [ { "version": "v0.x", "entries": [ { "name": "alice", "score": 1200, "me": false } ] }, { "version": "v1.0.2", "entries": [ { "name": "bob", "score": 1500, "me": true } ] } ] }' },
          { code: '200', body: '{ "user": { "name": "alice", "score": 1200, "rank": 3 } }' },
        ],
      },
      {
        method: 'GET',
        path: '/single/replay/:id',
        auth: true,
        title: '下载回放',
        description: '下载某条提交的回放文件 (仅本人)。回放格式见 llm.txt 附录或前端回放导入。',
        responses: [
          { code: '200', body: '回放文件 (JSON, ReplayFile 格式)', note: 'id: 提交记录 id' },
          { code: '404', body: '{ "error": "记录不存在" }' },
        ],
      },
    ],
  },
  {
    id: 'combat',
    title: '竞技模式 Combat',
    description: '出战代码、匹配、房间观战、历史与回放下载。',
    endpoints: [
      {
        method: 'GET',
        path: '/combat/state',
        auth: true,
        title: '出战状态',
        description: '当前用户的出战代码与战绩。未上传过时返回 null。',
        responses: [{ code: '200', body: '{ "code": "...", "wins": 2, "losses": 1 }' }],
      },
      {
        method: 'POST',
        path: '/combat/upload',
        auth: true,
        title: '上传出战代码',
        description: '上传出战代码 (上传后胜败清零)。',
        headers: ['Content-Type: application/json'],
        request: '{ "code": "..." }',
        responses: [
          { code: '200', body: '{ "ok": true }' },
          { code: '400', body: '{ "error": "缺少代码" }' },
        ],
      },
      {
        method: 'GET',
        path: '/combat/list',
        auth: true,
        title: '可挑战玩家',
        description: '可挑战的玩家列表 (排除自己)。',
        responses: [{ code: '200', body: '{ "entries": [ { "id": 2, "name": "bob", "wins": 3, "losses": 2 } ] }' }],
      },
      {
        method: 'POST',
        path: '/combat/start',
        auth: true,
        title: '发起对战',
        description: '向指定玩家发起对战 (每个玩家同时最多主动发起 1 场)。',
        headers: ['Content-Type: application/json'],
        request: '{ "id": 2 }',
        responses: [
          { code: '200', body: '{ "roomId": "a1b2c3d4e5f6" }' },
          { code: '400', body: '{ "error": "你已有一场进行中的对战, 请等待其结束后再发起新挑战" }' },
        ],
      },
      {
        method: 'GET',
        path: '/combat/room',
        title: '进行中的房间',
        description: '进行中的对战房间列表 (观战用, 无需登录)。',
        responses: [{ code: '200', body: '{ "rooms": [ { "id": "a1b2c3", "players": ["alice", "bob"], "status": "running" } ] }' }],
      },
      {
        method: 'GET',
        path: '/combat/history',
        auth: true,
        title: '历史对局',
        description: '当前用户的历史对局列表。',
        responses: [{ code: '200', body: '{ "entries": [ { "id": 1, "opponent": "bob", "result": "win", "created_at": 1720000000000 } ] }' }],
      },
      {
        method: 'GET',
        path: '/combat/replay/:id',
        auth: true,
        title: '下载对局回放',
        description: '某场对局的回放文件 (仅对局双方)。',
        responses: [
          { code: '200', body: '回放文件 (JSON, ReplayFile 格式)' },
          { code: '404', body: '{ "error": "记录不存在" }' },
        ],
      },
    ],
  },
  {
    id: 'ws',
    title: 'WebSocket',
    description: '对战房间实时推送通道。',
    endpoints: [
      {
        method: 'WS',
        path: '/ws/combat/room/:roomId',
        title: '房间实时推送',
        description: '对战房间实时推送 (观战 / 参战双方)。服务端推送消息: match-start / replay-buffer / turn / match-end / error。',
        headers: ['握手: GET 升级为 WebSocket'],
        responses: [
          { code: 'msg', body: '{ "type": "turn", "turn": 3, "events": [...] }', note: '类型: match-start | replay-buffer | turn | match-end | error' },
          { code: '1008', body: 'invalid path (房间不存在)' },
        ],
      },
    ],
  },
  {
    id: 'mcp',
    title: 'MCP',
    description: 'Model Context Protocol (streamable HTTP) 接入点。',
    endpoints: [
      {
        method: 'POST',
        path: '/mcp',
        title: 'MCP 接入',
        description: '向任意 AI Agent 提供游戏 API 文档、GitHub 登录与后端 API 代理。工具: list_docs / get_doc / get_crop / get_map / login_start / login_finish / api_call。GET 返回 405 提示, DELETE 关闭会话。',
        headers: ['Content-Type: application/json', 'MCP-Protocol-Version', 'Mcp-Session-Id (后续请求携带)'],
        request: 'MCP JSON-RPC 消息 (initialize / tools/call 等)',
        responses: [{ code: '200', body: 'MCP JSON-RPC 响应' }],
      },
      {
        method: 'TOOL',
        path: 'mcp: login_start / login_finish',
        title: 'MCP GitHub 登录',
        description: 'login_start 返回 GitHub 授权地址与 state (开发模式 dev: true); 浏览器完成授权后 login_finish(state) 领取会话令牌, 之后 api_call 自动携带认证。',
        responses: [
          { code: 'ok', body: 'login_start: { authorizeUrl, state, dev } | login_finish: 登录成功' },
        ],
      },
      {
        method: 'TOOL',
        path: 'mcp: api_call',
        title: 'MCP 后端 API 代理',
        description: '通用代理: 任意 method + 相对路径 + JSON body 调用后端全部 HTTP API, 返回 { status, data }。已登录会话自动携带会话 Cookie。',
        headers: ['参数: method (GET/POST/PUT/DELETE), path (相对路径), body (JSON, 可选)'],
        request: '{ "method": "POST", "path": "/single/validate", "body": { "code": "..." } }',
        responses: [{ code: 'ok', body: '{ "status": 200, "data": { ... } }' }],
      },
    ],
  },
  {
    id: 'misc',
    title: '其他',
    description: '静态资源与文档路由。',
    endpoints: [
      {
        method: 'GET',
        path: '/',
        title: '前端应用',
        description: '前端单页应用 (发布版同端口托管)。',
        responses: [{ code: '200', body: 'index.html' }],
      },
      {
        method: 'GET',
        path: '/llm.txt',
        title: 'LLM 友好文档',
        description: '全部游戏文档按章节拼接 (text/plain), 供 AI 直接读取。',
        responses: [{ code: '200', body: 'text/plain' }],
      },
      {
        method: 'GET',
        path: '/config',
        title: '运行时配置',
        description: '前端启动时拉取的运行时配置: esbuild.wasm 单独部署时返回其 URL (字段 esbuildWasmUrl, 未配置为 null)。',
        responses: [{ code: '200', body: '{ "esbuildWasmUrl": "https://cdn.example.com/esbuild.wasm" | null }' }],
      },
      {
        method: 'GET',
        path: '/api-docs',
        title: 'API 文档 (Markdown)',
        description: '本 API 文档的纯 Markdown 版本。',
        responses: [{ code: '200', body: 'text/markdown' }],
      },
    ],
  },
];

/** 生成 API 文档 Markdown (专业后端文档格式); baseUrl 按实际部署动态传入 */
export function apiDocsMarkdown(baseUrl?: string): string {
  const out: string[] = [
    '# RoboFarm 后端 HTTP API 文档',
    '',
    '本文档描述 RoboFarm 后端当前暴露的全部 HTTP 接口与 WebSocket 通道。',
    '',
    '## 通用约定',
    '',
    `- Base URL: ${baseUrl ?? '与当前请求同源'}`,
    ...API_DOC_CONVENTIONS.map((c) => `- ${c}`),
    '',
    '---',
    '',
  ];
  for (const group of API_DOC_GROUPS) {
    out.push(`## ${group.title}`, '');
    if (group.description) out.push(group.description, '');
    for (const e of group.endpoints) {
      out.push(`### ${e.method} ${e.path}${e.auth ? ' 🔒' : ''}`, '');
      out.push(`**${e.title}**: ${e.description}`, '');
      out.push(`- **Method**: \`${e.method}\``);
      out.push(`- **Endpoint**: \`${e.path}\``);
      if (e.auth) out.push('- **Auth**: 需要登录 (Cookie 会话)');
      if (e.headers?.length) {
        out.push('- **Headers**:');
        for (const h of e.headers) out.push(`  - ${h}`);
      }
      if (e.request) {
        out.push('- **Request Schema**:', '', '```json', e.request, '```', '');
      }
      out.push('- **Responses**:');
      for (const r of e.responses) {
        out.push(`  - \`${r.code}\`: \`\`\`${r.body}\`\`\`${r.note ? ` — ${r.note}` : ''}`);
      }
      out.push('');
    }
    out.push('---', '');
  }
  out.push('## 补充: 回放文件格式 (ReplayFile)', '', '```json', '{ "mode": "single | combat", "maxTurns": 500, "players": ["玩家"], "result": { "type": "finished", "money": [25] }, "rounds": [ { "round": 1, "drones": [{ "id": 0, "op": { "type": "plant", "crop": "strawberry" } }], "output": ["[log] ..."] } ] }', '```', '');
  return out.join('\n');
}

/** LLM 友好文档: 游戏文档全部章节 + 后端 API 文档; baseUrl 按实际部署动态传入 */
export function llmTxt(baseUrl?: string): string {
  return `# RoboFarm 文档 (LLM 友好汇总)

本文件由游戏内全部文档章节与后端 API 文档拼接而成, 供 AI / 机器人直接读取。

- 网页版 API 文档: GET {BASE_URL}/api-docs (Markdown) 或前端 /#/api-docs
- MCP (streamable HTTP): POST {BASE_URL}/mcp
- 玩家 API 文档章节: overview / operations / functions / types / crops / rules

---

${sectionMarkdown('all')}

---

${apiDocsMarkdown(baseUrl)}`;
}
