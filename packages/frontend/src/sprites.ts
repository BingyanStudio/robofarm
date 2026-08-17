// 贴图加载与渲染辅助。贴图位于 public/sprites/ (见 agent/SPRITE.md):
// - 无人机: drone.svg / drone_enemy.svg (机身+螺旋桨) + drone_eyes.svg (眼睛)
// - 地块: grass.svg (无作物土地) / field.svg (有作物土地) / water.svg (水池)
// - 作物: crop/<type>_<n>.avif, 正方形, 铺满一格, 下标从小到大为生长阶段
import { CropState, CropType, cropConfig } from '@robofarm/shared';

export interface Sprites {
  drone: HTMLImageElement | null;
  droneEnemy: HTMLImageElement | null;
  droneEyes: HTMLImageElement | null;
  grass: HTMLImageElement | null;
  field: HTMLImageElement | null;
  water: HTMLImageElement | null;
  /** 各作物的生长阶段贴图 (下标 0 基, 对应 <type>_1.._n) */
  crops: Partial<Record<CropType, HTMLImageElement[]>>;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 缺图不阻塞, 渲染器回退到程序化绘制
    img.src = src;
  });
}

async function loadCropStages(type: CropType): Promise<HTMLImageElement[]> {
  const stages: HTMLImageElement[] = [];
  for (let i = 1; i <= 8; i++) {
    const img = await loadImage(`/sprites/crop/${type}_${i}.avif`);
    if (!img) break;
    stages.push(img);
  }
  return stages;
}

let cache: Promise<Sprites> | null = null;

/** 加载全部贴图 (模块级缓存, 各界面复用) */
export function loadSprites(): Promise<Sprites> {
  if (!cache) {
    cache = (async () => {
      const [drone, droneEnemy, droneEyes, grass, field, water] = await Promise.all([
        loadImage('/sprites/drone.svg'),
        loadImage('/sprites/drone_enemy.svg'),
        loadImage('/sprites/drone_eyes.svg'),
        loadImage('/sprites/grass.svg'),
        loadImage('/sprites/field.svg'),
        loadImage('/sprites/water.svg'),
      ]);
      // 从注册表驱动: 新增作物 (CropType) 后自动加载其贴图 (缺图自动回退程序化绘制)
      const crops: Sprites['crops'] = {};
      await Promise.all(
        Object.values(CropType).map(async (type) => {
          crops[type] = await loadCropStages(type);
        })
      );
      return { drone, droneEnemy, droneEyes, grass, field, water, crops };
    })();
  }
  return cache;
}

/**
 * 计算作物应使用的生长阶段贴图下标 (0 基)。
 * 生长进度 = (growCycles - 剩余) / (growCycles - 1), 仅映射到除最后一张外的
 * 阶段贴图 —— 最后一张 (成熟态) 只在 state == Grown 时使用。
 * Thirsty 与 Growing 共用同一进度公式 (快照携带暂停时的剩余回合数),
 * 因此浇水恢复生长后贴图连续, 不再跳回中间占位阶段。
 */
export function cropStageIndex(
  state: CropState,
  cyclesToGrown: number,
  growCycles: number,
  stages: number
): number {
  const n = Math.max(1, stages);
  if (state === CropState.Grown) return n - 1;
  // 旧回放数据中 Thirsty 的 cyclesToGrown 为 0, 退化为中间阶段占位
  if (state === CropState.Thirsty && cyclesToGrown <= 0) {
    return Math.min(n - 1, Math.max(0, Math.floor(n / 2)));
  }
  const total = Math.max(1, growCycles);
  const remaining = Math.max(1, Math.min(total, cyclesToGrown));
  const progress = (total - remaining) / Math.max(1, total - 1); // 0 刚种下 → 1 即将成熟
  return Math.max(0, Math.min(n - 2, Math.floor(progress * Math.max(1, n - 1))));
}

/** 某作物是否已加载生长阶段贴图 */
export function hasCropSprites(sprites: Sprites | null, type: CropType): boolean {
  return !!sprites && !!sprites.crops[type] && sprites.crops[type]!.length > 0;
}

/** 作物生长周期数 (渲染阶段贴图用) */
export function growCyclesOf(type: CropType): number {
  return cropConfig(type).growCycles;
}
