import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager';
import { ClientToServerEvents, ServerToClientEvents, CreateRoomPayload, JoinRoomPayload, PlayCardPayload } from './types';
import { canPlay, processPlay, drawCardGeneric, extractSeeFutureResult, placeDefusedBomb } from './gameEngine';
import path from 'path';
import fs from 'fs';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

interface ConnectionContext {
  playerId?: string;
  roomId?: string;
  token?: string;
}

const app = express();
app.use(cors());
// 静态托管（若存在构建后的前端）
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // 保持前端路由回退
  app.get('/', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  app.get('/index.html', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'bomb-server' });
  });
}

const server = http.createServer(app);
const io: Server<ClientToServerEvents, ServerToClientEvents> = new Server(server, {
  cors: { origin: '*' },
});

const manager = new RoomManager();
const tokenMap = new Map<string, { roomId: string; playerId: string }>();

function makeToken() { return Math.random().toString(36).slice(2); }

function emitRoom(roomId: string) {
  const st = manager.getRoom(roomId);
  if (!st) return;
  io.to(roomId).emit('room:update', manager.toPublic(st));
}

function sendHand(roomId: string, playerId: string, socketId?: string) {
  const st = manager.getRoom(roomId); if (!st) return;
  const player = st.players.get(playerId); if (!player) return;
  const target = socketId ? io.sockets.sockets.get(socketId) : undefined;
  const emitter = target || io.sockets.sockets.get(player.socketId || '');
  if (emitter) emitter.emit('game:yourHand', player.hand);
}

