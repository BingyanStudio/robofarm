// 土地: 默认地块, 拥有"肥力"属性与沙漠化/盐碱化机制。
// 收获作物时扣除作物的肥力消耗 (负数 = 恢复肥力):
// - 肥力被扣到 < 0 → 沙漠化 (转为沙地)
// - 肥力被增加到 > 上限 → 盐碱化 (转为盐碱地)
// 全部机制在 onCropHarvested 回调中实现, 引擎只负责触发。
import { TileType } from '../types';
import type { TileCropEventContext } from '../types';
import { cropConfig } from '../registry';
import { MAX_TILE_FERTILITY } from '../config';
import { BaseTile } from './base';

export class Soil extends BaseTile {
  readonly type = TileType.Soil;
  readonly name = '土地';
  readonly sprite = 'grass';
  readonly spriteWithCrop = 'field';
  readonly color = '#b08d57';

  /**
   * 收获时扣除作物的肥力消耗 (fertilityCost, 负数表示增加肥力),
   * 并据此判定沙漠化 (< 0 → 沙地) 或盐碱化 (> 上限 → 盐碱地)。
   */
  onCropHarvested({ world, pos, crop }: TileCropEventContext): void {
    const tile = world.map[pos[1]][pos[0]];
    const cost = cropConfig(crop.type).fertilityCost;
    const fertility = (tile.fertility ?? 0) - cost;
    if (fertility < 0) {
      world.map[pos[1]][pos[0]] = { type: TileType.Sand, crop: null };
    } else if (fertility > MAX_TILE_FERTILITY) {
      world.map[pos[1]][pos[0]] = { type: TileType.Salt, crop: null };
    } else {
      tile.fertility = fertility;
    }
  }
}
