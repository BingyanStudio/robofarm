// 竞技模式服务: 对战房间管理、比赛推演、WebSocket 直播、回放存储。
import { WebSocket } from 'ws';
import { GameController, compilePlayerCode, DEFAULT_MAX_TURNS, GameEvent } from '@robofarm/shared';
import { NodeProgram } from '../runner/node-program';
import { getCombatCode, insertMatch, getMatch, listMatchesForUser, recordCombatResult, getUserById, listCombatCodesExcluding, ensureCwd } from '../db';
import { randomBytes } from 'node:crypto';

const stamp = () => new Date().toISOString();

export interface RoomPlayerInfo {
  userId: number;
  name: string;
  frame: 'normal' | 'mirror';
}

export interface Room {
  id: string;
  players: RoomPlayerInfo[];
  status: 'compiling' | 'running' | 'finished' | 'error';
  subscribers: Set<WebSocket>;
  events: GameEvent[];
  error: string | null;
}

const rooms = new Map<string, Room>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const roomId = () => randomBytes(6).toString('hex');

export function startMatch(
  challengerId: number,
  opponentId: number
): { roomId: string } | { error: string } {
  if (challengerId === opponentId) return { error: '不能挑战自己' };
  // 限制: 一个玩家同时最多主动发起 1 个对战 (防止重复点击连开多个房间)。
  // 发起方恒为房间的 P1 (frame normal), 对局中 (编译/推演) 不允许再开新房间。
  const activeOwn = [...rooms.values()].find(
    (r) =>
      (r.status === 'compiling' || r.status === 'running') &&
      r.players[0]?.userId === challengerId
  );
  if (activeOwn) return { error: '你已有一场进行中的对战, 请等待其结束后再发起新挑战' };
  const mine = getCombatCode(challengerId);
  const theirs = getCombatCode(opponentId);
  if (!mine) return { error: '请先上传自己的出战代码' };
  if (!theirs) return { error: '对方还没有上传出战代码' };
  const me = getUserById(challengerId);
  const opponent = getUserById(opponentId);
  if (!me || !opponent) return { error: '用户不存在' };

  const id = roomId();
  const room: Room = {
    id,
    players: [
      { userId: challengerId, name: me.github_login, frame: 'normal' },
      { userId: opponentId, name: opponent.github_login, frame: 'mirror' },
    ],
    status: 'compiling',
    subscribers: new Set(),
    events: [],
    error: null,
  };
  rooms.set(id, room);
  // 10 分钟后清理房间 (回放已存库)
  setTimeout(() => {
    if (rooms.get(id) === room) rooms.delete(id);
  }, 10 * 60 * 1000);
  runMatch(room, mine.code, theirs.code).catch((err) => {
    room.status = 'error';
    room.error = err instanceof Error ? err.message : String(err);
    broadcast(room, { type: 'error', message: room.error });
  });
  return { roomId: id };
}

