// 紫云英: 绿肥植物, 生长时加速周围作物的生长。
// 特殊效果 (onGrow: accelerateNeighbors) 直接定义在本文件, 引擎直接调用,
// 不再依赖 engine.ts 里的 GROWTH_EFFECTS 字典。
import { CropState, CropType, TileType } from '../types';
import type { CropTypeConfig } from '../registry';

export const milkVetch: CropTypeConfig = {
  type: CropType.MilkVetch,
  name: '紫云英',
  description: '绿肥植物，生长时会加速周围作物的生长。',
  habitats: [TileType.Soil, TileType.Sand],
  plantCost: 100,
  value: 120,
  growCycles: 160,
  thirstInterval: 40, // 生长中缺水 4 次
  color: '#7e9be8',
  /**
   * 生长中每回合按 上→右→下→左 顺序检查周围 Tile,
   * 若有作物且不缺水 (Growing) 且距离成熟剩余 >= 2 周期, 则其生长时间 -1 周期。
   */
  onGrow({ world, pos }) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = pos[0] + dx;
      const ny = pos[1] + dy;
      if (nx < 0 || nx >= world.map[0].length || ny < 0 || ny >= world.map.length) continue;
      const nb = world.map[ny][nx].crop;
      if (!nb || nb.state !== CropState.Growing) continue; // 缺水 (Thirsty) 的作物不加速
      if (nb.growthRemaining < 2) continue; // 距成熟不足 2 周期不加速
      nb.growthRemaining -= 1;
    }
  },
};
