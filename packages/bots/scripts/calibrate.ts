/**
 * Report what the bidding heuristic actually does, so the thresholds in
 * `src/config.ts` are chosen from evidence rather than taste.
 *
 *   pnpm --filter @tarot/bots calibrate -- --deals 20000
 *
 * Prints the distribution of hand evaluations per table size (so a threshold can
 * be read off as a percentile), then plays hands bot-versus-bot and reports how
 * often each contract is bid and how often it is made.
 */
import { CONFIG, evaluateHand, makeBot, playDeal, type Bot, type Level } from '../src/index.ts';
import {
  Bid,
  BID_NAMES,
  createHand,
  type PlayerCount,
  type Rules,
} from '@tarot/engine';

const TABLES: PlayerCount[] = [3, 4, 5];

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i] as number;
}

function evaluationSpread(deals: number, level: Level): void {
  console.log('Hand evaluation percentiles (a threshold at P90 fires on one hand in ten)\n');
  const header = ['P50', 'P60', 'P70', 'P80', 'P90', 'P95', 'P99', 'max'];
  console.log(`  table  ${header.map((h) => h.padStart(7)).join('')}`);
  for (const playerCount of TABLES) {
    const scores: number[] = [];
    for (let i = 0; i < deals; i++) {
      const state = createHand({ playerCount, seed: i * 2654435761, dealer: 0 });
      for (const hand of state.hands) scores.push(evaluateHand(hand, CONFIG[level].bidding));
    }
    scores.sort((a, b) => a - b);
    const row = [50, 60, 70, 80, 90, 95, 99]
      .map((p) => percentile(scores, p).toFixed(1).padStart(7))
      .join('');
    console.log(`  ${playerCount}p     ${row}${(scores[scores.length - 1] as number).toFixed(1).padStart(7)}`);
  }
  console.log();
}

function tableReport(games: number, level: Level, fast: boolean, rules?: Partial<Rules>): void {
  console.log(`Bot-versus-bot outcomes at level ${level}${fast ? ' (search off)' : ''}\n`);
  console.log('  table  redealt   Petite    Garde  G.Sans  G.Contre   made   avg |score|');
  for (const playerCount of TABLES) {
    // `--fast` keeps the level's bidding thresholds but turns the search off, so
    // the bid distribution can be measured over many thousands of hands.
    const bots: Bot[] = Array.from({ length: playerCount }, (_, seat) =>
      makeBot(level, {
        seed: 101 + seat * 7,
        ...(fast
          ? { config: { play: { budgetMs: 0, maxDeterminisations: 0, samplingAttempts: 0 } } }
          : {}),
      }),
    );
    const counts = new Map<Bid, number>();
    let passed = 0;
    let played = 0;
    let made = 0;
    let scoreTotal = 0;

    for (let i = 0; i < games; i++) {
      const state = playDeal(
        { playerCount, seed: i * 7919 + playerCount * 104_729, dealer: i % playerCount, rules },
        bots,
      );
      if (state.phase === 'passed') {
        passed++;
        continue;
      }
      played++;
      counts.set(state.contract as Bid, (counts.get(state.contract as Bid) ?? 0) + 1);
      if (state.result?.made) made++;
      scoreTotal += Math.abs(state.result?.score ?? 0);
    }

    const pct = (n: number, total: number) => `${((n / Math.max(total, 1)) * 100).toFixed(1)}%`;
    const cells = [Bid.Petite, Bid.Garde, Bid.GardeSans, Bid.GardeContre]
      .map((b) => pct(counts.get(b) ?? 0, played).padStart(8))
      .join('');
    console.log(
      `  ${playerCount}p   ${pct(passed, games).padStart(7)}${cells}` +
        `${pct(made, played).padStart(8)}${(scoreTotal / Math.max(played, 1)).toFixed(1).padStart(13)}`,
    );
  }
  console.log();
  console.log(`  (${BID_NAMES[Bid.GardeContre]} is the rarest by design.)`);
}

/**
 * Sit two levels at the same table, alternating seats, and report what the
 * difference is worth per hand. Tarot scores swing hard, so the standard error
 * is printed next to the mean: a difference smaller than twice it means nothing.
 */
function matchup(games: number, a: Level, b: Level, playerCount: PlayerCount): void {
  const bots: Bot[] = Array.from({ length: playerCount }, (_, seat) =>
    makeBot(seat % 2 === 0 ? a : b, { seed: 211 + seat * 7 }),
  );
  const perHand: number[] = [];
  for (let i = 0; i < games; i++) {
    const state = playDeal(
      { playerCount, seed: i * 15_485_863 + 7, dealer: i % playerCount },
      bots,
    );
    if (state.result === null) continue;
    let total = 0;
    for (let seat = 0; seat < playerCount; seat += 2) {
      total += state.result.deltas[seat] as number;
    }
    perHand.push(total);
  }
  const n = perHand.length;
  const mean = perHand.reduce((x, y) => x + y, 0) / Math.max(n, 1);
  const variance =
    perHand.reduce((acc, x) => acc + (x - mean) ** 2, 0) / Math.max(n - 1, 1);
  const stderr = Math.sqrt(variance / Math.max(n, 1));
  const seats = Math.ceil(playerCount / 2);
  console.log(
    `  ${playerCount}p  ${a.padEnd(9)} vs ${b.padEnd(9)} ` +
      `${(mean / seats).toFixed(1).padStart(8)} +/- ${(stderr / seats).toFixed(1)} ` +
      `points per hand per seat  (${n} hands)`,
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  const read = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
  };
  const levelIndex = argv.indexOf('--level');
  const level = (levelIndex >= 0 ? argv[levelIndex + 1] : 'normal') as Level;

  if (!argv.includes('--matchup')) {
    evaluationSpread(read('--deals', 5000), level);
    tableReport(read('--games', 2000), level, argv.includes('--fast'));
    return;
  }
  console.log('Head-to-head, alternating seats\n');
  const games = read('--games', 400);
  matchup(games, 'normal', 'debutant', 4);
  matchup(games, 'confirme', 'normal', 4);
}

main();
