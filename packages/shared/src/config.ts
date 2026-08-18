// 全局常量。玩家代码超时、回合节奏等限制都在这里集中定义,
// 保证前端本地执行与后端验证执行的限制完全一致。

/** 玩家程序单次 run() 执行的时间上限 (毫秒) */
export const TIMEOUT_MS = 400;

/** 玩家程序初始加载(编译产物求值)的时间上限 (毫秒) */
export const LOAD_TIMEOUT_MS = 2000;

/** 无人机最大储水量 */
export const MAX_WATER = 5;

/** 单人/竞技模式的默认回合数 */
export const DEFAULT_MAX_TURNS = 300;

/** 正常播放速度下每回合间隔 (毫秒) */
export const TURN_INTERVAL_MS = 800;

/** 加速档位的每回合间隔 (毫秒): 下标 0 = 正常, 1 = 2 倍速, 2 = 4 倍速 */
export const TURN_INTERVALS_MS = [TURN_INTERVAL_MS, 400, 200] as const;

/** 玩家初始金钱 */
export const START_MONEY = 20;

/** 无人机能量上限 */
export const MAX_ENERGY = 10;

/** Charge 每次补充的能量 */
export const CHARGE_GAIN = 5;

/** HarvestRow / HarvestCol 的能量消耗 */
export const HARVEST_ROW_COL_COST = 4;

/** WaterRow / WaterCol 的能量消耗 */
export const WATER_ROW_COL_COST = 3;

/** InterceptRow / InterceptCol 的能量消耗 */
export const INTERCEPT_ROW_COL_COST = 6;

/** ChangeTile (地块转换) 的能量消耗 */
export const CHANGE_TILE_COST = 3;

/** 每个玩家程序最多保留的日志行数 */
export const MAX_LOG_LINES = 200;

/** 每个玩家程序每回合最多返回的日志行数 */
export const MAX_LOGS_PER_TURN = 50;
