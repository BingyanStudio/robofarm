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

  it('小麦: 30 成本, 30 回合生长, 缺水 2 次 (剩余 20、10 回合时), 收获 +120', () => {
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
    expect(world.players[0].money).toBe(190); // 70 + 120
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

  it('南瓜: 100 成本, 100 回合生长, 缺水 5 次, 收获 +500', () => {
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
    expect(world.players[0].money).toBe(500);
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

describe('engine: 能量机制', () => {
  it('Charge: 原地不动, 能量 +5, 上限 10', () => {
    const w = single();
    let events = stepTurn(w, actions([0, { type: 'charge' }]));
    expect(eventsOfType(events, 'charge')).toHaveLength(1);
    expect(w.drones[0].energy).toBe(5);
    expect(w.drones[0].position).toEqual([3, 3]); // 原地不动
    stepTurn(w, actions([0, { type: 'charge' }]));
    expect(w.drones[0].energy).toBe(10); // 封顶
    stepTurn(w, actions([0, { type: 'charge' }]));
    expect(w.drones[0].energy).toBe(10); // 不再增加
  });

  it('HarvestRow: 收获整行成熟作物, 消耗 4 能量', () => {
    const w = single();
    w.drones[0].energy = 5;
    w.drones[0].position = [3, 2];
    placeCrop(w, [2, 2], { type: CropType.Strawberry, state: CropState.Grown, growthRemaining: 0 });
    placeCrop(w, [4, 2], { type: CropType.Strawberry, state: CropState.Grown, growthRemaining: 0 });
    placeCrop(w, [3, 2], { type: CropType.Strawberry, state: CropState.Growing, growthRemaining: 1 });
    const events = stepTurn(w, actions([0, { type: 'harvestRow' }]));
    expect(eventsOfType(events, 'harvest')).toHaveLength(2);
    expect(w.map[2][2].crop).toBeNull();
    expect(w.map[2][4].crop).toBeNull();
    expect(w.map[2][3].crop).not.toBeNull();
    expect(w.drones[0].energy).toBe(1); // 5 - 4
    expect(w.players[0].money).toBe(30); // 20 + 5 + 5
  });

  it('HarvestRow: 能量不足时无效, 不扣能量', () => {
    const w = single();
    w.drones[0].energy = 3;
    const events = stepTurn(w, actions([0, { type: 'harvestRow' }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
    expect(w.drones[0].energy).toBe(3);
  });

  it('HarvestRow 竞技模式: 仅收割自己半场作物', () => {
    const w = combat();
    w.drones[0].energy = 5;
    w.drones[0].position = [3, 2];
    placeCrop(w, [2, 2], { type: CropType.Strawberry, state: CropState.Grown, growthRemaining: 0 });
    placeCrop(w, [9, 2], { type: CropType.Strawberry, state: CropState.Grown, growthRemaining: 0 }); // 对方半场
    const events = stepTurn(w, actions([0, { type: 'harvestRow' }]));
    expect(eventsOfType(events, 'harvest')).toHaveLength(1);
    expect(w.map[2][9].crop).not.toBeNull(); // 对方半场未动
    expect(w.players[0].money).toBe(25); // 20 + 5, 无偷菜
  });

  it('WaterRow: 从左到右给缺水作物浇水直到水耗尽, 跳过不需浇水的', () => {
    const w = single();
    w.drones[0].energy = 3;
    w.drones[0].water = 2;
    w.drones[0].position = [3, 2];
    placeCrop(w, [2, 2], { type: CropType.Strawberry, state: CropState.Thirsty, growthRemaining: 2 });
    placeCrop(w, [3, 2], { type: CropType.Strawberry, state: CropState.Growing, growthRemaining: 2 });
    placeCrop(w, [4, 2], { type: CropType.Strawberry, state: CropState.Thirsty, growthRemaining: 2 });
    const events = stepTurn(w, actions([0, { type: 'waterRow' }]));
    expect(eventsOfType(events, 'water')).toHaveLength(2);
    expect(w.map[2][2].crop!.state).toBe(CropState.Growing);
    expect(w.map[2][4].crop!.state).toBe(CropState.Growing);
    expect(w.drones[0].water).toBe(0);
    expect(w.drones[0].energy).toBe(0); // 3 - 3
  });

  it('WaterCol: 从上到下浇水, 水耗尽即停', () => {
    const w = single();
    w.drones[0].energy = 3;
    w.drones[0].water = 1;
    w.drones[0].position = [3, 2];
    placeCrop(w, [3, 0], { type: CropType.Strawberry, state: CropState.Thirsty, growthRemaining: 2 });
    placeCrop(w, [3, 3], { type: CropType.Strawberry, state: CropState.Thirsty, growthRemaining: 2 });
    const events = stepTurn(w, actions([0, { type: 'waterCol' }]));
    expect(eventsOfType(events, 'water')).toHaveLength(1); // 1 格水
    expect(w.map[0][3].crop!.state).toBe(CropState.Growing);
    expect(w.map[3][3].crop!.state).toBe(CropState.Thirsty);
  });

  it('InterceptRow: 拦截整行对方偷菜无人机, 消耗 6 能量', () => {
    const w = combat();
    w.drones[0].energy = 6;
    w.drones[0].position = [4, 3];
    w.drones[2].position = [9, 3];
    w.drones[2].bounty = 7;
    w.drones[3].position = [6, 4]; // 不同行, 且在 P1 半场 (避免自动 stash)
    w.drones[3].bounty = 8;
    const events = stepTurn(w, actions([0, { type: 'interceptRow' }]));
    const intercepts = eventsOfType(events, 'intercept');
    expect(intercepts).toHaveLength(1); // 只拦到同行的 drone2
    expect(w.drones[2].bounty).toBe(0);
    expect(w.drones[3].bounty).toBe(8);
    expect(w.players[0].money).toBe(27); // 20 + 7
    expect(w.drones[0].energy).toBe(0); // 6 - 6
  });

  it('InterceptCol: 拦截整列对方偷菜无人机', () => {
    const w = combat();
    w.drones[0].energy = 6;
    w.drones[0].position = [4, 2];
    w.drones[2].position = [4, 5];
    w.drones[2].bounty = 7;
    w.drones[3].position = [10, 3];
    w.drones[3].bounty = 8;
    const events = stepTurn(w, actions([0, { type: 'interceptCol' }]));
    expect(eventsOfType(events, 'intercept')).toHaveLength(1);
    expect(w.drones[2].bounty).toBe(0);
    expect(w.players[0].money).toBe(27);
  });
});

describe('engine: 沙地', () => {
  it('草莓可种在沙地, 生长周期 ×1.5 向下取整 (5 → 7)', () => {
    const w = single();
    w.drones[0].position = [0, 0]; // 沙地
    const events = stepTurn(w, actions([0, { type: 'plant', crop: CropType.Strawberry }]));
    expect(eventsOfType(events, 'plant')).toHaveLength(1);
    expect(w.map[0][0].crop!.growthRemaining).toBe(6); // 种植回合即算第 1 个生长周期: floor(5*1.5)=7, 已扣 1
    for (let i = 0; i < 5; i++) stepTurn(w, actions([0, null]));
    expect(w.map[0][0].crop!.state).toBe(CropState.Growing);
    stepTurn(w, actions([0, null]));
    expect(w.map[0][0].crop!.state).toBe(CropState.Grown);
  });

  it('小麦不能种在沙地 (habitats 不含沙地)', () => {
    const w = single();
    w.drones[0].position = [0, 0];
    const events = stepTurn(w, actions([0, { type: 'plant', crop: CropType.Wheat }]));
    expect(eventsOfType(events, 'invalid-op')).toHaveLength(1);
  });

  it('沙地不覆盖水池', () => {
    const w = single();
    expect(w.map[1][1].type).toBe(TileType.Water); // 原水池位置仍是水
  });
});

describe('engine: 缺水次数动态计算', () => {
  it('沙地南瓜: 按种植时实际周期动态计算缺水次数 (150 周期 → 8 次)', () => {
    const w = single();
    w.players[0].money = 100;
    w.drones[0].position = [0, 0]; // 沙地
    stepTurn(w, actions([0, { type: 'plant', crop: CropType.Pumpkin }]));
    const crop = w.map[0][0].crop!;
    expect(crop.growthRemaining).toBe(149); // floor(100*1.5)=150, 种植回合已扣 1
    expect(crop.thirstTotal).toBe(8); // floor(150 / 18)
    let thirstyCount = 0;
    let guard = 0;
    while (crop.state !== CropState.Grown && guard++ < 300) {
      if (crop.state === CropState.Thirsty) {
        thirstyCount++;
        w.drones[0].water = 1;
        stepTurn(w, actions([0, { type: 'water' }]));
      } else {
        stepTurn(w, actions([0, null]));
      }
    }
    expect(thirstyCount).toBe(8);
    expect(crop.state).toBe(CropState.Grown);
  });

  it('土地作物缺水位置与原来一致: 小麦在剩余 20、10 回合时缺水', () => {
    const w = single();
    w.players[0].money = 100;
    stepTurn(w, actions([0, { type: 'plant', crop: CropType.Wheat }]));
    // 记录每次缺水时的剩余回合数
    const thirstyAt: number[] = [];
    let guard = 0;
    while (guard++ < 100) {
      const c = w.map[3][3].crop!;
      if (c.state === CropState.Thirsty) {
        thirstyAt.push(c.growthRemaining);
        w.drones[0].water = 1;
        stepTurn(w, actions([0, { type: 'water' }]));
      } else {
        stepTurn(w, actions([0, null]));
      }
      if (w.map[3][3].crop!.state === CropState.Grown) break;
    }
    expect(thirstyAt).toEqual([20, 10]);
  });
});

describe('engine: 新作物 (西瓜/紫云英/香菇)', () => {
  it('西瓜: 沙地生长不受 1.5 倍减速, 缺水 8 次', () => {
    const w = single();
    w.players[0].money = 200;
    w.drones[0].position = [0, 0]; // 沙地
    stepTurn(w, actions([0, { type: 'plant', crop: CropType.Melon }]));
    const crop = w.map[0][0].crop!;
    expect(crop.growthRemaining).toBe(119); // 120 - 1, 沙地免疫 (非 floor(120*1.5)=179)
    expect(crop.thirstTotal).toBe(8);
    let thirstyCount = 0;
    let guard = 0;
    while (crop.state !== CropState.Grown && guard++ < 200) {
      if (crop.state === CropState.Thirsty) {
        thirstyCount++;
        w.drones[0].water = 1;
        stepTurn(w, actions([0, { type: 'water' }]));
      } else {
        stepTurn(w, actions([0, null]));
      }
    }
    expect(thirstyCount).toBe(8);
    expect(crop.state).toBe(CropState.Grown);
  });

  it('紫云英成熟: 上下左右正在生长的作物剩余周期减少 25% (向下取整, 至少 1)', () => {
    const w = single();
    placeCrop(w, [3, 3], { type: CropType.MilkVetch, state: CropState.Growing, growthRemaining: 1 });
    placeCrop(w, [2, 3], { type: CropType.Pumpkin, state: CropState.Growing, growthRemaining: 95 });
    placeCrop(w, [4, 3], { type: CropType.Pumpkin, state: CropState.Growing, growthRemaining: 95 });
    placeCrop(w, [6, 6], { type: CropType.Pumpkin, state: CropState.Growing, growthRemaining: 95 });
    stepTurn(w, actions([0, null])); // 紫云英成熟, 触发特效
    expect(w.map[3][3].crop!.state).toBe(CropState.Grown);
    // (2,3) 先于 (3,3) 结算: 95→94 后再被加速 → floor(94*0.75)=70
    expect(w.map[3][2].crop!.growthRemaining).toBe(70);
    // (4,3) 后于 (3,3) 结算: 95 直接被加速 → floor(95*0.75)=71, 再扣 1 → 70
    expect(w.map[3][4].crop!.growthRemaining).toBe(70);
    // 远处对照不受影响
    expect(w.map[6][6].crop!.growthRemaining).toBe(94);
  });

  it('香菇成熟: 上下左右无作物且为陆地的格子自动种上新香菇', () => {
    const w = single();
    placeCrop(w, [3, 3], { type: CropType.Shiitake, state: CropState.Growing, growthRemaining: 1 });
    placeCrop(w, [2, 3], { type: CropType.Strawberry, state: CropState.Growing, growthRemaining: 3 }); // 已有作物
    w.map[4][3] = { type: TileType.Water, crop: null }; // (3,4) 水池
    stepTurn(w, actions([0, null]));
    expect(w.map[3][3].crop!.state).toBe(CropState.Grown);
    expect(w.map[3][4].crop?.type).toBe(CropType.Shiitake); // (4,3) 空地 → 新种
    expect(w.map[2][3].crop?.type).toBe(CropType.Shiitake); // (3,2) 空地 → 新种
    expect(w.map[3][2].crop?.type).toBe(CropType.Strawberry); // (2,3) 已有作物不变
    expect(w.map[4][3].crop).toBeNull(); // (3,4) 水池不种
    // 新香菇也在生长 (剩余 20, 种植回合扣 1)
    expect(w.map[3][4].crop!.growthRemaining).toBe(19);
  });

  it('香菇可多轮繁殖并收获 (自行生长 20 回合成熟)', () => {
    const w = single();
    placeCrop(w, [3, 3], { type: CropType.Shiitake, state: CropState.Growing, growthRemaining: 1 });
    for (let i = 0; i < 25; i++) stepTurn(w, actions([0, null]));
    // 第 1 轮: (3,3) 成熟 → 种 (4,3),(3,2),(3,4); 20 回合后它们成熟 → 再扩散
    const shiitakeCount = w.map.flat().filter((t) => t.crop?.type === CropType.Shiitake).length;
    expect(shiitakeCount).toBeGreaterThanOrEqual(4);
  });
});
