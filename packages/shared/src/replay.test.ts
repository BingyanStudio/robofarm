import { describe, expect, it } from 'vitest';
import { GameController, PlayerProgram, PlayerTurnResult } from './game-controller';
import { PlayerView } from './types';
import { Move } from './player-api';
import { ReplayRecorder, replayEvents } from './replay';

/** 简单的脚本化玩家程序, 不依赖平台沙箱 */
class ScriptedProgram implements PlayerProgram {
  constructor(private script: (droneId: number, view: PlayerView, turn: number) => any) {}
  async runTurn(droneId: number, view: PlayerView): Promise<PlayerTurnResult> {
    const op = this.script(droneId, view, view.turn);
    return { operation: op ?? null, durationMs: 10, logs: [] };
  }
  dispose() {}
}

describe('replay: 录制与重放', () => {
  it('录制单人局 → 回放文件 → 重新推演得到相同的最终金钱', async () => {
    const recorder = new ReplayRecorder();
    const controller = new GameController({
      mode: 'single',
      maxTurns: 10,
      players: [
        {
          name: '玩家',
          frame: 'normal',
          program: recorder.wrap(
            new ScriptedProgram((droneId, view) => {
              if (view.turn === 1) return { type: 'plant', crop: 'strawberry' };
              if (view.turn === 6) return { type: 'harvest' };
              return null;
            })
          ),
        },
      ],
    });
    while (!controller.over) {
      const events = await controller.step();
      recorder.afterStep(events, controller.world.turn);
    }
    const originalMoney = controller.world.players[0].money;
    expect(originalMoney).toBe(25);

    const file = recorder.buildFile({
      mode: 'single',
      maxTurns: 10,
      players: ['玩家'],
      result: { type: 'finished', money: [originalMoney] },
    });
    // 文件结构: 每回合有 round / drones / output
    expect(file.rounds.length).toBe(10);
    expect(file.rounds[0].round).toBe(1);
    expect(file.rounds[0].drones[0].op).toEqual({ type: 'plant', crop: 'strawberry' });

    // 重放: 事件流与原始一致 (最终金钱相同)
    const events = await replayEvents(file);
    const lastSnapshot = events.filter((e) => e.type === 'snapshot').pop();
    expect(lastSnapshot?.type === 'snapshot' && lastSnapshot.state.players[0].money).toBe(originalMoney);
    // 有 end 事件
    expect(events.some((e) => e.type === 'end')).toBe(true);
  });

  it('录制竞技局 → 重放双方金钱一致 (镜像坐标)', async () => {
    const recorder = new ReplayRecorder();
    const me = new ScriptedProgram((droneId, view) => {
      if (view.turn === 1) return new Move([3, 3]);
      return null;
    });
    const controller = new GameController({
      mode: 'combat',
      maxTurns: 5,
      players: [
        { name: 'A', frame: 'normal', program: recorder.wrap(me) },
        { name: 'B', frame: 'mirror', program: recorder.wrap(new ScriptedProgram(() => null)) },
      ],
    });
    while (!controller.over) {
      const events = await controller.step();
      recorder.afterStep(events, controller.world.turn);
    }
    const file = recorder.buildFile({
      mode: 'combat',
      maxTurns: 5,
      players: ['A', 'B'],
      result: { type: 'finished', money: [20, 20] },
    });
    const events = await replayEvents(file);
    const last = events.filter((e) => e.type === 'snapshot').pop();
    expect(last?.type === 'snapshot' && last.state.players[0].money).toBe(20);
    expect(last?.type === 'snapshot' && last.state.players[1].money).toBe(20);
  });
});
