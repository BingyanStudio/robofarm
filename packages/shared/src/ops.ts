// 玩家代码返回的操作的校验与规范化。
// 结构校验在这里进行 (新增操作类型时, 在此注册 schema),
// 语义校验 (是否越界、金钱是否足够等) 在 engine.ts 中进行。
import { InternalOperation, Position } from './types';
import { TILES, isCropType } from './registry';

export type NormalizeResult =
  | { ok: true; op: InternalOperation | null }
  | { ok: false; error: string };

export function isPosition(v: unknown): v is Position {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

interface OpSchema {
  fields: { name: string; kind: 'position' | 'string' | 'crops' }[];
}

// 操作类型 → 结构 schema 的注册表。新增操作类型时, 同时在此注册并在 engine.ts 注册处理器。
const OP_SCHEMAS: Record<string, OpSchema> = {
  move: { fields: [{ name: 'to', kind: 'position' }] },
  teleport: { fields: [{ name: 'to', kind: 'position' }] },
  plant: { fields: [{ name: 'crop', kind: 'string' }] },
  newDrone: { fields: [{ name: 'at', kind: 'position' }] },
  collectWater: { fields: [] },
  water: { fields: [] },
  harvest: { fields: [] },
  clear: { fields: [] },
  intercept: { fields: [{ name: 'at', kind: 'position' }] },
  charge: { fields: [] },
  harvestRow: { fields: [] },
  harvestCol: { fields: [] },
  waterRow: { fields: [] },
  waterCol: { fields: [] },
  interceptRow: { fields: [] },
  interceptCol: { fields: [] },
  plantRow: { fields: [{ name: 'plants', kind: 'crops' }] },
  plantCol: { fields: [{ name: 'plants', kind: 'crops' }] },
  changeTile: { fields: [{ name: 'tileType', kind: 'string' }] },
};

/**
 * 玩家侧 class API 的类名 → 引擎操作 type 的映射。
 * 玩家通过 `new Move([x, y])` 等构造操作, 跨 realm / postMessage 后类实例
 * 会丢失原型, 因此统一在 normalizeOp 里按构造类名转换为纯对象。
 */
const OP_CLASS_TYPES: Record<string, string> = {
  ChangeTile: 'changeTile',
  Move: 'move',
  Teleport: 'teleport',
  Plant: 'plant',
  NewDrone: 'newDrone',
  CollectWater: 'collectWater',
  Water: 'water',
  Harvest: 'harvest',
  Clear: 'clear',
  Intercept: 'intercept',
  Charge: 'charge',
  HarvestRow: 'harvestRow',
  HarvestCol: 'harvestCol',
  WaterRow: 'waterRow',
  WaterCol: 'waterCol',
  InterceptRow: 'interceptRow',
  InterceptCol: 'interceptCol',
  PlantRow: 'plantRow',
  PlantCol: 'plantCol',
};

/** 识别操作类型: 优先纯对象形式 (raw.type), 其次玩家 class 的构造类名 */
function opTypeOf(raw: Record<string, unknown>): string | null {
  if (typeof raw.type === 'string' && raw.type in OP_SCHEMAS) return raw.type;
  const ctor = raw.constructor as { name?: string } | undefined;
  if (ctor && typeof ctor.name === 'string') {
    const mapped = OP_CLASS_TYPES[ctor.name];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * 校验并规范化 run() 的返回值, 输出统一的纯对象形式。
 * - undefined / null: 视为空操作 (本回合不动作), 但会记日志提示
 * - 结构非法: 返回错误, 该回合操作被忽略并产生 invalid-op 事件
 * - 玩家 class 实例 (`new Move(...)`) 与纯对象 (`{ type: 'move', ... }`) 均支持
 */
export function normalizeOp(raw: unknown): NormalizeResult {
  if (raw === undefined || raw === null) {
    return { ok: true, op: null };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'run() 必须返回一个操作对象 (例如 new Move([x, y]) 或什么都不返回)' };
  }
  const op = raw as Record<string, unknown>;
  const type = opTypeOf(op);
  if (!type) {
    return { ok: false, error: '无法识别的操作: 请使用 new Move(...) / new Plant(...) 等操作类, 或 { type: "move", ... }' };
  }
  const schema = OP_SCHEMAS[type];
  for (const { name, kind } of schema.fields) {
    const v = op[name];
    if (kind === 'position' && !isPosition(v)) {
      return { ok: false, error: `操作 ${type} 的字段 ${name} 必须是 [x, y] 坐标` };
    }
    if (kind === 'string' && typeof v !== 'string') {
      return { ok: false, error: `操作 ${type} 的字段 ${name} 必须是字符串` };
    }
    if (kind === 'crops' && !(Array.isArray(v) && v.length > 0 && v.every((c) => isCropType(c)))) {
      return { ok: false, error: `操作 ${type} 的字段 ${name} 必须是非空作物类型数组 (如 ['strawberry', 'grape'])` };
    }
  }
  if (type === 'plant' && !isCropType(op.crop)) {
    return { ok: false, error: `未知作物类型: ${String(op.crop)}` };
  }
  if (type === 'changeTile' && !(String(op.tileType) in TILES)) {
    return { ok: false, error: `ChangeTile 的目标类型必须是 soil / water / sand 之一, 收到: ${String(op.tileType)}` };
  }
  // 输出干净的纯对象 (丢弃额外字段, 便于跨 worker 传输)
  const out: Record<string, unknown> = { type };
  for (const { name } of schema.fields) out[name] = op[name];
  return { ok: true, op: out as InternalOperation };
}
