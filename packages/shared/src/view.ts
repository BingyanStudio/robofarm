// 从绝对坐标世界状态构建玩家本地坐标系的视图。
// 竞技模式下 P2 的 frame 为 'mirror': 所有位置做水平镜像,
// 使双方都以"自己的半场在左侧"的同一个坐标系编程。
// 这是前后端执行结果一致性的关键: 双方无论在前端本地还是后端执行,
// 都调用同一个 buildPlayerView。
import {
  DroneInfo,
  Frame,
  PlayerView,
  Position,
  TileInfo,
  WorldState,
} from './types';
import { cropInfo } from './registry';
import { mirrorPosition, samePos } from './maps';

/** 将绝对坐标转换为玩家本地坐标 */
export function toLocal(pos: Position, width: number, frame: Frame): Position {
  return frame === 'mirror' ? mirrorPosition(pos, width) : pos;
}

/** 将玩家本地坐标转换为绝对坐标 */
export function fromLocal(pos: Position, width: number, frame: Frame): Position {
  return frame === 'mirror' ? mirrorPosition(pos, width) : pos;
}

/**
 * 构建某玩家某架无人机的本地视图。
 * @param playerIndex 玩家下标
 * @param droneIndex  该玩家第几架无人机 (即 run(droneId) 的 droneId)
 */
export function buildPlayerView(
  world: WorldState,
  playerIndex: number,
  droneIndex: number,
  frame: Frame
): PlayerView {
  const width = world.map[0].length;
  const height = world.map.length;

  const tiles: TileInfo[][] = [];
  for (let ly = 0; ly < height; ly++) {
    const row: TileInfo[] = [];
    for (let lx = 0; lx < width; lx++) {
      const abs = fromLocal([lx, ly], width, frame);
      const tile = world.map[abs[1]][abs[0]];
      row.push({
        type: tile.type,
        hasCrop: tile.crop !== null,
        fertility: tile.fertility,
        crop: tile.crop
          ? cropInfo(tile.crop.type, tile.crop.state, tile.crop.growthRemaining)
          : null,
      });
    }
    tiles.push(row);
  }

  // 本地无人机编号: 自己的无人机为 0..N-1 (即 run(droneId) 的 droneId);
  // 对方的无人机显示其真实全局 id (如竞技模式 P2 的无人机为 2, 3)
  const ownDrones = world.drones.filter((d) => d.player === playerIndex);
  const enemyDrones = world.drones.filter((d) => d.player !== playerIndex);
  const drones: DroneInfo[] = [];
  for (const d of ownDrones) {
    const idx = ownDrones.indexOf(d);
    drones.push({
      id: idx,
      position: toLocal(d.position, width, frame),
      water: d.water,
      energy: d.energy,
      isOpponent: false,
      bounty: d.bounty,
    });
  }
  for (const d of enemyDrones) {
    drones.push({
      id: d.id,
      position: toLocal(d.position, width, frame),
      water: d.water,
      energy: d.energy,
      isOpponent: true,
      bounty: d.bounty,
    });
  }

  const selfDrone = ownDrones[droneIndex];
  const self: DroneInfo = {
    id: droneIndex,
    position: toLocal(selfDrone.position, width, frame),
    water: selfDrone.water,
    energy: selfDrone.energy,
    isOpponent: false,
    bounty: selfDrone.bounty,
  };

  return {
    mode: world.mode,
    turn: world.turn + 1,
    maxTurns: world.maxTurns,
    map: { width, height, tiles },
    drones,
    self,
    money: world.players[playerIndex].money,
  };
}

/** 生成可序列化的回合结束快照 (绝对坐标), 用于渲染与回放 */
export function snapshotOf(world: WorldState) {
  return {
    mode: world.mode,
    // 快照在 step() 中 world.turn += 1 之后生成, 此时 world.turn 即刚完成的回合号
    turn: world.turn,
    maxTurns: world.maxTurns,
    map: world.map.map((row) =>
      row.map((tile) => ({
        type: tile.type,
        fertility: tile.fertility,
        crop: tile.crop
          ? cropInfo(tile.crop.type, tile.crop.state, tile.crop.growthRemaining)
          : null,
      }))
    ),
    drones: world.drones.map((d) => ({
      id: d.id,
      player: d.player,
      position: [d.position[0], d.position[1]] as Position,
      water: d.water,
      energy: d.energy,
      bounty: d.bounty,
      interceptTarget: d.interceptTarget ? ([d.interceptTarget[0], d.interceptTarget[1]] as Position) : null,
    })),
    players: world.players.map((p) => ({ id: p.id, money: p.money, alive: p.alive })),
  };
}

/** 供 getDrone / getTile / getCrop 使用的越界安全查询 */
export function findDroneAt(world: WorldState, pos: Position): number | null {
  for (const d of world.drones) if (samePos(d.position, pos)) return d.id;
  return null;
}
