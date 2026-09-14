import type { Action, HandResult, PlayerCount, PlayerView } from '@tarot/engine';

/** How a seat is filled. */
export type SeatKind = 'human' | 'bot';

export interface SeatInfo {
  seat: number;
  name: string;
  kind: SeatKind;
  /** Present for bot seats, and for a human seat a bot has taken over. */
  level?: string;
  /** False while a claimed seat's device is away. */
  connected: boolean;
  /**
   * True between a device dropping and the host giving up on it. The table
   * waits during this window; once it closes a bot plays the seat out.
   */
  awaitingReturn: boolean;
  /** True once a bot is playing a seat that belongs to a person. */
  standIn: boolean;
}

/** A table is either still being filled, or being played. */
export type TablePhase = 'lobby' | 'playing';

/** Running totals and the hand-by-hand history for one sitting. */
export interface SessionSnapshot {
  id: string;
  playerCount: PlayerCount;
  phase: TablePhase;
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

/**
 * What a device shows about itself when it sits down. `token` is how a seat
 * survives a reconnection: endpoint ids change when a radio link drops and comes
 * back, so the seat is held by this instead.
 */
export interface JoinRequest {
  name: string;
  /** Issued by the host on the first join; sent back to reclaim the seat. */
  token?: string;
  /** Which seat to take. Omitted means "any free one". */
  seat?: number;
}

export type ClientMessage =
  | { type: 'join'; join: JoinRequest }
  | { type: 'leave' }
  | { type: 'intent'; action: Action }
  | { type: 'undo' }
  | { type: 'next-hand' }
  /** Host device only: fill or empty a seat before the table starts. */
  | { type: 'set-seat'; seat: number; kind: SeatKind; level?: string }
  /** Host device only. */
  | { type: 'start' };

export type ServerMessage =
  | { type: 'seated'; seat: number; token: string }
  | { type: 'view'; seat: number; view: PlayerView }
  | { type: 'session'; session: SessionSnapshot }
  | { type: 'rejected'; code: string; message: string };

/** What a device advertises so others can find the table. */
export interface TableAdvert {
  /** Stable id for the table, so a reconnect finds the same one. */
  id: string;
  /** Shown in the list of nearby tables. */
  name: string;
  playerCount: PlayerCount;
  /** Seats still waiting for somebody. */
  freeSeats: number;
  phase: TablePhase;
}

/** A table someone nearby is advertising. */
export interface DiscoveredTable extends TableAdvert {
  /** How to reach it on the transport that found it. */
  endpoint: string;
}