io.on('connection', socket => {
  const ctx: ConnectionContext = {};
  console.log('Client connected', socket.id);

  socket.on('room:create', (payload: CreateRoomPayload, cb) => {
    try {
      const { roomId, player, room } = manager.createRoom(payload);
      player.socketId = socket.id;
      ctx.playerId = player.id;
      ctx.roomId = roomId;
      const token = makeToken();
      ctx.token = token;
      tokenMap.set(token, { roomId, playerId: player.id });
      socket.join(roomId);
      cb({ ok: true, roomId, token });
      socket.emit('room:joined', manager.toPublic(room), player);
      sendHand(roomId, player.id, socket.id);
      emitRoom(roomId);
    } catch (e: any) {
      cb({ ok: false, error: e.message });
    }
  });

  socket.on('room:join', (payload: JoinRoomPayload, cb) => {
    try {
      const { player, room } = manager.joinRoom(payload.roomId, payload.nickname, payload.avatar);
      player.socketId = socket.id;
      ctx.playerId = player.id;
      ctx.roomId = payload.roomId;
      const token = makeToken();
      ctx.token = token;
      tokenMap.set(token, { roomId: payload.roomId, playerId: player.id });
      socket.join(payload.roomId);
      cb({ ok: true, token });
      socket.emit('room:joined', manager.toPublic(room), player);
      sendHand(payload.roomId, player.id, socket.id);
      emitRoom(payload.roomId);
    } catch (e: any) {
      cb({ ok: false, error: e.message });
    }
  });

  socket.on('room:leave', () => {
    if (!ctx.roomId || !ctx.playerId) return;
    socket.leave(ctx.roomId);
    // Soft leave (keep player for reconnection) — future enhancement: mark disconnected
  });

  socket.on('room:start', () => {
    if (!ctx.roomId || !ctx.playerId) return;
    const st = manager.getRoom(ctx.roomId); if (!st) return;
    if (st.room.ownerId !== ctx.playerId) return;
    try {
      manager.startGame(ctx.roomId);
      emitRoom(ctx.roomId);
      // send all hands privately
      for (const p of st.players.values()) sendHand(ctx.roomId, p.id);
    } catch (e) {
      console.error(e);
      socket.emit('room:error', (e as any).message);
    }
  });

  socket.on('game:draw', () => {
    if (!ctx.roomId || !ctx.playerId) return;
    const st = manager.getRoom(ctx.roomId); if (!st) return;
    if (st.room.turnPlayerId !== ctx.playerId) return; // not your turn
    const player = st.players.get(ctx.playerId); if (!player || !player.alive) return;
    drawCardGeneric(st, ctx.playerId, false);
    // 如果进入拆除阶段
    if (st.pendingDefuse && st.pendingDefuse.playerId === ctx.playerId) {
      socket.emit('game:defuse', st.pendingDefuse.bomb);
    }
    emitRoom(ctx.roomId);
    sendHand(ctx.roomId, ctx.playerId);
  });

  socket.on('game:playCard', (payload: PlayCardPayload) => {
    if (!ctx.roomId || !ctx.playerId) return;
    const st = manager.getRoom(ctx.roomId); if (!st) return;
    const player = st.players.get(ctx.playerId); if (!player) return;

    // 组合出牌逻辑（两张/三张相同）
    if (payload.comboCardIds && payload.comboCardIds.length) {
      const allIds = [payload.cardId, ...payload.comboCardIds];
      const cards = allIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean) as any[];
      if (cards.length !== allIds.length) return; // 有不存在的牌
      const allSameType = cards.every(c => c.type === cards[0].type);
      // 从手牌移除并放入弃牌堆
      player.hand = player.hand.filter(c => !allIds.includes(c.id));
      cards.forEach(c => st.discard.push(c));
      player.handSize = player.hand.length;

      if (allSameType && cards.length === 2) {
        // 两张相同：随机抽目标玩家一张手牌
        if (!payload.targetPlayerId) return emitRoom(ctx.roomId);
        const target = st.players.get(payload.targetPlayerId);
        if (target && target.alive && target.hand.length) {
          const idx = Math.floor(Math.random() * target.hand.length);
            const stolen = target.hand.splice(idx, 1)[0];
            player.hand.push(stolen);
            // 更新公开 handSize
            const tPub = st.room.players.find(p=>p.id===target.id); if (tPub) tPub.handSize = target.hand.length;
        }
      } else if (allSameType && cards.length === 3) {
        // 三张相同：指定抽目标指定类型一张（若存在）
        if (!payload.targetPlayerId || !payload.namedCardType) return emitRoom(ctx.roomId);
        const target = st.players.get(payload.targetPlayerId);
        if (target && target.alive) {
          const wantedIdx = target.hand.findIndex(c => c.type === payload.namedCardType);
          if (wantedIdx >= 0) {
            const got = target.hand.splice(wantedIdx,1)[0];
            player.hand.push(got);
            const tPub = st.room.players.find(p=>p.id===target.id); if (tPub) tPub.handSize = target.hand.length;
          }
        }
      } else {
        // 未实现的其他组合（四张/五张）暂时仅弃置
      }
      // 更新当前玩家手牌公开数
      const pub = st.room.players.find(p=>p.id===player.id); if (pub) pub.handSize = player.hand.length;
      emitRoom(ctx.roomId);
      sendHand(ctx.roomId, player.id);
      return;
    }

    if (!canPlay(st, ctx.playerId, payload.cardId)) return;
    const idx = player.hand.findIndex(c => c.id === payload.cardId);
    if (idx < 0) return;
    const card = player.hand.splice(idx, 1)[0];
    st.discard.push(card);
    player.handSize = player.hand.length;
    processPlay({ state: st, player, card, targetId: payload.targetPlayerId });
    const sf = extractSeeFutureResult(player);
    if (st.pendingDefuse && st.pendingDefuse.playerId === ctx.playerId) {
      socket.emit('game:defuse', st.pendingDefuse.bomb);
    }
    emitRoom(ctx.roomId);
    sendHand(ctx.roomId, player.id);
    if (sf) socket.emit('game:seeFuture', sf.cards, sf.alterable);
  });

  socket.on('game:defuse', (cardId: string, position: number) => {
    if (!ctx.roomId || !ctx.playerId) return;
    const st = manager.getRoom(ctx.roomId); if (!st) return;
    if (!st.pendingDefuse || st.pendingDefuse.playerId !== ctx.playerId) return;
    const ok = placeDefusedBomb(st, ctx.playerId, position, cardId);
    if (!ok) return;
    emitRoom(ctx.roomId);
    sendHand(ctx.roomId, ctx.playerId);
  });

  socket.on('game:restart', () => {
    // TODO: implement restart flow
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

function advanceTurnBasic(st: ReturnType<RoomManager['getRoom']>) {
  if (!st) return;
  const alive = st.room.players.filter(p => st.players.get(p.id)?.alive);
  if (alive.length <= 1) {
    if (alive.length === 1) st.room.winnerId = alive[0].id;
    return; // game over
  }
  const order = [...alive].sort((a,b)=>a.seat-b.seat);
  const currentIndex = order.findIndex(p => p.id === st.room.turnPlayerId);
  let nextIndex = currentIndex + (st.room.direction === 1 ? 1 : -1);
  if (nextIndex < 0) nextIndex = order.length - 1;
  if (nextIndex >= order.length) nextIndex = 0;
  st.room.turnPlayerId = order[nextIndex].id;
}

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
