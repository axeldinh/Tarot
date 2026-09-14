/**
 * Measure whether one bot setting actually beats another.
 *
 *   pnpm --filter @tarot/bots experiment -- --a informed-30 --b blind-30 --games 400
 *
 * Tarot scores swing hard enough that a naive head-to-head needs thousands of
 * hands to see anything. So every deal is played twice, with the two variants
 * swapping seats between the runs, and the measurement is the difference. The
 * luck of the cards at a given seat lands on both variants and cancels, which
 * buys an order of magnitude in precision for twice the compute.
 */
import type { PlayerCount } from '@tarot/engine';
import { createHand } from '@tarot/engine';
import {
  CONFIG,
  makeBot,
  playHandWithBots,
  type Bot,
  type BotConfig,
  type Level,
} from '../src/index.ts';

interface Variant {
  level: Level;
  config?: Partial<BotConfig>;
}

/** The settings worth comparing. Add to this rather than editing one in place. */
const VARIANTS: Record<string, Variant> = {
  'greedy': { level: 'debutant' },
  'blind-30': {
    level: 'normal',
    config: { play: { ...CONFIG.normal.play, rolloutPolicy: 'blind' } },
  },
  'informed-30': {
    level: 'normal',
    config: { play: { ...CONFIG.normal.play, rolloutPolicy: 'informed' } },
  },
  'blind-200': {
    level: 'confirme',
    config: { play: { ...CONFIG.confirme.play, rolloutPolicy: 'blind' } },
  },
  'informed-200': {
    level: 'confirme',
    config: { play: { ...CONFIG.confirme.play, rolloutPolicy: 'informed' } },
  },
  'informed-8': {
    level: 'normal',
    config: { play: { ...CONFIG.normal.play, maxDeterminisations: 8, rolloutPolicy: 'informed' } },
  },
  'normal': { level: 'normal' },
  'confirme': { level: 'confirme' },
  // Is searching the ecart worth it? Same card play either way.
  'ecart-search': {
    level: 'normal',
    config: { searchEcart: { candidates: 10, determinisations: 12 } },
  },
  'ecart-heuristic': { level: 'normal', config: { searchEcart: null } },
};

function seatBots(order: readonly string[], seed: number): Bot[] {
  return order.map((name, seat) => {
    const variant = VARIANTS[name];
    if (!variant) throw new Error(`Unknown variant: ${name}`);
    return makeBot(variant.level, {
      seed: seed + seat * 31,
      ...(variant.config ? { config: variant.config } : {}),
    });
  });
}

/** A's total at the seats it holds, for one arrangement of one deal. */
function playArrangement(
  order: readonly string[],
  playerCount: PlayerCount,
  seed: number,
  dealer: number,
  aSeats: readonly number[],
): number | null {
  const bots = seatBots(order, seed);
  const state = playHandWithBots(createHand({ playerCount, seed, dealer }), bots);
  if (state.result === null) return null;
  let total = 0;
  for (const seat of aSeats) total += state.result.deltas[seat] as number;
  return total;
}

function main(): void {
  const argv = process.argv.slice(2);
  const read = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
  };
  const a = read('--a', 'informed-30');
  const b = read('--b', 'blind-30');
  const games = Number(read('--games', '200'));
  const playerCount = Number(read('--players', '4')) as PlayerCount;

  // Alternating seats, and the same seats held by the other variant in the
  // mirrored run.
  const first = Array.from({ length: playerCount }, (_, i) => (i % 2 === 0 ? a : b));
  const second = Array.from({ length: playerCount }, (_, i) => (i % 2 === 0 ? b : a));
  const aSeats = first.flatMap((name, seat) => (name === a ? [seat] : []));

  const started = Date.now();
  const paired: number[] = [];
  let played = 0;

  for (let i = 0; i < games; i++) {
    const seed = 1_000_003 + i * 7919;
    const dealer = i % playerCount;
    const withA = playArrangement(first, playerCount, seed, dealer, aSeats);
    const withB = playArrangement(second, playerCount, seed, dealer, aSeats);
    if (withA === null || withB === null) continue;
    played++;
    // Same deal, same seats: the difference is the variants, not the cards.
    paired.push(withA - withB);
  }

  const n = paired.length;
  const mean = paired.reduce((x, y) => x + y, 0) / Math.max(n, 1);
  const variance = paired.reduce((acc, x) => acc + (x - mean) ** 2, 0) / Math.max(n - 1, 1);
  const stderr = Math.sqrt(variance / Math.max(n, 1));
  const perSeat = mean / aSeats.length / 2;
  const perSeatErr = stderr / aSeats.length / 2;
  const sigma = perSeatErr === 0 ? 0 : perSeat / perSeatErr;

  console.log(`${a} vs ${b} at ${playerCount} players`);
  console.log(`  ${played} paired deals (${n} scored), ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(
    `  ${perSeat >= 0 ? '+' : ''}${perSeat.toFixed(1)} +/- ${perSeatErr.toFixed(1)} ` +
      `points per hand per seat  (${sigma.toFixed(1)} sigma)`,
  );
  console.log(
    sigma > 2.5
      ? `  ${a} is better.`
      : sigma < -2.5
        ? `  ${b} is better.`
        : '  No difference worth believing at this sample size.',
  );
}

main();
