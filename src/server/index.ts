import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { roomManager } from './rooms';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function broadcastGameState(room: any) {
  const base = room.game.getStateSnapshot();
  // attach expire timestamps
  base.pendingNopeExpireAt = room.pendingNopeExpireAt;
  base.pendingFavorExpireAt = room.pendingFavorExpireAt;
  for (const meta of room.players) {
    const snap = JSON.parse(JSON.stringify(base));
    snap.players = snap.players.map((p: any) => {
      if (p.id === meta.id) return p;
      return { ...p, hand: new Array(p.hand.length).fill({}) };
    });
    io.to(meta.socketId).emit('gameState', snap);
  }
  // Manage favor timer
  if (base.pendingFavor) {
    if (!room.favorTimer) {
      room.pendingFavorExpireAt = Date.now() + 5000;
      room.favorTimer = setTimeout(() => {
        (room.game as any).autoResolveFavor();
        room.favorTimer = undefined;
        room.pendingFavorExpireAt = undefined;
        broadcastGameState(room);
      }, 5000);
    }
  } else if (room.favorTimer) {
    clearTimeout(room.favorTimer); room.favorTimer = undefined; room.pendingFavorExpireAt = undefined;
  }
  if (!base.pendingNope && room.pendingNopeExpireAt) {
    room.pendingNopeExpireAt = undefined;
  }
}

io.on('connection', socket => {
  // Basic handshake (client provides playerId & name)
  socket.on('createRoom', (data, cb) => {
    try {
      const { playerId, name, avatar, options } = data;
      const room = roomManager.createRoom(socket.id, playerId, name, avatar, options);
      socket.join(room.id);
      io.to(room.id).emit('roomUpdate', { roomId: room.id, hostId: room.hostId, state: room.game.getStateSnapshot() });
      cb?.({ ok: true, roomId: room.id });
    } catch (e: any) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on('joinRoom', (data, cb) => {
    const { roomId, playerId, name, avatar } = data;
    const room = roomManager.joinRoom(roomId, socket.id, playerId, name, avatar);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    socket.join(room.id);
    io.to(room.id).emit('roomUpdate', { roomId: room.id, hostId: room.hostId, state: room.game.getStateSnapshot() });
    cb?.({ ok: true });
  });

  socket.on('startGame', (data, cb) => {
    const { roomId, playerId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const ok = roomManager.startGame(roomId, playerId);
    if (ok) broadcastGameState(room);
    cb?.({ ok });
  });

  socket.on('playCard', (data, cb) => {
    const { roomId, playerId, cardId, extra } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const result: any = (room.game as any).playCard(playerId, cardId, extra);
    if (result.pending) {
      if (room.pendingTimer) clearTimeout(room.pendingTimer);
      room.pendingNopeExpireAt = Date.now() + 4000;
      room.pendingTimer = setTimeout(() => {
        const outcome = (room.game as any).resolvePendingNow();
        io.to(room.id).emit('nopeResolved', { roomId: room.id, outcome });
        room.pendingNopeExpireAt = undefined;
        broadcastGameState(room);
      }, 4000);
    }
    broadcastGameState(room);
    cb?.({ ok: result.success, message: result.message, pending: result.pending });
  });

  socket.on('playNope', (data, cb) => {
    const { roomId, playerId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const res: any = (room.game as any).playNope(playerId);
    if (res.success) {
      if (room.pendingTimer) clearTimeout(room.pendingTimer);
      room.pendingNopeExpireAt = Date.now() + 3000;
      room.pendingTimer = setTimeout(() => {
        const outcome = (room.game as any).resolvePendingNow();
        io.to(room.id).emit('nopeResolved', { roomId: room.id, outcome });
        room.pendingNopeExpireAt = undefined;
        broadcastGameState(room);
      }, 3000);
    }
    broadcastGameState(room);
    cb?.({ ok: res.success, message: res.message });
  });

  socket.on('provideFavorCard', (data, cb) => {
    const { roomId, playerId, cardId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const res: any = (room.game as any).provideFavorCard(playerId, cardId);
    room.pendingFavorExpireAt = undefined;
    broadcastGameState(room);
    cb?.({ ok: res.success, cardId: res.cardId });
  });

  socket.on('forceResolveNope', (data, cb) => {
    const { roomId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    if (room.pendingTimer) { clearTimeout(room.pendingTimer); room.pendingTimer = undefined; }
    const outcome = (room.game as any).resolvePendingNow();
    io.to(room.id).emit('nopeResolved', { roomId: room.id, outcome });
    room.pendingNopeExpireAt = undefined;
    broadcastGameState(room);
    cb?.({ ok: true, outcome });
  });

  socket.on('swapSeat', (data, cb) => {
    const { roomId, playerId, targetSeat } = data;
    const ok = roomManager.swapSeats(roomId, playerId, targetSeat);
    const room = roomManager.getRoom(roomId);
    if (room) io.to(room.id).emit('roomUpdate', { roomId: room.id, hostId: room.hostId, state: room.game.getStateSnapshot() });
    cb?.({ ok });
  });

  socket.on('draw', (data, cb) => {
    const { roomId, playerId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const result = room.game.draw(playerId);
    broadcastGameState(room);
    cb?.({ ok: true, result });
  });

  socket.on('playCombo', (data, cb) => {
    const { roomId, playerId, cardIds, params } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const result = (room.game as any).playCombo(playerId, cardIds, params);
    broadcastGameState(room);
    cb?.({ ok: result.success, result });
  });

  socket.on('restartGame', (data, cb) => {
    const { roomId, playerId } = data;
    const ok = roomManager.restart(roomId, playerId);
    const room = roomManager.getRoom(roomId);
    if (room) broadcastGameState(room);
    cb?.({ ok });
  });

  socket.on('disconnect', () => {
    // For simplicity we do nothing; reconnection handled by joinRoom with same playerId
  });
});

app.post('/api/createRoom', (req, res) => {
  try {
    const { playerId, name, avatar, options } = req.body || {};
    if (!playerId || !name) return res.status(400).json({ ok: false, error: 'Missing player info' });
    const room = roomManager.createRoom('HTTP', playerId, name, avatar, options || { playerCount: 8, useExpansion: false, includeImploding: false });
    return res.json({ ok: true, roomId: room.id });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
export function startServer() {
  server.listen(PORT, () => {
    console.log('Server listening on port', PORT);
  });
}

if (require.main === module) {
  startServer();
}
