// 地块与作物的数据注册表。新增地块/作物只需在此注册,
// 引擎按注册表的数据驱动运行, 不需要改动 engine.ts。
import { CropState, CropType, TileType } from './types';

export interface TileTypeConfig {
  type: TileType;
  name: string;
  /** 无人机能否在该地块取水 */
  canCollectWater: boolean;
}

export const TILES: Record<TileType, TileTypeConfig> = {
  [TileType.Soil]: { type: TileType.Soil, name: '土地', canCollectWater: false },
  [TileType.Water]: { type: TileType.Water, name: '水池', canCollectWater: true },
};

export interface CropTypeConfig {
  type: CropType;
  name: string;
  /** 作物简介 (API 手册展示用) */
  description: string;
  /** 可种植的地块类型 (陆生 / 水生) */
  habitats: TileType[];
  /** 种植成本 */
  plantCost: number;
  /** 成熟后收获所得 */
  value: number;
  /** 种植后经过多少回合成熟 */
  growCycles: number;
  /**
   * 缺水的触发间隔: 生长到剩余回合数为 thirstInterval 的整数倍时进入 Thirsty。
   * 大约每 thirstInterval 回合生长需浇水一次 (浇水次数 ≈ growCycles / thirstInterval);
   * null 表示无需浇水。
   */
  thirstInterval: number | null;
}

/**
 * 作物注册表 (与 agent/CROP.md 对应)。
 * 注意: 作物代码名 (CropType) 与贴图名一致 (public/sprites/crop/<type>_<n>.avif)。
 */
export const CROPS: Record<CropType, CropTypeConfig> = {
  [CropType.Strawberry]: {
    type: CropType.Strawberry,
    name: '草莓',
    description: '零成本的基础作物, 适合快速启动与边角料时间。',
    habitats: [TileType.Soil],
    plantCost: 0,
    value: 5,
    growCycles: 5,
    thirstInterval: null, // 无需浇水
  },
  [CropType.Grape]: {
    type: CropType.Grape,
    name: '葡萄',
    description: '生长周期稍长, 但利率更高。',
    habitats: [TileType.Soil],
    plantCost: 20,
    value: 40,
    growCycles: 15,
    thirstInterval: null, // 无需浇水
  },
  [CropType.Wheat]: {
    type: CropType.Wheat,
    name: '小麦',
    description: '需要浇水的作物, 但收益较高。',
    habitats: [TileType.Soil],
    plantCost: 30,
    value: 80,
    growCycles: 25,
    thirstInterval: 10, // 生长中缺水 2 次 (剩余 20、10 回合时)
  },
  [CropType.Lotus]: {
    type: CropType.Lotus,
    name: '荷花',
    description: '水生植物, 让水池也成为盈利点。',
    habitats: [TileType.Water],
    plantCost: 30,
    value: 90,
    growCycles: 40,
    thirstInterval: null, // 无需浇水
  },
  [CropType.Pumpkin]: {
    type: CropType.Pumpkin,
    name: '南瓜',
    description: '生长周期和浇水条件都苛刻的植物, 但收益率高。',
    habitats: [TileType.Soil],
    plantCost: 100,
    value: 300,
    growCycles: 100,
    thirstInterval: 18, // 生长中缺水 5 次 (剩余 90、72、54、36、18 回合时)
  },
};

export function isCropType(v: unknown): v is CropType {
  return typeof v === 'string' && v in CROPS;
}

export function cropConfig(type: CropType): CropTypeConfig {
  return CROPS[type];
}

/** 作物在某一时刻对外暴露的计数 (Grown 为 0, Growing/Thirsty 为剩余回合数) */
export function cropInfo(type: CropType, state: CropState, growthRemaining: number) {
  return {
    type,
    state,
    cyclesToGrown: state === CropState.Grown ? 0 : Math.max(0, growthRemaining),
  };
}
