// 作物基类: 每种作物一个文件, 继承 BaseCrop 并填写自己的属性。
// 实际生长周期默认由基类的 growCycles() 计算 (按种植地块的 growthFactor,
// 沙地 ×3 向下取整), 需要特殊周期计算的作物重写 growCycles()
// (如香菇: 20 + 2 × 场上香菇总数)。
import { CropType, Tile, TileType, WorldState } from '../types';
import type { GrownEffectContext, GrowthEffectContext, MaturityEffectContext } from '../types';
import type { CropTypeConfig } from '../registry';
import { TILES } from '../registry';

export abstract class BaseCrop implements CropTypeConfig {
  abstract readonly type: CropType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly habitats: TileType[];
  abstract readonly plantCost: number;
  abstract readonly value: number;
  /** 基准生长周期 (土地上的回合数; 前端贴图进度也用它) */
  abstract readonly growCyclesBase: number;
  abstract readonly thirstInterval: number | null;
  /** 统计图表语义色 (饼图 / 图例 / 进度条共用) */
  abstract readonly color: string;

  /** 成熟特效: 作物成熟时执行 (多数作物不声明) */
  onGrown?(ctx: MaturityEffectContext): void;
  /** 成熟后每回合特效: 作物处于 Grown 状态时每个回合执行 (多数作物不声明, 如香菇扩散) */
  grownUpdate?(ctx: GrownEffectContext): void;
  /** 生长特效: 生长中每个回合执行 (多数作物不声明) */
  growUpdate?(ctx: GrowthEffectContext): void;

  /**
   * 实际生长周期: 返回种植在该地块上的实际回合数。
   * 默认按种植地块的 growthFactor 计算 (沙地 ×3 向下取整)。
   * 需要特殊周期计算的作物重写此函数 (如香菇按场上数量)。
   */
  growCycles(tile: Tile, _world: WorldState): number {
    return Math.floor(this.growCyclesBase * TILES[tile.type].growthFactor);
  }
}
