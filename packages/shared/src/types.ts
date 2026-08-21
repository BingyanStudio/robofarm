// 核心数据类型。所有数据均为纯 JSON 可序列化结构 (无 class / Map / Set),
// 以便通过 postMessage / WebSocket 在 worker、前后端之间传输。

/** 地图上的坐标, 使用 (x, y) 元组, x 轴向右, y 轴向下 */
export type Position = [number, number];

/** 地块类型。未来新增地块类型时在 registry.ts 中注册, 无需改动引擎 */
export enum TileType {
  Soil = 'soil',
  Water = 'water',
  Sand = 'sand',
}

/** 作物类型。未来新增作物时在 registry.ts 中注册 */
export enum CropType {
  Strawberry = 'strawberry',
  Grape = 'grape',
  Wheat = 'wheat',
  Lotus = 'lotus',
  Pumpkin = 'pumpkin',
  Melon = 'melon',
  MilkVetch = 'milk_vetch',
  Shiitake = 'shiitake',
  Daffodil = 'daffodil',
}

/** 作物状态 */
export enum CropState {
  /** 正在生长 */
  Growing = 'growing',
  /** 缺水: 不浇水则长期保持此状态, 生长不推进 (浇水后继续生长) */
  Thirsty = 'thirsty',
  /** 成熟, 可收获 */
  Grown = 'grown',
}

/** 游戏模式 */
export type GameMode = 'single' | 'combat';

/**
 * 坐标系变换。
 * 竞技模式下双方各自在自己的坐标系内编程: P1 使用绝对坐标 (normal),
 * P2 的世界是 P1 世界的镜像 (mirror), 因此双方都把自己的半场视为左侧。
 */
export type Frame = 'normal' | 'mirror';

/** 无人机可执行的操作 (判别联合)。新增操作时需同时注册 ops.ts 的模式与 engine.ts 的处理器 */
export type InternalOperation =
  | { type: 'move'; to: Position }
  | { type: 'teleport'; to: Position }
  | { type: 'plant'; crop: CropType }
  | { type: 'newDrone'; at: Position }
  | { type: 'collectWater' }
  | { type: 'water' }
  | { type: 'harvest' }
  | { type: 'clear' }
  | { type: 'intercept'; at: Position }
  // 能量相关操作
  | { type: 'charge' }
  | { type: 'harvestRow' }
  | { type: 'harvestCol' }
  | { type: 'waterRow' }
  | { type: 'waterCol' }
  | { type: 'interceptRow' }
  | { type: 'interceptCol' }
  | { type: 'plantRow'; plants: CropType[] }
  | { type: 'plantCol'; plants: CropType[] }
  // 地块转换
  | { type: 'changeTile'; tileType: TileType };

/** 单个地块的信息 (玩家 API 视角) */
export interface TileInfo {
  type: TileType;
  hasCrop: boolean;
  /** 地块上的作物, 无作物时为 null */
  crop: CropInfo | null;
}

/** 单个作物的信息 (玩家 API 视角) */
export interface CropInfo {
  type: CropType;
  state: CropState;
  /** 还需要多少回合成熟, 仅 Grown 时为 0 (Growing/Thirsty 均为剩余回合数) */
  cyclesToGrown: number;
}

/** 无人机信息 (玩家 API 视角, 坐标为玩家本地坐标系) */
export interface DroneInfo {
  /** 本地编号: 自己的无人机为 0..N-1; 对方的无人机为真实全局 id (如竞技模式 P2 的无人机为 2, 3) */
  id: number;
  position: Position;
  /** 当前储水量 */
  water: number;
  /** 当前能量 (上限 MAX_ENERGY) */
  energy: number;
  /** 是否是对方的无人机 */
  isOpponent: boolean;
  /** 对方无人机偷菜所得金额 (偷菜后未带回/未被拦截的部分) */
  bounty: number;
}

/** 玩家全局信息 (玩家 API 视角) */
export interface GameInfo {
  mode: GameMode;
  turn: number;
  maxTurns: number;
  money: number;
  /** 己方无人机数量上限 (单人 2 / 竞技 3), NewDrone 创建时受此限制 */
  droneLimit: number;
}

/** 玩家程序每回合看到的完整世界快照 (坐标为玩家本地坐标系) */
export interface PlayerView {
  mode: GameMode;
  turn: number;
  maxTurns: number;
  map: {
    width: number;
    height: number;
    tiles: TileInfo[][];
  };
  /** 场上所有无人机 (含对方), 本地坐标 */
  drones: DroneInfo[];
  /** 当前由 run() 控制的无人机 (即 droneId 对应的无人机) */
  self: DroneInfo;
  /** 自己的金钱 */
  money: number;
}

// ---------------------------------------------------------------------------
// 引擎内部状态 (绝对坐标)
// ---------------------------------------------------------------------------

