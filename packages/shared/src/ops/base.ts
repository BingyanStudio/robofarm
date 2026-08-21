// 无人机操作基类与共享类型。
//
// 每个操作 = 一个 class (ops/<type>.ts), 继承 DroneOperation, 通过重写静态方法
// apply() 实现各自的语义 (移动/传送登记移动候选, NewDrone 登记回合末延迟创建,
// 其余直接修改世界)。engine.ts 阶段 1 只按 type 查 OP_CLASSES 注册表并调用
// cls.apply(), 不再有 if-else 分支或处理器字典。
import type {
  DroneState,
  GameEvent,
  InternalOperation,
  Position,
  WorldState,
} from '../types';

/** 结构校验字段模式 (normalizeOp 用) */
export interface OpField {
  name: string;
  kind: 'position' | 'string' | 'crops';
}

/** 操作执行结果 (engine 收到 !ok 时产生 invalid-op 事件并带出 message) */
export type OpResult = { ok: boolean; message?: string };

/** 语义执行上下文: 每架无人机每回合一个 */
export interface OpContext {
  world: WorldState;
  drone: DroneState;
  events: GameEvent[];
  /** run() 执行耗时 (毫秒), 移动冲突仲裁用 */
  durationMs: number;
}

/** 移动候选 (参与阶段 2 的移动仲裁) */
export interface MoveCandidate {
  drone: DroneState;
  to: Position;
  durationMs: number;
}

/** 回合内跨阶段收集的会话状态 */
export interface TurnSession {
  moveCandidates: MoveCandidate[];
  /** NewDrone 待创建请求 (回合结束统一创建, 避免遍历中修改无人机列表) */
  newDroneRequests: { player: number; pos: Position }[];
}

/** 操作类 (类的静态侧): engine / normalizeOp 通过注册表 (ops/index.ts) 调用 */
export interface OpClass {
  readonly name: string;
  readonly fields: OpField[];
  apply(ctx: OpContext, op: InternalOperation, session: TurnSession): OpResult;
}

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

/**
 * 所有无人机操作类的基类。玩家在 run() 中通过 `new Move([x, y])` 等构造操作,
 * 跨 realm / postMessage 后经 normalizeOp 统一转换为纯对象, 引擎按 type 字段
 * 查 OP_CLASSES 注册表并调用静态 apply() 执行语义。
 * 每个子类带有一个稳定的 `type` 标识 (数据字段), 引擎据此识别操作;
 * 不能依赖 `constructor.name` —— 浏览器构建压缩时类名会被重命名。
 * 玩家不要直接实例化它。
 */
export abstract class DroneOperation {
  declare readonly type: string;

  /** 结构校验字段 (normalizeOp 用), 子类按需覆盖 (无参操作为空) */
  static readonly fields: OpField[] = [];

  /** 语义执行: 由各操作类重写 */
  static apply(_ctx: OpContext, _op: InternalOperation, _session: TurnSession): OpResult {
    return { ok: false, message: '未实现的操作' };
  }
}
