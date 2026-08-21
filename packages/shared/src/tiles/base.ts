// 地块基类: 每种地块一个文件, 继承 BaseTile 并填写自己的属性。
// 与作物基类 (crops/base.ts) 同构: 通用字段带默认值 (canCollectWater=false,
// growthFactor=1, thirstFactor=1), 特殊地块按需重写 (水池取水, 沙地生长 ×3,
// 盐碱地生长 ×1.5 且浇水次数 ×2)。
// 作物生命周期回调 (onCropPlanted / onCropWatered / onCropHarvested) 也定义在此,
// 引擎在对应时机直接调用, 无需 if 硬编码。
import { TileType } from '../types';
import type { TileCropEventContext } from '../types';
import type { TileTypeConfig } from '../registry';

export abstract class BaseTile implements TileTypeConfig {
  abstract readonly type: TileType;
  abstract readonly name: string;
  /** 无人机能否在该地块取水 (默认否, 水池重写为 true) */
  readonly canCollectWater: boolean = false;
  /** 种植在该地块上的生长周期倍率 (默认 ×1, 沙地重写为 ×3 / 盐碱地 ×1.5; BaseCrop.growCycles() 消费) */
  readonly growthFactor: number = 1;
  /** 种植在该地块上的浇水次数倍率 (默认 ×1, 盐碱地重写为 ×2; BaseCrop.thirstCount() 消费) */
  readonly thirstFactor: number = 1;
  /** 无作物时的地块贴图名 (public/sprites/<name>.svg) */
  abstract readonly sprite: string;
  /** 有作物时的地块贴图名 */
  abstract readonly spriteWithCrop: string;
  /** 无贴图时程序化绘制的底色 */
  abstract readonly color: string;

  /** 作物种下时执行 (多数地块不声明) */
  onCropPlanted?(ctx: TileCropEventContext): void;
  /** 作物浇水时执行 (多数地块不声明) */
  onCropWatered?(ctx: TileCropEventContext): void;
  /** 作物收获时执行 (如土地的沙漠化) */
  onCropHarvested?(ctx: TileCropEventContext): void;
}
