// 作物基类: 每种作物一个文件, 继承 BaseCrop 并填写自己的属性。
// 实际生长周期默认由基类的 growCycles() 计算 (按种植地块的 growthFactor,
// 沙地 ×3 向下取整), 需要特殊周期计算的作物重写 growCycles()
// (如香菇: 20 + 2 × 场上香菇总数)。
// 种植判定 (canPlant) 与肥力消耗 (fertilityCost) 也在此声明, 由子类实现/覆盖。
import { CropType, Tile, WorldState } from '../types';
import type { GrownEffectContext, GrowthEffectContext, MaturityEffectContext } from '../types';
import type { CropTypeConfig } from '../registry';
import { TILES } from '../registry';

export abstract class BaseCrop implements CropTypeConfig {
  abstract readonly type: CropType;
  abstract readonly name: string;
  abstract readonly description: string;
  /**
   * 是否可以种植在指定地块上: 由子类实现 (基类不判断), 检查 Tile 类型
   * (如 Lotus 只种在水池) 以及需要时的肥力等条件。
   */
  abstract canPlant(tile: Tile): boolean;
  /**
   * 肥力消耗: 收获时若脚下是土地则扣除该值 (负数 = 为土地恢复肥力)。
   * 基类默认 0, 子类按需覆盖。
   */
  readonly fertilityCost: number = 0;
  abstract readonly plantCost: number;
  abstract readonly value: number;
  /** 基准生长周期 (土地上的回合数; 前端贴图进度也用它) */
  abstract readonly growCyclesBase: number;
  /** 基准总缺水次数 (土地上的次数, 0 = 无需浇水); 缺水时机种植时随机选取 */
  abstract readonly thirstCountBase: number;
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

  /**
   * 总缺水次数: 默认 thirstCountBase × 地块浇水倍率 (盐碱地 ×2)。子类可按需重写。
   */
  thirstCount(tile: Tile, _world: WorldState): number {
    return this.thirstCountBase * TILES[tile.type].thirstFactor;
  }
}
