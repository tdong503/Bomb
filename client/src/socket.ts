import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './types';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket() {
  if (!socket) {
    const url = (import.meta.env.VITE_SERVER_URL as string) || 'http://localhost:4000';
    socket = io(url, {
      autoConnect: true,
      transports: ['websocket'],
    });
  }
  return socket;
}

