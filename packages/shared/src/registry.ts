// 地块与作物的数据注册表。地块配置集中在此注册;
// 作物配置按"每种作物一个文件"放在 crops/ 目录 (见下), 这里只做汇总。
import { CropState, CropType, GrowthEffectContext, MaturityEffectContext, TileType, WorldState } from './types';
import { strawberry } from './crops/strawberry';
import { grape } from './crops/grape';
import { wheat } from './crops/wheat';
import { lotus } from './crops/lotus';
import { pumpkin } from './crops/pumpkin';
import { melon } from './crops/melon';
import { milkVetch } from './crops/milk-vetch';
import { shiitake } from './crops/shiitake';
import { daffodil } from './crops/daffodil';

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
   * 统计图表语义色 (饼图 / 进度条 / 图例共用, 由前端消费)。
   * 原前端 stats.ts 的 CROP_COLORS 迁入各作物自己的文件。
   */
  color: string;
  /**
   * 成熟特效: 作物成熟时执行的函数 (定义在作物自己的文件里, 引擎直接调用)。
   * 多数作物不声明 (无特效)。
   */
  onMature?: (ctx: MaturityEffectContext) => void;
  /**
   * 生长特效: 作物生长中的每个回合都会执行的函数 (定义在作物自己的文件里, 引擎直接调用)。
   * 多数作物不声明 (无特效)。
   */
  onGrow?: (ctx: GrowthEffectContext) => void;
  /**
   * 动态生长周期: 若提供, 种植时用此函数计算实际周期 (覆盖 growCycles 与地块倍率)。
   * 如香菇: 实际周期 = 20 + 2 × 场上香菇总数。
   */
  plantCycles?: (world: WorldState) => number;
}

/**
 * 作物注册表 (与 agent/CROP.md 对应)。
 * 注意: 作物代码名 (CropType) 与贴图名一致 (public/sprites/crop/<type>_<n>.avif)。
 */
export const CROPS: Record<CropType, CropTypeConfig> = {
  [CropType.Strawberry]: strawberry,
  [CropType.Grape]: grape,
  [CropType.Wheat]: wheat,
  [CropType.Lotus]: lotus,
  [CropType.Pumpkin]: pumpkin,
  [CropType.Melon]: melon,
  [CropType.MilkVetch]: milkVetch,
  [CropType.Shiitake]: shiitake,
  [CropType.Daffodil]: daffodil,
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
