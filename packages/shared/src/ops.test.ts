import { describe, expect, it } from 'vitest';
import { normalizeOp } from './ops';
import { CollectWater, Clear, Harvest, Intercept, Move, Plant, Water } from './player-api';
import { CropType } from './types';

describe('normalizeOp: 玩家操作类 (class API)', () => {
  it('Move 实例 → 纯对象 { type: "move", to }', () => {
    const r = normalizeOp(new Move([1, 2]));
    expect(r).toEqual({ ok: true, op: { type: 'move', to: [1, 2] } });
  });

  it('Plant 实例 → 纯对象 { type: "plant", crop }', () => {
    const r = normalizeOp(new Plant(CropType.Strawberry));
    expect(r).toEqual({ ok: true, op: { type: 'plant', crop: 'strawberry' } });
  });

  it('CollectWater / Water / Harvest / Clear → 无参操作', () => {
    expect(normalizeOp(new CollectWater())).toEqual({ ok: true, op: { type: 'collectWater' } });
    expect(normalizeOp(new Water())).toEqual({ ok: true, op: { type: 'water' } });
    expect(normalizeOp(new Harvest())).toEqual({ ok: true, op: { type: 'harvest' } });
    expect(normalizeOp(new Clear())).toEqual({ ok: true, op: { type: 'clear' } });
  });

  it('Intercept 实例 → 纯对象 { type: "intercept", at }', () => {
    expect(normalizeOp(new Intercept([3, 4]))).toEqual({ ok: true, op: { type: 'intercept', at: [3, 4] } });
  });

  it('构造函数参数非法时抛错 (Move / Plant / Intercept)', () => {
    expect(() => new Move('abc' as never)).toThrow(/坐标/);
    expect(() => new Plant('cucumber' as never)).toThrow(/作物/);
    expect(() => new Intercept([1] as never)).toThrow(/坐标/);
  });

  it('纯对象形式仍然兼容', () => {
    expect(normalizeOp({ type: 'move', to: [1, 1] })).toEqual({ ok: true, op: { type: 'move', to: [1, 1] } });
    expect(normalizeOp(null)).toEqual({ ok: true, op: null });
    expect(normalizeOp({ type: 'fly' }).ok).toBe(false);
  });

  it('操作类实例的额外字段被丢弃, 输出干净纯对象', () => {
    const op = new Move([1, 1]) as unknown as Record<string, unknown>;
    op.hack = 'x';
    const r = normalizeOp(op);
    expect(r.ok && r.op).toEqual({ type: 'move', to: [1, 1] });
  });

  it('类名被压缩 (constructor.name 不可靠) 时仍能识别操作', () => {
    // 浏览器构建的 minifier 会把 class Move 重命名为单字母,
    // 识别必须依赖实例上的 type 字段, 而不是 constructor.name
    const op = new Move([1, 1]);
    Object.defineProperty(op.constructor, 'name', { value: 'l' });
    expect(normalizeOp(op)).toEqual({ ok: true, op: { type: 'move', to: [1, 1] } });
    const harvest = new Harvest();
    Object.defineProperty(harvest.constructor, 'name', { value: 'x' });
    expect(normalizeOp(harvest)).toEqual({ ok: true, op: { type: 'harvest' } });
  });
});
