import { describe, expect, it } from 'vitest';
import { stepTurn } from './engine';
import { createCombatWorld, createSingleWorld, placeCrop } from './maps';
import { CropState, CropType, GameEvent, TileType } from './types';

const single = () => createSingleWorld(300);
const combat = () => createCombatWorld(300);

function actions(...items: [number, any][]): Record<number, { op: any; durationMs: number }> {
  const out: Record<number, { op: any; durationMs: number }> = {};
  for (const [id, op] of items) out[id] = { op, durationMs: 10 };
  return out;
}

function eventsOfType(events: GameEvent[], type: string): GameEvent[] {
  return events.filter((e) => e.type === type);
}

describe('engine: 种植与收获周期', () => {
  it('种植草莓: 0 成本, 5 回合成熟, 收获得 5 金钱', () => {
    const world = single();
    // 回合 1: 种植
    let events = stepTurn(world, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    expect(eventsOfType(events, 'plant')).toHaveLength(1);
    expect(world.map[3][3].crop?.state).toBe(CropState.Growing);
    expect(world.players[0].money).toBe(20); // 种植成本 0

    // 种植回合即算第 1 个生长周期: 之后 3 个空回合仍是 Growing (剩 1 周期)
    for (let i = 0; i < 3; i++) stepTurn(world, actions([0, null]));
    expect(world.map[3][3].crop?.state).toBe(CropState.Growing);
    expect(world.map[3][3].crop?.growthRemaining).toBe(1);
    // 第 5 个生长周期结束即成熟
    stepTurn(world, actions([0, null]));
    expect(world.map[3][3].crop?.state).toBe(CropState.Grown);

    // 收获
    events = stepTurn(world, actions([0, { type: 'harvest' }]));
    expect(eventsOfType(events, 'harvest')).toHaveLength(1);
    expect(world.map[3][3].crop).toBeNull();
    expect(world.players[0].money).toBe(25); // 20 + 5
  });

  it('未成熟时收获无效', () => {
    const world = single();
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    const events = stepTurn(world, actions([0, { type: 'harvest' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(world.map[3][3].crop).not.toBeNull();
  });

  it('草莓无需浇水, 从不进入缺水状态并正常成熟', () => {
    const world = single();
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    let thirsty = false;
    for (let i = 0; i < 30; i++) {
      const events = stepTurn(world, actions([0, null]));
      const grow = eventsOfType(events, 'crop-grow')[0] as any;
      if (grow && grow.state === CropState.Thirsty) thirsty = true;
    }
    expect(thirsty).toBe(false);
    expect(world.map[3][3].crop?.state).toBe(CropState.Grown);
  });

  it('地块已被占用时不能重复种植', () => {
    const world = single();
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    const events = stepTurn(world, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
  });

  it('水池上不能种植 (草莓为陆生)', () => {
    const world = single();
    // 把无人机直接放到 (1,1) 水池
    world.drones[0].position = [1, 1];
    const events = stepTurn(world, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(world.players[0].money).toBe(20);
  });
});

describe('engine: 各类作物 (注册表驱动)', () => {
  it('葡萄: 20 成本, 15 回合成熟, 无需浇水, 收获 +40', () => {
    const world = single();
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Grape }]));
    expect(world.players[0].money).toBe(0); // 20 - 20
    for (let i = 0; i < 13; i++) stepTurn(world, actions([0, null]));
    expect(world.map[3][3].crop?.state).toBe(CropState.Growing); // 还差 1 周期
    stepTurn(world, actions([0, null]));
    expect(world.map[3][3].crop?.state).toBe(CropState.Grown);
    stepTurn(world, actions([0, { type: 'harvest' }]));
    expect(world.players[0].money).toBe(40); // 0 + 40
  });

  it('小麦: 30 成本, 25 回合生长, 缺水 2 次 (剩余 20、10 回合时)', () => {
    const world = single();
    world.players[0].money = 100; // 初始资金不够, 直接补给
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Wheat }]));
    expect(world.players[0].money).toBe(70);
    let thirstyCount = 0;
    for (let i = 0; i < 60; i++) {
      if (world.map[3][3].crop?.state === CropState.Thirsty) {
        thirstyCount++;
        world.drones[0].water = 1;
        stepTurn(world, actions([0, { type: 'water' }]));
      } else {
        stepTurn(world, actions([0, null]));
      }
      if (world.map[3][3].crop?.state === CropState.Grown) break;
    }
    expect(thirstyCount).toBe(2);
    expect(world.map[3][3].crop?.state).toBe(CropState.Grown);
    stepTurn(world, actions([0, { type: 'harvest' }]));
    expect(world.players[0].money).toBe(150); // 70 + 80
  });

  it('荷花: 水生, 只能种在水池, 40 回合成熟, 收获 +90', () => {
    const world = single();
    world.players[0].money = 100; // 初始资金不够, 直接补给
    // 陆地上不能种荷花
    const bad = stepTurn(world, actions([0, { type: 'plant', crop: CropType.Lotus }]));
    expect(eventsOfType(bad, 'invalid-op')).toHaveLength(1);
    // 水池上可以
    world.drones[0].position = [1, 1];
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Lotus }]));
    expect(world.players[0].money).toBe(70); // 100 - 30 (已补给)
    for (let i = 0; i < 38; i++) stepTurn(world, actions([0, null]));
    expect(world.map[1][1].crop?.state).toBe(CropState.Growing);
    stepTurn(world, actions([0, null]));
    expect(world.map[1][1].crop?.state).toBe(CropState.Grown);
    stepTurn(world, actions([0, { type: 'harvest' }]));
    expect(world.players[0].money).toBe(160); // 70 + 90
  });

  it('南瓜: 100 成本, 100 回合生长, 缺水 5 次, 收获 +300', () => {
    const world = single();
    world.players[0].money = 100; // 初始资金不够, 直接补给
    stepTurn(world, actions([0, { type: 'plant', crop: CropType.Pumpkin }]));
    expect(world.players[0].money).toBe(0);
    let thirstyCount = 0;
    for (let i = 0; i < 200; i++) {
      if (world.map[3][3].crop?.state === CropState.Thirsty) {
        thirstyCount++;
        world.drones[0].water = 1;
        stepTurn(world, actions([0, { type: 'water' }]));
      } else {
        stepTurn(world, actions([0, null]));
      }
      if (world.map[3][3].crop?.state === CropState.Grown) break;
    }
    expect(thirstyCount).toBe(5);
    expect(world.map[3][3].crop?.state).toBe(CropState.Grown);
    stepTurn(world, actions([0, { type: 'harvest' }]));
    expect(world.players[0].money).toBe(300);
  });
});

