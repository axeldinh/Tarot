import type { HandResult } from '@tarot/engine';
import type { HandRecord, SeatInfo, SessionSnapshot } from './protocol.ts';

export interface SessionInit {
  id: string;
  playerCount: number;
  seats: SeatInfo[];
  dealer: number;
}

/**
 * The running score for one sitting: totals, hand-by-hand history, and whose
 * turn it is to deal. Plain data so it can be written to local storage and read
 * back to resume an interrupted session.
 */
export function newSession(init: SessionInit): SessionSnapshot {
  return {
    id: init.id,
    playerCount: init.playerCount,
    seats: init.seats,
    totals: new Array<number>(init.playerCount).fill(0),
    hands: [],
    handsDealt: 0,
    dealer: init.dealer,
    undoAvailable: false,
  };
}

/** Fold one finished hand into the session. `result` is null for a passed-out deal. */
export function recordHand(
  session: SessionSnapshot,
  result: HandResult | null,
  dealer: number,
): SessionSnapshot {
  const totals = session.totals.map(
    (total, seat) => total + (result ? (result.deltas[seat] as number) : 0),
  );
  const record: HandRecord = {
    index: session.hands.length,
    dealer,
    result,
    totalsAfter: totals,
  };
  return {
    ...session,
    totals,
    hands: [...session.hands, record],
    handsDealt: session.handsDealt + 1,
  };
}

/** Sanity check for a session read back from storage. */
export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<SessionSnapshot>;
  return (
    typeof s.id === 'string' &&
    typeof s.playerCount === 'number' &&
    Array.isArray(s.seats) &&
    Array.isArray(s.totals) &&
    Array.isArray(s.hands) &&
    s.totals.length === s.playerCount &&
    typeof s.dealer === 'number' &&
    typeof s.undoAvailable === 'boolean'
  );
}
