// 地块与作物的数据注册表。新增地块/作物只需在此注册,
// 引擎按注册表的数据驱动运行, 不需要改动 engine.ts。
import { CropState, CropType, TileType } from './types';

export interface TileTypeConfig {
  type: TileType;
  name: string;
  /** 无人机能否在该地块取水 */
  canCollectWater: boolean;
  /** 种植在该地块上时生长周期倍率 (如沙地 1.5) */
  growthFactor: number;
  /** 无作物时的地块贴图名 (public/sprites/<name>.svg) */
  sprite: string;
  /** 有作物时的地块贴图名; 无则与 sprite 相同 */
  spriteWithCrop: string;
  /** 无贴图时程序化绘制的底色 */
  color: string;
}

export const TILES: Record<TileType, TileTypeConfig> = {
  [TileType.Soil]: {
    type: TileType.Soil,
    name: '土地',
    canCollectWater: false,
    growthFactor: 1,
    sprite: 'grass',
    spriteWithCrop: 'field',
    color: '#b08d57',
  },
  [TileType.Water]: {
    type: TileType.Water,
    name: '水池',
    canCollectWater: true,
    growthFactor: 1,
    sprite: 'water',
    spriteWithCrop: 'water',
    color: '#6fb7dd',
  },
  [TileType.Sand]: {
    type: TileType.Sand,
    name: '沙地',
    canCollectWater: false,
    growthFactor: 1.5,
    sprite: 'sand',
    spriteWithCrop: 'sand_field',
    color: '#d8c07c',
  },
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
   * 缺水的触发间隔 (回合数): 作物总缺水次数 = floor(实际生长周期 / thirstInterval),
   * 实际周期在种植时按地块 growthFactor 计算 (如沙地 ×1.5);
   * 缺水均匀分布在生长过程中 (每约 thirstInterval 回合一次)。
   * null 表示无需浇水。
   */
  thirstInterval: number | null;
  /**
   * 覆盖地块的生长倍率: 设置后忽略地块 growthFactor (如西瓜在沙地不受 1.5 减速)。
   * 未设置时使用地块的 growthFactor。
   */
  growthOverride?: number;
  /**
   * 成熟时的特效 (效果 id): 引擎按 id 在 MATURITY_EFFECTS 表注册处理器,
   * 每种作物成熟时都会执行其挂接的特效; 多数作物不声明 (无特效)。
   */
  onMature?: 'accelerateNeighbors' | 'selfSpread';
  /**
   * 生长中的特效 (效果 id): 引擎按 id 在 GROWTH_EFFECTS 表注册处理器,
   * 每种作物在生长中的每个回合都会执行其挂接的特效; 多数作物不声明 (无特效)。
   */
  onGrow?: 'autoWater';
}

/**
 * 作物注册表 (与 agent/CROP.md 对应)。
 * 注意: 作物代码名 (CropType) 与贴图名一致 (public/sprites/crop/<type>_<n>.avif)。
 */
export const CROPS: Record<CropType, CropTypeConfig> = {
  [CropType.Strawberry]: {
    type: CropType.Strawberry,
    name: '草莓',
    description: '零成本的基础作物, 味道很不错。',
    habitats: [TileType.Soil, TileType.Sand],
    plantCost: 0,
    value: 5,
    growCycles: 5,
    thirstInterval: null, // 无需浇水
  },
  [CropType.Grape]: {
    type: CropType.Grape,
    name: '葡萄',
    description: '生长周期稍长，利率更高，味道也很不错。',
    habitats: [TileType.Soil, TileType.Sand],
    plantCost: 20,
    value: 40,
    growCycles: 15,
    thirstInterval: null, // 无需浇水
  },
  [CropType.Wheat]: {
    type: CropType.Wheat,
    name: '小麦',
    description: '需要浇水的作物，但收益较高。',
    habitats: [TileType.Soil],
    plantCost: 30,
    value: 120,
    growCycles: 30,
    thirstInterval: 15, // 生长中缺水 2 次 (剩余 20、10 回合时)
  },
  [CropType.Lotus]: {
    type: CropType.Lotus,
    name: '荷花',
    description: '水生植物，让水池也成为盈利点。',
    habitats: [TileType.Water],
    plantCost: 30,
    value: 90,
    growCycles: 40,
    thirstInterval: null, // 无需浇水
  },
  [CropType.Pumpkin]: {
    type: CropType.Pumpkin,
    name: '南瓜',
    description: '生长周期和浇水条件都苛刻的植物，但收益率高。',
    habitats: [TileType.Soil, TileType.Sand],
    plantCost: 100,
    value: 500,
    growCycles: 100,
    thirstInterval: 18, // 生长中缺水 5 次 (每 18 回合一次)
  },
  [CropType.Melon]: {
    type: CropType.Melon,
    name: '西瓜',
    description: '一种沙地友好的高价值作物, 需要合理规划浇水。',
    habitats: [TileType.Soil, TileType.Sand],
    plantCost: 120,
    value: 840,
    growCycles: 120,
    thirstInterval: 15, // 生长中缺水 8 次
    growthOverride: 1, // 沙地生长不受 1.5 倍减速影响
  },
  [CropType.MilkVetch]: {
    type: CropType.MilkVetch,
    name: '紫云英',
    description: '绿肥植物，成熟时会加快周围作物的生长。',
    habitats: [TileType.Soil, TileType.Sand],
    plantCost: 180,
    value: 200,
    growCycles: 60,
    thirstInterval: 40, // 生长中缺水 1 次
    onMature: 'accelerateNeighbors',
  },
  [CropType.Shiitake]: {
    type: CropType.Shiitake,
    name: '香菇',
    description: '一种会自我繁殖的作物, 需要控制其繁殖范围并多轮收取以获得最大收益。',
    habitats: [TileType.Soil],
    plantCost: 80,
    value: 40,
    growCycles: 20,
    thirstInterval: null, // 无需浇水
    onMature: 'selfSpread',
  },
  [CropType.Daffodil]: {
    type: CropType.Daffodil,
    name: '水仙',
    description: '功能性作物, 为周围的作物提供缓慢的浇水支持。',
    habitats: [TileType.Water],
    plantCost: 150,
    value: 100,
    growCycles: 80,
    thirstInterval: null, // 无需浇水
    onGrow: 'autoWater', // 生长中每回合自动给邻格缺水作物浇水一次
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