describe('engine: 移动与仲裁', () => {
  it('目标格被静止无人机占据时无法移动', () => {
    const w = combat();
    // drone2 (P2) 静止在 (4,2), drone0 (P1) 尝试移入
    w.drones[2].position = [4, 2];
    const events = stepTurn(w, actions([0, { type: 'move', to: [4, 2] }]));
    expect(eventsOfType(events, 'move-blocked')).toHaveLength(1);
    expect(w.drones[0].position).toEqual([3, 2]);
  });

  it('两架无人机争抢同一格: 执行时间短者获胜', () => {
    const w = combat();
    // drone0 (3,2) 与 drone2 (5,2) 同时争抢 (4,2)
    w.drones[2].position = [5, 2];
    const events = stepTurn(
      w,
      {
        0: { op: { type: 'move', to: [4, 2] }, durationMs: 20 },
        2: { op: { type: 'move', to: [4, 2] }, durationMs: 5 },
      } as any
    );
    expect(eventsOfType(events, 'move')).toHaveLength(1);
    expect(w.drones[2].position).toEqual([4, 2]); // 耗时短者成功
    expect(w.drones[0].position).toEqual([3, 2]); // 失败者原地不动
  });

  it('两架无人机同时向不同方向移动互不影响', () => {
    const w = combat();
    // drone0 (3,2) -> (4,2), drone2 (10,2) -> (9,2)
    const events = stepTurn(
      w,
      {
        0: { op: { type: 'move', to: [4, 2] }, durationMs: 10 },
        2: { op: { type: 'move', to: [9, 2] }, durationMs: 10 },
      } as any
    );
    expect(eventsOfType(events, 'move')).toHaveLength(2);
    expect(w.drones[0].position).toEqual([4, 2]);
    expect(w.drones[2].position).toEqual([9, 2]);
  });

  it('相邻互换被仲裁阻止 (目标格回合开始时仍被占据)', () => {
    const w = combat();
    // drone0 (3,2) <-> drone2 (4,2): 双方目标都被对方占据, 均不移动
    w.drones[2].position = [4, 2];
    const events = stepTurn(
      w,
      {
        0: { op: { type: 'move', to: [4, 2] }, durationMs: 10 },
        2: { op: { type: 'move', to: [3, 2] }, durationMs: 10 },
      } as any
    );
    expect(eventsOfType(events, 'move')).toHaveLength(0);
    expect(w.drones[0].position).toEqual([3, 2]);
    expect(w.drones[2].position).toEqual([4, 2]);
  });

  it('移动范围限制: 超出周围 8 格不移动并报错', () => {
    const world = single();
    // (3,3) -> (1,1) 距离 2 格, 超出范围
    let events = stepTurn(world, actions([0, { type: 'move', to: [1, 1] }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(world.drones[0].position).toEqual([3, 3]); // 不移动
    // 原地不动也是无效移动
    events = stepTurn(world, actions([0, { type: 'move', to: [3, 3] }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    // 相邻格 (含斜角) 合法
    for (const to of [[2, 3], [4, 3], [2, 2], [4, 2]]) {
      world.drones[0].position = [3, 3];
      events = stepTurn(world, actions([0, { type: 'move', to }]));
      expect(eventsOfType(events, 'invalid-op')).toHaveLength(0);
      expect(eventsOfType(events, 'move')).toHaveLength(1);
    }
  });

  it('移动越界无效 (相邻格但在地图外)', () => {
    const world = single();
    world.drones[0].position = [0, 0];
    const events = stepTurn(world, actions([0, { type: 'move', to: [-1, 0] }]));
    expect(eventsOfType(events, 'move-blocked')).toHaveLength(1);
  });
});

describe('engine: 缺水机制 (无枯萎, 长期 Thirsty)', () => {
  it('缺水作物长期保持 Thirsty, 生长不推进; 浇水后从剩余进度继续生长', () => {
    const world = single();
    // 手动放一颗缺水作物: 还剩 2 周期成熟
    placeCrop(world, [3, 3], { type: CropType.Strawberry, state: CropState.Thirsty, growthRemaining: 2 });
    // 长期不浇水: 保持 Thirsty, 不枯萎, 生长不推进
    for (let i = 0; i < 10; i++) {
      const events = stepTurn(world, actions([0, null]));
      const grow = eventsOfType(events, 'crop-grow')[0] as any;
      expect(grow.state).toBe(CropState.Thirsty);
    }
    expect(world.map[3][3].crop?.state).toBe(CropState.Thirsty);
    expect(world.map[3][3].crop?.growthRemaining).toBe(2); // 生长未推进

    // 浇水后恢复生长; 浇水的当回合结束即完成一次生长 (2 -> 1)
    world.drones[0].water = 1;
    let events = stepTurn(world, actions([0, { type: 'water' }]));
    expect(eventsOfType(events, 'water')).toHaveLength(1);
    expect(world.map[3][3].crop?.state).toBe(CropState.Growing);
    expect(world.map[3][3].crop?.growthRemaining).toBe(1);
    stepTurn(world, actions([0, null]));
    expect(world.map[3][3].crop?.state).toBe(CropState.Grown);
    expect(world.drones[0].water).toBe(0); // 消耗 1 格水
  });

  it('对非缺水作物浇水无效', () => {
    const world = single();
    placeCrop(world, [3, 3], { type: CropType.Strawberry, state: CropState.Growing, growthRemaining: 5 });
    world.drones[0].water = 1;
    const events = stepTurn(world, actions([0, { type: 'water' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(world.drones[0].water).toBe(1);
  });
});

describe('engine: 取水', () => {
  it('在池塘取水, 最多 5 格', () => {
    const world = single();
    world.drones[0].position = [1, 1];
    for (let i = 0; i < 5; i++) {
      const events = stepTurn(world, actions([0, { type: 'collectWater' }]));
      expect(eventsOfType(events, 'collect-water')).toHaveLength(1);
    }
    expect(world.drones[0].water).toBe(5);
    const events = stepTurn(world, actions([0, { type: 'collectWater' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(world.drones[0].water).toBe(5);
  });

  it('不在池塘上无法取水', () => {
    const world = single();
    const events = stepTurn(world, actions([0, { type: 'collectWater' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
  });
});

describe('engine: 偷菜与拦截', () => {
  it('在对方半场收获进入临时资金池, 返回己方半场后入账', () => {
    const w = combat();
    // 在对方半场 (8,3) 放一颗成熟草莓, drone0 直接站在上面
    placeCrop(w, [8, 3], { type: CropType.Strawberry, state: CropState.Grown, growthRemaining: 0});
    w.drones[0].position = [8, 3];
    let events = stepTurn(w, actions([0, { type: 'harvest' }]));
    const harvest = eventsOfType(events, 'harvest')[0] as any;
    expect(harvest.stole).toBe(true);
    expect(w.drones[0].bounty).toBe(5); // 进入临时资金池
    expect(w.players[0].money).toBe(20); // 未入账

    // 返回己方半场 (5,3): 该回合结束时自动入账
    w.drones[0].position = [5, 3];
    events = stepTurn(w, actions([0, null]));
    expect(eventsOfType(events, 'stash')).toHaveLength(1);
    expect(w.drones[0].bounty).toBe(0);
    expect(w.players[0].money).toBe(25); // 20 + 5
  });

  it('偷菜者被拦截: 资金池清空, 资金返还给受害方', () => {
    const w = combat();
    // drone0 (P1) 在对方半场, 带 5 金币偷菜资金
    w.drones[0].position = [5, 3];
    w.drones[0].bounty = 5;
    // P2 的 drone2 在 (4,3), 本回合拦截 (5,3)
    // drone0 本回合移动到 (6,3)? 拦截目标需是回合结束时所在位置: 设目标 (5,3) 且 drone0 不动
    const events = stepTurn(
      w,
      {
        0: null,
        2: { op: { type: 'intercept', at: [5, 3] }, durationMs: 5 },
      } as any
    );
    const intercepts = eventsOfType(events, 'intercept') as any[];
    expect(intercepts).toHaveLength(1);
    expect(intercepts[0].bounty).toBe(5);
    expect(w.drones[0].bounty).toBe(0);
    expect(w.players[1].money).toBe(25); // 资金返还给受害方 P2
    expect(w.players[0].money).toBe(20);
    // 不再产生 stash (资金已清空)
    expect(eventsOfType(events, 'stash')).toHaveLength(0);
  });

  it('在自己半场收获直接入账 (无资金池)', () => {
    const w = combat();
    placeCrop(w, [3, 3], { type: CropType.Strawberry, state: CropState.Grown, growthRemaining: 0});
    w.drones[0].position = [3, 3];
    const events = stepTurn(w, actions([0, { type: 'harvest' }]));
    const harvest = eventsOfType(events, 'harvest')[0] as any;
    expect(harvest.stole).toBe(false);
    expect(w.players[0].money).toBe(25);
    expect(w.drones[0].bounty).toBe(0);
  });

  it('可在对方半场种植, 铲除仍限己方半场', () => {
    const w = combat();
    // drone0 在对方半场 (8,3)
    w.drones[0].position = [8, 3];
    // 种植不再受半场限制
    let events = stepTurn(w, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    expect(eventsOfType(events, 'plant')).toHaveLength(1);
    expect(w.map[3][8].crop).not.toBeNull();
    expect(w.players[0].money).toBe(20); // 草莓零成本
    // 铲除仍仅限己方半场
    events = stepTurn(w, actions([0, { type: 'clear' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
  });
});

describe('engine: 健壮性', () => {
  it('未知操作类型产生 invalid-op 事件, 不崩溃', () => {
    const world = single();
    const events = stepTurn(world, actions([0, { type: 'fly' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(world.drones[0].position).toEqual([3, 3]);
  });

  it('run 返回 null 视为不动作', () => {
    const world = single();
    const events = stepTurn(world, actions([0, null]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(0);
  });

  it('地图地块类型正确', () => {
    const world = single();
    expect(world.map[1][1].type).toBe(TileType.Water);
    expect(world.map[3][3].type).toBe(TileType.Soil);
  });
});
