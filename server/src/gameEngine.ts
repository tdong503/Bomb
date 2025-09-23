import { InternalRoomState, PlayerID, CardType, Card, PlayerPrivate } from './types';
import { shuffleInPlace } from './util';

export interface PlayContext {
  state: InternalRoomState;
  player: PlayerPrivate;
  card: Card;
  targetId?: PlayerID;
}

export function canPlay(state: InternalRoomState, playerId: PlayerID, cardId: string) {
  const player = state.players.get(playerId);
  if (!player || !player.alive) return false;
  if (state.room.turnPlayerId !== playerId) return false; // (忽略可响应时机例如否决)
  return player.hand.some(c => c.id === cardId);
}

export function processPlay(ctx: PlayContext) {
  const { card, state, player } = ctx;
  switch (card.type) {
    case CardType.Skip:
      endTurn(state, player, { viaSkip: true });
      break;
    case CardType.Attack:
      applyAttack(state, player, undefined);
      break;
    case CardType.TargetedAttack:
      applyAttack(state, player, ctx.targetId);
      break;
    case CardType.Reverse:
      state.room.direction = state.room.direction === 1 ? -1 : 1;
      break;
    case CardType.SeeTheFuture:
      emitSeeFuture(state, player, 3, false);
      break;
    case CardType.AlterTheFuture:
      emitSeeFuture(state, player, 3, true);
      break;
    case CardType.Shuffle:
      shuffleInPlace(state.deck);
      state.room.deckCount = state.deck.length;
      break;
    case CardType.Favor:
      if (ctx.targetId) favorTransfer(state, player.id, ctx.targetId);
      break;
    case CardType.DrawFromBottom:
      // 立即执行一次“抽底”视为本回合一次抽牌
      drawCardGeneric(state, player.id, true /* fromBottom */);
      break;
    case CardType.Salvage:
      salvageFromDiscard(state, player.id);
      break;
    default:
      // 普通猫牌或暂未实现的功能牌：无效果
      break;
  }
}

function favorTransfer(state: InternalRoomState, fromId: PlayerID, targetId: PlayerID) {
  if (fromId === targetId) return;
  const target = state.players.get(targetId); const from = state.players.get(fromId);
  if (!target || !from || !target.hand.length) return;
  const idx = Math.floor(Math.random() * target.hand.length);
  const card = target.hand.splice(idx, 1)[0];
  from.hand.push(card);
  updateHandPublic(state, targetId);
  updateHandPublic(state, fromId);
}

function applyAttack(state: InternalRoomState, player: PlayerPrivate, specifiedTarget?: PlayerID) {
  const carry = Math.max(1, player.pendingTurns); // 剩余需要执行的回合数（至少1）
  player.pendingTurns = 0; // 自己不再执行剩余抽牌
  const next = getNextAlivePlayer(state, player.id);
  if (!next) return;
  const target = specifiedTarget ? state.players.get(specifiedTarget) || next : next;
  target.pendingTurns += carry; // 叠加：原本至少1，增加 carry
  advanceTurn(state);
}

export function drawCardGeneric(state: InternalRoomState, playerId: PlayerID, fromBottom = false) {
  const player = state.players.get(playerId); if (!player) return;
  if (state.room.turnPlayerId !== playerId) return;
  if (state.pendingDefuse && state.pendingDefuse.playerId === playerId) return; // 正在放置炸弹，不能抽
  const card = fromBottom ? state.deck.shift() : state.deck.pop();
  if (!card) return; // 牌堆耗尽（可加入平局/胜利逻辑）
  state.room.deckCount = state.deck.length;

  if (card.type === CardType.Bomb) {
    const defIndex = player.hand.findIndex(c => c.type === CardType.Defuse);
    if (defIndex >= 0) {
      const defuse = player.hand.splice(defIndex, 1)[0];
      // 拆除牌进入弃牌
      state.discard.push(defuse);
      // 进入待放置阶段
      state.pendingDefuse = { playerId, bomb: card };
      state.room.waitingForDefusePlacement = true;
      updateHandPublic(state, playerId);
      return; // 等待客户端“game:defuse” 指定位置
    } else {
      eliminatePlayer(state, playerId, card);
    }
  } else {
    player.hand.push(card);
  }
  updateHandPublic(state, playerId);
  // 完成一次抽牌 -> 回合使用次数减少
  player.pendingTurns -= 1;
  if (player.pendingTurns <= 0) {
    player.pendingTurns = 0;
    advanceTurn(state);
  }
}

