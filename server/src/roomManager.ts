import { InternalRoomState, RoomID, PlayerID, CreateRoomPayload, RoomOptions, PlayerPrivate, Direction, Card, CardType, RoomStatePublic, PlayerPublic, } from './types';
import { buildInitialDealingPool, assembleDeckAfterDealing } from './deck';
import { generateId, makeRng, shuffleInPlace, now } from './util';
import { CardFamily } from './types';

interface RoomManagerOptions {
  maxRooms?: number;
}

const DEFAULT_ROOM_OPTIONS: RoomOptions = {
  expansion: true,
  enableImploding: true,
  maxPlayers: 10,
};

export class RoomManager {
  rooms: Map<RoomID, InternalRoomState> = new Map();
  options: RoomManagerOptions;

  constructor(opts: RoomManagerOptions = {}) {
    this.options = opts;
  }

  createRoom(payload: CreateRoomPayload): { roomId: string; player: PlayerPrivate; room: InternalRoomState } {
    const roomId = generateId('r_');
    const ownerId = generateId('p_');
    const opts: RoomOptions = { ...DEFAULT_ROOM_OPTIONS, ...(payload.options || {}) };

    const player: PlayerPrivate = {
      id: ownerId,
      nickname: payload.nickname,
      avatar: payload.avatar,
      seat: 0,
      alive: true,
      handSize: 0,
      hand: [],
      pendingTurns: 1,
      connected: true,
    };

    const internal: InternalRoomState = {
      room: {
        roomId,
        ownerId,
        players: [publicFromPlayer(player)],
        started: false,
        direction: Direction.Clockwise,
        deckCount: 0,
        createdAt: now(),
        options: opts,
        rankOrder: [],
      },
      players: new Map([[ownerId, player]]),
      deck: [],
      discard: [],
      rngSeed: Date.now(),
      nextActionCounter: 0,
    };

    this.rooms.set(roomId, internal);
    return { roomId, player, room: internal };
  }

  getRoom(roomId: string) { return this.rooms.get(roomId); }

  joinRoom(roomId: string, nickname: string, avatar?: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.room.started) throw new Error('Game already started');
    if (room.room.players.length >= room.room.options.maxPlayers) throw new Error('Room full');
    const playerId = generateId('p_');
    const seat = this.findNextSeat(room);
    const player: PlayerPrivate = {
      id: playerId,
      nickname,
      avatar,
      seat,
      alive: true,
      handSize: 0,
      hand: [],
      pendingTurns: 1,
      connected: true,
    };
    room.players.set(playerId, player);
    room.room.players.push(publicFromPlayer(player));
    return { player, room };
  }

  findNextSeat(room: InternalRoomState) {
    const taken = new Set(room.room.players.map(p => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    return seat;
  }

  startGame(roomId: string) {
    const state = this.rooms.get(roomId);
    if (!state) throw new Error('Room not found');
    if (state.room.started) throw new Error('Already started');
    const numPlayers = state.room.players.length;
    if (numPlayers < 2) throw new Error('Need at least 2 players');

    const dealingPool = buildInitialDealingPool({
      numPlayers,
      expansion: state.room.options.expansion,
      enableImploding: state.room.options.enableImploding,
    });
    const rng = makeRng(state.rngSeed);
    shuffleInPlace(dealingPool, rng);

    for (const p of state.players.values()) {
      for (let i = 0; i < 5; i++) {
        const card = dealingPool.pop();
        if (!card) throw new Error('Dealing pool exhausted unexpectedly');
        p.hand.push(card);
      }
      const defuse: Card = { id: generateId('c_'), type: CardType.Defuse, family: CardFamily.Special };
      p.hand.push(defuse);
      p.handSize = p.hand.length;
    }

    const remainingPool: Card[] = dealingPool; // leftover (non bomb/defuse)
    const deck = assembleDeckAfterDealing({
      remainingPool,
      numPlayers,
      expansion: state.room.options.expansion,
      enableImploding: state.room.options.enableImploding,
      defuseAlreadyDealt: numPlayers,
    });

    state.deck = deck;
    state.room.deckCount = deck.length;
    state.room.started = true;
    const idx = Math.floor(rng() * numPlayers);
    state.room.turnPlayerId = state.room.players[idx].id;

    for (const pub of state.room.players) {
      const priv = state.players.get(pub.id)!;
      pub.handSize = priv.hand.length;
    }
  }

  toPublic(room: InternalRoomState): RoomStatePublic {
    return JSON.parse(JSON.stringify(room.room));
  }
}

function publicFromPlayer(p: PlayerPrivate): PlayerPublic {
  const { id, nickname, avatar, seat, alive, handSize, finishRank, connected } = p;
  return { id, nickname, avatar, seat, alive, handSize, finishRank, connected };
}
