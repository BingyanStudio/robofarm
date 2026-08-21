// 操作类的注册表与玩家操作的结构校验/规范化 (原 ops.ts)。
//
// - 引擎 (engine.ts) 阶段 1 按 type 查 OP_CLASSES 并调用 cls.apply() 执行语义,
//   不再有 if-else 分支 / 处理器字典; 新增操作 = 在 ops/ 新建操作类 + 在此登记。
// - normalizeOp 负责把玩家代码的返回值 (操作类实例或纯对象) 校验并规范化为纯对象,
//   便于跨 realm / postMessage 传输。
import { InternalOperation } from '../types';
import { TILES, isCropType } from '../registry';
import { isPosition } from './base';
import type { OpClass } from './base';
import { Move } from './move';
import { Teleport } from './teleport';
import { NewDrone } from './new-drone';
import { Plant } from './plant';
import { CollectWater } from './collect-water';
import { Water } from './water';
import { Harvest } from './harvest';
import { Clear } from './clear';
import { Intercept } from './intercept';
import { Charge } from './charge';
import { HarvestRow } from './harvest-row';
import { HarvestCol } from './harvest-col';
import { WaterRow } from './water-row';
import { WaterCol } from './water-col';
import { InterceptRow } from './intercept-row';
import { InterceptCol } from './intercept-col';
import { PlantRow } from './plant-row';
import { PlantCol } from './plant-col';
import { ChangeTile } from './change-tile';
import { Fertilize } from './fertilize';
import { FertilizeRow } from './fertilize-row';
import { FertilizeCol } from './fertilize-col';

export { DroneOperation, isPosition } from './base';
export type { OpClass, OpContext, OpField, OpResult, TurnSession, MoveCandidate } from './base';
// 操作类对外的具名导出 (玩家侧 API 经 player-api.ts 二次导出到沙箱)
export { Move } from './move';
export { Teleport } from './teleport';
export { NewDrone } from './new-drone';
export { Plant } from './plant';
export { CollectWater } from './collect-water';
export { Water } from './water';
export { Harvest } from './harvest';
export { Clear } from './clear';
export { Intercept } from './intercept';
export { Charge } from './charge';
export { HarvestRow } from './harvest-row';
export { HarvestCol } from './harvest-col';
export { WaterRow } from './water-row';
export { WaterCol } from './water-col';
export { InterceptRow } from './intercept-row';
export { InterceptCol } from './intercept-col';
export { PlantRow } from './plant-row';
export { PlantCol } from './plant-col';
export { ChangeTile } from './change-tile';
export { Fertilize } from './fertilize';
export { FertilizeRow } from './fertilize-row';
export { FertilizeCol } from './fertilize-col';

/** 操作 type → 操作类。引擎与 normalizeOp 共用这一处注册表 */
export const OP_CLASSES: Record<string, OpClass> = {
  move: Move,
  teleport: Teleport,
  newDrone: NewDrone,
  plant: Plant,
  collectWater: CollectWater,
  water: Water,
  harvest: Harvest,
  clear: Clear,
  intercept: Intercept,
  charge: Charge,
  harvestRow: HarvestRow,
  harvestCol: HarvestCol,
  waterRow: WaterRow,
  waterCol: WaterCol,
  interceptRow: InterceptRow,
  interceptCol: InterceptCol,
  plantRow: PlantRow,
  plantCol: PlantCol,
  changeTile: ChangeTile,
  fertilize: Fertilize,
  fertilizeRow: FertilizeRow,
  fertilizeCol: FertilizeCol,
};

/** 按操作 type 取操作类 (engine 阶段 1 的分发入口, 替代 if-else 链) */
export function opClassOf(type: string): OpClass | null {
  return OP_CLASSES[type] ?? null;
}

/** 玩家 class 构造名 → 操作 type 的映射 (兜底: 实例丢失 type 字段时的旧兼容路径) */
const OP_CLASS_TYPES: Record<string, string> = {};
for (const [type, cls] of Object.entries(OP_CLASSES)) {
  OP_CLASS_TYPES[cls.name] = type;
}

export type NormalizeResult =
  | { ok: true; op: InternalOperation | null }
  | { ok: false; error: string };

/** 识别操作类型: 优先纯对象形式 (raw.type), 其次玩家 class 的构造类名 */
function opTypeOf(raw: Record<string, unknown>): string | null {
  if (typeof raw.type === 'string' && raw.type in OP_CLASSES) return raw.type;
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
 * - 结构字段模式来自操作类的静态 fields, 新增操作只需在类里声明
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
  const cls = OP_CLASSES[type];
  for (const { name, kind } of cls.fields) {
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
  for (const { name } of cls.fields) out[name] = op[name];
  return { ok: true, op: out as InternalOperation };
}
