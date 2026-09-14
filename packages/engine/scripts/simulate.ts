/**
 * Headless simulation harness.
 *
 *   pnpm --filter @tarot/engine simulate -- --games 10000 --players 4
 *
 * Plays whole hands with random legal choices and asserts the invariants that
 * must hold for every hand: no crash, no illegal move, every card accounted for,
 * and a settlement that sums to exactly zero. Until the bots land this is what
 * stands in for bot-vs-bot play; the driver is swapped for the bot API in step 5.
 */
import {
  Bid,
  DECK_SIZE,
  LAYOUT,
  TOTAL_POINTS_2,
  applyAction,
  createHand,
  discardableCards,
  forcedTrumpCount,
  isTrump,
  legalActions,
  legalCalls,
  makeRng,
  points2,
  sumPoints2,
  type Action,
  type Card,
  type GameState,
  type PlayerCount,
} from '../src/index.ts';

interface Options {
  games: number;
  players: PlayerCount[];
  seed: number;
  verbose: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { games: 10_000, players: [3, 4, 5], seed: 1, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--games' && value) options.games = Number(value);
    if (arg === '--seed' && value) options.seed = Number(value);
    if (arg === '--players' && value) options.players = [Number(value) as PlayerCount];
    if (arg === '--verbose') options.verbose = true;
  }
  return options;
}

function chooseEcart(hand: readonly Card[], size: number): Card[] {
  const forced = forcedTrumpCount(hand, size);
  const pool = discardableCards(hand);
  const plain = pool.filter((c) => !isTrump(c)).sort((a, b) => points2(a) - points2(b));
  const trumps = pool.filter(isTrump).sort((a, b) => a - b);
  return [...trumps.slice(0, forced), ...plain.slice(0, size - forced)];
}

function playHand(playerCount: PlayerCount, seed: number): GameState {
  const rng = makeRng(seed);
  let s = createHand({ playerCount, seed, dealer: rng.nextInt(playerCount) });

  // Bid: one seat is keen so most hands get played, the rest usually pass. The
  // mix is deliberately crude — it only has to exercise every contract level.
  const eager = rng.nextInt(playerCount);
  for (let i = 0; i < playerCount; i++) {
    const seat = s.currentPlayer;
    const bids = legalActions(s);
    const takes = bids.filter((a) => a.type === 'Bid' && a.bid !== Bid.Pass);
    const wantsIt = seat === eager ? rng.next() < 0.95 : rng.next() < 0.15;
    const pick = wantsIt && takes.length > 0 ? takes[rng.nextInt(takes.length)] : bids[0];
    s = applyAction(s, pick as Action);
  }
  if (s.phase === 'passed') return s;

  while (s.phase !== 'done') {
    if (s.phase === 'discard') {
      const taker = s.taker as number;
      const cards = chooseEcart(s.hands[taker] as Card[], LAYOUT[playerCount].chienSize);
      s = applyAction(s, { type: 'Discard', player: taker, cards });
      continue;
    }
    if (s.phase === 'calling') {
      const calls = legalCalls(s.hands[s.currentPlayer] as Card[]);
      s = applyAction(s, {
        type: 'CallKing',
        player: s.currentPlayer,
        card: calls[rng.nextInt(calls.length)] as Card,
      });
      continue;
    }
    const actions = legalActions(s);
    if (actions.length === 0) throw new Error(`No legal action in phase ${s.phase}`);
    s = applyAction(s, actions[rng.nextInt(actions.length)] as Action);
  }
  return s;
}

function check(state: GameState, playerCount: PlayerCount, seed: number): void {
  const fail = (message: string): never => {
    throw new Error(`[${playerCount}p seed ${seed}] ${message}`);
  };

  if (state.phase === 'passed') return;
  const result = state.result;
  if (result === null) fail('finished hand has no result');
  const r = result as NonNullable<typeof result>;

  const all = [...state.piles.flat(), ...state.ecart, ...state.chien];
  if (all.length !== DECK_SIZE) fail(`${all.length} cards accounted for, expected ${DECK_SIZE}`);
  if (new Set(all).size !== DECK_SIZE) fail('a card was duplicated or lost');
  if (sumPoints2(all) !== TOTAL_POINTS_2) fail('card points do not add up to 91');
  if (state.tricks.length !== LAYOUT[playerCount].cardsPerPlayer) fail('wrong number of tricks');
  if (state.hands.some((h) => h.length > 0)) fail('cards left in hand');
  if (state.excuseDebts.length > 0) fail('an Excuse debt was never settled');

  const total = r.deltas.reduce((a, b) => a + b, 0);
  if (total !== 0) fail(`settlement sums to ${total}, not 0`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();
  let played = 0;
  let passed = 0;
  const contracts = new Map<Bid, number>();

  for (const playerCount of options.players) {
    for (let i = 0; i < options.games; i++) {
      const seed = options.seed + i * 7919 + playerCount * 104_729;
      const state = playHand(playerCount, seed);
      check(state, playerCount, seed);
      if (state.phase === 'passed') {
        passed++;
        continue;
      }
      played++;
      const contract = state.contract as Bid;
      contracts.set(contract, (contracts.get(contract) ?? 0) + 1);
      if (options.verbose && i % 1000 === 0) {
        console.log(`${playerCount}p #${i}: score ${state.result?.score}`);
      }
    }
  }

  const seconds = (Date.now() - started) / 1000;
  console.log(
    `OK — ${played + passed} hands (${played} played, ${passed} redealt) ` +
      `across ${options.players.join('/')} players in ${seconds.toFixed(1)}s`,
  );
  for (const [contract, count] of [...contracts].sort((a, b) => a[0] - b[0])) {
    console.log(`  contract ${contract}: ${count}`);
  }
}

main();
