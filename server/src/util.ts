import { Card } from './types';

export function shuffleInPlace<T>(arr: T[], rng: () => number = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function makeRng(seed: number) {
  // Mulberry32
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function drawTop(deck: Card[]): Card | undefined { return deck.pop(); }
export function drawBottom(deck: Card[]): Card | undefined { return deck.shift(); }

export function now() { return Date.now(); }

export function generateId(prefix: string = '') {
  return prefix + Math.random().toString(36).slice(2, 10);
}

