import { createGame, GameEngine } from '../game/Game';
import { GameOptions } from '../game/types';
import { v4 as uuid } from 'uuid';

interface RoomPlayerMeta {
  id: string;
  name: string;
  avatar?: string;
  socketId: string;
}

export interface RoomState {
  id: string;
  hostId: string;
  createdAt: number;
  game: GameEngine;
  players: RoomPlayerMeta[]; // mapping to engine players
  options: GameOptions;
  pendingTimer?: NodeJS.Timeout; // for NOPE resolution
  favorTimer?: NodeJS.Timeout; // for favor selection timeout
  pendingNopeExpireAt?: number;
  pendingFavorExpireAt?: number;
}

export class RoomManager {
  private rooms: Map<string, RoomState> = new Map();

  createRoom(hostSocketId: string, hostPlayerId: string, name: string, avatar: string | undefined, options: GameOptions): RoomState {
    const roomId = uuid().slice(0, 6);
    const game = createGame({ ...options });
    game.addPlayer(hostPlayerId, name, avatar);
    const room: RoomState = {
      id: roomId,
      hostId: hostPlayerId,
      createdAt: Date.now(),
      game,
      players: [{ id: hostPlayerId, name, avatar, socketId: hostSocketId }],
      options
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(id: string): RoomState | undefined {
    return this.rooms.get(id);
  }

  joinRoom(roomId: string, socketId: string, playerId: string, name: string, avatar?: string): RoomState | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const existing = room.players.find(p => p.id === playerId);
    if (!existing) {
      if (!room.game.addPlayer(playerId, name, avatar)) return room; // maybe full
      room.players.push({ id: playerId, name, avatar, socketId });
    } else {
      existing.socketId = socketId; // reconnect
      existing.name = name;
      existing.avatar = avatar;
    }
    return room;
  }

  leaveRoom(roomId: string, playerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    // soft removal from game not implemented (player stays ghost). Could implement elimination.
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    }
  }

  startGame(roomId: string, requesterId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== requesterId) return false;
    return room.game.start();
  }

  swapSeats(roomId: string, playerId: string, targetSeat: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const game = room.game as any;
    if (game.state?.started) return false; // cannot swap after start (state is private; using any for test)
    // We rely on players array order as seat order
    const idx = game.state.players.findIndex((p: any) => p.id === playerId);
    if (idx === -1) return false;
    if (targetSeat < 0 || targetSeat >= game.state.players.length) return false;
    const [p] = game.state.players.splice(idx, 1);
    game.state.players.splice(targetSeat, 0, p);
    game.state.players.forEach((pl: any, i: number) => (pl.seat = i));
    return true;
  }

  restart(roomId: string, requesterId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== requesterId) return false;
    if (!room.game.getStateSnapshot().finished) return false;
    // Capture players
    const oldPlayers = room.game.getStateSnapshot().players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
    room.game = createGame({ ...room.options, playerCount: oldPlayers.length });
    for (const p of oldPlayers) {
      room.game.addPlayer(p.id, p.name, p.avatar);
    }
    return room.game.start();
  }
}

export const roomManager = new RoomManager();
