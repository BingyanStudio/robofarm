// 地图定义与生成。
// 单人种植: 7x7, 出生点 (3,3)。
// 竞技模式: 14x7, 左半 7x7 与单人种植相同, 右半为左半的镜像;
//           P1 出生在左半 (3,2)(3,4), P2 出生在镜像位置。
// 竞技模式下双方各自以本地坐标系编程 (P2 的世界为镜像), 因此地图必须关于
// 中轴 (x = 6.5) 镜像对称 —— 这是构建地图时的约束, 不要破坏。
import {
  CropData,
  DroneState,
  PlayerState,
  Position,
  Tile,
  TileType,
  WorldState,
} from './types';
import { START_MONEY } from './config';

export const SINGLE_WIDTH = 7;
export const SINGLE_HEIGHT = 7;
export const COMBAT_WIDTH = 14;
export const COMBAT_HEIGHT = 7;

/** 单人地图上的水池位置 */
const SINGLE_WATER_TILES: Position[] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [4, 4],
  [4, 5],
  [5, 4],
  [5, 5],
];

/** 单人地图上的沙地区域: [左上 x, 左上 y, 右下 x, 右下 y], 水池优先于沙地 */
const SINGLE_SAND_REGIONS: [number, number, number, number][] = [
  [0, 0, 6, 1],
  [0, 2, 2, 3],
];

/** 单人地图出生点 */
const SINGLE_SPAWNS: Position[] = [[3, 3]];

/** 竞技模式 P1 出生点 (左半) */
const COMBAT_SPAWNS_P1: Position[] = [
  [3, 2],
  [3, 4],
];

/**
 * 沿水平中轴镜像坐标。竞技模式 P2 的本地坐标系 = 绝对坐标的镜像。
 * width 必须为偶数 (14), 镜像后左右半场互换。
 */
export function mirrorPosition(pos: Position, width: number): Position {
  return [width - 1 - pos[0], pos[1]];
}

function emptyTile(type: TileType): Tile {
  return { type, crop: null };
}

function buildMap(width: number, height: number): Tile[][] {
  const map: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) row.push(emptyTile(TileType.Soil));
    map.push(row);
  }
  return map;
}

function isWaterAt(map: Tile[][], pos: Position): boolean {
  return map[pos[1]][pos[0]].type === TileType.Water;
}

/** 铺设单人地图左半的地形: 水池优先, 其次是沙地区域 (只覆盖土地) */
function applyLandscape(map: Tile[][]): void {
  for (const [x, y] of SINGLE_WATER_TILES) map[y][x] = emptyTile(TileType.Water);
  for (const [x1, y1, x2, y2] of SINGLE_SAND_REGIONS) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (map[y][x].type === TileType.Soil) map[y][x] = emptyTile(TileType.Sand);
      }
    }
  }
}

export function createSingleWorld(maxTurns: number): WorldState {
  const map = buildMap(SINGLE_WIDTH, SINGLE_HEIGHT);
  applyLandscape(map);
  const spawn = SINGLE_SPAWNS[0];
  const drone: DroneState = {
    id: 0,
    player: 0,
    position: [spawn[0], spawn[1]],
    water: 0,
    energy: 0,
    bounty: 0,
    interceptTarget: null,
    interceptZone: null,
  };
  const players: PlayerState[] = [{ id: 0, money: START_MONEY, alive: true }];
  return { mode: 'single', map, drones: [drone], players, turn: 0, maxTurns };
}

export function createCombatWorld(maxTurns: number): WorldState {
  const map = buildMap(COMBAT_WIDTH, COMBAT_HEIGHT);
  // 左半与单人地图相同 (含沙地)
  applyLandscape(map);
  // 右半为左半的镜像
  for (let y = 0; y < SINGLE_HEIGHT; y++) {
    for (let x = 0; x < SINGLE_WIDTH; x++) {
      const [mx, my] = mirrorPosition([x, y], COMBAT_WIDTH);
      map[my][mx] = emptyTile(map[y][x].type);
    }
  }
  const drones: DroneState[] = [];
  const spawnsP2 = COMBAT_SPAWNS_P1.map((p) => mirrorPosition(p, COMBAT_WIDTH));
  const spawns = [...COMBAT_SPAWNS_P1, ...spawnsP2];
  spawns.forEach((pos, i) => {
    drones.push({
      id: i,
      player: i < 2 ? 0 : 1,
      position: [pos[0], pos[1]],
      water: 0,
      energy: 0,
      bounty: 0,
      interceptTarget: null,
      interceptZone: null,
    });
  });
  const players: PlayerState[] = [
    { id: 0, money: START_MONEY, alive: true },
    { id: 1, money: START_MONEY, alive: true },
  ];
  return { mode: 'combat', map, drones, players, turn: 0, maxTurns };
}

/**
 * 判断某坐标是否属于某玩家的半场。
 * 单人种植: 处处都是自己的半场。
 * 竞技模式: P1 半场为绝对坐标 x < width/2, P2 半场为 x >= width/2
 * (P2 本地坐标中的"左半"对应绝对坐标的右半)。
 */
export function isOwnHalfAt(world: WorldState, player: number, pos: Position): boolean {
  if (world.mode !== 'combat') return true;
  const half = world.map[0].length / 2;
  return player === 0 ? pos[0] < half : pos[0] >= half;
}

/** 判断无人机当前是否位于自己的半场 */
export function isOwnHalf(world: WorldState, drone: DroneState): boolean {
  return isOwnHalfAt(world, drone.player, drone.position);
}

export function inBounds(world: WorldState, pos: Position): boolean {
  return (
    pos[0] >= 0 && pos[0] < world.map[0].length && pos[1] >= 0 && pos[1] < world.map.length
  );
}

export function tileAt(world: WorldState, pos: Position): Tile {
  return world.map[pos[1]][pos[0]];
}

export function samePos(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** 供测试/调试使用的辅助: 在当前地块种植作物 */
export function placeCrop(world: WorldState, pos: Position, crop: CropData): void {
  world.map[pos[1]][pos[0]].crop = crop;
}

export function isWater(world: WorldState, pos: Position): boolean {
  return isWaterAt(world.map, pos);
}
