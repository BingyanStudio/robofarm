// 注入玩家沙箱的 API 实现。前后端共用这一份实现, 保证玩家代码
// 在前端本地执行与在后端验证执行时得到完全相同的结果。
// API 函数只读取"每回合由宿主传入的视图快照", 因此天然无状态。
import { CropInfo, CropType, DroneInfo, GameInfo, PlayerView, Position, TileInfo, TileType } from './types';
import { TILES } from './registry';
import { MAX_LOGS_PER_TURN, MAX_LOG_LINES, DRONE_LIMIT } from './config';
import { isPosition } from './ops';
import { isCropType } from './registry';

// ---------------------------------------------------------------------------
// 玩家侧的操作类 (class extends DroneOperation)。
// 玩家在 run() 中通过 `new Move([x, y])` 等方式构造操作, 引擎按构造类名
// (className) 识别操作类型, 参数在构造函数中传递。
// ---------------------------------------------------------------------------

/** 所有无人机操作类的基类。玩家不要直接实例化它。
 *  每个子类带有一个稳定的 `type` 标识 (数据字段), 引擎据此识别操作;
 *  不能依赖 `constructor.name` —— 浏览器构建压缩时类名会被重命名。 */
export class DroneOperation {
  declare readonly type: string;
}

/** 移动到周围 8 格之一 */
export class Move extends DroneOperation {
  readonly type = 'move';
  constructor(public to: Position) {
    super();
    if (!isPosition(to)) throw new Error('Move 的参数 to 必须是 [x, y] 坐标');
  }
}

/** 传送到指定位置 (任意距离), 消耗 ceil(欧氏距离) 能量; 竞技模式只能在我方半场内传送 */
export class Teleport extends DroneOperation {
  readonly type = 'teleport';
  constructor(public to: Position) {
    super();
    if (!isPosition(to)) throw new Error('Teleport 的参数 to 必须是 [x, y] 坐标');
  }
}

/** 花费 4000 金钱在指定位置创建一架新的无人机 (上限: 单人 2 / 竞技 3, 见 getGame().droneLimit) */
export class NewDrone extends DroneOperation {
  readonly type = 'newDrone';
  constructor(public at: Position) {
    super();
    if (!isPosition(at)) throw new Error('NewDrone 的参数 at 必须是 [x, y] 坐标');
  }
}

/** 在当前位置种植作物 */
export class Plant extends DroneOperation {
  readonly type = 'plant';
  constructor(public crop: CropType) {
    super();
    if (!isCropType(crop)) throw new Error(`Plant 的参数 crop 必须是作物类型 (如 CropType.Strawberry), 收到: ${String(crop)}`);
  }
}

/** 在池塘上取水 */
export class CollectWater extends DroneOperation {
  readonly type = 'collectWater';
  constructor() {
    super();
  }
}

/** 给当前地块的作物浇水 */
export class Water extends DroneOperation {
  readonly type = 'water';
  constructor() {
    super();
  }
}

/** 收获当前地块的作物 */
export class Harvest extends DroneOperation {
  readonly type = 'harvest';
  constructor() {
    super();
  }
}

/** 铲除当前地块的作物 */
export class Clear extends DroneOperation {
  readonly type = 'clear';
  constructor() {
    super();
  }
}

/** 拦截: 指定一个格子, 偷菜无人机在该回合结束时进入则返还资金 (仅竞技模式) */
export class Intercept extends DroneOperation {
  readonly type = 'intercept';
  constructor(public at: Position) {
    super();
    if (!isPosition(at)) throw new Error('Intercept 的参数 at 必须是 [x, y] 坐标');
  }
}

/** 充能: 原地不动, 能量 +5 (上限 10) */
export class Charge extends DroneOperation {
  readonly type = 'charge';
  constructor() {
    super();
  }
}

/** 收割整行: 一次性收获所在行全部成熟作物 (竞技模式仅自己半场), 消耗 4 能量 */
export class HarvestRow extends DroneOperation {
  readonly type = 'harvestRow';
  constructor() {
    super();
  }
}

/** 收割整列: 一次性收获所在列全部成熟作物 (竞技模式仅自己半场), 消耗 4 能量 */
export class HarvestCol extends DroneOperation {
  readonly type = 'harvestCol';
  constructor() {
    super();
  }
}

/** 浇灌整行: 从左到右给所在行缺水作物浇水直到水耗尽, 消耗 3 能量 */
export class WaterRow extends DroneOperation {
  readonly type = 'waterRow';
  constructor() {
    super();
  }
}

/** 浇灌整列: 从上到下给所在列缺水作物浇水直到水耗尽, 消耗 3 能量 */
export class WaterCol extends DroneOperation {
  readonly type = 'waterCol';
  constructor() {
    super();
  }
}

/** 拦截整行: 回合结束时拦截所在行全部携带偷菜资金的对方无人机, 消耗 6 能量 */
export class InterceptRow extends DroneOperation {
  readonly type = 'interceptRow';
  constructor() {
    super();
  }
}

/** 拦截整列: 回合结束时拦截所在列全部携带偷菜资金的对方无人机, 消耗 6 能量 */
export class InterceptCol extends DroneOperation {
  readonly type = 'interceptCol';
  constructor() {
    super();
  }
}

