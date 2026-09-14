import type { Action, HandResult, PlayerView } from '@tarot/engine';

/** How a seat is filled. */
export type SeatKind = 'human' | 'bot';

export interface SeatInfo {
  seat: number;
  name: string;
  kind: SeatKind;
  /** Present for bot seats. */
  level?: string;
  /** False while a claimed seat is away; the host plays it with a bot. */
  connected: boolean;
}

/** Running totals and the hand-by-hand history for one sitting. */
export interface SessionSnapshot {
  id: string;
  playerCount: number;
  seats: SeatInfo[];
  /** Cumulative score per seat. Always sums to zero. */
  totals: number[];
  hands: HandRecord[];
  /** Hands dealt so far, including any that were passed out. */
  handsDealt: number;
  dealer: number;
  /**
   * Whether the host would accept an undo right now. Always false at a real
   * table: taking a card back is a solo-only affordance.
   */
  undoAvailable: boolean;
}

export interface HandRecord {
  index: number;
  dealer: number;
  /** Null when everybody passed and the hand was redealt. */
  result: HandResult | null;
  totalsAfter: number[];
}

export type ClientMessage =
  | { type: 'hello'; seat: number }
  | { type: 'intent'; seat: number; action: Action }
  | { type: 'undo'; seat: number }
  | { type: 'next-hand'; seat: number };

export type ServerMessage =
  | { type: 'view'; seat: number; view: PlayerView }
  | { type: 'session'; session: SessionSnapshot }
  | { type: 'rejected'; seat: number; code: string; message: string };
