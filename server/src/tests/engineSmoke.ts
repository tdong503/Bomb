import { RoomManager } from '../roomManager';
import { CardType } from '../types';
import { canPlay, processPlay, drawCardGeneric, extractSeeFutureResult } from '../gameEngine';

function log(title: string, data?: any) { console.log(`\n=== ${title} ===`); if (data !== undefined) console.log(data); }

// Setup room with 3 players for deterministic-ish smoke test
const manager = new RoomManager();
const { roomId } = manager.createRoom({ nickname: 'Alice' });
manager.joinRoom(roomId, 'Bob');
manager.joinRoom(roomId, 'Carol');

// Force seed for repeatability
const state = manager.getRoom(roomId)!;
state.rngSeed = 123456;
manager.startGame(roomId);

log('Initial Public State', manager.toPublic(state));

for (const p of state.players.values()) {
  console.log(p.nickname, 'hand types:', p.hand.map(c => c.type));
}

// Helper to simulate playing first matching card type available
function playFirst(playerId: string, types: CardType[]) {
  const st = manager.getRoom(roomId)!;
  const player = st.players.get(playerId)!;
  for (const t of types) {
    const card = player.hand.find(c => c.type === t);
    if (card && canPlay(st, playerId, card.id)) {
      player.hand = player.hand.filter(c => c.id !== card.id);
      st.discard.push(card);
      processPlay({ state: st, player, card });
      const sf = extractSeeFutureResult(player);
      log(`Play ${card.type} by ${player.nickname}`);
      if (sf) log('SeeFuture Result', sf);
      return true;
    }
  }
  return false;
}

// Execute a mini turn cycle (current player tries Skip > Attack > Favor > Shuffle > SeeFuture else draws)
for (let i = 0; i < 6; i++) {
  const st = manager.getRoom(roomId)!;
  if (st.room.winnerId) break;
  const currentId = st.room.turnPlayerId!;
  const player = st.players.get(currentId)!;
  log(`Turn ${i+1} Start: ${player.nickname} (pendingTurns=${player.pendingTurns})`);
  const played = playFirst(currentId, [CardType.Skip, CardType.Attack, CardType.TargetedAttack, CardType.Favor, CardType.Shuffle, CardType.SeeTheFuture]);
  if (!played) {
    // draw one card
    drawCardGeneric(st, currentId, false);
    log('After Draw Hand', player.hand.map(c => c.type));
  }
  log('Turn End State', {
    turnPlayer: st.room.turnPlayerId,
    direction: st.room.direction,
    deck: st.deck.length,
    pending: [...st.players.values()].map(p=>({ nick:p.nickname, pending:p.pendingTurns, alive:p.alive, size:p.hand.length }))
  });
}

log('Final Public State', manager.toPublic(state));
console.log('\nSmoke test complete.');