export function placeDefusedBomb(state: InternalRoomState, playerId: PlayerID, position: number, cardId: string) {
  if (!state.pendingDefuse) return false;
  if (state.pendingDefuse.playerId !== playerId) return false;
  const { bomb } = state.pendingDefuse;
  if (bomb.id !== cardId) return false;
  // 位置定义：0 = 底部(index 0)，deck.length = 顶部（下一位最可能抽到）
  const pos = Math.min(Math.max(0, position), state.deck.length);
  state.deck.splice(pos, 0, bomb);
  state.room.deckCount = state.deck.length;
  state.pendingDefuse = undefined;
  state.room.waitingForDefusePlacement = false;
  // 放置后继续：当前玩家还需要继续其剩余的 pendingTurns 抽牌吗？规则：拆除后该次抽牌视为已完成。
  const player = state.players.get(playerId);
  if (player) {
    player.pendingTurns -= 1;
    if (player.pendingTurns <= 0) {
      player.pendingTurns = 0;
      advanceTurn(state);
    }
  }
  return true;
}

function salvageFromDiscard(state: InternalRoomState, playerId: PlayerID) {
  if (!state.discard.length) return;
  const player = state.players.get(playerId); if (!player) return;
  const idx = Math.floor(Math.random() * state.discard.length);
  const card = state.discard.splice(idx, 1)[0];
  player.hand.push(card);
  updateHandPublic(state, playerId);
}

function endTurn(state: InternalRoomState, player: PlayerPrivate, _opts?: any) {
  player.pendingTurns = 0;
  advanceTurn(state);
}

function emitSeeFuture(state: InternalRoomState, player: PlayerPrivate, count: number, alterable: boolean) {
  const top = state.deck.slice(-count);
  (player as any).__seeFutureResult = { cards: top, alterable };
}

function eliminatePlayer(state: InternalRoomState, playerId: PlayerID, bombCard: Card) {
  const p = state.players.get(playerId); if (!p) return;
  p.alive = false;
  state.discard.push(bombCard);
  p.hand.forEach(c => state.discard.push(c));
  p.hand = [];
  p.handSize = 0;
  state.room.rankOrder.push(playerId);
  const alive = [...state.players.values()].filter(pl => pl.alive);
  if (alive.length === 1) {
    state.room.winnerId = alive[0].id;
  }
}

function advanceTurn(state: InternalRoomState) {
  if (state.room.winnerId) return;
  const currentId = state.room.turnPlayerId;
  const next = getNextAlivePlayer(state, currentId);
  if (!next) return;
  state.room.turnPlayerId = next.id;
  if (next.pendingTurns <= 0) next.pendingTurns = 1;
}

function getNextAlivePlayer(state: InternalRoomState, fromId?: PlayerID) {
  const players = [...state.room.players].sort((a,b)=>a.seat-b.seat);
  const alive = players.filter(p => state.players.get(p.id)?.alive);
  if (alive.length === 0) return undefined;
  if (!fromId) return state.players.get(alive[0].id);
  const dir = state.room.direction === 1 ? 1 : -1;
  const currentIdx = alive.findIndex(p => p.id === fromId);
  let idx = currentIdx;
  let steps = 0;
  do {
    idx += dir;
    if (idx < 0) idx = alive.length - 1;
    if (idx >= alive.length) idx = 0;
    steps++;
    const cand = state.players.get(alive[idx].id);
    if (cand && cand.alive) return cand;
  } while (steps <= alive.length + 1);
  return undefined;
}

function updateHandPublic(state: InternalRoomState, playerId: PlayerID) {
  const p = state.players.get(playerId); if (!p) return;
  const pub = state.room.players.find(pp => pp.id === playerId); if (!pub) return;
  pub.handSize = p.hand.length;
  p.handSize = p.hand.length; // 同步私有视图
}

export function extractSeeFutureResult(player: PlayerPrivate) {
  const res = (player as any).__seeFutureResult as { cards: Card[]; alterable: boolean } | undefined;
  delete (player as any).__seeFutureResult;
  return res;
}
