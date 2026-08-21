// 荷花: 水生植物, 让水池也成为盈利点。
import { CropType, Tile, TileType } from '../types';
import { BaseCrop } from './base';

export class Lotus extends BaseCrop {
  readonly type = CropType.Lotus;
  readonly name = '荷花';
  readonly description = '水生植物，让水池也成为盈利点。';
  readonly plantCost = 30;
  readonly value = 90;
  readonly growCyclesBase = 40;
  readonly thirstCountBase = 0; // 无需浇水
  readonly color = '#f48fb1';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Water;
  }
}
