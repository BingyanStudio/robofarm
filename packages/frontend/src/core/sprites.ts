// Sprite loading and rendering helpers. Sprites live in public/sprites/ (see agent/SPRITE.md):
// - Drones: drone.svg / drone_enemy.svg (body + propeller) + drone_eyes.svg (eyes)
// - Tiles: loaded via the TILES registry's sprite/spriteWithCrop names (grass/field/water/sand/sand_field)
// - Crops: crop/<type>_<n>.avif, square, fill one cell, index 0..n = growth stages
import { CropState, CropType, cropConfig, TILES } from '@robofarm/shared';

export interface Sprites {
  drone: HTMLImageElement | null;
  droneEnemy: HTMLImageElement | null;
  droneEyes: HTMLImageElement | null;
  /** Tile sprites: keys are the sprite / spriteWithCrop names in the TILES registry */
  tiles: Record<string, HTMLImageElement | null>;
  /** Per-crop growth stage sprites (0-based index, mapping to <type>_1.._n) */
  crops: Partial<Record<CropType, HTMLImageElement[]>>;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // missing image does not block; renderer falls back to procedural draw
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

/** Load all sprites (module-level cache, shared across screens) */
export function loadSprites(): Promise<Sprites> {
  if (!cache) {
    cache = (async () => {
      const [drone, droneEnemy, droneEyes] = await Promise.all([
        loadImage('/sprites/drone.svg'),
        loadImage('/sprites/drone_enemy.svg'),
        loadImage('/sprites/drone_eyes.svg'),
      ]);
      // Drive tile sprites from the registry: adding a tile type auto-loads its sprite (missing sprite falls back to procedural draw).
      const names = new Set<string>();
      for (const cfg of Object.values(TILES)) {
        names.add(cfg.sprite);
        names.add(cfg.spriteWithCrop);
      }
      const entries = await Promise.all(
        [...names].map(async (name) => [name, await loadImage(`/sprites/${name}.svg`)] as const)
      );
      const tiles: Sprites['tiles'] = {};
      for (const [name, img] of entries) tiles[name] = img;
      // Drive from the registry: adding a crop (CropType) auto-loads its sprite (missing sprite falls back to procedural draw).
      const crops: Sprites['crops'] = {};
      await Promise.all(
        Object.values(CropType).map(async (type) => {
          crops[type] = await loadCropStages(type);
        })
      );
      return { drone, droneEnemy, droneEyes, tiles, crops };
    })();
  }
  return cache;
}

/**
 * Compute the growth-stage sprite index a crop should use (0-based).
 * Growth progress = (growCycles - remaining) / (growCycles - 1), mapped only onto
 * stage sprites except the last one —— the last (mature) is used only when state == Grown.
 * Thirsty and Growing share the same progress formula (the snapshot carries the remaining
 * cycles at pause time), so after watering restores growth the sprite stays continuous and
 * never jumps back to a mid placeholder stage.
 */
export function cropStageIndex(
  state: CropState,
  cyclesToGrown: number,
  growCycles: number,
  stages: number
): number {
  const n = Math.max(1, stages);
  if (state === CropState.Grown) return n - 1;
  // In old replay data the Thirsty cyclesToGrown is 0, degrading to a mid-stage placeholder.
  if (state === CropState.Thirsty && cyclesToGrown <= 0) {
    return Math.min(n - 1, Math.max(0, Math.floor(n / 2)));
  }
  const total = Math.max(1, growCycles);
  const remaining = Math.max(1, Math.min(total, cyclesToGrown));
  const progress = (total - remaining) / Math.max(1, total - 1); // 0 just planted → 1 about to mature
  return Math.max(0, Math.min(n - 2, Math.floor(progress * Math.max(1, n - 1))));
}

/** Whether a crop's growth-stage sprites have been loaded */
export function hasCropSprites(sprites: Sprites | null, type: CropType): boolean {
  return !!sprites && !!sprites.crops[type] && sprites.crops[type]!.length > 0;
}

/** Number of grow cycles a crop has (used for stage sprite rendering). */
export function growCyclesOf(type: CropType): number {
  return cropConfig(type).growCycles;
}
