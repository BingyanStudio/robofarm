// 水仙: 功能性作物, 为周围的作物提供缓慢的浇水支持。
// 特殊效果 (growUpdate) 直接定义在本文件, 引擎直接调用。
import { CropState, CropType, Tile, TileType } from '../types';
import type { GrowthEffectContext } from '../types';
import { TILES } from '../registry';
import { BaseCrop } from './base';

export class Daffodil extends BaseCrop {
  readonly type = CropType.Daffodil;
  readonly name = '水仙';
  readonly description = '功能性作物, 为周围的作物提供缓慢的浇水支持。';
  readonly plantCost = 150;
  readonly value = 100;
  readonly growCyclesBase = 80;
  readonly thirstInterval = null; // 无需浇水
  readonly color = '#f2d24b';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Water;
  }

  /**
   * 生长中每回合按 上→右→下→左 顺序检查周围 Tile,
   * 若存在缺水作物则自动浇水 (每回合仅浇水一次), 成熟后无此效果。
   * 浇水效果与普通 Water 一致 (前端渲染淡蓝色特效)。
   */
  growUpdate({ world, pos, events }: GrowthEffectContext): void {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = pos[0] + dx;
      const ny = pos[1] + dy;
      if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) continue;
      const tile = world.map[ny][nx];
      const nb = tile.crop;
      if (!nb || nb.state !== CropState.Thirsty) continue;
      nb.state = CropState.Growing;
      // 自动浇水同样触发目标地块的"作物浇水"回调
      TILES[tile.type].onCropWatered?.({ world, pos: [nx, ny], crop: nb, events });
      events.push({ type: 'water', drone: -1, pos: [nx, ny] });
      return; // 每回合仅浇水一次
    }
  }
}
