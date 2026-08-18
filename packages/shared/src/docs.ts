// 游戏 API 文档的单一事实来源 (shared)。
// 前端右侧手册与后端 MCP 服务器都从这里生成内容, 保证两边一致。
import { CROPS, TILES } from './registry';

export interface DocEntry {
  /** 条目锚点 id (供前端文档内跳转) */
  id: string;
  name: string;
  /** 定义/签名 */
  def: string;
  /** 正式文字描述 (支持 `反引号代码` 与 [text](#ref) 链接) */
  desc: string;
  /** 参数列表 (每项支持反引号) */
  params?: string[];
  /** 返回值说明 */
  returns?: string;
  example?: string;
}

export interface DocSection {
  id: string;
  title: string;
  entries: DocEntry[];
}

export const DOC_OPERATIONS: DocEntry[] = [
  {
    id: 'doc-Move',
    name: 'Move',
    def: 'class Move extends DroneOperation',
    desc: '使无人机在回合结束时移动到指定的相邻格。仅支持周围 8 格 (含斜向); 超出范围、目标越界或被其他无人机占据时操作无效并报错。',
    params: ['`to`: `[number, number]` — 目标坐标 (x, y)'],
    example: 'return new Move([2, 3]);',
  },
  {
    id: 'doc-Plant',
    name: 'Plant',
    def: 'class Plant extends DroneOperation',
    desc: '在无人机当前所在格种植作物, 立即扣除成本。目标格需为空且可种植; 竞技模式下可在对方半场种植 (占用对方地块)。',
    params: ['`crop`: `CropType` — 作物类型, 可用作物见作物文档'],
    example: 'return new Plant(\'strawberry\');',
  },
  {
    id: 'doc-CollectWater',
    name: 'CollectWater',
    def: 'class CollectWater extends DroneOperation',
    desc: '在池塘上取水 1 格, 储水量上限 5 格。不在池塘上或已满时操作无效。',
    example: 'return new CollectWater();',
  },
  {
    id: 'doc-Water',
    name: 'Water',
    def: 'class Water extends DroneOperation',
    desc: '给当前格的缺水作物浇水, 消耗 1 格水, 作物恢复生长。当前格没有缺水作物或无水可用时操作无效。',
    example: 'return new Water();',
  },
  {
    id: 'doc-Harvest',
    name: 'Harvest',
    def: 'class Harvest extends DroneOperation',
    desc: '收获当前格已成熟的作物, 获得其价值。竞技模式下在对方半场收获会进入无人机临时资金池 (偷菜)。',
    example: 'return new Harvest();',
  },
  {
    id: 'doc-Clear',
    name: 'Clear',
    def: 'class Clear extends DroneOperation',
    desc: '铲除当前格作物。竞技模式下仅限己方半场。',
    example: 'return new Clear();',
  },
  {
    id: 'doc-Intercept',
    name: 'Intercept',
    def: 'class Intercept extends DroneOperation',
    desc: '竞技模式专用: 指定一个拦截格, 若对方携带偷菜资金的无人机在该回合结束时位于该格, 则其资金池清空并返还给你。',
    params: ['`at`: `[number, number]` — 拦截目标坐标 (x, y)'],
    example: 'return new Intercept([5, 3]);',
  },
  {
    id: 'doc-Charge',
    name: 'Charge',
    def: 'class Charge extends DroneOperation',
    desc: '充能: 本回合原地不动, 能量 +5 (上限 10)。能量用于行/列范围操作。',
    example: 'return new Charge();',
  },
  {
    id: 'doc-HarvestRow',
    name: 'HarvestRow',
    def: 'class HarvestRow extends DroneOperation',
    desc: '一次性收获自身所在行的全部成熟作物, 消耗 4 能量。竞技模式仅收割自己半场的作物 (不产生偷菜)。',
    example: 'return new HarvestRow();',
  },
  {
    id: 'doc-HarvestCol',
    name: 'HarvestCol',
    def: 'class HarvestCol extends DroneOperation',
    desc: '一次性收获自身所在列的全部成熟作物, 消耗 4 能量。竞技模式仅收割自己半场的作物 (不产生偷菜)。',
    example: 'return new HarvestCol();',
  },
  {
    id: 'doc-WaterRow',
    name: 'WaterRow',
    def: 'class WaterRow extends DroneOperation',
    desc: '给所在行作物从左到右浇水, 直到储水耗尽为止, 跳过不需要浇水的作物, 消耗 3 能量。',
    example: 'return new WaterRow();',
  },
  {
    id: 'doc-WaterCol',
    name: 'WaterCol',
    def: 'class WaterCol extends DroneOperation',
    desc: '给所在列作物从上到下浇水, 直到储水耗尽为止, 跳过不需要浇水的作物, 消耗 3 能量。',
    example: 'return new WaterCol();',
  },
  {
    id: 'doc-InterceptRow',
    name: 'InterceptRow',
    def: 'class InterceptRow extends DroneOperation',
    desc: '竞技模式专用: 回合结束时拦截所在行全部携带偷菜资金的对方无人机, 消耗 6 能量。',
    example: 'return new InterceptRow();',
  },
  {
    id: 'doc-InterceptCol',
    name: 'InterceptCol',
    def: 'class InterceptCol extends DroneOperation',
    desc: '竞技模式专用: 回合结束时拦截所在列全部携带偷菜资金的对方无人机, 消耗 6 能量。',
    example: 'return new InterceptCol();',
  },
];

