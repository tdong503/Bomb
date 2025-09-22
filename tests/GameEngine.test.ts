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
    const attack = createCard(CardType.ATTACK);
    (game as any).state.players[0].hand.push(attack);
    const res = game.playCard(currentId, attack.id);
    expect(res.pending).toBe(true);
    // resolve
    game.resolvePendingNow();
    const after = game.getDebugState();
    expect(after.currentPlayerIndex).toBe(1);
    const next = after.players[1];
    expect(next.remainingTurns).toBeGreaterThan(1);
  });

  test('skip ends turn after resolution', () => {
    const game = setup(3);
    const dbg = game.getDebugState();
    const currentId = dbg.players[0].id;
    const skip = createCard(CardType.SKIP);
    (game as any).state.players[0].hand.push(skip);
    const res = game.playCard(currentId, skip.id);
    expect(res.pending).toBe(true);
    game.resolvePendingNow();
    const after = game.getDebugState();
    expect(after.currentPlayerIndex).toBe(1);
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

  test('favor interactive: pending then target provides a card', () => {
    const n=3;
    const game:any = createGame({ playerCount:n, useExpansion:false, includeImploding:false, seed:'s1' });
    for (let i=0;i<n;i++) game.addPlayer('F'+i,'F'+i);
    game.start();
    // Ensure target (F1) has at least one extra normal card
    (game as any).state.players[1].hand.push(createCard(CardType.NORMAL));
    const favor = createCard(CardType.FAVOR);
    (game as any).state.players[0].hand.push(favor);
    const beforeTarget = (game as any).state.players[1].hand.length;
    const beforeReq = (game as any).state.players[0].hand.length;
    const res = game.playCard('F0', favor.id, { targetPlayerId: 'F1' });
    expect(res.pending).toBe(true);
    game.resolvePendingNow(); // resolves NOPE window and sets pendingFavor
    const snapAfter = game.getDebugState();
    expect(snapAfter.pendingFavor || (game as any).getPendingFavor?.()).toBeTruthy();
    // Choose a specific card (first non-defuse if exists)
    const targetHand = (game as any).state.players[1].hand;
    const choose = targetHand.find((c:any)=>![CardType.DEFUSE,CardType.BOMB,CardType.IMPLODING].includes(c.type)) || targetHand[0];
    const r2 = game.provideFavorCard('F1', choose.id);
    expect(r2.success).toBe(true);
    const after = game.getDebugState();
    const afterTarget = after.players[1].hand.length;
    const afterReq = after.players[0].hand.length;
    expect(afterTarget).toBe(beforeTarget - 1);
    // requester lost favor (-1) gained one card (+1) net same
    expect(afterReq).toBe(beforeReq);
  });

  test('favor autoResolveFavor picks a card if timeout occurs', () => {
    const game:any = createGame({ playerCount:3, useExpansion:false, includeImploding:false, seed:'s2' });
    game.addPlayer('A','A'); game.addPlayer('B','B'); game.addPlayer('C','C');
    game.start();
    (game as any).state.players[1].hand.push(createCard(CardType.NORMAL));
    const favor = createCard(CardType.FAVOR);
    (game as any).state.players[0].hand.push(favor);
    game.playCard('A', favor.id, { targetPlayerId:'B' });
    game.resolvePendingNow();
    const beforeAuto = game.getDebugState();
    expect(beforeAuto.pendingFavor).toBeTruthy();
    game.autoResolveFavor();
    const after = game.getDebugState();
    expect(after.pendingFavor).toBeFalsy();
  });

  test('five distinct retrieval by type & name works without exposing discard list in snapshot', () => {
    const game:any = createGame({ playerCount:3, useExpansion:false, includeImploding:false, seed:'rt1' });
    game.addPlayer('R0','R0'); game.addPlayer('R1','R1'); game.addPlayer('R2','R2');
    game.start();
    // Give player R0 five distinct normal cats
    const names = ['BOSS_KITTEN','SLIPPER_KITTEN','BUG_KITTEN','NEZHA_KITTEN','LIGHTNING_KITTEN'] as any;
    const cards = names.map((n:any)=> createNormalCat(n));
    (game as any).state.players[0].hand.push(...cards);
    // Put a target normal card in discard pile to retrieve
    const targetCat = createNormalCat('POTATO_KITTEN' as any);
    (game as any).state.discardPile.push(targetCat);
    const res = game.playCombo('R0', cards.map((c:any)=>c.id), { declareCardType: CardType.NORMAL, declareNormalName: 'POTATO_KITTEN' });
    expect(res.success).toBe(true);
    const after = game.getDebugState();
    const inHand = after.players[0].hand.find((c:any)=>c.id===targetCat.id);
    expect(inHand).toBeTruthy();
    const snap = game.getStateSnapshot();
    expect((snap as any).discardPile).toBeUndefined(); // hidden now
  });

  test('NOPE log records sequence order', () => {
    const game:any = createGame({ playerCount:4, useExpansion:false, includeImploding:false, seed:'s3' });
    game.addPlayer('P0','P0'); game.addPlayer('P1','P1'); game.addPlayer('P2','P2'); game.addPlayer('P3','P3');
    game.start();
    const attack = createCard(CardType.ATTACK); (game as any).state.players[0].hand.push(attack);
    const n1 = createCard(CardType.NOPE); (game as any).state.players[1].hand.push(n1);
    const n2 = createCard(CardType.NOPE); (game as any).state.players[2].hand.push(n2);
    const n3 = createCard(CardType.NOPE); (game as any).state.players[3].hand.push(n3);
    game.playCard('P0', attack.id);
    game.playNope('P1');
    game.playNope('P2');
    game.playNope('P3');
    const snap = game.getStateSnapshot();
    expect(snap.pendingNope?.log?.map((l: any)=>l.playerId)).toEqual(['P1','P2','P3']);
    game.resolvePendingNow(); // odd number 3 -> canceled
    const after = game.getDebugState();
    expect(after.currentPlayerIndex).toBe(0); // turn not advanced due to canceled attack
  });
});
