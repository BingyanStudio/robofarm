// 确定性伪随机工具: 用于种植时随机选取作物缺水时机。
// 基础随机性来自**游戏开始时随机取得的种子** (WorldState.rngSeed, 对玩家不可预测,
// 避免把随机机制硬编码进代码), 再叠加 (玩家/位置/作物/回合) 使同一局内各次种植
// 互不相同; 该种子计入回放文件, 回放时用同一种子重推演, 保证过程与结果一致。
import { CropType, Position, WorldState } from './types';

/** mulberry32: 轻量确定性 PRNG, 相同种子产生相同序列 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 种植用随机种子: 由 (本局随机种子, 玩家, 位置, 作物, 回合) 稳定派生 (FNV-1a 哈希) */
export function plantingSeed(world: WorldState, pos: Position, crop: CropType, player: number): number {
  const s = `${world.rngSeed}|${player}|${pos[0]}|${pos[1]}|${crop}|${world.turn}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 从 [1, cycles-1] 中确定性随机选取 n 个缺水触发点 (按剩余回合数降序)。
 * 随机只改变缺水时机, 不改变缺水次数; n 超过可选范围时取全部可选点。
 */
export function pickThirstPoints(seed: number, cycles: number, n: number): number[] {
  if (n <= 0 || cycles <= 1) return [];
  const count = Math.min(n, cycles - 1);
  const rand = mulberry32(seed);
  const pool: number[] = [];
  for (let i = 1; i < cycles; i++) pool.push(i);
  // Fisher-Yates 洗牌后取前 count 个, 再降序排列 (与生长递减方向一致)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => b - a);
}
