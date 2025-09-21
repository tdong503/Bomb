import { createGame } from '../src/game/Game';
import { CardType, createCard, createNormalCat } from '../src/game/types';

describe('GameEngine core mechanics', () => {
  function setup(n=3){
    const game = createGame({ playerCount: n, useExpansion:false, includeImploding:false });
    for (let i=0;i<n;i++) game.addPlayer('P'+i,'Player'+i);
    expect(game.start()).toBe(true);
    return game as any; // for internal state access in tests
  }

  test('start: bombs and defuse counts correct', () => {
    const n=4;
    const game:any = createGame({ playerCount:n, useExpansion:false, includeImploding:false });
    for (let i=0;i<n;i++) game.addPlayer('P'+i,'Player'+i);
    game.start();
    const snap = game.getStateSnapshot();
    // Each player has 6 cards (5 + defuse)
    snap.players.forEach((p:any)=> expect(p.hand.length).toBe(6));
    // Draw pile bombs = players -1
    const debug = game.getDebugState();
    const bombs = debug.drawPile.filter((c:any)=>c.type===CardType.BOMB).length;
    expect(bombs).toBe(n-1);
    const defuses = debug.drawPile.filter((c:any)=>c.type===CardType.DEFUSE).length;
    expect(defuses).toBe(2); // remaining defuse
  });

  test('draw bomb with defuse survives', () => {
    const game = setup(3);
    const state = game.getDebugState();
    const player = state.players[0];
    // Ensure player has a defuse
    const hasDefuse = player.hand.some((c:any)=>c.type===CardType.DEFUSE);
    expect(hasDefuse).toBe(true);
    // Put a bomb on top of draw pile
    game.unsafeForceDrawPile([ createCard(CardType.BOMB), ...state.drawPile ]);
    const beforeDefuseCount = player.hand.filter((c:any)=>c.type===CardType.DEFUSE).length;
    const res = game.draw(player.id);
    expect(res.exploded).toBeUndefined();
    const after = game.getDebugState();
    const playerAfter = after.players[0];
    const afterDefuseCount = playerAfter.hand.filter((c:any)=>c.type===CardType.DEFUSE).length;
    expect(afterDefuseCount).toBe(beforeDefuseCount-1);
    expect(playerAfter.alive).toBe(true);
  });

  test('draw bomb without defuse eliminates', () => {
    const game = setup(3);
    const dbg = game.getDebugState();
    const p0 = dbg.players[0];
    // Remove defuse cards from hand (simulate usage) by moving them to discard
    p0.hand = p0.hand.filter((c:any)=>c.type!==CardType.DEFUSE);
    (game as any).state.players[0].hand = p0.hand; // commit mutation
    // Force bomb on top
    game.unsafeForceDrawPile([ createCard(CardType.BOMB), ...dbg.drawPile ]);
    const res = game.draw(p0.id);
    expect(res.exploded).toBe(true);
    const after = game.getDebugState();
    expect(after.players[0].alive).toBe(false);
  });

  test('attack adds extra turn to next player and advances turn', () => {
    const game = setup(3);
    const dbg = game.getDebugState();
    const currentId = dbg.players[0].id;
    // Give current player an ATTACK card
    const attack = createCard(CardType.ATTACK);
    (game as any).state.players[0].hand.push(attack);
    const res = game.playCard(currentId, attack.id);
    expect(res.success).toBe(true);
    const after = game.getDebugState();
    // Current player should now be index 1
    expect(after.currentPlayerIndex).toBe(1);
    const next = after.players[1];
    expect(next.remainingTurns).toBeGreaterThan(1); // 2 turns total
  });

  test('skip ends turn immediately', () => {
    const game = setup(3);
    const dbg = game.getDebugState();
    const currentId = dbg.players[0].id;
    const skip = createCard(CardType.SKIP);
    (game as any).state.players[0].hand.push(skip);
    const res = game.playCard(currentId, skip.id);
    expect(res.success).toBe(true);
    const after = game.getDebugState();
    expect(after.currentPlayerIndex).toBe(1); // advanced
  });

  test('two of a kind steals random card', () => {
    const game = setup(3);
    const dbg = game.getDebugState();
    const current = dbg.players[0];
    // Guarantee target has at least one card beyond defuse by injecting a normal card
    const injected = createNormalCat('BOSS_KITTEN');
    (game as any).state.players[1].hand.push(injected);
    const c1 = createNormalCat('SLIPPER_KITTEN');
    const c2 = createNormalCat('SLIPPER_KITTEN');
    (game as any).state.players[0].hand.push(c1, c2);
    const res = game.playCombo(current.id, [c1.id, c2.id]);
    expect(res.success).toBe(true);
    // The two cards moved to discard
    const after = game.getDebugState();
    const inHand = after.players[0].hand.find((c:any)=>c.id===c1.id || c.id===c2.id);
    expect(inHand).toBeUndefined();
  });
});

