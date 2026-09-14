import type { PlayerCount } from '@tarot/engine';
import type { SeatSpec } from '../src/index.ts';

/**
 * A scheduler that runs anything asked for "now" inline, and holds anything with
 * a real delay until the test flushes it. Bot moves are the former; the grace
 * period a dropped device is given is the latter, so a test can stand in the
 * middle of it and look around.
 */
export function manualSchedule(): {
  schedule: (fn: () => void, ms: number) => void;
  pending: () => number;
  flush: () => void;
} {
  const queued: (() => void)[] = [];
  return {
    schedule: (fn, ms) => {
      if (ms === 0) fn();
      else queued.push(fn);
    },
    pending: () => queued.length,
    flush: () => {
      const due = queued.splice(0, queued.length);
      for (const fn of due) fn();
    },
  };
}

/** A table of bots. */
export function botSeats(n: number, level: 'debutant' | 'normal' = 'debutant'): SeatSpec[] {
  return Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, kind: 'bot' as const, level }));
}

/** A table where `humans` seats are waiting for somebody and the rest are bots. */
export function tableSeats(playerCount: PlayerCount, humans: number): SeatSpec[] {
  return Array.from({ length: playerCount }, (_, i) =>
    i < humans
      ? { name: `Joueur ${i + 1}`, kind: 'human' as const, open: true }
      : { name: `Bot ${i + 1}`, kind: 'bot' as const, level: 'debutant' as const },
  );
}

/** Deterministic tokens, so a test can assert on them. */
export function tokenSource(): () => string {
  let n = 0;
  return () => `token-${n++}`;
}
