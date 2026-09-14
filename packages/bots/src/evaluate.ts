import {
  CAVALIER,
  DAME,
  PETIT,
  ROI,
  SUITS,
  TRUMP_21,
  isBout,
  isExcuse,
  isTrump,
  rankOf,
  suitOf,
  type Card,
  type Suit,
} from '@tarot/engine';
import type { BiddingWeights } from './config.ts';

export interface HandShape {
  trumps: Card[];
  /** Trumps of rank 16 and up. */
  highTrumps: Card[];
  bouts: number;
  hasPetit: boolean;
  has21: boolean;
  hasExcuse: boolean;
  kings: number;
  dames: number;
  cavaliers: number;
  /** Cards held per suit, indexed by suit. */
  suitLengths: number[];
  voids: number;
  singletons: number;
}

export function shapeOf(hand: readonly Card[]): HandShape {
  const trumps = hand.filter(isTrump);
  const suitLengths = [0, 0, 0, 0];
  let kings = 0;
  let dames = 0;
  let cavaliers = 0;

  for (const c of hand) {
    const suit = suitOf(c);
    if (suit === null) continue;
    suitLengths[suit] = (suitLengths[suit] as number) + 1;
    const rank = rankOf(c);
    if (rank === ROI) kings++;
    else if (rank === DAME) dames++;
    else if (rank === CAVALIER) cavaliers++;
  }

  return {
    trumps,
    highTrumps: trumps.filter((c) => rankOf(c) >= 16),
    bouts: hand.filter(isBout).length,
    hasPetit: hand.includes(PETIT),
    has21: hand.includes(TRUMP_21),
    hasExcuse: hand.some(isExcuse),
    kings,
    dames,
    cavaliers,
    suitLengths,
    voids: suitLengths.filter((n) => n === 0).length,
    singletons: suitLengths.filter((n) => n === 1).length,
  };
}

/**
 * Score a hand for bidding, in "bid points". Counts what actually wins tricks:
 * bouts, trump length, honours you can bring home, and a shape that lets you
 * ruff. A long weak side suit is a liability, so it is charged for.
 */
export function evaluateHand(hand: readonly Card[], w: BiddingWeights): number {
  const s = shapeOf(hand);
  let score = 0;

  score += s.bouts * w.bout;
  if (s.has21) score += w.trump21;
  if (s.hasPetit && s.trumps.length >= w.petitGuardTrumps) score += w.petitGuarded;

  score += s.trumps.length * w.trump;
  score += s.highTrumps.length * w.highTrump;

  score += s.kings * w.king;
  score += s.dames * w.dame;
  score += s.cavaliers * w.cavalier;

  for (const suit of SUITS) {
    const length = s.suitLengths[suit as Suit] as number;
    if (length === 0) score += w.voidSuit;
    else if (length === 1) score += w.singleton;
    else if (length > 5) score -= (length - 5) * w.longSuitPenalty;
  }

  return score;
}
