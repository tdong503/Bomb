import { io } from 'socket.io-client';

export const socket = io('/', { autoConnect: true });

// Simple event bus
class Bus { constructor(){ this.listeners = {}; }
  on(evt, fn){ (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data){ (this.listeners[evt]||[]).forEach(fn=>fn(data)); }
}
export const stateBus = new Bus();

socket.on('roomUpdate', data => stateBus.emit('roomUpdate', data));
socket.on('gameState', data => stateBus.emit('gameState', data));

const nameKey = 'bomb_player_name';
export function getPlayerId(){ let id = localStorage.getItem('bomb_player_id'); if(!id){ id = crypto.randomUUID(); localStorage.setItem('bomb_player_id', id);} return id; }
export function ensureName(){ let n = localStorage.getItem(nameKey); if(!n){ n = '玩家'+Math.floor(Math.random()*1000); localStorage.setItem(nameKey, n);} return n; }
export function setName(n){ localStorage.setItem(nameKey, n); }

