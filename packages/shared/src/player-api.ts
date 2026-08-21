// 注入玩家沙箱的 API 实现。前后端共用这一份实现, 保证玩家代码
// 在前端本地执行与在后端验证执行时得到完全相同的结果。
// API 函数只读取"每回合由宿主传入的视图快照", 因此天然无状态。
// 操作类 (Move / Plant / ...) 已拆分到 ops/ 目录, 每个操作一个文件, 见 ./ops。
import { CropInfo, DroneInfo, GameInfo, PlayerView, Position, TileInfo } from './types';
import { MAX_LOGS_PER_TURN, MAX_LOG_LINES, DRONE_LIMIT } from './config';
import {
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
  Fertilize,
  FertilizeRow,
  FertilizeCol,
} from './ops';

export {
  DroneOperation,
  Move,
  Teleport,
  NewDrone,
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
  ChangeTile,
  Fertilize,
  FertilizeRow,
  FertilizeCol,
} from './ops';

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
  Fertilize,
  FertilizeRow,
  FertilizeCol,
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
