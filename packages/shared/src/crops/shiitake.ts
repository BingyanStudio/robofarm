// 香菇: 成熟后按 [上右下左] 顺序扩散 4 株; 场上香菇越多生长越慢。
// 特殊效果 (onMature) 与动态生长周期 (growCycles 重写) 都定义在本文件。
import { CropType, Tile, TileType, WorldState } from '../types';
import type { MaturityEffectContext } from '../types';
import { BaseCrop } from './base';

/** 场上香菇总数 (用于动态生长周期, 种植/扩散时按当时场上数量计算) */
function countShiitake(world: WorldState): number {
  let count = 0;
  for (const row of world.map) {
    for (const t of row) {
      if (t.crop?.type === CropType.Shiitake) count++;
    }
  }
  return count;
}

export class Shiitake extends BaseCrop {
  readonly type = CropType.Shiitake;
  readonly name = '香菇';
  readonly description = '成熟后, 每回合按照 [上右下左] 顺序种下新的香菇，一共四颗。但场上香菇越多，香菇生长越慢。';
  readonly habitats = [TileType.Soil];
  readonly plantCost = 80;
  readonly value = 40;
  readonly growCyclesBase = 20;
  readonly thirstInterval = 20; // 实际周期按场上香菇数动态计算, 缺水次数随之增减
  readonly color = '#c0846a';

  /** 成熟特效: 进入扩散期, 之后每回合按上右下左顺序扩散 1 株 (共 4 次) */
  onMature({ crop }: MaturityEffectContext): void {
    crop.spreadLeft = 4;
  }

  /** 动态生长周期: 基础 20 + 2 × 场上香菇总数 (忽略地块倍率, 香菇只长在土地) */
  growCycles(_tile: Tile, world: WorldState): number {
    return this.growCyclesBase + 2 * countShiitake(world);
  }
}
