// 西瓜: 高价值作物, 需要合理规划浇水, 收获时消耗 3 点土地肥力 (最耗肥)。
// 沙地受 3 倍减速 (与基类默认 growCycles 一致, 无特殊周期)。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class Melon extends BaseCrop {
  readonly type = CropType.Melon;
  readonly name = '西瓜';
  readonly description = '一种高价值作物, 需要合理规划浇水。';
  readonly fertilityCost = 3; // 最耗肥的作物
  readonly plantCost = 1000;
  readonly value = 1800;
  readonly growCyclesBase = 100;
  readonly thirstInterval = 15; // 生长中缺水 6 次 (沙地 ×3 时 20 次)
  readonly color = '#66bb6a';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil || tile.type === TileType.Sand;
  }
}
