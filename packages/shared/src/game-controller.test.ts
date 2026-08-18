import { describe, expect, it } from 'vitest';
import { GameController, PlayerProgram, PlayerTurnResult } from './game-controller';
import { PlayerView, CropState, CropType } from './types';
import { Move } from './player-api';
import { placeCrop } from './maps';

/** 简单的脚本化玩家程序, 不依赖平台沙箱 */
class ScriptedProgram implements PlayerProgram {
  constructor(private script: (droneId: number, view: PlayerView, turn: number) => any) {}
  async runTurn(droneId: number, view: PlayerView): Promise<PlayerTurnResult> {
    const op = this.script(droneId, view, view.turn);
    return { operation: op ?? null, durationMs: 10, logs: [] };
  }
  dispose() {}
}

class FailingProgram implements PlayerProgram {
  constructor(private readonly msg: string) {}
  async runTurn(): Promise<PlayerTurnResult> {
    return { operation: null, durationMs: 0, logs: [], error: this.msg };
  }
  dispose() {}
}

const me = (script: (d: number, v: PlayerView, t: number) => any) => ({
  name: '玩家',
  frame: 'normal' as const,
  program: new ScriptedProgram(script),
});

async function runToEnd(controller: GameController): Promise<{ events: any[]; over: boolean }> {
  const all: any[] = [];
  let over = false;
  for (let i = 0; i < 500 && !controller.over; i++) {
    const events = await controller.step();
    all.push(...events);
    if (events.some((e) => e.type === 'end')) {
      over = true;
      break;
    }
  }
  return { events: all, over };
}

describe('GameController: 单人种植', () => {
  it('运行完整一局并正常结束, 视图回合数与金钱正确', async () => {
    let seenTurn: number[] = [];
    const controller = new GameController({
      mode: 'single',
      maxTurns: 10,
      players: [
        me((droneId, view) => {
          seenTurn.push(view.turn);
          if (view.turn === 1) return { type: 'plant', crop: CropType.Strawberry };
          if (view.turn === 7) return { type: 'harvest' };
          return null;
        }),
      ],
    });
    const { events, over } = await runToEnd(controller);
    expect(over).toBe(true);
    const end = events.find((e) => e.type === 'end');
    expect(end.result.type).toBe('finished');
    // 第 1 回合种植, 成熟需 5 回合, 第 7 回合收获 (+5)
    expect(end.result.scores[0].money).toBe(25);
    // 视图回合从 1 到 10
    expect(seenTurn).toHaveLength(10);
    expect(seenTurn[0]).toBe(1);
    // 每回合都有快照
    expect(events.filter((e) => e.type === 'snapshot')).toHaveLength(10);
  });

  it('程序报错导致游戏提前结束', async () => {
    const controller = new GameController({
      mode: 'single',
      maxTurns: 300,
      players: [
        { name: '玩家', frame: 'normal', program: new FailingProgram('出错了') },
      ],
    });
    const { events } = await runToEnd(controller);
    const end = events.find((e) => e.type === 'end');
    expect(end.result.type).toBe('error');
    expect(end.result.message).toContain('出错了');
  });
});

