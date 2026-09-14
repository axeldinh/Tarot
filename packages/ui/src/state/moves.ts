import {
  Bid,
  LAYOUT,
  bestPoignee,
  discardableCards,
  forcedTrumpCount,
  illegalReason,
  isTrump,
  legalCalls,
  legalCards,
  validateEcart,
  type Card,
  type EcartError,
  type IllegalReason,
  type PlayerView,
  type PoigneeKind,
} from '@tarot/engine';

/** Everything a screen needs to know about what this seat may do right now. */
export interface Affordances {
  myTurn: boolean;
  legal: Card[];
  /** Bids that would beat the table. */
  bids: Bid[];
  calls: Card[];
  ecartSize: number;
  poignee: PoigneeKind | null;
  /** True once this seat has played a card, which closes the poignee window. */
  hasPlayed: boolean;
}

export function highestBid(bids: readonly (Bid | null)[]): Bid {
  let best: Bid = Bid.Pass;
  for (const b of bids) if (b !== null && b > best) best = b;
  return best;
}

export function hasPlayed(view: PlayerView): boolean {
  if (view.currentTrick?.plays.some((p) => p.player === view.self)) return true;
  return view.tricks.some((t) => t.plays.some((p) => p.player === view.self));
}

export function affordances(view: PlayerView): Affordances {
  const myTurn = view.currentPlayer === view.self;
  const plays = view.currentTrick?.plays ?? [];
  const played = hasPlayed(view);

  const bids: Bid[] = [];
  if (view.phase === 'bidding' && myTurn) {
    const best = highestBid(view.bids);
    bids.push(Bid.Pass);
    for (const bid of [Bid.Petite, Bid.Garde, Bid.GardeSans, Bid.GardeContre]) {
      if (bid > best) bids.push(bid);
    }
  }

  const showPoignee =
    view.phase === 'playing' &&
    myTurn &&
    !played &&
    !view.poignees.some((p) => p.player === view.self);

  return {
    myTurn,
    legal: view.phase === 'playing' && myTurn ? legalCards(view.hand, plays) : [],
    bids,
    calls: view.phase === 'calling' && myTurn ? legalCalls(view.hand) : [],
    ecartSize: LAYOUT[view.playerCount].chienSize,
    poignee: showPoignee ? bestPoignee(view.hand, view.playerCount) : null,
    hasPlayed: played,
  };
}

/** Why this card cannot be played, for the one-line reason on tap. */
export function reasonFor(view: PlayerView, card: Card): IllegalReason | null {
  return illegalReason(view.hand, view.currentTrick?.plays ?? [], card);
}

export interface EcartState {
  chosen: Card[];
  remaining: number;
  complete: boolean;
  error: EcartError | null;
  /** Cards the rules forbid burying at all. */
  forbidden: Set<Card>;
  trumpsAllowed: number;
}

/**
 * Track a part-built ecart. Kings and bouts are never buriable; trumps are only
 * buriable up to the number the rules force, and the count shrinks as ordinary
 * cards are chosen.
 */
export function ecartState(hand: readonly Card[], chosen: readonly Card[], size: number): EcartState {
  const allowed = new Set(discardableCards(hand));
  const forbidden = new Set(hand.filter((c) => !allowed.has(c)));
  const trumpsAllowed = forcedTrumpCount(hand, size);
  const trumpsChosen = chosen.filter(isTrump).length;

  for (const card of hand) {
    if (isTrump(card) && allowed.has(card) && trumpsChosen >= trumpsAllowed && !chosen.includes(card)) {
      forbidden.add(card);
    }
  }

  return {
    chosen: [...chosen],
    remaining: size - chosen.length,
    complete: chosen.length === size,
    error: chosen.length === size ? validateEcart(hand, chosen, size) : null,
    forbidden,
    trumpsAllowed,
  };
}

export { Bid };
