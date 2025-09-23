export type PlayerID = string;
export type RoomID = string;

export enum Direction {
  Clockwise = 1,
  CounterClockwise = -1,
}

export enum CardFamily {
  Special = 'SPECIAL',
  Common = 'COMMON',
}

export enum CardType {
  Defuse = 'DEFUSE',
  Bomb = 'BOMB',
  Imploding = 'IMPLODING',
  Skip = 'SKIP',
  Attack = 'ATTACK',
  TargetedAttack = 'TARGETED_ATTACK',
  Reverse = 'REVERSE',
  SeeTheFuture = 'SEE_FUTURE',
  AlterTheFuture = 'ALTER_FUTURE',
  Favor = 'FAVOR',
  Shuffle = 'SHUFFLE',
  DrawFromBottom = 'DRAW_BOTTOM',
  Nope = 'NOPE',
  Salvage = 'SALVAGE',
  // Common families
  BossKitten = 'BOSS_KITTEN',
  SlipperKitten = 'SLIPPER_KITTEN',
  BugKitten = 'BUG_KITTEN',
  NezhaKitten = 'NEZHA_KITTEN',
  LightningKitten = 'LIGHTNING_KITTEN',
  PotatoKitten = 'POTATO_KITTEN',
}

export interface Card {
  id: string;
  type: CardType;
  family: CardFamily;
  meta?: Record<string, any>;
  visible?: boolean; // e.g. Imploding after first draw
}

export interface PlayerPublic {
  id: PlayerID;
  nickname: string;
  avatar?: string;
  seat: number;
  alive: boolean;
  handSize: number;
  finishRank?: number; // 1 => champion (last alive), etc.
  connected: boolean;
}

export interface PlayerPrivate extends PlayerPublic {
  hand: Card[];
  socketId?: string;
  pendingTurns: number; // for Attack stacking
}

export interface RoomOptions {
  expansion: boolean; // whether extension pack used
  enableImploding: boolean;
  maxPlayers: number;
}

export interface RoomStatePublic {
  roomId: RoomID;
  ownerId: PlayerID;
  players: PlayerPublic[];
  started: boolean;
  direction: Direction;
  turnPlayerId?: PlayerID;
  deckCount: number;
  discardTop?: Card; // top of discard visible
  waitingForDefusePlacement?: boolean;
  nopeWindow?: NopeWindowState;
  createdAt: number;
  options: RoomOptions;
  winnerId?: PlayerID;
  rankOrder: PlayerID[]; // elimination order last->first or similar
  attackChain?: AttackChainInfo;
}

export interface AttackChainInfo {
  currentVictimId: PlayerID;
  remainingTurnsForVictim: number;
}

export interface NopeWindowState {
  actionId: string; // unique id per actionable stack
  cardPlayed: CardType;
  sourcePlayerId: PlayerID;
  expiresAt: number; // epoch ms
  chain: NopeChainEntry[]; // sequence of nopes
  resolved: boolean;
}

export interface NopeChainEntry {
  playerId: PlayerID;
  cardId: string;
  timestamp: number;
}

export interface InternalRoomState {
  room: RoomStatePublic;
  players: Map<PlayerID, PlayerPrivate>;
  deck: Card[]; // top at end (pop) or index 0? We'll use deck[deck.length-1] as top.
  discard: Card[]; // top is last element
  rngSeed: number;
  nextActionCounter: number;
  pendingDefuse?: { playerId: PlayerID; bomb: Card };
}

export interface CreateRoomPayload {
  nickname: string;
  avatar?: string;
  options?: Partial<RoomOptions>;
}

export interface JoinRoomPayload {
  roomId: string;
  nickname: string;
  avatar?: string;
}

export interface PlayCardPayload {
  cardId: string;
  comboCardIds?: string[]; // for multi-card combos
  targetPlayerId?: PlayerID;
  namedCardType?: CardType; // for 3-of specifying target card type, or 5 distinct
  bottomInsertIndex?: number; // placeholder for defuse insertion logic
  extra?: Record<string, any>;
}

export interface UseNopePayload {
  actionId: string;
  cardId: string; // nope card id
}

export interface SeatChangePayload {
  toSeat: number;
}

export interface SalvageResult {
  success: boolean;
  card?: Card;
}

export type ServerToClientEvents = {
  'room:update': (room: RoomStatePublic) => void;
  'room:joined': (room: RoomStatePublic, you: PlayerPrivate) => void;
  'room:error': (message: string) => void;
  'game:yourHand': (hand: Card[]) => void;
  'game:seeFuture': (cards: Card[], alterable: boolean) => void;
  'game:defuse': (bombCard: Card) => void; // ask for placement
  'game:log': (entry: GameLogEntry) => void;
  'reconnect:token': (playerId: PlayerID, roomId?: RoomID) => void;
};

export type ClientToServerEvents = {
  'room:create': (payload: CreateRoomPayload, cb: (res: { ok: boolean; roomId?: string; error?: string; token?: string }) => void) => void;
  'room:join': (payload: JoinRoomPayload, cb: (res: { ok: boolean; error?: string; token?: string }) => void) => void;
  'room:leave': () => void;
  'room:start': () => void;
  'seat:change': (payload: SeatChangePayload) => void;
  'game:playCard': (payload: PlayCardPayload) => void;
  'game:draw': () => void;
  'game:useNope': (payload: UseNopePayload) => void;
  'game:defuse': (cardId: string, position: number) => void;
  'game:restart': () => void;
};

export interface GameLogEntry {
  id: string;
  ts: number;
  type: string;
  text: string;
  data?: any;
}
