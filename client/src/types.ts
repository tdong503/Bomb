// Client-side light copies of shared types (could be factored to a shared package later)
export type PlayerID = string;
export interface PlayerPublic {
  id: PlayerID;
  nickname: string;
  avatar?: string;
  seat: number;
  alive: boolean;
  handSize: number;
  finishRank?: number;
  connected: boolean;
}
export interface RoomOptions {
  expansion: boolean;
  enableImploding: boolean;
  maxPlayers: number;
}
export interface RoomStatePublic {
  roomId: string;
  ownerId: PlayerID;
  players: PlayerPublic[];
  started: boolean;
  direction: 1 | -1;
  turnPlayerId?: PlayerID;
  deckCount: number;
  createdAt: number;
  options: RoomOptions;
  winnerId?: PlayerID;
  rankOrder: PlayerID[];
}
export interface Card { id: string; type: string; family: string; visible?: boolean; }

export interface ServerToClientEvents {
  'room:update': (room: RoomStatePublic) => void;
  'room:joined': (room: RoomStatePublic, you: any) => void;
  'room:error': (message: string) => void;
  'game:yourHand': (hand: Card[]) => void;
  'game:log': (entry: any) => void;
  'game:seeFuture': (cards: Card[], alterable: boolean) => void;
  'game:defuse': (bombCard: Card) => void;
}
export interface ClientToServerEvents {
  'room:create': (payload: { nickname: string; avatar?: string; options?: Partial<RoomOptions> }, cb: (res: any) => void) => void;
  'room:join': (payload: { roomId: string; nickname: string; avatar?: string }, cb: (res: any) => void) => void;
  'room:start': () => void;
  'game:draw': () => void;
  'game:playCard': (payload: { cardId: string; comboCardIds?: string[]; targetPlayerId?: string; namedCardType?: string }) => void;
  'game:defuse': (cardId: string, position: number) => void;
}