describe('GameController: 竞技模式视图坐标系', () => {
  it('P2 的视图为镜像: 自己的无人机在左侧, 对方在右侧', async () => {
    const views: PlayerView[] = [];
    const controller = new GameController({
      mode: 'combat',
      maxTurns: 5,
      players: [
        me((_d, _v) => null),
        {
          name: '对手',
          frame: 'mirror',
          program: new ScriptedProgram((droneId, view) => {
            views.push(view);
            return null;
          }),
        },
      ],
    });
    await runToEnd(controller);
    const v = views[0];
    expect(v.map.width).toBe(14);
    // P2 自己的无人机在本地坐标左侧
    const own = v.drones.filter((d) => !d.isOpponent);
    expect(own).toHaveLength(2);
    for (const d of own) expect(d.position[0]).toBeLessThan(7);
    // 对方 (P1) 的无人机在本地坐标右侧
    const enemy = v.drones.filter((d) => d.isOpponent);
    expect(enemy).toHaveLength(2);
    for (const d of enemy) expect(d.position[0]).toBeGreaterThanOrEqual(7);
    // getSelf 对应 droneId
    expect(v.self.id).toBe(0);
    expect(v.self.isOpponent).toBe(false);
  });

  it('P2 (mirror 帧) 的 Move 目标坐标会被映射回绝对坐标', async () => {
    const controller = new GameController({
      mode: 'combat',
      maxTurns: 3,
      players: [
        me((_d, _v) => null),
        {
          name: '对手',
          frame: 'mirror',
          program: new ScriptedProgram((droneId, view) => {
            // 本地坐标系: 自己的无人机在左侧 (本地 x ∈ [0,6]);
            // 返回本地坐标中的相邻格移动
            const self = view.drones[droneId];
            return new Move([self.position[0] + 1, self.position[1]]);
          }),
        },
      ],
    });
    const { events } = await runToEnd(controller);
    const moveEvents = events.filter((e) => e.type === 'move');
    expect(moveEvents.length).toBeGreaterThan(0);
    for (const m of moveEvents) {
      const dx = Math.abs(m.to[0] - m.from[0]);
      const dy = Math.abs(m.to[1] - m.from[1]);
      // 绝对坐标下目标与出发地相邻 (若不转换, 目标落在 x<7 的对方半场, 距离>1 被拒绝)
      expect(dx + dy).toBe(1);
      // 目标仍在 P2 半场 (绝对 x >= 7)
      expect(m.to[0]).toBeGreaterThanOrEqual(7);
    }
  });

  it('竞技模式收获对方半场作物时 money 不变 (进入 bounty)', async () => {
    const controller = new GameController({
      mode: 'combat',
      maxTurns: 20,
      players: [
        me((droneId, view) => {
          // 第 1 回合: 收获 (测试先在地图上放置成熟作物并移动无人机)
          if (view.turn === 1) return { type: 'harvest' };
          return null;
        }),
        { name: '对手', frame: 'mirror', program: new ScriptedProgram(() => null) },
      ],
    });
    // 预先在 (8,2) 放一颗成熟草莓 (对方半场), 并把 drone0 放到该格
    placeCrop(controller.world, [8, 2], {
      type: CropType.Strawberry,
      state: CropState.Grown,
      growthRemaining: 0,
    });
    controller.world.drones[0].position = [8, 2];
    await runToEnd(controller);
    // 收获进入 bounty, 未返回己方半场前不计入金钱
    expect(controller.world.drones[0].bounty).toBe(5);
    expect(controller.world.players[0].money).toBe(20);
  });

  it('玩家操作类 (class API) 经控制器规范化后执行', async () => {
    const controller = new GameController({
      mode: 'single',
      maxTurns: 5,
      players: [
        {
          name: '玩家',
          frame: 'normal',
          program: new ScriptedProgram((_d, view) => {
            // 使用玩家侧操作类, 而非纯对象
            if (view.turn === 1) return new Move([2, 3]); // 相邻格
            if (view.turn === 2) return new Move([3, 3]); // 回到出生点
            return null;
          }),
        },
      ],
    });
    await runToEnd(controller);
    expect(controller.world.drones[0].position).toEqual([3, 3]);
  });
});

describe('GameController: NewDrone', () => {
  it('创建的新无人机在下一回合开始执行代码 (droneId 顺延为 1)', async () => {
    const called: number[][] = []; // 每回合被调用的 droneId 列表
    const controller = new GameController({
      mode: 'single',
      maxTurns: 8,
      players: [
        me((droneId, view) => {
          if (!called[view.turn]) called[view.turn] = [];
          called[view.turn].push(droneId);
          if (view.turn === 1) return { type: 'newDrone', at: [6, 6] };
          if (droneId === 1 && view.turn >= 2) return { type: 'move', to: [5, 6] };
          return null;
        }),
      ],
    });
    controller.world.players[0].money = 5000; // 支付 NewDrone 费用
    const { events } = await runToEnd(controller);
    expect(events.some((e) => e.type === 'new-drone')).toBe(true);
    // 第 1 回合只有 droneId 0; 第 2 回合起 droneId 0 和 1 都被调用
    expect(called[1]).toEqual([0]);
    expect(called[2]).toEqual([0, 1]);
    expect(called[3]).toEqual([0, 1]);
    // 新无人机执行了移动
    const moves = events.filter((e) => e.type === 'move' && e.drone !== undefined);
    expect(moves.some((e) => JSON.stringify(e.from) === '[6,6]' && JSON.stringify(e.to) === '[5,6]')).toBe(true);
  });
});
