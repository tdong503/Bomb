import { v4 as uuid } from 'uuid';
import { buildInitialDeck, setupDeckAfterDealing, shuffle } from './deck';
import { createRNG } from './rng';
import { Card, CardType, createCard, GameOptions, InternalGameState, PlayerState, GameStateSnapshot } from './types';

export interface PlayCardResult {
  success: boolean;
  message?: string;
  pending?: boolean; // whether this created a pending NOPE-able action
}

export class GameEngine {
  private state: InternalGameState;
  private pendingAction?: {
    id: string;
    playerId: string;
    cardType: CardType;
    originatingCardId: string; // already in discard
    extra?: any;
    nopes: string[]; // playerIds who played NOPE
    log?: { playerId: string; at: number }[]; // sequence log
  };
  private pendingFavor?: { requesterId: string; targetId: string };
  private rand: () => number;

  constructor(private options: GameOptions) {
    this.rand = createRNG(options.seed);
    this.state = {
      id: uuid(),
      options,
      players: [],
      drawPile: [],
      discardPile: [],
      turnDirection: 1,
      currentPlayerIndex: 0,
      started: false,
      finished: false
    };
  }

  addPlayer(id: string, name: string, avatar?: string): boolean {
    if (this.state.started) return false;
    if (this.state.players.find(p => p.id === id)) return false;
    if (this.state.players.length >= this.options.playerCount) return false;
    const seat = this.state.players.length; // simple incremental seat
    this.state.players.push({
      id,
      name,
      avatar,
      hand: [],
      alive: true,
      seat,
      remainingTurns: 1
    });
    return true;
  }

  start(): boolean {
    if (this.state.started) return false;
    // restore original rule: need at least 2 players
    if (this.state.players.length < 2) return false;
    this.state.options.playerCount = this.state.players.length; // lock to actual joined players
    // Build deck without bombs & defuse
    let deck = buildInitialDeck(this.state.options, this.rand);
    // Deal 5 cards each + 1 defuse
    for (const player of this.state.players) {
      for (let i = 0; i < 5; i++) {
        const card = deck.shift();
        if (!card) break; // just in case
        player.hand.push(card);
      }
      player.hand.push(createCard(CardType.DEFUSE));
    }
    // Add bombs + remaining defuse to deck
    deck = setupDeckAfterDealing(this.state.players.length, this.state.options, deck, this.rand);
    this.state.drawPile = deck;
    this.state.started = true;
    this.state.currentPlayerIndex = 0; // seat 0 starts (could randomize later)
    return true;
  }

  private alivePlayers(): PlayerState[] {
    return this.state.players.filter(p => p.alive);
  }

  private nextPlayerIndex(fromIndex: number): number {
    const dir = this.state.turnDirection;
    const total = this.state.players.length;
    let idx = fromIndex;
    for (let i = 0; i < total; i++) {
      idx = (idx + dir + total) % total;
      const p = this.state.players[idx];
      if (p.alive) return idx;
    }
    return fromIndex; // fallback
  }

  get currentPlayer(): PlayerState | undefined {
    return this.state.players[this.state.currentPlayerIndex];
  }

  getStateSnapshot(): GameStateSnapshot {
    return {
      id: this.state.id,
      createdAt: parseInt(this.state.id.slice(0, 8), 16) || Date.now(),
      started: this.state.started,
      finished: this.state.finished,
      winnerPlayerId: this.state.winnerPlayerId,
      turnDirection: this.state.turnDirection as 1 | -1,
      currentPlayerIndex: this.state.currentPlayerIndex,
      players: this.state.players.map(p => ({ ...p, hand: [...p.hand] })),
      drawPileCount: this.state.drawPile.length,
      pendingNope: this.pendingAction ? { cardType: this.pendingAction.cardType, playerId: this.pendingAction.playerId, nopeCount: this.pendingAction.nopes.length, log: this.pendingAction.log } : undefined,
      pendingFavor: this.pendingFavor ? { ...this.pendingFavor } : undefined
    } as any;
  }

  playCard(playerId: string, cardId: string, extra?: any): PlayCardResult {
    if (this.state.finished) return { success: false, message: 'Game finished' };
    if (this.pendingAction) return { success: false, message: 'Pending action waiting for resolution' };
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.alive) return { success: false, message: 'Invalid player' };
    if (this.currentPlayer?.id !== playerId) return { success: false, message: 'Not your turn' };

    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { success: false, message: 'Card not in hand' };
    const [card] = player.hand.splice(idx, 1);
    this.state.discardPile.push(card);

