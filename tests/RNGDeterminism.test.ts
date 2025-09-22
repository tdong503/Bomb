import { createGame } from '../src/game/Game';
import { CardType } from '../src/game/types';

describe('Deterministic RNG with seed', () => {
  test('same seed -> identical initial hands & draw pile top sequence', () => {
    const opts = { playerCount: 4, useExpansion: false, includeImploding: false, seed: 'seed123' } as any;
    const g1: any = createGame({ ...opts });
    const g2: any = createGame({ ...opts });
    for (let i=0;i<4;i++){ g1.addPlayer('A'+i,'A'+i); g2.addPlayer('A'+i,'A'+i); }
    g1.start(); g2.start();
    const s1 = g1.getDebugState();
    const s2 = g2.getDebugState();
    for (let i=0;i<4;i++) {
      const h1 = s1.players[i].hand.map((c:any)=>c.type+ (c.name||''));
      const h2 = s2.players[i].hand.map((c:any)=>c.type+ (c.name||''));
      expect(h1).toEqual(h2);
    }
    // Compare first 10 draw pile card types
    const d1 = s1.drawPile.slice(0,10).map((c:any)=>c.type+ (c.name||''));
    const d2 = s2.drawPile.slice(0,10).map((c:any)=>c.type+ (c.name||''));
    expect(d1).toEqual(d2);
  });

  test('different seeds -> likely different draw pile ordering', () => {
    const base = { playerCount: 4, useExpansion: false, includeImploding: false } as any;
    const g1: any = createGame({ ...base, seed: 'alpha' });
    const g2: any = createGame({ ...base, seed: 'beta' });
    for (let i=0;i<4;i++){ g1.addPlayer('P'+i,'P'+i); g2.addPlayer('P'+i,'P'+i); }
    g1.start(); g2.start();
    const s1 = g1.getDebugState();
    const s2 = g2.getDebugState();
    const d1 = s1.drawPile.map((c:any)=>c.type).join(',');
    const d2 = s2.drawPile.map((c:any)=>c.type).join(',');
    // They should differ in most cases; assert not equal
    expect(d1).not.toEqual(d2);
  });
});

