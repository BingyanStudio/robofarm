// 沙地: 种植时生长周期 ×1.5 (growthFactor 重写); 收获时易沙漠化 (引擎语义)。
import { TileType } from '../types';
import { BaseTile } from './base';

export class Sand extends BaseTile {
  readonly type = TileType.Sand;
  readonly name = '沙地';
  readonly growthFactor = 1.5;
  readonly sprite = 'sand';
  readonly spriteWithCrop = 'sand_field';
  readonly color = '#d8c07c';
}
