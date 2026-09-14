/**
 * Headless bot-versus-bot simulation.
 *
 *   pnpm --filter @tarot/bots simulate -- --games 10000 --level debutant
 *
 * Plays whole hands with a bot in every seat and asserts the invariants that
 * must hold for every hand: no crash, no illegal move, every card accounted for,
 * 91 points on the table, and a settlement that sums to exactly zero. Each bot
 * only ever receives a `PlayerView`, so this also exercises the path a real
 * networked table takes.
 */
import {
  Bid,
  BID_NAMES,
  DECK_SIZE,
  LAYOUT,
  TOTAL_POINTS_2,
  sumPoints2,
  type GameState,
  type PlayerCount,
} from '@tarot/engine';
import { LEVELS, makeBot, playDeal, type Bot, type Level } from '../src/index.ts';

interface Options {
  games: number;
  players: PlayerCount[];
  level: Level;
  seed: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { games: 10_000, players: [3, 4, 5], level: 'debutant', seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--games' && value) options.games = Number(value);
    if (arg === '--seed' && value) options.seed = Number(value);
    if (arg === '--players' && value) options.players = [Number(value) as PlayerCount];
    if (arg === '--level' && value) {
      if (!LEVELS.includes(value as Level)) throw new Error(`Unknown level: ${value}`);
      options.level = value as Level;
    }
  }
  return options;
}

function check(state: GameState, playerCount: PlayerCount, seed: number): void {
  const fail = (message: string): never => {
    throw new Error(`[${playerCount}p seed ${seed}] ${message}`);
  };
  if (state.phase === 'passed') return;

  const result = state.result;
  if (result === null) return fail('finished hand has no result');

  const all = [...state.piles.flat(), ...state.ecart, ...state.chien];
  if (all.length !== DECK_SIZE) fail(`${all.length} cards accounted for, expected ${DECK_SIZE}`);
  if (new Set(all).size !== DECK_SIZE) fail('a card was duplicated or lost');
  if (sumPoints2(all) !== TOTAL_POINTS_2) fail('card points do not add up to 91');
  if (state.tricks.length !== LAYOUT[playerCount].cardsPerPlayer) fail('wrong number of tricks');
  if (state.hands.some((h) => h.length > 0)) fail('cards left in hand');
  if (state.excuseDebts.length > 0) fail('an Excuse debt was never settled');

  const total = result.deltas.reduce((a, b) => a + b, 0);
  if (total !== 0) fail(`settlement sums to ${total}, not 0`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();
  const contracts = new Map<Bid, number>();
  let played = 0;
  let passed = 0;
  let made = 0;
  let moves = 0;

  for (const playerCount of options.players) {
    const bots: Bot[] = Array.from({ length: playerCount }, (_, seat) =>
      makeBot(options.level, { seed: options.seed + seat * 7 }),
    );
    for (let i = 0; i < options.games; i++) {
      const seed = options.seed + i * 7919 + playerCount * 104_729;
      const state = playDeal({ playerCount, seed, dealer: i % playerCount }, bots);
      check(state, playerCount, seed);
      if (state.phase === 'passed') {
        passed++;
        continue;
      }
      played++;
      moves += state.tricks.length * playerCount;
      if (state.result?.made) made++;
      const contract = state.contract as Bid;
      contracts.set(contract, (contracts.get(contract) ?? 0) + 1);
    }
  }

  const seconds = (Date.now() - started) / 1000;
  console.log(
    `OK — ${played + passed} hands at level ${options.level} ` +
      `(${played} played, ${passed} redealt) across ${options.players.join('/')} players ` +
      `in ${seconds.toFixed(1)}s`,
  );
  console.log(`  contracts made: ${((made / Math.max(played, 1)) * 100).toFixed(1)}%`);
  console.log(`  cards played: ${moves}`);
  for (const [contract, count] of [...contracts].sort((a, b) => a[0] - b[0])) {
    const share = ((count / Math.max(played, 1)) * 100).toFixed(1);
    console.log(`  ${BID_NAMES[contract].padEnd(12)} ${String(count).padStart(6)}  ${share}%`);
  }
}

main();
