// 水池: 唯一可取水的地块 (canCollectWater 重写为 true); 只可种水生作物。
import { TileType } from '../types';
import { BaseTile } from './base';

export class Water extends BaseTile {
  readonly type = TileType.Water;
  readonly name = '水池';
  readonly canCollectWater = true;
  readonly sprite = 'water';
  readonly spriteWithCrop = 'water';
  readonly color = '#6fb7dd';
}