/** 种植整行: 从左到右按 plants 顺序在所在行种植, 跳过无法种植的格子, 直到行末或数组耗尽, 消耗 3 能量 */
export class PlantRow extends DroneOperation {
  readonly type = 'plantRow';
  constructor(public plants: CropType[]) {
    super();
    if (!Array.isArray(plants) || plants.length === 0 || !plants.every((c) => isCropType(c))) {
      throw new Error('PlantRow 的参数 plants 必须是非空作物类型数组 (如 [\'strawberry\', \'grape\'])');
    }
  }
}

/** 种植整列: 从上到下按 plants 顺序在所在列种植, 跳过无法种植的格子, 直到列末或数组耗尽, 消耗 3 能量 */
export class PlantCol extends DroneOperation {
  readonly type = 'plantCol';
  constructor(public plants: CropType[]) {
    super();
    if (!Array.isArray(plants) || plants.length === 0 || !plants.every((c) => isCropType(c))) {
      throw new Error('PlantCol 的参数 plants 必须是非空作物类型数组 (如 [\'strawberry\', \'grape\'])');
    }
  }
}

/** 转换脚下地块: 消耗 3 能量, 上下左右必须有至少一个与目标类型相同的地块 */
export class ChangeTile extends DroneOperation {
  readonly type = 'changeTile';
  constructor(public tileType: TileType) {
    super();
    if (!(tileType in TILES)) {
      throw new Error(`ChangeTile 的目标类型必须是 soil / water / sand 之一, 收到: ${String(tileType)}`);
    }
  }
}

/** 注入沙箱的全部操作类 (按类名供玩家代码直接引用) */
export const OPS = {
  DroneOperation,
  Move,
  Teleport,
  Plant,
  CollectWater,
  Water,
  Harvest,
  Clear,
  Intercept,
  Charge,
  HarvestRow,
  HarvestCol,
  WaterRow,
  WaterCol,
  InterceptRow,
  InterceptCol,
  PlantRow,
  PlantCol,
  NewDrone,
  ChangeTile,
};

export interface PlayerApi {
  /** 获取当前由 run() 控制的无人机信息 */
  getSelf(): DroneInfo;
  /** 获取当前回合信息与自己的金钱 */
  getGame(): GameInfo;
  /** 获取地图尺寸 */
  getMap(): { width: number; height: number };
  /** 获取指定地块信息, 坐标越界返回 null */
  getTile(position: Position): TileInfo | null;
  /** 获取指定地块的作物信息, 无作物或越界返回 null */
  getCrop(position: Position): CropInfo | null;
  /** 获取指定地块上的无人机信息, 无无人机或越界返回 null */
  getDrone(position: Position): DroneInfo | null;
}

export interface PlayerConsole {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

function inView(view: PlayerView, pos: Position): boolean {
  return (
    pos[0] >= 0 && pos[0] < view.map.width && pos[1] >= 0 && pos[1] < view.map.height
  );
}

function fmtArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * 创建玩家 API 与受控 console。
 * @param getView 每回合返回当前视图 (由宿主在调用 run() 前设置)
 */
export function playerApiFactory(getView: () => PlayerView | null): {
  api: PlayerApi;
  ops: typeof OPS;
  console: PlayerConsole;
  drainLogs: () => string[];
} {
  let logs: string[] = [];
  let truncated = false;

  const log = (level: string, args: unknown[]) => {
    if (logs.length >= MAX_LOG_LINES) {
      if (!truncated) {
        logs.push('[系统] 日志过多, 已截断');
        truncated = true;
      }
      return;
    }
    const line = `[${level}] ${args.map(fmtArg).join(' ')}`;
    logs.push(line);
    if (logs.length >= MAX_LOGS_PER_TURN && level !== 'error' && level !== 'warn') {
      logs.push('[系统] 本回合日志过多, 其余被忽略');
    }
  };

  const consoleObj: PlayerConsole = {
    log: (...a: unknown[]) => log('log', a),
    info: (...a: unknown[]) => log('info', a),
    warn: (...a: unknown[]) => log('warn', a),
    error: (...a: unknown[]) => log('error', a),
  };

  const api: PlayerApi = {
    getSelf(): DroneInfo {
      const view = getView();
      if (!view) throw new Error('API 调用时机错误: 当前回合视图未就绪');
      return view.self;
    },
    getGame(): GameInfo {
      const view = getView();
      if (!view) throw new Error('API 调用时机错误: 当前回合视图未就绪');
      return { mode: view.mode, turn: view.turn, maxTurns: view.maxTurns, money: view.money, droneLimit: DRONE_LIMIT[view.mode] };
    },
    getMap() {
      const view = getView();
      if (!view) throw new Error('API 调用时机错误: 当前回合视图未就绪');
      return { width: view.map.width, height: view.map.height };
    },
    getTile(position: Position): TileInfo | null {
      const view = getView();
      if (!view) throw new Error('API 调用时机错误: 当前回合视图未就绪');
      if (!inView(view, position)) return null;
      return view.map.tiles[position[1]][position[0]];
    },
    getCrop(position: Position): CropInfo | null {
      const view = getView();
      if (!view) throw new Error('API 调用时机错误: 当前回合视图未就绪');
      if (!inView(view, position)) return null;
      const tile = view.map.tiles[position[1]][position[0]];
      return tile.crop;
    },
    getDrone(position: Position): DroneInfo | null {
      const view = getView();
      if (!view) throw new Error('API 调用时机错误: 当前回合视图未就绪');
      if (!inView(view, position)) return null;
      for (const d of view.drones) {
        if (d.position[0] === position[0] && d.position[1] === position[1]) return d;
      }
      return null;
    },
  };

  return { api, ops: OPS, console: consoleObj, drainLogs: () => logs.splice(0, logs.length) };
}
