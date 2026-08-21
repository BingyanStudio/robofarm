// 香菇: 成熟后按 [上右下左] 顺序扩散 4 株; 场上香菇越多生长越慢。
// 特殊效果 (onMature: selfSpread) 与动态生长周期 (plantCycles) 都定义在本文件。
import { CropType, TileType, WorldState } from '../types';
import type { CropTypeConfig } from '../registry';

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

export const shiitake: CropTypeConfig = {
  type: CropType.Shiitake,
  name: '香菇',
  description: '成熟后, 每回合按照 [上右下左] 顺序种下新的香菇，一共四颗。但场上香菇越多，香菇生长越慢。',
  habitats: [TileType.Soil],
  plantCost: 80,
  value: 40,
  growCycles: 20,
  thirstInterval: 20, // 实际周期按场上香菇数动态计算, 缺水次数随之增减
  color: '#c0846a',
  /** 成熟特效: 进入扩散期, 之后每回合按上右下左顺序扩散 1 株 (共 4 次) */
  onMature({ crop }) {
    crop.spreadLeft = 4;
  },
  /** 动态生长周期: 基础 20 + 2 × 场上香菇总数 */
  plantCycles(world) {
    return 20 + 2 * countShiitake(world);
  },
};
