// pickThirstPoints: 缺水时机 = 均匀分布基准 + 每点 ±2 回合随机偏移, 且互不重合。
import { describe, it, expect } from 'vitest';
import { pickThirstPoints } from './rng';

describe('pickThirstPoints: 均匀分布 + 随机偏移', () => {
  it('触发点互不重合, 且在生长范围内, 降序排列', () => {
    // 高密度: 盐碱地西瓜 16 次缺水, 总周期 120
    const pts = pickThirstPoints(0x1234, 120, 16);
    expect(pts).toHaveLength(16);
    expect(new Set(pts).size).toBe(16); // 两个浇水回合不重合
    for (const p of pts) {
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(119);
    }
    expect([...pts].sort((a, b) => b - a)).toEqual(pts);
  });

  it('极端密度: n 超过可选范围时取满全部可选回合且互不重合', () => {
    const pts = pickThirstPoints(42, 10, 20); // span=9
    expect(pts).toHaveLength(9);
    expect(new Set(pts).size).toBe(9);
  });

  it('小麦 (2 次缺水, 30 周期): 均匀分布在大致等间距位置', () => {
    // 基准 8 / 22, 各 ±2 → 两点间距至少 10, 且不落在两端
    for (let seed = 0; seed < 200; seed++) {
      const pts = pickThirstPoints(seed, 30, 2);
      expect(pts[0] - pts[1]).toBeGreaterThanOrEqual(10);
      expect(pts[0]).toBeGreaterThanOrEqual(20);
      expect(pts[1]).toBeLessThanOrEqual(10);
    }
  });

  it('确定性: 相同种子结果一致', () => {
    expect(pickThirstPoints(7, 30, 2)).toEqual(pickThirstPoints(7, 30, 2));
  });

  it('无需浇水 (n=0) 或周期过短时返回空', () => {
    expect(pickThirstPoints(1, 30, 0)).toEqual([]);
    expect(pickThirstPoints(1, 1, 3)).toEqual([]);
  });
});
