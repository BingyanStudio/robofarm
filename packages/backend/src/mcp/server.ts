// RoboFarm 游戏 API 文档的 MCP 服务器。
// 向任意接入的 Agent (Claude Desktop / Cursor / mcp-remote 等) 提供
// AI 友好的游戏 API 文档 (Markdown), 内容来自 shared/src/docs.ts
// (与前端右侧手册同一事实来源)。
//
// 使用底层 Server API + 原生 JSON Schema (不依赖 zod 版本兼容性)。
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { CROPS, DOC_SECTIONS, isCropType, sectionMarkdown, cropDocEntries, createSingleWorld, createCombatWorld, GAME_VERSION, BaseCrop, plantableTiles } from '@robofarm/shared';
import { mcpLoginStart, mcpLoginFinish, userFromToken, AuthUser } from '../auth';
import * as api from '../services/api';

const DOC_TITLES: Record<string, string> = {
  overview: '游戏概览',
  operations: '无人机操作',
  functions: 'API 函数',
  types: '数据类型',
  crops: '作物一览',
  rules: '规则',
  all: '全部文档',
};

const ALL_SECTIONS = [...DOC_SECTIONS] as string[];

export interface McpServerOptions {
  /** 后端对外地址 (登录授权回调兜底 / 文档链接), 由会话创建时的请求推导 */
  baseUrl?: string;
}

