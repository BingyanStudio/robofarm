// 土地: 默认地块, 可种大多数作物; 生长周期 ×1 (基类默认值)。
import { TileType } from '../types';
import { BaseTile } from './base';

export class Soil extends BaseTile {
  readonly type = TileType.Soil;
  readonly name = '土地';
  readonly sprite = 'grass';
  readonly spriteWithCrop = 'field';
  readonly color = '#b08d57';
}