export const DOC_FUNCTIONS: DocEntry[] = [
  {
    id: 'doc-getSelf',
    name: 'getSelf()',
    def: 'getSelf(): DroneInfo',
    desc: '返回当前由 `run(droneId)` 控制的无人机信息, 包括本地编号、位置、储水量与归属。',
    returns: '`DroneInfo` — 字段说明见 [DroneInfo](#doc-DroneInfo)',
    example: 'const self = getSelf();\nif (self.water === 0) return new CollectWater();',
  },
  {
    id: 'doc-getGame',
    name: 'getGame()',
    def: 'getGame(): GameInfo',
    desc: '返回游戏模式、当前回合、总回合数与自己的金钱, 用于编写策略分支。',
    returns: '`GameInfo` — 字段说明见 [GameInfo](#doc-GameInfo)',
    example: 'const g = getGame();\nif (g.turn === 1) return new Plant(\'strawberry\');',
  },
  {
    id: 'doc-getMap',
    name: 'getMap()',
    def: 'getMap(): { width: number; height: number }',
    desc: '返回地图尺寸, 用于坐标越界判断。',
    example: 'const m = getMap();\nif (x < m.width) ...',
  },
  {
    id: 'doc-getTile',
    name: 'getTile([x, y])',
    def: 'getTile(position: Position): TileInfo | null',
    desc: '返回指定格的地块信息 (土地/水池、是否有作物及作物详情)。坐标越界返回 `null`。',
    params: ['`position`: `[number, number]` — 格子的坐标 (x, y)'],
    returns: '`TileInfo | null` — 字段说明见 [TileInfo](#doc-TileInfo)',
    example: 'const t = getTile([1, 1]);\nif (t?.type === \'water\') return new CollectWater();',
  },
  {
    id: 'doc-getCrop',
    name: 'getCrop([x, y])',
    def: 'getCrop(position: Position): CropInfo | null',
    desc: '返回指定格的作物信息; 无作物或越界返回 `null`。',
    params: ['`position`: `[number, number]` — 格子的坐标 (x, y)'],
    returns: '`CropInfo | null` — 字段说明见 [CropInfo](#doc-CropInfo)',
    example: 'const c = getCrop([3, 3]);\nif (c?.state === \'grown\') return new Harvest();',
  },
  {
    id: 'doc-getDrone',
    name: 'getDrone([x, y])',
    def: 'getDrone(position: Position): DroneInfo | null',
    desc: '返回指定格上的无人机信息 (含对方无人机), 用于侦察与避让。',
    params: ['`position`: `[number, number]` — 格子的坐标 (x, y)'],
    returns: '`DroneInfo | null` — 字段说明见 [DroneInfo](#doc-DroneInfo)',
    example: 'const d = getDrone([2, 2]);\nif (d) return null; // 被占, 本回合不动',
  },
  {
    id: 'doc-console',
    name: 'console.log(...)',
    def: 'console.log(...args: unknown[]): void',
    desc: '输出日志到界面日志面板, 用于调试; 每回合日志有数量上限。',
    params: ['`...args`: `unknown[]` — 任意个数的输出值'],
    example: 'console.log(\'money\', getGame().money);',
  },
];

/** CropType 枚举条目 (数据来自注册表, 新增作物自动列出) */
function cropTypeDocEntry(): DocEntry {
  return {
    id: 'doc-CropType',
    name: 'CropType',
    def: 'enum CropType',
    desc: '作物类型枚举, 作为 `Plant` 的参数与 `CropInfo.type` 的值。完整属性见作物文档。',
    params: Object.values(CROPS).map(
      (c) =>
        `\`${c.type}\`: ${c.name} — 成本 ${c.plantCost}, 收获 ${c.value}, ` +
        `${c.growCycles} 回合成熟, ${c.thirstInterval === null ? '无需浇水' : `每 ${c.thirstInterval} 回合需浇水`}`
    ),
  };
}

