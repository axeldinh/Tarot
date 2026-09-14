import type { PlayerCount } from '@tarot/engine';
import type { Level } from './types.ts';

/**
 * Every tunable number the bots use, in one place so they can be adjusted
 * without reading the code. `scripts/calibrate.ts` reports what the current
 * numbers do to the bid distribution and the taker's success rate.
 */

/** Weights for the bidding hand evaluation. Units are arbitrary "bid points". */
export interface BiddingWeights {
  /** Per bout held (Petit, 21, Excuse). */
  bout: number;
  /** Extra for the 21, which is a bout you can never lose. */
  trump21: number;
  /** Extra for the Petit when you have enough trumps to walk it home. */
  petitGuarded: number;
  /** How many trumps count as guarding the Petit. */
  petitGuardTrumps: number;
  /** Per trump held. */
  trump: number;
  /** Per trump of rank 16 or above, on top of `trump`. */
  highTrump: number;
  /** Per king. */
  king: number;
  /** Per dame. */
  dame: number;
  /** Per cavalier. */
  cavalier: number;
  /** Per non-trump suit you hold nothing in. */
  voidSuit: number;
  /** Per non-trump suit you hold exactly one card in. */
  singleton: number;
  /** Per card beyond five in a single non-trump suit — long side suits are dead weight. */
  longSuitPenalty: number;
}

export interface BiddingThresholds {
  petite: number;
  garde: number;
  gardeSans: number;
  gardeContre: number;
}

/** Weights for choosing the ecart. Lower cost means more willing to bury it. */
export interface EcartWeights {
  /** Multiplier on the card's own point value: shed cheap cards first. */
  honour: number;
  /** Credit for progress towards emptying a suit, divided by the suit's length. */
  void: number;
  /** Charge for leaving a dame or a cavalier without enough cards to guard it. */
  unguard: number;
}

export interface PlayConfig {
  /** Wall-clock budget for one card decision. */
  budgetMs: number;
  /** Hard cap on Monte-Carlo determinisations, whatever the budget allows. */
  maxDeterminisations: number;
  /** Tries at sampling a hand layout that respects the void inferences. */
  samplingAttempts: number;
}

export interface BotConfig {
  bidding: BiddingWeights;
  ecart: EcartWeights;
  /** Thresholds differ by table size because hands differ in size. */
  thresholds: Record<PlayerCount, BiddingThresholds>;
  play: PlayConfig;
  /** Range for the artificial pause, so play feels human. */
  delayMs: [number, number];
  /** Show a poignee whose bonus is worth the information it gives away. */
  announcePoignee: boolean;
  /** When a hand is lopsided enough to be worth announcing a chelem. */
  chelem: ChelemRule | null;
}

/**
 * A chelem is all thirteen-plus tricks, so the bar is deliberately brutal: it is
 * announced from a hand that is almost nothing but trumps, holding the 21 (which
 * no one can beat) and at least two bouts.
 */
export interface ChelemRule {
  /** Share of the hand that must be trumps, 0..1. */
  minTrumpRatio: number;
  requires21: boolean;
  minBouts: number;
}

const WEIGHTS: BiddingWeights = {
  bout: 3,
  trump21: 1,
  petitGuarded: 1.5,
  petitGuardTrumps: 6,
  trump: 1,
  highTrump: 0.75,
  king: 2,
  dame: 1,
  cavalier: 0.5,
  voidSuit: 2,
  singleton: 0.75,
  longSuitPenalty: 0.5,
};

/**
 * Thresholds are per table size: at three players you hold 24 cards and at five
 * only 15, so the same hand strength scores very differently.
 */
const ECART: EcartWeights = {
  honour: 2,
  void: 7,
  unguard: 4,
};

/**
 * Read off the evaluation percentiles that `scripts/calibrate.ts` prints. The
 * taker is the best of `playerCount` hands. Note that hands within a deal are
 * negatively correlated — the trumps one player is missing are in somebody
 * else's hand — so deals pass out far less often than the percentiles alone
 * suggest, and these numbers come from measuring rather than from the algebra.
 * As set, roughly 3-7% of deals are redealt and the played hands split about
 * 40/45/11/3 across Petite, Garde, Garde Sans and Garde Contre.
 */
const THRESHOLDS: Record<PlayerCount, BiddingThresholds> = {
  3: { petite: 15.5, garde: 18.5, gardeSans: 23, gardeContre: 26.5 },
  4: { petite: 13.5, garde: 16.5, gardeSans: 20, gardeContre: 23 },
  5: { petite: 12.5, garde: 15, gardeSans: 18, gardeContre: 21 },
};

export const CONFIG: Record<Level, BotConfig> = {
  /** Plays legally and sensibly, bids far too often, never looks ahead. */
  debutant: {
    bidding: WEIGHTS,
    ecart: ECART,
    // A beginner overbids: the same ladder, shifted down about a point and a half.
    thresholds: {
      3: { petite: 14, garde: 17, gardeSans: 21.5, gardeContre: 25 },
      4: { petite: 12, garde: 15, gardeSans: 18.5, gardeContre: 21.5 },
      5: { petite: 11, garde: 13.5, gardeSans: 16.5, gardeContre: 19.5 },
    },
    play: { budgetMs: 0, maxDeterminisations: 0, samplingAttempts: 0 },
    delayMs: [300, 600],
    announcePoignee: true,
    chelem: null,
  },
  /** Same heuristics, plus a modest Monte-Carlo search. */
  normal: {
    bidding: WEIGHTS,
    ecart: ECART,
    thresholds: THRESHOLDS,
    play: { budgetMs: 150, maxDeterminisations: 30, samplingAttempts: 40 },
    delayMs: [400, 800],
    announcePoignee: true,
    chelem: { minTrumpRatio: 0.85, requires21: true, minBouts: 3 },
  },
  /**
   * The full budget the spec allows on a mid-range phone.
   *
   * Measured, this is not yet worth its cost: over 208 hands head-to-head it beat
   * Normal by 3.7 +/- 6.3 points a hand, which is nothing. Every rollout runs the
   * same greedy policy, so more samples buy a more precise estimate of the same
   * biased number. The fix is a better rollout policy, not a bigger budget.
   */
  confirme: {
    bidding: WEIGHTS,
    ecart: ECART,
    thresholds: THRESHOLDS,
    play: { budgetMs: 400, maxDeterminisations: 200, samplingAttempts: 60 },
    delayMs: [400, 800],
    announcePoignee: true,
    chelem: { minTrumpRatio: 0.8, requires21: true, minBouts: 2 },
  },
};

export function configFor(level: Level, overrides: Partial<BotConfig> = {}): BotConfig {
  const base = CONFIG[level];
  return { ...base, ...overrides };
}
