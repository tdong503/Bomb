import { Card, CardFamily, CardType } from './types';
import { generateId, shuffleInPlace, makeRng } from './util';

export interface GenerateDeckOptions {
  numPlayers: number;
  expansion: boolean;
  enableImploding: boolean;
  seed?: number;
}

interface CardSpec {
  type: CardType;
  base: number; // copies in a single base deck (for types with fixed count irrespective of players (excluding defuse/bomb formula))
  scalable?: boolean; // if true, add +1 per extra player over threshold
}

// Base deck thresholds per spec.
const BASE_ONLY_THRESHOLD = 5; // 2-5 players one deck
const BASE_PLUS_EXP_THRESHOLD = 8; // 2-8 players one deck when expansion included

const baseSpecialSpecs: CardSpec[] = [
  { type: CardType.Skip, base: 4, scalable: true },
  { type: CardType.Attack, base: 4, scalable: true },
  { type: CardType.SeeTheFuture, base: 5, scalable: true },
  { type: CardType.Favor, base: 4, scalable: true },
  { type: CardType.Shuffle, base: 4, scalable: true },
  { type: CardType.Nope, base: 5, scalable: true },
];

const baseCommonSpecs: CardSpec[] = [
  { type: CardType.BossKitten, base: 4, scalable: true },
  { type: CardType.SlipperKitten, base: 4, scalable: true },
  { type: CardType.BugKitten, base: 4, scalable: true },
  { type: CardType.NezhaKitten, base: 4, scalable: true },
  { type: CardType.LightningKitten, base: 4, scalable: true },
];

const expansionSpecs: CardSpec[] = [
  { type: CardType.DrawFromBottom, base: 4, scalable: true },
  { type: CardType.Reverse, base: 4, scalable: true },
  { type: CardType.TargetedAttack, base: 4, scalable: true },
  { type: CardType.AlterTheFuture, base: 5, scalable: true },
  { type: CardType.PotatoKitten, base: 4, scalable: true },
  { type: CardType.Salvage, base: 5, scalable: true },
];

export function generateFullPool(opts: GenerateDeckOptions): Card[] {
  const threshold = opts.expansion ? BASE_PLUS_EXP_THRESHOLD : BASE_ONLY_THRESHOLD;
  const extraPlayers = Math.max(0, opts.numPlayers - threshold);
  const cards: Card[] = [];

  const addCopies = (spec: CardSpec, family: CardFamily) => {
    let count = spec.base + (spec.scalable ? extraPlayers : 0);
    for (let i = 0; i < count; i++) {
      cards.push({ id: generateId('c_'), type: spec.type, family });
    }
  };

  [...baseSpecialSpecs].forEach(s => addCopies(s, CardFamily.Special));
  [...baseCommonSpecs].forEach(s => addCopies(s, CardFamily.Common));

  if (opts.expansion) {
    expansionSpecs.forEach(s => addCopies(s, s.type === CardType.PotatoKitten ? CardFamily.Common : CardFamily.Special));
    if (opts.enableImploding) {
      cards.push({ id: generateId('c_'), type: CardType.Imploding, family: CardFamily.Special, meta: { stage: 0 }, visible: false });
    }
  }

  // Defuse & Bomb handled separately by formulas when assembling final deck after dealing.
  return cards;
}

export function buildInitialDealingPool(opts: GenerateDeckOptions): Card[] {
  // We remove Bomb & Defuse before dealing, as per rules. This returns only non-bomb/non-defuse pool.
  return generateFullPool(opts).filter(c => c.type !== CardType.Bomb && c.type !== CardType.Defuse);
}

export function assembleDeckAfterDealing(params: { remainingPool: Card[]; numPlayers: number; expansion: boolean; enableImploding: boolean; rngSeed?: number; defuseAlreadyDealt: number; }): Card[] {
  const { remainingPool, numPlayers, defuseAlreadyDealt } = params;
  const totalDefuseNeeded = numPlayers + 2; // formula
  const defuseRemaining = Math.max(0, totalDefuseNeeded - defuseAlreadyDealt);
  for (let i = 0; i < defuseRemaining; i++) {
    remainingPool.push({ id: generateId('c_'), type: CardType.Defuse, family: CardFamily.Special });
  }
  const bombCount = Math.max(1, numPlayers - 1);
  for (let i = 0; i < bombCount; i++) {
    remainingPool.push({ id: generateId('c_'), type: CardType.Bomb, family: CardFamily.Special });
  }
  // Shuffle
  const rng = makeRng(params.rngSeed ?? Date.now());
  shuffleInPlace(remainingPool, rng);
  return remainingPool;
}