async function runMatch(room: Room, codeA: string, codeB: string): Promise<void> {
  ensureCwd(); // cwd 可能被外部删除, 运行前自愈
  console.log(`[${stamp()}] [combat] room=${room.id} 对局开始: ${room.players[0].name} vs ${room.players[1].name}`);
  const compiledA = await compilePlayerCode(codeA);
  const compiledB = await compilePlayerCode(codeB);
  if (!compiledA.ok) return failMatch(room, `${room.players[0].name} 的代码编译失败: ${compiledA.errors[0]?.message}`);
  if (!compiledB.ok) return failMatch(room, `${room.players[1].name} 的代码编译失败: ${compiledB.errors[0]?.message}`);

  const programA = new NodeProgram(compiledA.js);
  const programB = new NodeProgram(compiledB.js);
  try {
    await programA.load();
    await programB.load();
  } catch (err) {
    programA.dispose();
    programB.dispose();
    return failMatch(room, err instanceof Error ? err.message : String(err));
  }

  const controller = new GameController({
    mode: 'combat',
    players: [
      { name: room.players[0].name, frame: room.players[0].frame, program: programA },
      { name: room.players[1].name, frame: room.players[1].frame, program: programB },
    ],
    maxTurns: DEFAULT_MAX_TURNS,
  });

  room.status = 'running';
  broadcast(room, {
    type: 'match-start',
    config: {
      mode: 'combat',
      players: room.players.map((p) => ({ name: p.name })),
      maxTurns: DEFAULT_MAX_TURNS,
    },
  });

  const interval = Number(process.env.TURN_INTERVAL_MS ?? 800);
  let endResult: GameEvent | null = null;
  try {
    while (!controller.over) {
      const events = await controller.step();
      room.events.push(...events);
      for (const e of events) if (e.type === 'end') endResult = e;
      broadcast(room, { type: 'turn', turn: controller.world.turn, events });
      await sleep(interval);
    }
  } finally {
    programA.dispose();
    programB.dispose();
  }

  const end = endResult;
  if (!end || end.type !== 'end') return failMatch(room, '对局意外结束');

  const result = end.result;
  let winnerId: number | null = null;
  let loserId: number | null = null;
  let winner: string | null = null;
  let outcome: 'win' | 'loss' | 'draw' | 'error' = 'error';

  if (result.type === 'error') {
    winnerId = room.players[result.player === 0 ? 1 : 0].userId;
    loserId = room.players[result.player].userId;
    winner = room.players[result.player === 0 ? 1 : 0].name;
    outcome = 'loss';
  } else {
    const [s0, s1] = [result.scores[0].money, result.scores[1].money];
    if (s0 > s1) {
      winnerId = room.players[0].userId;
      loserId = room.players[1].userId;
      winner = room.players[0].name;
      outcome = 'win';
    } else if (s1 > s0) {
      winnerId = room.players[1].userId;
      loserId = room.players[0].userId;
      winner = room.players[1].name;
      outcome = 'win';
    } else {
      outcome = 'draw';
    }
  }

  if (outcome === 'win' || outcome === 'loss') {
    recordCombatResult(winnerId, loserId!);
  }

  const replay = JSON.stringify({
    config: {
      mode: 'combat',
      players: room.players.map((p) => ({ name: p.name })),
      maxTurns: DEFAULT_MAX_TURNS,
    },
    events: room.events,
  });
  const matchId = insertMatch(room.id, room.players[0].userId, room.players[1].userId, winnerId, outcome, replay);

  room.status = 'finished';
  console.log(`[${stamp()}] [combat] room=${room.id} 对局结束 matchId=${matchId} 胜者=${winner ?? '平局/中止'}`);
  broadcast(room, {
    type: 'match-end',
    matchId,
    result: {
      type: 'finished',
      scores: result.type === 'finished' ? result.scores : [],
      winner,
      outcome,
    },
  });
}

function failMatch(room: Room, message: string): void {
  room.status = 'error';
  room.error = message;
  broadcast(room, { type: 'error', message });
  room.events.push({ type: 'end', result: { type: 'error', player: -1, message } });
}

export function broadcast(room: Room, msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const ws of room.subscribers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

/** 订阅房间: 先回放已产生的事件, 之后实时推送 */
export function subscribeRoom(roomId: string, ws: WebSocket): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.subscribers.add(ws);
  ws.on('close', () => room.subscribers.delete(ws));
  if (room.status === 'running' || room.status === 'finished') {
    ws.send(
      JSON.stringify({
        type: 'match-start',
        config: {
          mode: 'combat',
          players: room.players.map((p) => ({ name: p.name })),
          maxTurns: DEFAULT_MAX_TURNS,
        },
      })
    );
    // 回放已产生的事件 (含每回合 snapshot), 前端按序应用
    ws.send(JSON.stringify({ type: 'replay-buffer', events: room.events }));
  }
  if (room.status === 'error') {
    ws.send(JSON.stringify({ type: 'error', message: room.error }));
  }
  return true;
}

export function listRooms(): {
  id: string;
  players: string[];
  status: Room['status'];
}[] {
  return [...rooms.values()].map((r) => ({
    id: r.id,
    players: r.players.map((p) => p.name),
    status: r.status,
  }));
}

export function combatList(userId: number) {
  return listCombatCodesExcluding(userId);
}

export function matchHistory(userId: number) {
  return listMatchesForUser(userId);
}

export function matchReplay(matchId: number, userId: number):
  | { config: unknown; events: GameEvent[] }
  | { error: string } {
  const m = getMatch(matchId);
  if (!m) return { error: '对局不存在' };
  if (m.player1_id !== userId && m.player2_id !== userId) return { error: '无权查看该对局' };
  try {
    const parsed = JSON.parse(m.replay) as { config: unknown; events: GameEvent[] };
    return { config: parsed.config, events: parsed.events };
  } catch {
    return { error: '回放数据损坏' };
  }
}
