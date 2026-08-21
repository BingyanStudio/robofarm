// 盐碱地: 盐碱化的产物 (土地肥力超过上限时转化)。种植时生长周期 ×1.5,
// 浇水次数 ×2; 不可取水。
import { TileType } from '../types';
import { BaseTile } from './base';

export class Salt extends BaseTile {
  readonly type = TileType.Salt;
  readonly name = '盐碱地';
  readonly growthFactor = 1.5;
  readonly thirstFactor = 2;
  readonly sprite = 'salt';
  readonly spriteWithCrop = 'salt_field';
  readonly color = '#c7c9b8';
}
