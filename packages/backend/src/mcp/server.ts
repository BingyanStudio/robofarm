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
import { CROPS, DOC_SECTIONS, isCropType, sectionMarkdown, cropDocEntries } from '@robofarm/shared';

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

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'robofarm-docs', version: '0.1.0' },
    { capabilities: { resources: {}, tools: {}, prompts: {} } }
  );

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
        description: '获取指定作物的完整参数 (种植成本/收获/成熟回合/需水/可种地块) 与描述, 返回 JSON',
        inputSchema: {
          type: 'object',
          properties: {
            crop: { type: 'string', description: '作物代码名, 如 strawberry' },
          },
          required: ['crop'],
        },
      },
    ],
  }));

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
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              type: cfg.type,
              name: cfg.name,
              plantCost: cfg.plantCost,
              value: cfg.value,
              growCycles: cfg.growCycles,
              thirstInterval: cfg.thirstInterval,
              habitats: cfg.habitats,
              description: cfg.description,
            }, null, 2),
          }],
        };
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
              '  - `new Plant(crop)` 在当前位置种植 (crop 用字符串, 如 \'strawberry\')\n' +
              '  - `new CollectWater()` 在池塘取水 (上限 5 格)\n' +
              '  - `new Water()` 给当前格缺水作物浇水\n' +
              '  - `new Harvest()` 收获当前格成熟作物\n' +
              '  - `new Clear()` 铲除当前格作物\n' +
              '  - `new Intercept([x, y])` 竞技模式拦截\n' +
              '- 可用 API: `getSelf()` / `getGame()` (含 money) / `getMap()` / `getTile(p)` / `getCrop(p)` / `getDrone(p)`, 坐标越界返回 null。\n' +
              '- 作物列表 (代码名, 成本/收获/成熟回合/需水/可种地块):\n' + cropSummary() + '\n' +
              '- 竞技模式: 自己半场在左侧 (14×7), 对方半场收获进入临时资金池, 返回己方半场入账。\n' +
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