export const DOC_TYPES: DocEntry[] = [
  {
    id: 'doc-DroneInfo',
    name: 'DroneInfo',
    def: 'interface DroneInfo',
    desc: '无人机的运行时信息。`id` 为本地编号 (自己的无人机 0..N-1); `isOpponent` 区分敌我; `bounty` 为对方无人机携带的偷菜资金。',
    params: [
      '`id`: `number` — 本地无人机编号',
      '`position`: `[number, number]` — 当前坐标',
      '`water`: `number` — 储水量 (0..5)',
      '`energy`: `number` — 能量 (0..10, 经 Charge 补充, 供行/列范围操作消耗)',
      '`isOpponent`: `boolean` — 是否为对方无人机',
      '`bounty`: `number` — 偷菜资金池 (仅对方无人机有意义)',
    ],
  },
  {
    id: 'doc-TileInfo',
    name: 'TileInfo',
    def: 'interface TileInfo',
    desc: '地块信息: `type` 为土地/水池/沙地, `crop` 为该格作物 (无作物时为 `null`)。',
    params: [
      '`type`: `\'soil\' | \'water\' | \'sand\'` — 地块类型 (沙地上生长周期 ×1.5)',
      '`hasCrop`: `boolean` — 是否有作物',
      '`crop`: `CropInfo | null` — 作物信息',
    ],
  },
  cropTypeDocEntry(),
  {
    id: 'doc-CropState',
    name: 'CropState',
    def: 'enum CropState',
    desc: '作物状态: `growing` 生长中 / `thirsty` 缺水 (不浇水则长期保持, 生长暂停, 不枯萎) / `grown` 成熟可收获。',
    params: [
      '`growing`: 正在生长, `cyclesToGrown` 为剩余回合数',
      '`thirsty`: 缺水, `cyclesToGrown` 为暂停时的剩余回合数, 浇水后继续生长',
      '`grown`: 成熟, 可收获',
    ],
  },
  {
    id: 'doc-CropInfo',
    name: 'CropInfo',
    def: 'interface CropInfo',
    desc: '作物信息: `state` 为生长/缺水/成熟; `cyclesToGrown` 为剩余回合数 (成熟时为 0)。',
    params: [
      '`type`: `CropType` — 作物类型, 见 [CropType](#doc-CropType)',
      '`state`: `\'growing\' | \'thirsty\' | \'grown\'` — 作物状态, 见 [CropState](#doc-CropState)',
      '`cyclesToGrown`: `number` — 剩余成熟回合数 (grown 为 0)',
    ],
  },
  {
    id: 'doc-GameInfo',
    name: 'GameInfo',
    def: 'interface GameInfo',
    desc: '对局全局信息: `mode` 为单人或竞技, `money` 为自己的金钱。',
    params: [
      '`mode`: `\'single\' | \'combat\'` — 游戏模式',
      '`turn`: `number` — 当前回合',
      '`maxTurns`: `number` — 总回合数',
      '`money`: `number` — 自己的金钱 (初始 20)',
    ],
  },
];

/** 作物图鉴条目 (数据来自注册表, 供前端手册与 MCP 共用) */
export function cropDocEntries(): DocEntry[] {
  return Object.values(CROPS).map((cfg) => ({
    id: `crop-${cfg.type}`,
    name: cfg.name,
    def: `代码名: \`${cfg.type}\``,
    desc: cfg.description,
    params: [
      `成本: ${cfg.plantCost}`,
      `收获: ${cfg.value}`,
      `成熟: ${cfg.growCycles} 回合`,
      cfg.thirstInterval === null ? '需水: 无需浇水' : `需水: 每 ${cfg.thirstInterval} 回合`,
      `可种在: ${cfg.habitats.map((t) => TILES[t].name).join(' / ')}`,
    ],
  }));
}

export interface DocParagraphSection {
  title: string;
  paragraphs: string[];
}

/** 规则/机制说明 (Markdown 段落) */
export const DOC_RULES: DocParagraphSection[] = [
  {
    title: '回合制',
    paragraphs: [
      '每回合 `run()` 调用一次; 所有玩家的操作同时结算, 冲突时执行耗时短者优先。',
      '只允许移动到周围 8 格 (相邻格, 含斜向), 超出范围操作无效并报错。',
    ],
  },
  {
    title: '作物与缺水',
    paragraphs: [
      '作物有 生长中 / 缺水 / 成熟 三种状态; 进入缺水后长期保持, 生长不推进, 浇水后继续。',
      '缺水次数按种植时的实际生长周期动态计算 (每约 `thirstInterval` 回合一次, 总次数 = 实际周期 ÷ 间隔), 沙地等生长周期被调整的地块缺水次数相应增加。',
    ],
  },
  {
    title: '地块与沙地',
    paragraphs: [
      '地块类型: 土地 (soil) / 水池 (water) / 沙地 (sand)。沙地上可种植草莓/葡萄/南瓜/西瓜/紫云英, 生长所需周期 ×1.5 (向下取整); 西瓜在沙地生长不受减速影响。',
    ],
  },
  {
    title: '能量机制',
    paragraphs: [
      '无人机拥有能量 (上限 10, 初始 0)。`Charge` 原地充能 +5; 行/列范围操作消耗能量: 收割整行/列 4, 浇灌整行/列 3, 拦截整行/列 6。',
    ],
  },
  {
    title: '竞技模式',
    paragraphs: [
      '地图 14×7, 你的半场在左侧 (与单人地图相同), 对方在右侧; 双方用同一坐标系编程 (对方视角为镜像)。',
      '偷菜: 对方半场收获的金钱进入无人机临时资金池, 返回己方半场时入账; 对方可用 Intercept / InterceptRow / InterceptCol 拦截, 命中则资金返还。',
      '种植不受半场限制 (可到对方半场占位种植); 铲除仅限己方半场; 行/列收割仅限己方半场。',
    ],
  },
  {
    title: '限制',
    paragraphs: [
      '单次 `run()` 执行时限 400ms, 超时/内存超限立即终止并判负; 禁止网络/系统/异步 API。',
    ],
  },
];

