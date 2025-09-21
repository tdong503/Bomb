import { v4 as uuid } from 'uuid';

export enum CardType {
  DEFUSE = 'DEFUSE',
  BOMB = 'BOMB',
  SKIP = 'SKIP',
  ATTACK = 'ATTACK',
  SEE_FUTURE = 'SEE_FUTURE',
  FAVOR = 'FAVOR',
  SHUFFLE = 'SHUFFLE',
  NOPE = 'NOPE',
  NORMAL = 'NORMAL',
  DRAW_BOTTOM = 'DRAW_BOTTOM',
  REVERSE = 'REVERSE',
  TARGETED_ATTACK = 'TARGETED_ATTACK',
  ALTER_FUTURE = 'ALTER_FUTURE',
  IMPLODING = 'IMPLODING',
  SALVAGE = 'SALVAGE'
}

export type NormalCatName =
  | 'BOSS_KITTEN'
  | 'SLIPPER_KITTEN'
  | 'BUG_KITTEN'
  | 'NEZHA_KITTEN'
  | 'LIGHTNING_KITTEN'
  | 'POTATO_KITTEN';

export interface Card {
  id: string;
  type: CardType;
  name?: NormalCatName; // only for NORMAL cards
  // future: metadata for art asset, expansion origin, etc.
}

export interface PlayerState {
  id: string;
  name: string;
  avatar?: string;
  hand: Card[];
  alive: boolean;
  seat: number; // fixed seat order
  remainingTurns: number; // used when attacked (stack of turns)
  disconnected?: boolean;
}

export interface GameOptions {
  playerCount: number;
  useExpansion: boolean; // include expansion set
  includeImploding: boolean; // include black hole (Imploding)
  seed?: string; // optional deterministic seed (not yet implemented)
}

export interface GameStateSnapshot {
  id: string;
  createdAt: number;
  started: boolean;
  finished: boolean;
  winnerPlayerId?: string;
  turnDirection: 1 | -1;
  currentPlayerIndex: number; // index into players array (alive players considered but we keep raw index for stability)
  players: PlayerState[];
  drawPileCount: number;
  discardTop?: Card; // show top for UI animations
  publicKnownCardsTop?: Card[]; // e.g. revealed by See Future (limited to current viewer context in real impl)
}

export interface InternalGameState {
  id: string;
  options: GameOptions;
  players: PlayerState[];
  drawPile: Card[];
  discardPile: Card[];
  turnDirection: 1 | -1;
  currentPlayerIndex: number;
  started: boolean;
  finished: boolean;
  winnerPlayerId?: string;
}

export function createNormalCat(name: NormalCatName): Card {
  return { id: uuid(), type: CardType.NORMAL, name };
}

export function createCard(type: CardType, name?: NormalCatName): Card {
  return { id: uuid(), type, name };
}

