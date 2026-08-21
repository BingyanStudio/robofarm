// 地块与作物的数据注册表。地块配置按"每种地块一个文件"放在 tiles/ 目录
// (继承 BaseTile, 见下); 作物配置按"每种作物一个文件"放在 crops/ 目录
// (继承 BaseCrop, 见下), 这里只做汇总。
import { CropState, CropType, GrowthEffectContext, MaturityEffectContext, Tile, TileType, WorldState } from './types';
import { Soil } from './tiles/soil';
import { Water } from './tiles/water';
import { Sand } from './tiles/sand';
import { Strawberry } from './crops/strawberry';
import { Grape } from './crops/grape';
import { Wheat } from './crops/wheat';
import { Lotus } from './crops/lotus';
import { Pumpkin } from './crops/pumpkin';
import { Melon } from './crops/melon';
import { MilkVetch } from './crops/milk-vetch';
import { Shiitake } from './crops/shiitake';
import { Daffodil } from './crops/daffodil';

export { BaseTile } from './tiles/base';
export { BaseCrop } from './crops/base';

export interface TileTypeConfig {
  type: TileType;
  name: string;
  /** 无人机能否在该地块取水 */
  canCollectWater: boolean;
  /** 种植在该地块上时的生长周期倍率 (如沙地 1.5, 由 BaseCrop.growCycles() 消费) */
  growthFactor: number;
  /** 无作物时的地块贴图名 (public/sprites/<name>.svg) */
  sprite: string;
  /** 有作物时的地块贴图名; 无则与 sprite 相同 */
  spriteWithCrop: string;
  /** 无贴图时程序化绘制的底色 */
  color: string;
}

/**
 * 地块注册表。每种地块是 tiles/<type>.ts 里的一个类 (继承 BaseTile),
 * 这里统一实例化; 通用默认值 (canCollectWater=false, growthFactor=1)
 * 放在基类, 特殊地块重写 (水池取水 / 沙地 ×1.5)。
 */
export const TILES: Record<TileType, TileTypeConfig> = {
  [TileType.Soil]: new Soil(),
  [TileType.Water]: new Water(),
  [TileType.Sand]: new Sand(),
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
  /** 基准生长周期 (土地上的回合数; 前端贴图进度也用它) */
  growCyclesBase: number;
  /**
   * 实际生长周期: 返回种植在指定地块上的实际生长回合数。
   * 默认实现 (BaseCrop) 按地块 growthFactor 计算 (沙地 1.5 → ×1.5 向下取整),
   * 需要特殊周期计算的作物重写 (如香菇: 20 + 2 × 场上香菇总数)。
   */
  growCycles(tile: Tile, world: WorldState): number;
  /**
   * 缺水的触发间隔 (回合数): 作物总缺水次数 = floor(实际生长周期 / thirstInterval),
   * 实际周期在种植时按 growCycles() 动态计算 (如沙地 ×1.5);
   * 缺水均匀分布在生长过程中 (每约 thirstInterval 回合一次)。
   * null 表示无需浇水。
   */
  thirstInterval: number | null;
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
}

/**
 * 作物注册表 (与 agent/CROP.md 对应)。
 * 注意: 作物代码名 (CropType) 与贴图名一致 (public/sprites/crop/<type>_<n>.avif)。
 * 每种作物是 crops/<type>.ts 里的一个类 (继承 BaseCrop), 这里统一实例化。
 */
export const CROPS: Record<CropType, CropTypeConfig> = {
  [CropType.Strawberry]: new Strawberry(),
  [CropType.Grape]: new Grape(),
  [CropType.Wheat]: new Wheat(),
  [CropType.Lotus]: new Lotus(),
  [CropType.Pumpkin]: new Pumpkin(),
  [CropType.Melon]: new Melon(),
  [CropType.MilkVetch]: new MilkVetch(),
  [CropType.Shiitake]: new Shiitake(),
  [CropType.Daffodil]: new Daffodil(),
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
