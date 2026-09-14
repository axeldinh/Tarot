import type { Card, FollowSuit } from './cards.ts';

export type PlayerCount = 3 | 4 | 5;

/**
 * Les encheres, in ascending order. A const object rather than a TS `enum` so
 * that every source file in the engine is erasable-syntax-only and runs under
 * plain `node --experimental-strip-types`.
 */
export const Bid = {
  Pass: 0,
  Petite: 1,
  Garde: 2,
  GardeSans: 3,
  GardeContre: 4,
} as const;
export type Bid = (typeof Bid)[keyof typeof Bid];

export const BID_NAMES: Record<Bid, string> = {
  [Bid.Pass]: 'Passe',
  [Bid.Petite]: 'Petite',
  [Bid.Garde]: 'Garde',
  [Bid.GardeSans]: 'Garde Sans',
  [Bid.GardeContre]: 'Garde Contre',
};

/** Contract multiplier applied to the scoring base. */
export const BID_MULTIPLIER: Record<Bid, number> = {
  [Bid.Pass]: 0,
  [Bid.Petite]: 1,
  [Bid.Garde]: 2,
  [Bid.GardeSans]: 4,
  [Bid.GardeContre]: 6,
};

export type PoigneeKind = 'simple' | 'double' | 'triple';

export const POIGNEE_BONUS: Record<PoigneeKind, number> = {
  simple: 20,
  double: 30,
  triple: 40,
};

/** Number of trumps that must be shown, by player count. */
export const POIGNEE_SIZE: Record<PlayerCount, Record<PoigneeKind, number>> = {
  3: { simple: 13, double: 15, triple: 18 },
  4: { simple: 10, double: 13, triple: 15 },
  5: { simple: 8, double: 10, triple: 13 },
};

export type Phase =
  /** Each player bids once. */
  | 'bidding'
  /** 5 players only: the taker calls a king. */
  | 'calling'
  /** Petite / Garde: the chien is face up and the taker discards. */
  | 'discard'
  /** Each player may announce a chelem, in seat order. */
  | 'chelem'
  /** Cards on the table. */
  | 'playing'
  /** Hand finished and scored. */
  | 'done'
  /** Everybody passed; the hand is void and must be redealt. */
  | 'passed';

export type Side = 'taker' | 'defence';

export interface TrickPlay {
  player: number;
  card: Card;
}

export interface CompletedTrick {
  index: number;
  leader: number;
  plays: TrickPlay[];
  /** Player who took the trick. */
  winner: number;
  /** Suit that had to be followed (null if only the Excuse was ever played). */
  followSuit: FollowSuit | null;
  /** True when the Excuse was played and stayed with the player who played it. */
  excuseKept: boolean;
}

export interface PoigneeDeclaration {
  player: number;
  kind: PoigneeKind;
  /** The trumps actually shown to the table. */
  cards: Card[];
}

export type Action =
  | { type: 'Bid'; player: number; bid: Bid }
  | { type: 'CallKing'; player: number; card: Card }
  | { type: 'Discard'; player: number; cards: Card[] }
  | { type: 'AnnounceChelem'; player: number; announce: boolean }
  | { type: 'AnnouncePoignee'; player: number; kind: PoigneeKind }
  | { type: 'PlayCard'; player: number; card: Card };

export interface Rules {
  /**
   * The spec computes `base = 25 + |diff| + petitAuBout` and then flips the sign
   * of the whole thing when the contract fails, which means a defence "petit au
   * bout" reduces what the taker pays. The FFT rule instead credits the 10 x
   * multiplier to whichever side won it, independently of the contract.
   * Default follows the project spec.
   */
  petitAuBoutIndependentOfContract: boolean;
}

export const DEFAULT_RULES: Rules = {
  petitAuBoutIndependentOfContract: false,
};

export interface HandResult {
  taker: number;
  contract: Bid;
  partner: number | null;
  /** Card points of the taker's side, in half-points. */
  takerPoints2: number;
  /** Same, as the traditional half-point number. */
  takerPoints: number;
  defencePoints: number;
  bouts: number;
  target: number;
  /** takerPoints - target. Contract made when >= 0. */
  diff: number;
  made: boolean;
  multiplier: number;
  /** +10 / -10 / 0, from the taker's point of view. */
  petitAuBout: number;
  petitAuBoutSide: Side | null;
  base: number;
  poigneeBonus: number;
  chelemBonus: number;
  /** Signed from the taker's point of view; a defender's delta is its negation. */
  score: number;
  /** Per-player point deltas. Always sums to exactly 0. */
  deltas: number[];
}

export interface GameState {
  playerCount: PlayerCount;
  dealer: number;
  rules: Rules;
  phase: Phase;

  /** Private: `hands[p]` must never be sent to anyone but player `p`. */
  hands: Card[][];
  /** Private until revealed (Petite / Garde). */
  chien: Card[];
  chienRevealed: boolean;

  bids: (Bid | null)[];
  currentPlayer: number;
  taker: number | null;
  contract: Bid | null;

  /** 5 players: the card the taker called to find a partner. */
  calledCard: Card | null;
  /** Set once the called card has been played, or immediately if self-called. */
  partner: number | null;
  partnerRevealed: boolean;

  ecart: Card[];
  /** Trumps put in the ecart must be shown to everyone. */
  ecartTrumpsShown: Card[];

  chelemAnnouncedBy: number | null;
  /** How many players have answered the chelem question in the current hand. */
  chelemAnswers: number;
  poignees: PoigneeDeclaration[];

  currentTrick: { leader: number; plays: TrickPlay[] } | null;
  tricks: CompletedTrick[];

  /** Cards won, per player. Aggregated per side at scoring time. */
  piles: Card[][];
  /** Excuse owed a low card because the player had won nothing yet. */
  excuseDebts: { debtor: number; creditor: number }[];
  /** Whether a player has played at least one card (gates the poignee). */
  hasPlayed: boolean[];

  result: HandResult | null;
}

/**
 * Everything a player is allowed to know: the public state plus their own hand.
 * Bots receive only this — the type boundary is what stops them cheating.
 */
export interface PlayerView {
  playerCount: PlayerCount;
  self: number;
  dealer: number;
  phase: Phase;
  hand: Card[];
  /** Face up only for Petite / Garde, and only between reveal and discard. */
  chien: Card[] | null;
  bids: (Bid | null)[];
  currentPlayer: number;
  taker: number | null;
  contract: Bid | null;
  calledCard: Card | null;
  partner: number | null;
  /** Own ecart only; other players never see it. */
  ecart: Card[] | null;
  ecartTrumpsShown: Card[];
  chelemAnnouncedBy: number | null;
  poignees: PoigneeDeclaration[];
  currentTrick: { leader: number; plays: TrickPlay[] } | null;
  tricks: CompletedTrick[];
  cardsLeft: number[];
  result: HandResult | null;
}
