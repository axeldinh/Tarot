import {
  CAVALIER,
  DAME,
  ROI,
  discardableCards,
  forcedTrumpCount,
  isKing,
  isTrump,
  points2,
  rankOf,
  suitOf,
  type Card,
  type Suit,
} from '@tarot/engine';
import type { EcartWeights } from './config.ts';

/** How many cards of the same suit an honour wants behind it to survive. */
const GUARDS_NEEDED: Record<number, number> = { [ROI]: 0, [DAME]: 1, [CAVALIER]: 2 };

/**
 * What it costs to bury this card. Cheap cards from short suits with no king in
 * them are the ideal ecart: they are worth nothing and they buy a void to ruff
 * into. Stripping a dame or a cavalier bare is charged for.
 */
export function ecartCost(card: Card, hand: readonly Card[], w: EcartWeights): number {
  const suit = suitOf(card);
  /* c8 ignore next -- trumps are picked separately, by rank */
  if (suit === null) return points2(card) * w.honour;

  const inSuit = hand.filter((c) => suitOf(c) === suit);
  let cost = points2(card) * w.honour;

  // A suit holding a king can never be emptied, so there is no void to chase.
  if (!inSuit.some(isKing)) cost -= w.void / inSuit.length;

  const after = inSuit.length - 1;
  for (const other of inSuit) {
    if (other === card) continue;
    const needed = GUARDS_NEEDED[rankOf(other)];
    if (needed !== undefined && after - 1 < needed) cost += w.unguard;
  }

  return cost;
}

/**
 * Pick the ecart. Trumps go in only when the rules force it, lowest first and
 * shown to the table; the rest is chosen greedily, re-costing after each card so
 * that emptying a suit gets more attractive as the suit gets shorter.
 */
export function chooseEcart(hand: readonly Card[], size: number, w: EcartWeights): Card[] {
  const remaining = [...hand];
  const chosen: Card[] = [];

  const take = (card: Card): void => {
    chosen.push(card);
    remaining.splice(remaining.indexOf(card), 1);
  };

  const forced = forcedTrumpCount(hand, size);
  const buriableTrumps = discardableCards(remaining)
    .filter(isTrump)
    .sort((a, b) => a - b);
  for (const t of buriableTrumps.slice(0, forced)) take(t);

  while (chosen.length < size) {
    const pool = discardableCards(remaining).filter((c) => !isTrump(c));
    /* c8 ignore next -- forcedTrumpCount guarantees the pool lasts */
    if (pool.length === 0) break;
    let best = pool[0] as Card;
    let bestCost = ecartCost(best, remaining, w);
    for (const card of pool.slice(1)) {
      const cost = ecartCost(card, remaining, w);
      if (cost < bestCost) {
        best = card;
        bestCost = cost;
      }
    }
    take(best);
  }

  return chosen;
}

/**
 * Which king to call at five players. Calling into a suit you hold cards in
 * means you can help your partner bring it home; a void is the worst place to
 * look for one. Calling a king you hold yourself is a deliberate choice to play
 * alone, so it is only ever the fallback the rules force on you.
 */
export function chooseCall(hand: readonly Card[], legal: readonly Card[], w: EcartWeights): Card {
  const notHeld = legal.filter((c) => !hand.includes(c));
  const candidates = notHeld.length > 0 ? notHeld : legal;

  let best = candidates[0] as Card;
  let bestScore = -Infinity;
  for (const card of candidates) {
    const suit = suitOf(card) as Suit;
    const inSuit = hand.filter((c) => suitOf(c) === suit);
    // Two or three cards in the suit is the sweet spot: enough to lead it and to
    // follow when the partner does, without being a long suit we are stuck with.
    const length = inSuit.length;
    const shape = length === 0 ? -w.unguard : Math.min(length, 3) * 2 - Math.max(0, length - 4);
    const honours = inSuit.reduce((sum, c) => sum + (rankOf(c) >= CAVALIER ? 1 : 0), 0);
    const score = shape + honours;
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}