export function createMcpServer(opts: McpServerOptions = {}): Server {
  const server = new Server(
    { name: 'robofarm-docs', version: GAME_VERSION },
    { capabilities: { resources: {}, tools: {}, prompts: {} } }
  );
  // 无状态设计: 不保存任何会话内登录状态。需要鉴权的工具每次调用都通过
  // token 参数携带登录凭证 (login_finish 返回), 现场解析用户。

  // ---- 资源列表 / 读取 ----
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: ALL_SECTIONS.map((s) => ({
      uri: `robofarm://docs/${s}`,
      name: `${DOC_TITLES[s]}文档`,
      mimeType: 'text/markdown',
      description: `RoboFarm 游戏 API 文档章节: ${DOC_TITLES[s]}`,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const m = /^robofarm:\/\/docs\/(\w+)$/.exec(req.params.uri);
    const section = m ? m[1] : '';
    if (!ALL_SECTIONS.includes(section)) {
      throw new Error(`未知文档资源: ${req.params.uri}。可用: robofarm://docs/{${ALL_SECTIONS.join('|')}}`);
    }
    return {
      contents: [{ uri: req.params.uri, mimeType: 'text/markdown', text: sectionMarkdown(section) }],
    };
  });

  // ---- 工具 ----
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'list_docs',
        description: '列出 RoboFarm 游戏 API 文档的全部章节',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_doc',
        description: '获取 RoboFarm 游戏 API 文档的指定章节 (Markdown, AI 友好格式): 操作类、API 函数、数据类型、作物、规则',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              enum: ALL_SECTIONS,
              description: '章节 id',
            },
          },
          required: ['section'],
        },
      },
      {
        name: 'get_crop',
        description: '获取指定作物的完整参数 (成本/收获/成熟回合/需水/可种地块) 与描述, 返回 JSON',
        inputSchema: {
          type: 'object',
          properties: {
            crop: { type: 'string', description: '作物代码名, 如 strawberry' },
          },
          required: ['crop'],
        },
      },
      {
        name: 'get_map',
        description: '获取指定游戏模式的地图: 尺寸、地块布局 (soil/water)、无人机出生点, 返回 JSON',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['single', 'combat'],
              description: '游戏模式: single 单人 / combat 竞技',
            },
          },
          required: ['mode'],
        },
      },
      {
        name: 'login_start',
        description: 'GitHub 登录第一步: 返回授权地址与 state。开发模式下无需登录 (dev: true)。浏览器完成授权后, 用返回的 state 调用 login_finish 领取登录凭证 token。',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'login_finish',
        description: 'GitHub 登录第二步: 用 login_start 返回的 state 领取登录凭证 token (浏览器授权完成后, 10 分钟内有效)。返回的 token 需保存, 之后调用需要鉴权的工具时作为 token 参数传入 (无状态凭证, 不绑定会话)。',
        inputSchema: {
          type: 'object',
          properties: { state: { type: 'string', description: 'login_start 返回的 state' } },
          required: ['state'],
        },
      },
      {
        name: 'api_call',
        description: '调用后端 API: 任意 method + 相对路径 + JSON body, 返回 { status, data }。进程内直调; 访问需鉴权接口时以 token 参数携带登录凭证。',
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP 方法 (默认 GET)' },
            path: { type: 'string', description: '相对路径, 如 /single/validate 或 /single/replay/1' },
            body: { type: 'object', description: 'JSON 请求体 (POST/PUT 时)' },
            token: { type: 'string', description: '登录凭证 (login_finish 返回; 访问需鉴权接口时必填)' },
          },
          required: ['path'],
        },
      },
      // ---- 单人种植 (需登录, 除排行榜) ----
      {
        name: 'single_validate',
        description: '提交玩家代码并启动服务器端单人验证 (最多 500 回合), 同一用户同时只能运行一个。之后用 single_validate_status 查询进度与分数。',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '玩家 TypeScript 代码 (含入口函数 run)' },
            token: { type: 'string', description: '登录凭证 (login_finish 返回)' },
          },
          required: ['code', 'token'],
        },
      },
      {
        name: 'single_validate_status',
        description: '查询当前用户的单人验证状态: busy / progress (0-1) / score / error。',
        inputSchema: {
          type: 'object',
          properties: { token: { type: 'string', description: '登录凭证 (login_finish 返回)' } },
          required: ['token'],
        },
      },
      {
        name: 'single_history',
        description: '当前用户的单人提交历史 (id / score / error / replay / created_at)。',
        inputSchema: {
          type: 'object',
          properties: { token: { type: 'string', description: '登录凭证 (login_finish 返回)' } },
          required: ['token'],
        },
      },
      {
        name: 'single_leaderboard',
        description: '单人种植公开排行榜 (name / score / me)。无需登录; 传 token 时自己的条目标记 me。',
        inputSchema: {
          type: 'object',
          properties: { token: { type: 'string', description: '登录凭证 (可选, 用于标记自己的条目)' } },
        },
      },
      {
        name: 'single_replay',
        description: '下载某条单人提交的完整回放文件 (ReplayFile JSON, 仅本人可见)。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: '提交记录 id (见 single_history)' },
            token: { type: 'string', description: '登录凭证 (login_finish 返回)' },
          },
          required: ['id', 'token'],
        },
      },
      // ---- 竞技模式 (需登录, 除观战房间) ----
      {
        name: 'combat_state',
        description: '当前用户的出战代码与战绩 (code / wins / losses), 未上传过返回 null。',
        inputSchema: {
          type: 'object',
          properties: { token: { type: 'string', description: '登录凭证 (login_finish 返回)' } },
          required: ['token'],
        },
      },
      {
        name: 'combat_upload',
        description: '上传竞技出战代码 (上传后胜败清零)。',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string', description: '出战 TypeScript 代码' },
            token: { type: 'string', description: '登录凭证 (login_finish 返回)' },
          },
          required: ['code', 'token'],
        },
      },
      {
        name: 'combat_list',
        description: '可挑战的玩家列表 (id / name / wins / losses, 排除自己)。',
        inputSchema: {
          type: 'object',
          properties: { token: { type: 'string', description: '登录凭证 (login_finish 返回)' } },
          required: ['token'],
        },
      },
      {
        name: 'combat_start',
        description: '向指定玩家发起竞技对战, 返回 roomId。每个玩家同时最多主动发起 1 场。',
        inputSchema: {
          type: 'object',
          properties: {
            opponentId: { type: 'number', description: '对手用户 id (见 combat_list)' },
            token: { type: 'string', description: '登录凭证 (login_finish 返回)' },
          },
          required: ['opponentId', 'token'],
        },
      },
      {
        name: 'combat_room',
        description: '进行中的对战房间列表 (观战用, 无需登录): id / players / status。',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'combat_history',
        description: '当前用户的历史对局列表 (id / opponent / opponentId / result / created_at)。',
        inputSchema: {
          type: 'object',
          properties: { token: { type: 'string', description: '登录凭证 (login_finish 返回)' } },
          required: ['token'],
        },
      },
      {
        name: 'combat_replay',
        description: '下载某场对战回放 ({ config, events }, 仅对局双方可见)。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: '对局 id (见 combat_history)' },
            token: { type: 'string', description: '登录凭证 (login_finish 返回)' },
          },
          required: ['id', 'token'],
        },
      },
    ],
  }));

  /** 按登录凭证解析当前用户 (开发模式自动登录; 无效/缺失返回 null) */
  const userOfToken = (token: unknown): AuthUser | null => {
    const t = typeof token === 'string' && token.trim() ? token : null;
    return userFromToken(t);
  };

  /**
   * 进程内调用后端: 与 app.ts 的 HTTP 路由共用 services/api.ts 的同一份实现
   * (api_xxx 函数), 不经 HTTP 往返。用户由每次调用携带的 token 解析 (无状态)。
   */
  async function callBackend(
    method: string,
    path: string,
    body?: unknown,
    token?: unknown
  ): Promise<{ status: number; data: unknown }> {
    const m = method.toUpperCase();
    const [seg, queryStr] = path.split('?');
    const q = new URLSearchParams(queryStr ?? '');
    const user = userOfToken(token);
    const userId = user?.id ?? null;

    if (m === 'GET' && seg === '/auth/me') return api.apiAuthMe(user);
    if (m === 'GET' && seg === '/config') return api.apiConfig();
    if (m === 'GET' && seg === '/single/leaderboard') {
      return api.apiSingleLeaderboard(userId, q.get('user') ?? '');
    }
    if (seg === '/single/validate') {
      if (m === 'POST') return await api.apiSingleValidateSubmit(userId, body);
      if (m === 'GET') return api.apiSingleValidateStatus(userId);
    }
    if (m === 'GET' && seg === '/single/history') return api.apiSingleHistory(userId);
    const replayM = /^\/single\/replay\/(\d+)$/.exec(seg ?? '');
    if (m === 'GET' && replayM) return api.apiSingleReplay(userId, Number(replayM[1]));

    if (m === 'GET' && seg === '/combat/state') return api.apiCombatState(userId);
    if (m === 'POST' && seg === '/combat/upload') return api.apiCombatUpload(userId, body);
    if (m === 'GET' && seg === '/combat/list') return api.apiCombatList(userId);
    if (m === 'POST' && seg === '/combat/start') return api.apiCombatStart(userId, body);
    if (m === 'GET' && seg === '/combat/room') return api.apiCombatRoom();
    if (m === 'GET' && seg === '/combat/history') return api.apiCombatHistory(userId);
    const combatReplayM = /^\/combat\/replay\/(\d+)$/.exec(seg ?? '');
    if (m === 'GET' && combatReplayM) return api.apiCombatReplay(userId, Number(combatReplayM[1]));

    return api.apiUnknown(m, seg ?? '');
  }

  /** 封装 callBackend 结果: 非 2xx 标记错误, 401 提示登录流程 */
  const apiToolResult = async (
    method: string,
    path: string,
    body?: unknown,
    token?: unknown
  ): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> => {
    const r = await callBackend(method, path, body, token);
    if (r.status === 401) {
      return {
        content: [{
          type: 'text',
          text: 'HTTP 401: 凭证缺失或无效。先调用 login_start + login_finish 获取 token, 并在本次调用中以 token 参数传入 (开发模式下后端自动登录, 无需此步骤)。',
        }],
        isError: true,
      };
    }
    if (r.status >= 400) {
      return { content: [{ type: 'text', text: `HTTP ${r.status}: ${JSON.stringify(r.data)}` }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(r.data, null, 2) }] };
  };

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    switch (name) {
      case 'list_docs':
        return {
          content: [{
            type: 'text',
            text: 'RoboFarm 游戏 API 文档章节:\n' +
              ALL_SECTIONS.map((s) => `- ${s}: ${DOC_TITLES[s]}`).join('\n') +
              '\n\n使用 get_doc 获取章节内容, 或直接读取 robofarm://docs/<section> 资源。',
          }],
        };
      case 'get_doc': {
        const section = typeof args?.section === 'string' ? args.section : '';
        if (!ALL_SECTIONS.includes(section)) {
          return {
            content: [{ type: 'text', text: `未知章节: ${section}。可用章节: ${ALL_SECTIONS.join(', ')}` }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: sectionMarkdown(section) }] };
      }
      case 'get_crop': {
        const crop = typeof args?.crop === 'string' ? args.crop : '';
        if (!isCropType(crop)) {
          return {
            content: [{ type: 'text', text: `未知作物: ${crop}。可用作物: ${Object.values(CROPS).map((c) => c.type).join(', ')}` }],
            isError: true,
          };
        }
        const cfg = CROPS[crop];
        // 特效/特殊机制: 特效是挂在配置上的函数, 无法 JSON 序列化, 因此转换为可读描述。
        const special: string[] = [];
        if (cfg.onGrown) special.push('成熟特效');
        if (cfg.grownUpdate) special.push('成熟后每回合特效');
        if (cfg.growUpdate) special.push('生长特效');
        // 重写了 growCycles() (如香菇) → 动态生长周期
        if (cfg.growCycles !== BaseCrop.prototype.growCycles) special.push('动态生长周期');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              type: cfg.type,
              name: cfg.name,
              plantCost: cfg.plantCost,
              value: cfg.value,
              growCyclesBase: cfg.growCyclesBase,
              thirstCountBase: cfg.thirstCountBase,
              fertilityCost: cfg.fertilityCost,
              habitats: plantableTiles(cfg),
              canPlantDesc: cfg.canPlantDesc,
              // 特殊机制 (未设置则无)
              specialMechanisms: special.length > 0 ? special : undefined,
              description: cfg.description,
            }, null, 2),
          }],
        };
      }
      case 'get_map': {
        const mode = args?.mode;
        if (mode !== 'single' && mode !== 'combat') {
          return {
            content: [{ type: 'text', text: `未知模式: ${mode}。可用模式: single (单人), combat (竞技)` }],
            isError: true,
          };
        }
        const world = mode === 'single' ? createSingleWorld(0) : createCombatWorld(0);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              mode,
              width: world.map[0].length,
              height: world.map.length,
              tiles: world.map.map((row) => row.map((t) => t.type)),
              spawns: world.drones.map((d) => ({
                droneId: d.id,
                player: d.player,
                x: d.position[0],
                y: d.position[1],
              })),
              note:
                mode === 'combat'
                  ? '竞技地图 14x7: 左半为 P1 半场, 右半为左半镜像 (P2 半场); P2 以镜像本地坐标系编程 (自己的半场在左侧)。'
                  : '单人地图 7x7, 出生点 (3,3)。',
            }, null, 2),
          }],
        };
      }
      case 'login_start': {
        const base = opts.baseUrl ?? '';
        const r = mcpLoginStart(base);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(r, null, 2),
          }],
        };
      }
      case 'login_finish': {
        const state = typeof args?.state === 'string' ? args.state : '';
        const r = mcpLoginFinish(state);
        if ('error' in r) {
          return { content: [{ type: 'text', text: r.error }], isError: true };
        }
        // 无状态凭证: 返回 token 由客户端保存, 之后每次调用以 token 参数传入
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ ok: true, token: r.token, hint: '请保存 token, 需要鉴权的工具调用时作为 token 参数传入' }, null, 2),
          }],
        };
      }
      case 'api_call': {
        const method = typeof args?.method === 'string' ? args.method.toUpperCase() : 'GET';
        const path = typeof args?.path === 'string' ? args.path : '';
        if (!path.startsWith('/')) {
          return { content: [{ type: 'text', text: 'path 必须是相对路径 (以 / 开头)' }], isError: true };
        }
        const res = await callBackend(method, path, args?.body, args?.token);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ status: res.status, data: res.data }, null, 2),
          }],
        };
      }
      // ---- 单人种植 ----
      case 'single_validate': {
        const code = typeof args?.code === 'string' ? args.code : '';
        if (!code.trim()) {
          return { content: [{ type: 'text', text: '缺少 code 参数 (玩家 TypeScript 代码)' }], isError: true };
        }
        return await apiToolResult('POST', '/single/validate', { code }, args?.token);
      }
      case 'single_validate_status':
        return await apiToolResult('GET', '/single/validate', undefined, args?.token);
      case 'single_history':
        return await apiToolResult('GET', '/single/history', undefined, args?.token);
      case 'single_leaderboard':
        return await apiToolResult('GET', '/single/leaderboard', undefined, args?.token);
      case 'single_replay': {
        const id = Number(args?.id);
        if (!Number.isInteger(id)) {
          return { content: [{ type: 'text', text: '缺少 id 参数 (提交记录 id)' }], isError: true };
        }
        return await apiToolResult('GET', `/single/replay/${id}`, undefined, args?.token);
      }
      // ---- 竞技模式 ----
      case 'combat_state':
        return await apiToolResult('GET', '/combat/state', undefined, args?.token);
      case 'combat_upload': {
        const code = typeof args?.code === 'string' ? args.code : '';
        if (!code.trim()) {
          return { content: [{ type: 'text', text: '缺少 code 参数 (出战 TypeScript 代码)' }], isError: true };
        }
        return await apiToolResult('POST', '/combat/upload', { code }, args?.token);
      }
      case 'combat_list':
        return await apiToolResult('GET', '/combat/list', undefined, args?.token);
      case 'combat_start': {
        const opponentId = Number(args?.opponentId);
        if (!Number.isInteger(opponentId)) {
          return { content: [{ type: 'text', text: '缺少 opponentId 参数 (对手用户 id)' }], isError: true };
        }
        return await apiToolResult('POST', '/combat/start', { id: opponentId }, args?.token);
      }
      case 'combat_room':
        return await apiToolResult('GET', '/combat/room');
      case 'combat_history':
        return await apiToolResult('GET', '/combat/history', undefined, args?.token);
      case 'combat_replay': {
        const id = Number(args?.id);
        if (!Number.isInteger(id)) {
          return { content: [{ type: 'text', text: '缺少 id 参数 (对局 id)' }], isError: true };
        }
        return await apiToolResult('GET', `/combat/replay/${id}`, undefined, args?.token);
      }
      default:
        throw new Error(`未知工具: ${name}`);
    }
  });

  // ---- Prompt: 编写玩家代码的模板 ----
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'write_player_code',
        description: '为 RoboFarm 编写玩家代码的指引模板 (附 API 摘要)',
        arguments: [
          { name: 'goal', description: '无人机策略目标 (可选)', required: false },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name !== 'write_player_code') {
      throw new Error(`未知 Prompt: ${req.params.name}`);
    }
    const goal = (req.params.arguments as Record<string, unknown> | undefined)?.goal;
    return {
      description: 'RoboFarm 玩家代码编写指引',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              '你正在为 RoboFarm 编写玩家程序 (TypeScript)。规则如下:\n' +
              '- 定义入口函数 `function run(droneId: number)`; 每回合对每架无人机调用一次, 返回一个操作类实例或 `null`。\n' +
              '- 可用操作类 (均继承 DroneOperation, 按类名识别):\n' +
              '  - `new Move([x, y])` 移动到周围 8 格之一\n' +
              '  - `new Teleport([x, y])` 传送到任意位置 (能量 = ceil(欧氏距离), 竞技模式仅限己方半场)\n' +
              '  - `new Plant(crop)` 在当前位置种植 (crop 用字符串, 如 \'strawberry\')\n' +
              '  - `new CollectWater()` 在池塘一次取满水 (上限 5 格)\n' +
              '  - `new Water()` 给当前格缺水作物浇水\n' +
              '  - `new WaterRow()` / `new WaterCol()` 给整行/列浇水 (3 能量)\n' +
              '  - `new PlantRow(plants)` / `new PlantCol(plants)` 按数组顺序种植整行/列 (3 能量, 跳过无法种植的格子)\n' +
              '  - 行/列范围操作实际覆盖以无人机为中心的 3 格; InterceptRow/Col 以施法点为中心 3 格\n' +
              '  - `new NewDrone([x, y])` 花费 4000 金钱创建新无人机 (上限: 单人 2 / 竞技 3)\n' +
              '  - `new Harvest()` 收获当前格成熟作物\n' +
              '  - `new HarvestRow()` / `new HarvestCol()` 收割整行/列 (4 能量, 竞技仅己方半场)\n' +
              '  - `new Clear()` 铲除当前格作物\n' +
              '  - `new Intercept([x, y])` 竞技模式单格拦截\n' +
              '  - `new InterceptRow()` / `new InterceptCol()` 拦截整行/列 (6 能量)\n' +
              '  - `new Charge()` 原地充能 +5 (能量上限 10)\n' +
              '  - `new ChangeTile(tileType)` 转换脚下地块为 soil/water/sand (4 能量, 需相邻同类型地块)\n' +
              '- 可用 API: `getSelf()` (含 water/energy) / `getGame()` (含 money) / `getMap()` / `getTile(p)` / `getCrop(p)` / `getDrone(p)`, 坐标越界返回 null。\n' +
              '- 作物列表 (代码名, 成本/收获/成熟回合/需水/可种地块):\n' + cropSummary() + '\n' +
              '- 机制: 沙漠化 (收获的格相邻有沙地则转化为沙地); 间作 (四方向 ≥2 个不同作物, 收获 +20%); 香菇总周期 = 20 + 2×场上香菇数\n' +
              '- 竞技模式: 自己半场在左侧 (14×7), 对方半场收获进入临时资金池, 返回己方半场入账; 种植不受半场限制 (可到对方半场占位), 铲除仅限己方半场。沙地上生长周期 ×1.5, 草莓/葡萄/南瓜/西瓜/紫云英可种。\n' +
              '- 限制: 单次 run() 400ms 超时即判负; 禁止网络/异步 API。\n' +
              '- 完整文档可用 get_doc / robofarm://docs/* 获取。\n\n' +
              (goal ? `策略目标: ${String(goal)}\n\n` : '') +
              '请给出完整的 player 代码。',
          },
        },
      ],
    };
  });

  return server;
}

/** 作物文档摘要 (提示词用) */
export function cropSummary(): string {
  return cropDocEntries()
    .map((e) => `- ${e.name} (${e.def.replace(/^代码名: /, '')}): ${e.params?.join('; ')}`)
    .join('\n');
}
