import { Card, CardType, createCard, createNormalCat, GameOptions } from './types';

interface BaseCounts {
  [key: string]: number;
}

const BASE_FUNCTION_COUNTS: BaseCounts = {
  [CardType.SKIP]: 4,
  [CardType.ATTACK]: 4,
  [CardType.SEE_FUTURE]: 5,
  [CardType.FAVOR]: 4,
  [CardType.SHUFFLE]: 4,
  [CardType.NOPE]: 5
};

const NORMAL_CATS = [
  'BOSS_KITTEN',
  'SLIPPER_KITTEN',
  'BUG_KITTEN',
  'NEZHA_KITTEN',
  'LIGHTNING_KITTEN'
] as const;

const EXPANSION_FUNCTION_COUNTS: BaseCounts = {
  [CardType.DRAW_BOTTOM]: 4,
  [CardType.REVERSE]: 4,
  [CardType.TARGETED_ATTACK]: 4,
  [CardType.ALTER_FUTURE]: 5,
  [CardType.SALVAGE]: 5
};

const EXPANSION_NORMAL_CATS = ['POTATO_KITTEN'] as const;

export interface BuiltDeck {
  drawPile: Card[]; // complete deck BEFORE dealing (without bombs & defuse removed yet)
}

function duplicateCounts(base: BaseCounts, extra: number): BaseCounts {
  if (extra <= 0) return { ...base };
  const out: BaseCounts = {};
  for (const k of Object.keys(base)) out[k] = base[k] + extra;
  return out;
}

function buildBaseCards(playerCount: number, options: GameOptions): Card[] {
  const cards: Card[] = [];
  const expansion = options.useExpansion;
  // Determine scaling threshold
  const threshold = expansion ? 8 : 5;
  const extraPlayers = Math.max(0, playerCount - threshold);

  const functionCounts = duplicateCounts({ ...BASE_FUNCTION_COUNTS }, extraPlayers);
  for (const [type, count] of Object.entries(functionCounts)) {
    for (let i = 0; i < count; i++) cards.push(createCard(type as CardType));
  }
  // Normal cats (base)
  for (const name of NORMAL_CATS) {
    for (let i = 0; i < 4 + extraPlayers; i++) cards.push(createNormalCat(name));
  }
  if (expansion) {
    const expFunctionCounts = duplicateCounts({ ...EXPANSION_FUNCTION_COUNTS }, extraPlayers);
    for (const [type, count] of Object.entries(expFunctionCounts)) {
      for (let i = 0; i < count; i++) cards.push(createCard(type as CardType));
    }
    for (const name of EXPANSION_NORMAL_CATS) {
      for (let i = 0; i < 4 + extraPlayers; i++) cards.push(createNormalCat(name));
    }
    if (options.includeImploding) {
      cards.push(createCard(CardType.IMPLODING));
    }
  } else if (options.includeImploding) {
    // If imploding chosen but not expansion, still allow (rule flexible) – else could ignore.
    cards.push(createCard(CardType.IMPLODING));
  }
  return cards;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildInitialDeck(options: GameOptions, rand: () => number = Math.random): Card[] {
  return shuffle(buildBaseCards(options.playerCount, options), rand);
}

export function setupDeckAfterDealing(players: number, options: GameOptions, drawPile: Card[], rand: () => number = Math.random): Card[] {
  // Add bombs and remaining defuse into the draw pile and reshuffle lightly (spread random insertion)
  const bombsToAdd = players - 1; // per rules
  for (let i = 0; i < bombsToAdd; i++) {
    const idx = Math.floor(rand() * (drawPile.length + 1));
    drawPile.splice(idx, 0, createCard(CardType.BOMB));
  }
  // Remaining defuse: total defuse count = players + 2
  const totalDefuse = players + 2;
  const alreadyDealtDefuse = players; // each player got exactly one
  const remaining = totalDefuse - alreadyDealtDefuse;
  for (let i = 0; i < remaining; i++) {
    const idx = Math.floor(rand() * (drawPile.length + 1));
    drawPile.splice(idx, 0, createCard(CardType.DEFUSE));
  }
  return drawPile;
}