export const DOC_OVERVIEW: DocParagraphSection = {
  title: '游戏概览',
  paragraphs: [
    'RoboFarm 是一个编程农场游戏: 玩家编写 TypeScript 控制无人机, 在限定回合 (300) 内赚取最多金钱。每局初始资金 20 金钱, 用于种植等开销。',
    '每回合, 游戏对每架无人机调用一次 `function run(droneId: number)`, 玩家返回一个操作类实例 (或 `null` 表示不动)。',
    '操作类继承自 `DroneOperation`, 引擎按类名识别; 参数在构造函数中传入。',
    '坐标均为 `[x, y]` 元组, x 向右, y 向下; 越界访问 API 返回 `null`。',
  ],
};

// ---------------------------------------------------------------------------
// Markdown 渲染 (MCP / AI 使用)
// ---------------------------------------------------------------------------

function plain(text: string): string {
  // 去掉文档内锚点链接, 保留反引号
  return text.replace(/\[([^\]]*)\]\(#[^)]*\)/g, '$1');
}

function entryMarkdown(e: DocEntry, heading: string): string {
  const lines: string[] = [];
  lines.push(`${heading} ${e.name}`);
  lines.push('');
  lines.push(`- 定义: \`${e.def}\``);
  lines.push(`- 描述: ${plain(e.desc)}`);
  if (e.params) {
    for (const p of e.params) lines.push(`- 参数: ${plain(p)}`);
  }
  if (e.returns) lines.push(`- 返回: ${plain(e.returns)}`);
  if (e.example) {
    lines.push('  示例:');
    lines.push('  ```typescript');
    lines.push(...e.example.split('\n').map((l) => '  ' + l));
    lines.push('  ```');
  }
  lines.push('');
  return lines.join('\n');
}

export function sectionMarkdown(section: string): string {
  const out: string[] = [];
  switch (section) {
    case 'overview':
      out.push(`# ${DOC_OVERVIEW.title}`, '');
      out.push(...DOC_OVERVIEW.paragraphs.map((p) => plain(p)), '');
      break;
    case 'operations':
      out.push('# 无人机操作', '');
      out.push('所有操作继承自 `DroneOperation`, 引擎按类名识别; `run()` 返回 null 表示本回合不动。', '');
      for (const e of DOC_OPERATIONS) out.push(entryMarkdown(e, '##'));
      break;
    case 'functions':
      out.push('# API 函数', '');
      for (const e of DOC_FUNCTIONS) out.push(entryMarkdown(e, '##'));
      break;
    case 'types':
      out.push('# 数据类型', '');
      for (const e of DOC_TYPES) out.push(entryMarkdown(e, '##'));
      break;
    case 'crops':
      out.push('# 作物一览', '');
      for (const e of cropDocEntries()) out.push(entryMarkdown(e, '##'));
      break;
    case 'rules':
      out.push('# 规则', '');
      for (const s of DOC_RULES) {
        out.push(`## ${s.title}`, '');
        out.push(...s.paragraphs.map((p) => plain(p)), '');
      }
      break;
    case 'all':
      out.push(sectionMarkdown('overview'));
      out.push(sectionMarkdown('operations'));
      out.push(sectionMarkdown('functions'));
      out.push(sectionMarkdown('types'));
      out.push(sectionMarkdown('crops'));
      out.push(sectionMarkdown('rules'));
      break;
    default:
      throw new Error(`未知文档章节: ${section}`);
  }
  return out.join('\n');
}

/** 可用的文档章节 id */
export const DOC_SECTIONS = ['overview', 'operations', 'functions', 'types', 'crops', 'rules', 'all'] as const;
export type DocSectionId = (typeof DOC_SECTIONS)[number];
