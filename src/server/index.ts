import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { roomManager } from './rooms';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', socket => {
  // Basic handshake (client provides playerId & name)
  socket.on('createRoom', (data, cb) => {
    try {
      const { playerId, name, avatar, options } = data;
      const room = roomManager.createRoom(socket.id, playerId, name, avatar, options);
      socket.join(room.id);
      io.to(room.id).emit('roomUpdate', { roomId: room.id, state: room.game.getStateSnapshot() });
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
    io.to(room.id).emit('roomUpdate', { roomId: room.id, state: room.game.getStateSnapshot() });
    cb?.({ ok: true });
  });

  socket.on('startGame', (data, cb) => {
    const { roomId, playerId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const ok = roomManager.startGame(roomId, playerId);
    io.to(room.id).emit('gameState', room.game.getStateSnapshot());
    cb?.({ ok });
  });

  socket.on('playCard', (data, cb) => {
    const { roomId, playerId, cardId, extra } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const result = room.game.playCard(playerId, cardId, extra);
    io.to(room.id).emit('gameState', room.game.getStateSnapshot());
    cb?.({ ok: result.success, message: result.message });
  });

  socket.on('draw', (data, cb) => {
    const { roomId, playerId } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    const result = room.game.draw(playerId);
    io.to(room.id).emit('gameState', room.game.getStateSnapshot());
    cb?.({ ok: true, result });
  });

  socket.on('playCombo', (data, cb) => {
    const { roomId, playerId, cardIds, params } = data;
    const room = roomManager.getRoom(roomId);
    if (!room) return cb?.({ ok: false, error: 'Room not found' });
    // @ts-ignore access to engine
    const result = room.game.playCombo(playerId, cardIds, params);
    io.to(room.id).emit('gameState', room.game.getStateSnapshot());
    cb?.({ ok: result.success, result });
  });

  socket.on('swapSeat', (data, cb) => {
    const { roomId, playerId, targetSeat } = data;
    const ok = roomManager.swapSeats(roomId, playerId, targetSeat);
    const room = roomManager.getRoom(roomId);
    if (room) io.to(room.id).emit('roomUpdate', { roomId: room.id, state: room.game.getStateSnapshot() });
    cb?.({ ok });
  });

  socket.on('restartGame', (data, cb) => {
    const { roomId, playerId } = data;
    const ok = roomManager.restart(roomId, playerId);
    const room = roomManager.getRoom(roomId);
    if (room) io.to(room.id).emit('gameState', room.game.getStateSnapshot());
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