    if (card.type === CardType.NOPE) {
      // NOPE 只能通过 playNope 调用，这里视为非法主动出牌
      player.hand.push(card);
      this.state.discardPile.pop();
      return { success: false, message: 'NOPE cannot be played proactively' };
    }
    if (card.type === CardType.DEFUSE || card.type === CardType.BOMB || card.type === CardType.IMPLODING) {
      player.hand.push(card);
      this.state.discardPile.pop();
      return { success: false, message: 'Card cannot be played directly' };
    }

    const reactive = new Set<CardType>([
      CardType.ATTACK,
      CardType.TARGETED_ATTACK,
      CardType.SKIP,
      CardType.FAVOR,
      CardType.SHUFFLE,
      CardType.REVERSE,
      CardType.SEE_FUTURE,
      CardType.ALTER_FUTURE
    ]);

    if (card.type === CardType.NORMAL) {
      // Normal 单张：无直接效果
      return { success: true };
    }

    if (reactive.has(card.type)) {
      // 创建待决动作，可被 NOPE
      this.pendingAction = {
        id: uuid(),
        playerId,
        cardType: card.type,
        originatingCardId: card.id,
        extra,
        nopes: []
      };
      return { success: true, pending: true };
    }

    // 非 reactive 功能牌（目前都被归类为 reactive，留此防扩展）
    this.executeCardEffect(card.type, player, extra);
    return { success: true };
  }

  playNope(playerId: string): { success: boolean; message?: string } {
    if (!this.pendingAction) return { success: false, message: 'No pending action' };
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.alive) return { success: false, message: 'Invalid player' };
    const idx = player.hand.findIndex(c => c.type === CardType.NOPE);
    if (idx === -1) return { success: false, message: 'No NOPE card' };
    const [nope] = player.hand.splice(idx, 1);
    this.state.discardPile.push(nope);
    this.pendingAction.nopes.push(playerId);
    (this.pendingAction.log ||= []).push({ playerId, at: Date.now() });
    return { success: true };
  }

  resolvePendingNow(): { executed?: boolean; canceled?: boolean } {
    if (!this.pendingAction) return {};
    const action = this.pendingAction;
    this.pendingAction = undefined;
    const canceled = action.nopes.length % 2 === 1; // 奇数 NOPE 取消
    if (canceled) {
      return { canceled: true };
    }
    // 执行效果（若仍合法）
    const originPlayer = this.state.players.find(p => p.id === action.playerId);
    if (!originPlayer || !originPlayer.alive) return { canceled: true }; // 起始者失效则视为取消
    this.executeCardEffect(action.cardType, originPlayer, action.extra);
    return { executed: true };
  }

  private executeCardEffect(type: CardType, player: PlayerState, extra?: any) {
    switch (type) {
      case CardType.SKIP:
        player.remainingTurns = 0;
        this.advanceTurn();
        return;
      case CardType.SHUFFLE:
        shuffle(this.state.drawPile, this.rand);
        return;
      case CardType.ATTACK:
        player.remainingTurns = 0;
        this.applyAttack(1);
        this.advanceTurn();
        return;
      case CardType.TARGETED_ATTACK:
        player.remainingTurns = 0;
        this.applyAttack(1, extra?.targetPlayerId);
        this.advanceTurn();
        return;
      case CardType.REVERSE:
        this.state.turnDirection = (this.state.turnDirection * -1) as 1 | -1;
        return;
      case CardType.SEE_FUTURE:
        // 仅揭示，逻辑由前端处理
        return;
      case CardType.ALTER_FUTURE: {
        if (Array.isArray(extra?.newOrderIds)) {
          const ids: string[] = extra.newOrderIds;
          const topSlice = this.state.drawPile.slice(0, ids.length);
          if (topSlice.every(c => ids.includes(c.id))) {
            const reordered: Card[] = [];
            for (const id of ids) {
              const i = topSlice.findIndex(c => c.id === id);
              if (i >= 0) {
                reordered.push(topSlice[i]);
                topSlice.splice(i, 1);
              }
            }
            Array.prototype.splice.apply(this.state.drawPile, [0, reordered.length, ...reordered]);
          }
        }
        return;
      }
      case CardType.DRAW_BOTTOM:
        (player as any).nextDrawBottom = true;
        return;
      case CardType.SALVAGE: {
        if (this.state.discardPile.length > 1) {
          const pool = this.state.discardPile.slice(0, -1);
          const random = pool[Math.floor(this.rand() * pool.length)];
          if (random.type === CardType.BOMB || random.type === CardType.IMPLODING) {
            const pos = Math.floor(this.rand() * (this.state.drawPile.length + 1));
            this.state.drawPile.splice(pos, 0, random);
            const ri = this.state.discardPile.findIndex(c => c.id === random.id);
            if (ri >= 0) this.state.discardPile.splice(ri, 1);
          } else {
            const ri = this.state.discardPile.findIndex(c => c.id === random.id);
            if (ri >= 0) {
              const [rec] = this.state.discardPile.splice(ri, 1);
              player.hand.push(rec);
            }
          }
        }
        return;
      }
      case CardType.FAVOR: {
        // Determine target for interaction phase
        let target: PlayerState | undefined;
        if (extra?.targetPlayerId) {
          target = this.state.players.find(p => p.id === extra.targetPlayerId && p.alive && p.id !== player.id && p.hand.length > 0);
        }
        if (!target) {
          const candidates = this.state.players.filter(p => p.alive && p.id !== player.id && p.hand.length > 0);
          if (candidates.length) target = candidates[Math.floor(this.rand() * candidates.length)];
        }
        if (target) {
          this.pendingFavor = { requesterId: player.id, targetId: target.id };
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * Play a combo of cards (they must all be in player's hand and normal or allowed for combo)
   * Returns an object describing the effect.
   */
  playCombo(playerId: string, cardIds: string[], params?: { targetPlayerId?: string; declareCardName?: string; declareCardId?: string; declareCardType?: CardType; declareNormalName?: string }): { success: boolean; message?: string; effect?: any } {
    if (this.state.finished) return { success: false, message: 'Game finished' };
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.alive) return { success: false, message: 'Invalid player' };
    if (this.currentPlayer?.id !== playerId) return { success: false, message: 'Not your turn' };
    if (cardIds.length < 2) return { success: false, message: 'Not a combo' };

    const cards: Card[] = [];
    for (const id of cardIds) {
      const idx = player.hand.findIndex(c => c.id === id);
      if (idx === -1) return { success: false, message: 'Card missing' };
      cards.push(player.hand[idx]);
    }

    // Validate normal cards or treat any normal cat for distinct set
    const allNormal = cards.every(c => c.type === CardType.NORMAL);
    if (!allNormal) return { success: false, message: 'Only normal cat cards can form combos (placeholder rule)' };

    // Distinguish patterns
    const nameCounts: Record<string, number> = {};
    for (const c of cards) nameCounts[c.name || ''] = (nameCounts[c.name || ''] || 0) + 1;
    const uniqueNames = Object.keys(nameCounts).length;
    const size = cards.length;

    let comboType: 'TWO' | 'THREE' | 'FOUR' | 'FIVE_DISTINCT' | undefined;
    if (size === 2 && uniqueNames === 1) comboType = 'TWO';
    else if (size === 3 && uniqueNames === 1) comboType = 'THREE';
    else if (size === 4 && uniqueNames === 1) comboType = 'FOUR';
    else if (size === 5 && uniqueNames === 5) comboType = 'FIVE_DISTINCT';

    if (!comboType) return { success: false, message: 'Invalid combo structure' };

    // Remove from hand & discard
    for (const c of cards) {
      const idx = player.hand.findIndex(h => h.id === c.id);
      if (idx >= 0) player.hand.splice(idx, 1);
      this.state.discardPile.push(c);
    }

    switch (comboType) {
      case 'TWO': {
        const target = this.pickRandomOtherPlayer(playerId);
        if (target) {
          const card = this.removeRandomCard(target);
          if (card) player.hand.push(card);
          return { success: true, effect: { type: 'STEAL_RANDOM', targetId: target.id, cardId: card?.id } };
        }
        return { success: true, effect: { type: 'NO_TARGET' } };
      }
      case 'THREE': {
        const targetId = params?.targetPlayerId;
        const target = this.state.players.find(p => p.id === targetId && p.alive && p.id !== playerId);
        const declaredName = params?.declareCardName;
        if (target && declaredName) {
          const idx = target.hand.findIndex(c => c.type === CardType.NORMAL && c.name === declaredName);
            if (idx >= 0) {
              const [taken] = target.hand.splice(idx, 1);
              player.hand.push(taken);
              return { success: true, effect: { type: 'STEAL_DECLARED', targetId: target.id, cardId: taken.id } };
            }
          return { success: true, effect: { type: 'MISS_DECLARED', targetId: target.id } };
        }
        return { success: true, effect: { type: 'NO_TARGET' } };
      }
      case 'FOUR': {
        // Everyone else discards one random card
        const affected: { playerId: string; discardedCardId?: string }[] = [];
        for (const p of this.state.players) {
          if (!p.alive || p.id === playerId) continue;
          const card = this.removeRandomCard(p);
          if (card) this.state.discardPile.push(card);
          affected.push({ playerId: p.id, discardedCardId: card?.id });
        }
        return { success: true, effect: { type: 'FORCE_DISCARD', affected } };
      }
      case 'FIVE_DISTINCT': {
        // Retrieval enhanced: by exact id OR by type (and optional normal name)
        if (params?.declareCardId) {
          const idx = this.state.discardPile.findIndex(c => c.id === params!.declareCardId);
          if (idx >= 0) {
            const [retrieved] = this.state.discardPile.splice(idx, 1);
            player.hand.push(retrieved);
            return { success: true, effect: { type: 'RETRIEVE', cardId: retrieved.id, cardType: retrieved.type, name: retrieved.name } };
          }
          return { success: true, effect: { type: 'RETRIEVE_MISS', cardId: params.declareCardId } };
        }
        if (params?.declareCardType) {
          let foundIndex = -1;
          if (params.declareCardType === CardType.NORMAL && params.declareNormalName) {
            foundIndex = this.state.discardPile.findIndex(c => c.type === CardType.NORMAL && c.name === params!.declareNormalName);
          } else {
            foundIndex = this.state.discardPile.findIndex(c => c.type === params.declareCardType);
          }
          if (foundIndex >= 0) {
            const [retrieved] = this.state.discardPile.splice(foundIndex, 1);
            player.hand.push(retrieved);
            return { success: true, effect: { type: 'RETRIEVE', cardId: retrieved.id, cardType: retrieved.type, name: retrieved.name } };
          }
          return { success: true, effect: { type: 'RETRIEVE_MISS_TYPE', cardType: params.declareCardType, name: params.declareNormalName } };
        }
        return { success: true, effect: { type: 'RETRIEVE_NONE' } };
      }
    }
    return { success: false, message: 'Unhandled combo' };
  }

  /**
   * Provide a favor card to the requester (target must be set in pendingFavor)
   * @param targetPlayerId The ID of the target player receiving the card
   * @param cardId Optional specific card ID to give, otherwise a random valid card is chosen
   */
  provideFavorCard(targetPlayerId: string, cardId?: string): { success: boolean; message?: string; cardId?: string } {
    if (!this.pendingFavor) return { success: false, message: 'No pending favor' };
    if (this.pendingFavor.targetId !== targetPlayerId) return { success: false, message: 'Not target' };
    const target = this.state.players.find(p => p.id === targetPlayerId && p.alive);
    const requester = this.state.players.find(p => p.id === this.pendingFavor!.requesterId && p.alive);
    if (!target || !requester) { this.pendingFavor = undefined; return { success: false, message: 'Players invalid' }; }
    let idx = -1;
    if (cardId) idx = target.hand.findIndex(c => c.id === cardId);
    if (idx === -1) {
      // fallback choose random prefer non-defuse/bomb
      idx = target.hand.findIndex(c => ![CardType.DEFUSE, CardType.BOMB, CardType.IMPLODING].includes(c.type));
      if (idx === -1 && target.hand.length) idx = Math.floor(this.rand() * target.hand.length);
    }
    if (idx >= 0) {
      const [gift] = target.hand.splice(idx, 1);
      requester.hand.push(gift);
      this.pendingFavor = undefined;
      return { success: true, cardId: gift.id };
    }
    this.pendingFavor = undefined;
    return { success: true };
  }

  autoResolveFavor() {
    if (this.pendingFavor) {
      this.provideFavorCard(this.pendingFavor.targetId);
    }
  }

  /** Test helper: replace draw pile (NOT for production). */
  unsafeForceDrawPile(cards: Card[]) { (this as any).state.drawPile = cards; }

  getDebugState() {
    const internal = JSON.parse(JSON.stringify((this as any).state));
    (internal as any).pendingFavor = this.pendingFavor ? { ...this.pendingFavor } : undefined;
    return internal;
  }

  private pickRandomOtherPlayer(playerId: string): PlayerState | undefined {
    const others = this.state.players.filter(p => p.alive && p.id !== playerId && p.hand.length > 0);
    if (!others.length) return undefined;
    const idx = Math.floor(this.rand() * others.length);
    return others[idx];
  }

  private removeRandomCard(p: PlayerState): Card | undefined {
    if (!p.hand.length) return undefined;
    const idx = Math.floor(this.rand() * p.hand.length);
    return p.hand.splice(idx, 1)[0];
  }

  private applyAttack(extraTurns: number, targetPlayerId?: string) {
    // Increase next target's remainingTurns by extraTurns (they already have 1 built-in when their turn starts)
    let targetIdx: number;
    if (targetPlayerId) {
      targetIdx = this.state.players.findIndex(p => p.id === targetPlayerId && p.alive);
      if (targetIdx === -1) targetIdx = this.nextPlayerIndex(this.state.currentPlayerIndex);
    } else {
      targetIdx = this.nextPlayerIndex(this.state.currentPlayerIndex);
    }
    const target = this.state.players[targetIdx];
    target.remainingTurns += extraTurns; // they will have to take extraTurns additional turns
  }

  draw(playerId: string): { card?: Card; exploded?: boolean; eliminated?: boolean; } {
    if (this.state.finished) return {};
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.alive) return {};
    if (this.currentPlayer?.id !== playerId) return {};

    const fromBottom = (player as any).nextDrawBottom;
    if (fromBottom) delete (player as any).nextDrawBottom;

    const card = fromBottom ? this.state.drawPile.pop() : this.state.drawPile.shift();
    if (!card) {
      // If deck empty, reshuffle discard (minus top?) simplified: end game awarding current alive players
      this.finishIfOneLeft();
      return {};
    }

    if (card.type === CardType.BOMB) {
      const defuseIdx = player.hand.findIndex(c => c.type === CardType.DEFUSE);
      if (defuseIdx >= 0) {
        // Use defuse
        const [defuse] = player.hand.splice(defuseIdx, 1);
        this.state.discardPile.push(defuse);
        // Reinsert bomb at random position
        const pos = Math.floor(this.rand() * (this.state.drawPile.length + 1));
        this.state.drawPile.splice(pos, 0, card);
      } else {
        // Eliminate player
        player.alive = false;
        this.state.discardPile.push(card); // bomb to discard
        // All hand cards to discard
        while (player.hand.length) this.state.discardPile.push(player.hand.pop()!);
        this.finishIfOneLeft();
        this.advanceTurn();
        return { card, exploded: true, eliminated: true };
      }
    } else if (card.type === CardType.IMPLODING) {
      // Track exposure
      const exposed = (card as any).exposed;
      if (!exposed) {
        (card as any).exposed = true;
        // Reinsert face-up card (represented by exposed flag) randomly
        const pos = Math.floor(this.rand() * (this.state.drawPile.length + 1));
        this.state.drawPile.splice(pos, 0, card);
      } else {
        // Second draw eliminates regardless of defuse
        player.alive = false;
        this.state.discardPile.push(card);
        while (player.hand.length) this.state.discardPile.push(player.hand.pop()!);
        this.finishIfOneLeft();
        this.advanceTurn();
        return { card, exploded: true, eliminated: true };
      }
    } else {
      // Normal acquisition
      player.hand.push(card);
    }

    // Turn consumption
    player.remainingTurns -= 1;
    if (player.remainingTurns <= 0) {
      player.remainingTurns = 1; // reset for next time they have a normal entry
      this.advanceTurn();
    }

    return { card };
  }

  private advanceTurn() {
    if (this.state.finished) return;
    // Find next alive player
    const nextIdx = this.nextPlayerIndex(this.state.currentPlayerIndex);
    this.state.currentPlayerIndex = nextIdx;
    // Ensure next player's remainingTurns baseline is at least 1
    const cp = this.currentPlayer;
    if (cp && cp.remainingTurns < 1) cp.remainingTurns = 1;
  }

  private finishIfOneLeft() {
    const alive = this.alivePlayers();
    if (alive.length <= 1) {
      this.state.finished = true;
      this.state.winnerPlayerId = alive[0]?.id;
    }
  }

  getPendingFavor() { return this.pendingFavor ? { ...this.pendingFavor } : undefined; }
}

export function createGame(options: GameOptions) {
  return new GameEngine(options);
}