export interface CropData {
  type: CropType;
  state: CropState;
  /** 距离成熟的剩余生长回合数 (Growing 时递减; Thirsty 时不推进) */
  growthRemaining: number;
  /**
   * 总缺水次数: 种植时按该次种植的实际生长周期数 (含地块 growthFactor)
   * 动态计算, 即 floor(实际周期 / thirstInterval); 0 表示无需浇水。
   */
  thirstTotal?: number;
  /** 已发生的缺水次数 */
  thirstsDone?: number;
  /** 种植时的实际生长周期数 (计算缺水触发点用) */
  plantCycles?: number;
  /** 香菇: 成熟后还需扩散的小香菇数量 (每回合 1 个, 按上右下左顺序, 到 0 停止) */
  spreadLeft?: number;
}

export interface Tile {
  type: TileType;
  crop: CropData | null;
}

export interface DroneState {
  /** 全局无人机 id (唯一) */
  id: number;
  /** 所属玩家下标 (0 / 1) */
  player: number;
  position: Position;
  water: number;
  /** 能量储量 (上限 MAX_ENERGY, 经 Charge 补充) */
  energy: number;
  /** 偷菜所得临时资金池 (离开对方半场前持有) */
  bounty: number;
  /** 本回合的拦截目标, 回合结束时结算 */
  interceptTarget: Position | null;
  /** 行/列范围拦截: 以施法点 (无人机释放时的位置) 为中心的 3 格范围, 回合结束时结算 */
  interceptZone: { axis: 'row' | 'col'; center: Position } | null;
}

export interface PlayerState {
  id: number;
  money: number;
  alive: boolean;
}

export interface WorldState {
  mode: GameMode;
  map: Tile[][];
  drones: DroneState[];
  players: PlayerState[];
  turn: number;
  maxTurns: number;
}

// ---------------------------------------------------------------------------
// 作物特效上下文 (作物自己的文件里定义特效函数时使用)
// ---------------------------------------------------------------------------

/** 作物成熟特效 (onMature) 的执行上下文 */
export interface MaturityEffectContext {
  world: WorldState;
  pos: Position;
  crop: CropData;
  events: GameEvent[];
}

/** 作物生长特效 (onGrow) 的执行上下文 */
export interface GrowthEffectContext {
  world: WorldState;
  crop: CropData;
  pos: Position;
  events: GameEvent[];
}

// ---------------------------------------------------------------------------
// 事件流 (渲染 / 回放 / 日志)
// ---------------------------------------------------------------------------

/** 快照中的地块 */
export interface SnapshotTile {
  type: TileType;
  crop: CropInfo | null;
}

/** 快照中的无人机 */
export interface SnapshotDrone {
  id: number;
  player: number;
  position: Position;
  water: number;
  energy: number;
  bounty: number;
  interceptTarget: Position | null;
}

/** 快照中的玩家 */
export interface SnapshotPlayer {
  id: number;
  money: number;
  alive: boolean;
}

/** 每回合结束时的世界快照 (绝对坐标), 渲染与回放都基于它 */
export interface SnapshotState {
  mode: GameMode;
  turn: number;
  maxTurns: number;
  map: SnapshotTile[][];
  drones: SnapshotDrone[];
  players: SnapshotPlayer[];
}

export interface GameResultFinished {
  type: 'finished';
  scores: { player: number; name: string; money: number }[];
}

/** 程序超时 / 报错 / 内存超限导致的非正常结束 */
export interface GameResultError {
  type: 'error';
  player: number;
  message: string;
}

export type GameResult = GameResultFinished | GameResultError;

export type GameEvent =
  | { type: 'turn'; turn: number }
  | { type: 'move'; drone: number; from: Position; to: Position }
  | { type: 'move-blocked'; drone: number; to: Position; reason: 'out-of-bounds' | 'occupied' }
  | { type: 'plant'; drone: number; pos: Position; crop: CropType }
  | { type: 'collect-water'; drone: number; pos: Position; water: number }
  | { type: 'water'; drone: number; pos: Position }
  | { type: 'harvest'; drone: number; pos: Position; value: number; stole: boolean }
  | { type: 'charge'; drone: number; pos: Position; energy: number }
  | { type: 'change-tile'; drone: number; pos: Position; tileType: TileType }
  | { type: 'clear'; drone: number; pos: Position }
  | { type: 'intercept'; drone: number; pos: Position; thief: number; bounty: number }
  | { type: 'stash'; drone: number; pos: Position; bounty: number }
  | { type: 'new-drone'; drone: number; pos: Position }
  | { type: 'crop-grow'; pos: Position; state: CropState; cyclesToGrown: number }
  | { type: 'invalid-op'; drone: number; message: string }
  | { type: 'log'; player: number; lines: string[] }
  | { type: 'snapshot'; state: SnapshotState }
  | { type: 'end'; result: GameResult };
