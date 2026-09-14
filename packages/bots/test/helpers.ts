import {
  Bid,
  DECK,
  LAYOUT,
  applyAction,
  createHandFrom,
  king,
  legalCalls,
  makeRng,
  parseHand,
  shuffle,
  type Card,
  type GameState,
  type PlayerCount,
} from '@tarot/engine';
import { CONFIG, chooseEcart, greedyCard, makeSideOf } from '../src/index.ts';

/** Cards a seat must not be dealt by the filler, e.g. to force a void. */
export type Refuses = Record<number, (card: Card) => boolean>;

/**
 * Build a complete legal deal around a set of fixed hands. `refuses` keeps
 * chosen cards out of a seat's filler, which is how a fixture says "player 1 is
 * void in spades" without spelling out all eighteen cards.
 */
export function buildDeal(
  playerCount: PlayerCount,
  fixed: Record<number, string>,
  seed: number,
  refuses: Refuses = {},
): { hands: Card[][]; chien: Card[] } {
  const { cardsPerPlayer, chienSize } = LAYOUT[playerCount];
  const used = new Set<Card>();
  const hands: Card[][] = [];
  for (let p = 0; p < playerCount; p++) {
    const cards = fixed[p] ? parseHand(fixed[p] as string) : [];
    for (const c of cards) {
      if (used.has(c)) throw new Error(`Card used twice in fixture: ${c}`);
      used.add(c);
    }
    hands.push(cards);
  }

  const pool = shuffle(
    DECK.filter((c) => !used.has(c)),
    makeRng(seed),
  );
  // Constrained seats pick first, or there may be nothing left they can take.
  const order = [...hands.keys()].sort(
    (a, b) => (refuses[a] ? 0 : 1) - (refuses[b] ? 0 : 1),
  );
  for (const seat of order) {
    const hand = hands[seat] as Card[];
    const refuse = refuses[seat];
    while (hand.length < cardsPerPlayer) {
      const index = pool.findIndex((c) => !refuse || !refuse(c));
      if (index < 0) throw new Error(`Cannot fill seat ${seat} under its constraints`);
      hand.push(pool.splice(index, 1)[0] as Card);
    }
  }
  return { hands, chien: pool.slice(0, chienSize) };
}

export interface DealOptions {
  taker: number;
  bid: Bid;
  playerCount?: PlayerCount;
  seed?: number;
  dealer?: number;
  refuses?: Refuses;
}

/**
 * Deal, put the hand in `taker`'s name at `bid`, settle the chien and the chelem
 * question, and hand back a state with the first card still to play.
 */
export function dealToPlay(fixed: Record<number, string>, options: DealOptions): GameState {
  const playerCount = options.playerCount ?? 4;
  const { hands, chien } = buildDeal(
    playerCount,
    fixed,
    options.seed ?? 4242,
    options.refuses ?? {},
  );
  let s = createHandFrom({
    playerCount,
    dealer: options.dealer ?? playerCount - 1,
    hands,
    chien,
  });

  for (let i = 0; i < playerCount; i++) {
    const p = s.currentPlayer;
    s = applyAction(s, {
      type: 'Bid',
      player: p,
      bid: p === options.taker ? options.bid : Bid.Pass,
    });
  }
  if (s.phase === 'calling') {
    const hand = s.hands[s.currentPlayer] as Card[];
    const calls = legalCalls(hand);
    s = applyAction(s, {
      type: 'CallKing',
      player: s.currentPlayer,
      card: (calls.find((c) => !hand.includes(c)) ?? king(0)) as Card,
    });
  }
  if (s.phase === 'discard') {
    const taker = s.taker as number;
    s = applyAction(s, {
      type: 'Discard',
      player: taker,
      cards: chooseEcart(
        s.hands[taker] as Card[],
        LAYOUT[playerCount].chienSize,
        CONFIG.normal.ecart,
      ),
    });
  }
  while (s.phase === 'chelem') {
    s = applyAction(s, { type: 'AnnounceChelem', player: s.currentPlayer, announce: false });
  }
  return s;
}

/** Play `n` more cards with the fast greedy policy. */
export function playSomeTricks(state: GameState, n: number): GameState {
  let s = state;
  const sideOf = makeSideOf(s.taker ?? 0, s.partner);
  const totalTricks = LAYOUT[s.playerCount].cardsPerPlayer;
  for (let i = 0; i < n && s.phase === 'playing'; i++) {
    const seat = s.currentPlayer;
    const card = greedyCard(
      s.hands[seat] as Card[],
      s.currentTrick?.plays ?? [],
      seat,
      s.playerCount,
      sideOf,
      s.tricks.length + 1 === totalTricks,
    );
    s = applyAction(s, { type: 'PlayCard', player: seat, card });
  }
  return s;
}
