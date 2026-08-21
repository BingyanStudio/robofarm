// 游戏 API 文档的单一事实来源 (shared)。
// 前端右侧手册与后端 MCP 服务器都从这里生成内容, 保证两边一致。
import { CROPS } from './registry';

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
        id: 'doc-Teleport',
        name: 'Teleport',
        def: 'class Teleport extends DroneOperation',
        desc: '传送到指定位置 (任意距离), 消耗 ceil(欧氏距离) 点能量; 传送失败 (目标越界 / 被占据) 时能量不退还。竞技模式只能从我方半场传送到我方半场。',
        params: ['`to`: `[number, number]` — 目标坐标 (x, y)'],
        example: 'return new Teleport([6, 3]);',
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
        desc: '在池塘上取水, 一次取满 (上限 5 格)。不在池塘上或已满时操作无效。',
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
        id: 'doc-WaterRow',
        name: 'WaterRow',
        def: 'class WaterRow extends DroneOperation',
        desc: '给以无人机为中心的行内 3 格作物从左到右浇水, 直到储水耗尽为止, 跳过不需要浇水的作物, 消耗 3 能量。',
        example: 'return new WaterRow();',
    },
    {
        id: 'doc-PlantRow',
        name: 'PlantRow',
        def: 'class PlantRow extends DroneOperation',
        desc: '在以无人机为中心的行内 3 格从左到右按 plants 数组顺序种植, 跳过无法种植的格子 (地块不适配 / 已有作物 / 金钱不足), 消耗 3 能量。',
        params: ['`plants`: `CropType[]` — 作物类型数组 (非空), 按顺序逐个种植'],
        example: "return new PlantRow(['strawberry', 'grape', 'pumpkin']);",
    },
    {
        id: 'doc-PlantCol',
        name: 'PlantCol',
        def: 'class PlantCol extends DroneOperation',
        desc: '在以无人机为中心的列内 3 格从上到下按 plants 数组顺序种植, 跳过无法种植的格子 (地块不适配 / 已有作物 / 金钱不足), 消耗 3 能量。',
        params: ['`plants`: `CropType[]` — 作物类型数组 (非空), 按顺序逐个种植'],
        example: "return new PlantCol(['strawberry', 'strawberry']);",
    },
    {
        id: 'doc-WaterCol',
        name: 'WaterCol',
        def: 'class WaterCol extends DroneOperation',
        desc: '给所在列作物从上到下浇水, 直到储水耗尽为止, 跳过不需要浇水的作物, 消耗 3 能量。',
        example: 'return new WaterCol();',
    },
    {
        id: 'doc-Harvest',
        name: 'Harvest',
        def: 'class Harvest extends DroneOperation',
        desc: '收获当前格已成熟的作物, 获得其价值。竞技模式下在对方半场收获会进入无人机临时资金池 (偷菜)。',
        example: 'return new Harvest();',
    },
    {
        id: 'doc-HarvestRow',
        name: 'HarvestRow',
        def: 'class HarvestRow extends DroneOperation',
        desc: '一次性收获以无人机为中心的行内 3 格全部成熟作物, 消耗 4 能量。竞技模式仅收割自己半场的作物 (不产生偷菜)。',
        example: 'return new HarvestRow();',
    },
    {
        id: 'doc-HarvestCol',
        name: 'HarvestCol',
        def: 'class HarvestCol extends DroneOperation',
        desc: '一次性收获以无人机为中心的列内 3 格全部成熟作物, 消耗 4 能量。竞技模式仅收割自己半场的作物 (不产生偷菜)。',
        example: 'return new HarvestCol();',
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
        id: 'doc-InterceptRow',
        name: 'InterceptRow',
        def: 'class InterceptRow extends DroneOperation',
        desc: '竞技模式专用: 回合结束时拦截以施法点为中心的行内 3 格中全部携带偷菜资金的对方无人机, 消耗 6 能量。',
        example: 'return new InterceptRow();',
    },
    {
        id: 'doc-InterceptCol',
        name: 'InterceptCol',
        def: 'class InterceptCol extends DroneOperation',
        desc: '竞技模式专用: 回合结束时拦截以施法点为中心的列内 3 格中全部携带偷菜资金的对方无人机, 消耗 6 能量。',
        example: 'return new InterceptCol();',
    },
    {
        id: 'doc-NewDrone',
        name: 'NewDrone',
        def: 'class NewDrone extends DroneOperation',
        desc: '花费 4000 金钱在指定位置创建一架新的无人机 (该无人机下一回合开始执行代码)。前提: 金钱足够 / 无人机数量未达上限 (单人 2 / 竞技 3, 见 getGame().droneLimit) / 指定位置没有无人机。',
        params: ['`at`: `[number, number]` — 创建位置坐标 (x, y)'],
        example: 'return new NewDrone([6, 3]);',
    },
    {
        id: 'doc-Charge',
        name: 'Charge',
        def: 'class Charge extends DroneOperation',
        desc: '充能: 本回合原地不动, 能量 +5 (上限 10)。能量用于行/列范围操作。',
        example: 'return new Charge();',
    },
    {
        id: 'doc-ChangeTile',
        name: 'ChangeTile',
        def: 'class ChangeTile extends DroneOperation',
        desc: '将脚下地块转换为指定类型 (soil / water / sand), 消耗 3 能量; 转为土地时肥力为 0。前提: 上下左右必须有至少一个与目标类型相同的地块, 不允许凭空创造; 有作物的地块不能转换。',
        params: ['`tileType`: `\'soil\' | \'water\' | \'sand\'` — 目标地块类型'],
        example: 'return new ChangeTile(\'water\');',
    },
    {
        id: 'doc-Fertilize',
        name: 'Fertilize',
        def: 'class Fertilize extends DroneOperation',
        desc: '给脚下土地施肥 (肥力 +3), 消耗 3 能量; 若不是土地则失败且不扣能量。',
        params: [],
        example: 'return new Fertilize();',
    },
    {
        id: 'doc-FertilizeRow',
        name: 'FertilizeRow',
        def: 'class FertilizeRow extends DroneOperation',
        desc: '给以自己为中心的行 3 格内土地施肥 (肥力 +3), 非土地格子跳过 (不返还能量), 消耗 8 能量。',
        params: [],
        example: 'return new FertilizeRow();',
    },
    {
        id: 'doc-FertilizeCol',
        name: 'FertilizeCol',
        def: 'class FertilizeCol extends DroneOperation',
        desc: '给以自己为中心的列 3 格内土地施肥 (肥力 +3), 非土地格子跳过 (不返还能量), 消耗 8 能量。',
        params: [],
        example: 'return new FertilizeCol();',
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
                `${c.growCyclesBase} 回合成熟, ${c.thirstCountBase === 0 ? '无需浇水' : `总缺水 ${c.thirstCountBase} 次`}`
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
            `成熟: ${cfg.growCyclesBase} 回合`,
            cfg.thirstCountBase === 0 ? '需水: 无需浇水' : `需水: ${cfg.thirstCountBase} 次`,
            `可种在: ${cfg.canPlantDesc}`,
            // 肥力消耗: 0 不显示; 负数 = 恢复肥力
            cfg.fertilityCost === 0
                ? null
                : cfg.fertilityCost < 0
                    ? `肥力: 恢复 ${-cfg.fertilityCost}`
                    : `肥力: 消耗 ${cfg.fertilityCost}`,
        ].filter((p): p is string => p !== null),
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
            '游戏按照 [回合] 推进。每一回合, 所有场上的无人机同时执行自己的代码, 返回本回合自己执行的操作。',
            '代码的执行时间被限制在 **0.4s** 内, 若执行超过 **0.4s**, 则该无人机会因超时而跳过回合。',
            '如果两台无人机的操作有冲突 (例如, 尝试移动到同一个格子上), 则代码执行时间更短的无人机抢占, 另一个无人机跳过回合。',
            '目前，游戏模式限制了总运行回合数，你需要在游戏结束时，取得尽可能多的金钱。',
        ],
    },
    {
        title: '无人机',
        paragraphs: [
            '无人机是玩家通过编程控制的 **主要单位**。场上同时可存在**多个**无人机。',
            '无人机通过 **API函数** 访问当前游戏内的各个信息, 包括 **地块，作物，其他无人机，回合数，金钱** 等, 具体请查询 **API函数** 章节',
            '无人机在 `run` 函数返回 **操作**, 来决定本回合自己执行的动作，具体请查询 **操作** 章节'
        ]
    },
    {
        title: '作物',
        paragraphs: [
            '作物有 **生长中 / 缺水 / 成熟** 三种状态，一般而言会经过 [生长 → 多次缺水 → 多次被浇水 → 成熟] 的过程。',
            '作物缺水时, 会在右上角显示 💧 图标，**生长将会停滞**。',
            '一种作物在生长中，需要浇水的次数是**固定**的，浇水回合大致**均匀分布**在整个生长阶段 (每个浇水回合带有 **2 回合以内**的随机偏移)。',
            '当前版本存在如下特殊机制',
            '沙漠化:',
            '收获作物时, 若该作物周围存在沙地, 则该格也转化为沙地 (仅蚕食土地, 不影响水池)。',
            '间作: ',
            '若作物的四方向邻格至少有 2 个不同于自己种类的作物, 收获收益 +20%。',
        ],
    },
    {
        title: '地块',
        paragraphs: [
            '当前版本存在 3 种地块 - **土地，沙地，水池**',
            '土地:',
            '基础地块，能种植绝大多数作物',
            '沙地:',
            '营养较少的地块, 部分作物无法种植; 在上面种植的作物, 生长周期为正常的 3 倍',
            '水池:',
            '含水地块，无人机可在上方蓄水。部分水生作物可以在上面种植',
            '盐碱地:',
            '营养过多而不适宜农业的地块，部分作物无法种植; 在上面种植的作物, 生长周期为正常的 1.5 倍，浇水次数为正常的 2 倍',
        ],
    },
    {
        title: '灌溉机制',
        paragraphs: [
            '农作物会在生长的特定阶段需求浇水。如果没有浇水，则农作物停止生长。',
            '**农作物的缺水时机是随机的** (非固定回合), 最佳实践是通过游戏内 API 动态判定是否需要浇水, **不要硬编码浇水回合**。',
            '因此, 服务器验证结果可能与本地试玩 (随机种子) **不完全一致**; 服务器端使用**固定的 5 个随机种子**验证, 对同一份代码结果**可复现**。',
            '无人机拥有储水能力，储水上限为 5, 初始为 0。',
            '获取: ',
            '当位于 *水池* 上时，无人机可执行 `CollectWater` 操作，获得 5 格水量。',
            '使用: ',
            '当位于 *缺水农作物* 上时，无人机可通过 `Water` 系操作，消耗 1 格水量，使作物恢复生长。'
        ],
    },
    {
        title: '能量机制',
        paragraphs: [
            '无人机拥有能量 (上限 10, 初始 0)。能量多用于执行一些 **特殊的无人机操作**。',
            '获取: ',
            '无人机可执行 `Charge` 操作获得 5 点能量。',
            '使用: ',
            '无人机可消耗能量，执行',
            '- **单回合对多地块执行操作**。例如, `HarvestRow` 操作会收割以无人机为中心，横向 3 格的成熟作物。',
            '- **特殊操作**。例如, `Teleport` 操作允许无人机无视距离传送到指定位置',
            '合理利用能量，能 **批量种植作物以取得更高收益**'
        ],
    },
    {
        title: '施肥机制',
        paragraphs: [
            '**土地** 地块现在拥有 "肥力" 属性。游戏开始时，地图中的土地肥力均为 5',
            '无人机: ',
            '无人机可执行 `Fertilize` 等操作对土地主动施肥，该操作会消耗能量。',
            '农作物: ',
            '- 多数农作物会消耗土地的肥力, 如西瓜、南瓜等。',
            '- 少数农作物会给土地增加肥力, 如紫云英、香菇等。',
            '转化: ',
            '土地的肥力上限为 10。',
            '- 若土地肥力下降至 0 以下, 则土地转化为沙地。',
            '- 若土地肥力提升至 10 以上, 则土地转化为盐碱地。',
        ],
    },
    {
        title: '单人种植模式',
        paragraphs: [
            '在该模式下，你初始获得 1 架无人机和一个固定的地图。你需要通过编程, 在 **500 个回合** 内尽可能多地种植作物赚取金钱。',
            '地图固定，尺寸为 7 x 7.',
            '**服务器验证**: 提交代码后, 服务器使用**固定的 5 个随机种子**各完整执行一局, 取**平均分 (向上取整)** 作为成绩; 缺水时机随机, 服务器得分可能与本地试玩略有不同, 但服务器端结果可复现。',
        ],
    },
    {
        title: '多人竞技模式',
        paragraphs: [
            '在该模式下，你初始获得 2 架无人机和一个对称的固定地图。',
            '除了尽可能挣得更多金钱，你还可以悄悄光顾对方的田地，摘下其播种的果实; 亦或是种植作物，干扰对方的运营体系。',
            '但对方并非赤手空拳, **"拦截"** 操作会将你的非法所得悉数回收。',
            '地图固定，尺寸为 14 x 7, 两侧地图对称。你所在的半边区域为 **己方半场**, 另一半为 **对方半场**, 部分机制只能在特定场地发挥效果。',
        ],
    }
];

export const DOC_OVERVIEW: DocParagraphSection = {
    title: '游戏概览',
    paragraphs: [
        '`RoboFarm` 是一个以 **玩家编程** 为核心的农场经营游戏。',
        '你需要编写 `Typescript` 控制农业无人机，在限定的场地和回合数内，通过合理种植农作物，并利用农作物的布局与特殊性质来实现最大化收益。',
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
