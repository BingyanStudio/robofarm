// 土地: 默认地块, 可种大多数作物; 生长周期 ×1 (基类默认值)。
// 拥有"沙漠化"机制: 收获作物时若周围有沙地则本格转化为沙地 (onCropHarvested 回调)。
import { TileType } from '../types';
import type { TileCropEventContext } from '../types';
import { orthNeighbors } from '../maps';
import { BaseTile } from './base';

export class Soil extends BaseTile {
  readonly type = TileType.Soil;
  readonly name = '土地';
  readonly sprite = 'grass';
  readonly spriteWithCrop = 'field';
  readonly color = '#b08d57';

  /**
   * 沙漠化: 收获作物时, 若该格上下左右存在沙地, 则该格转化为沙地。
   * (仅蚕食土地, 不影响水池等地块; 回调只会在土地自身触发时执行)
   */
  onCropHarvested({ world, pos }: TileCropEventContext): void {
    for (const [nx, ny] of orthNeighbors(pos, world)) {
      if (world.map[ny][nx].type === TileType.Sand) {
        world.map[pos[1]][pos[0]] = { type: TileType.Sand, crop: null };
        return;
      }
    }
  }
}
