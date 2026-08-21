// 香菇: 成熟后按 [上右下左] 顺序扩散 4 株; 场上香菇越多生长越慢。
// 全部机制 (成熟特效 onGrown / 成熟后每回合扩散 grownUpdate / 动态周期 growCycles 重写)
// 都定义在本文件, 引擎只负责在对应时机调用回调。
import { CropState, CropType, Position, Tile, TileType, WorldState } from '../types';
import type { GameEvent, GrownEffectContext, MaturityEffectContext } from '../types';
import { TILES } from '../registry';
import { pickThirstPoints, plantingSeed } from '../rng';
import { BaseCrop } from './base';

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

export class Shiitake extends BaseCrop {
  readonly type = CropType.Shiitake;
  readonly name = '香菇';
  readonly description = '成熟后, 每回合按照 [上右下左] 顺序种下新的香菇，一共四颗。但场上香菇越多，香菇生长越慢。';
  readonly plantCost = 80;
  readonly value = 40;
  readonly growCyclesBase = 20;
  readonly thirstInterval = 20; // 实际周期按场上香菇数动态计算, 缺水次数随之增减
  readonly color = '#c0846a';

  canPlant(tile: Tile): boolean {
    return tile.type === TileType.Soil;
  }

  /** 成熟特效: 进入扩散期, 之后每回合按上右下左顺序扩散 1 株 (共 4 次) */
  onGrown({ crop }: MaturityEffectContext): void {
    crop.spreadLeft = 4;
  }

  /** 成熟后每回合按 上→右→下→左 顺序扩散 1 株小香菇, spreadLeft 到 0 停止 */
  grownUpdate({ world, pos, crop, events }: GrownEffectContext): void {
    if (!crop.spreadLeft || crop.spreadLeft <= 0) return;
    this.spawnShiitake(world, pos, 4 - crop.spreadLeft, events);
    crop.spreadLeft -= 1;
  }

  /** 动态生长周期: 基础 20 + 2 × 场上香菇总数 (忽略地块倍率, 香菇只长在土地) */
  growCycles(_tile: Tile, world: WorldState): number {
    return this.growCyclesBase + 2 * countShiitake(world);
  }

  /**
   * 按方向序号 (0=上, 1=右, 2=下, 3=左) 在邻格种下一株新的香菇
   * (地块需为空且为土地; 越界或不可种植则放弃该方向)。
   */
  private spawnShiitake(world: WorldState, pos: Position, dirIndex: number, events: GameEvent[]): void {
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
    const [dx, dy] = dirs[dirIndex] ?? [0, 0];
    const nx = pos[0] + dx;
    const ny = pos[1] + dy;
    if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) return;
    const tile = world.map[ny][nx];
    if (tile.crop || tile.type !== TileType.Soil) return;
    // 扩散出的香菇同样按场上香菇总数动态计算生长周期 (本类重写的 growCycles),
    // 缺水时机同样确定性随机 (种子含位置/回合)
    const cycles = this.growCycles(tile, world);
    tile.crop = {
      type: CropType.Shiitake,
      state: CropState.Growing,
      growthRemaining: cycles,
      thirstAt: pickThirstPoints(
        plantingSeed(world, [nx, ny], CropType.Shiitake, -1),
        cycles,
        this.thirstCount(tile, world)
      ),
      thirstsDone: 0,
    };
    // 扩散种下同样触发地块的"作物种下"回调
    TILES[tile.type].onCropPlanted?.({ world, pos: [nx, ny], crop: tile.crop, events });
    events.push({ type: 'plant', drone: -1, pos: [nx, ny], crop: CropType.Shiitake });
  }
}
