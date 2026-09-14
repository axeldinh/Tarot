import {
  Bid,
  DECK,
  LAYOUT,
  applyAction,
  createHand,
  createHandFrom,
  EXCUSE,
  discardableCards,
  forcedTrumpCount,
  isTrump,
  legalActions,
  legalCards,
  legalCalls,
  makeRng,
  nextPlayer,
  parseHand,
  points2,
  shuffle,
  type Action,
  type Card,
  type GameState,
  type PlayerCount,
  type Rules,
} from '../src/index.ts';

/** Deal the remaining cards around a set of fixed hands so a scripted deal is complete. */
export function fillDeal(
  playerCount: PlayerCount,
  fixed: Record<number, string>,
  options: { chien?: string; seed?: number } = {},
): { hands: Card[][]; chien: Card[] } {
  const { cardsPerPlayer, chienSize } = LAYOUT[playerCount];
  const used = new Set<Card>();
  const hands: Card[][] = [];
  for (let p = 0; p < playerCount; p++) {
    const cards = fixed[p] ? parseHand(fixed[p] as string) : [];
    for (const c of cards) {
      if (used.has(c)) throw new Error(`Card used twice in fixture: ${c}`);
      used.add(c);
    }
    hands.push(cards);
  }
  const chien = options.chien ? parseHand(options.chien) : [];
  for (const c of chien) {
    if (used.has(c)) throw new Error(`Card used twice in fixture: ${c}`);
    used.add(c);
  }

  const rest = shuffle(
    DECK.filter((c) => !used.has(c)),
    makeRng(options.seed ?? 1),
  );
  let i = 0;
  for (const hand of hands) while (hand.length < cardsPerPlayer) hand.push(rest[i++] as Card);
  while (chien.length < chienSize) chien.push(rest[i++] as Card);
  return { hands, chien };
}

export function handFrom(
  playerCount: PlayerCount,
  fixed: Record<number, string>,
  options: { chien?: string; seed?: number; dealer?: number; rules?: Partial<Rules> } = {},
): GameState {
  const { hands, chien } = fillDeal(playerCount, fixed, options);
  return createHandFrom({
    playerCount,
    dealer: options.dealer ?? 0,
    hands,
    chien,
    rules: options.rules,
  });
}

export function apply(state: GameState, ...actions: Action[]): GameState {
  let s = state;
  for (const a of actions) s = applyAction(s, a);
  return s;
}

/** Everyone passes except `taker`, who bids `bid`. */
export function bidTo(state: GameState, taker: number, bid: Bid): GameState {
  let s = state;
  for (let i = 0; i < s.playerCount; i++) {
    const p = s.currentPlayer;
    s = applyAction(s, { type: 'Bid', player: p, bid: p === taker ? bid : Bid.Pass });
  }
  return s;
}

/** A legal, unsurprising ecart: cheapest non-trump cards first. */
export function chooseEcart(hand: readonly Card[], size: number): Card[] {
  const forced = forcedTrumpCount(hand, size);
  const pool = discardableCards(hand);
  const nonTrumps = pool.filter((c) => !isTrump(c)).sort((a, b) => points2(a) - points2(b));
  const trumps = pool.filter(isTrump).sort((a, b) => a - b);
  return [...trumps.slice(0, forced), ...nonTrumps.slice(0, size - forced)];
}

export function autoDiscard(state: GameState): GameState {
  if (state.phase !== 'discard') return state;
  const taker = state.taker as number;
  const cards = chooseEcart(state.hands[taker] as Card[], LAYOUT[state.playerCount].chienSize);
  return applyAction(state, { type: 'Discard', player: taker, cards });
}

/** Everyone declines the chelem. */
export function skipChelem(state: GameState): GameState {
  let s = state;
  while (s.phase === 'chelem') {
    s = applyAction(s, { type: 'AnnounceChelem', player: s.currentPlayer, announce: false });
  }
  return s;
}

/**
 * Play out a hand with an explicit card policy. The default keeps the Excuse
 * back until it is the only card left and otherwise plays the lowest legal card,
 * which makes scripted scenarios deterministic.
 */
export function playOut(
  state: GameState,
  pick: (s: GameState, legal: Card[]) => Card = lowestKeepingExcuse,
): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'playing') {
    guard++;
    if (guard > 200) throw new Error('Play did not terminate');
    const legal = legalCards(s.hands[s.currentPlayer] as Card[], s.currentTrick?.plays ?? []);
    s = applyAction(s, { type: 'PlayCard', player: s.currentPlayer, card: pick(s, legal) });
  }
  return s;
}

/** Play exactly `n` more cards with the given policy. */
export function playCards(
  state: GameState,
  n: number,
  pick: (s: GameState, legal: Card[]) => Card = lowestKeepingExcuse,
): GameState {
  let s = state;
  for (let i = 0; i < n && s.phase === 'playing'; i++) {
    const legal = legalCards(s.hands[s.currentPlayer] as Card[], s.currentTrick?.plays ?? []);
    s = applyAction(s, { type: 'PlayCard', player: s.currentPlayer, card: pick(s, legal) });
  }
  return s;
}

export function lowestKeepingExcuse(_s: GameState, legal: Card[]): Card {
  const sorted = [...legal].sort((a, b) => a - b);
  const withoutExcuse = sorted.filter((c) => c !== EXCUSE);
  return (withoutExcuse[0] ?? sorted[0]) as Card;
}

/** Drive a hand to the end with random legal choices. */
export function playRandomly(state: GameState, seed: number): GameState {
  const rng = makeRng(seed);
  let s = state;
  let guard = 0;
  while (s.phase !== 'done' && s.phase !== 'passed') {
    guard++;
    if (guard > 500) throw new Error(`Hand did not terminate (phase ${s.phase})`);
    if (s.phase === 'discard') {
      s = autoDiscard(s);
      continue;
    }
    const actions = legalActions(s);
    // Poignees are rare; take them only occasionally so they still get exercised.
    const pool = actions.filter((a) => a.type !== 'AnnouncePoignee' || rng.next() < 0.5);
    const source = pool.length > 0 ? pool : actions;
    s = applyAction(s, source[rng.nextInt(source.length)] as Action);
  }
  return s;
}

/** A full random hand, biased so that somebody almost always takes. */
export function randomHand(playerCount: PlayerCount, seed: number): GameState {
  const rng = makeRng(seed);
  let s = createHand({ playerCount, seed, dealer: rng.nextInt(playerCount) });
  // Bidding: force at least one non-pass so most hands are actually played.
  const forcedTaker = rng.nextInt(playerCount);
  for (let i = 0; i < playerCount; i++) {
    const p = s.currentPlayer;
    const available = legalActions(s).filter((a) => a.type === 'Bid');
    const nonPass = available.filter((a) => a.type === 'Bid' && a.bid !== Bid.Pass);
    const pick =
      p === forcedTaker && nonPass.length > 0
        ? (nonPass[rng.nextInt(nonPass.length)] as Action)
        : (available[rng.nextInt(available.length)] as Action);
    s = applyAction(s, pick);
  }
  if (s.phase === 'passed') return s;
  if (s.phase === 'calling') {
    const calls = legalCalls(s.hands[s.taker as number] as Card[]);
    s = applyAction(s, {
      type: 'CallKing',
      player: s.taker as number,
      card: calls[rng.nextInt(calls.length)] as Card,
    });
  }
  return playRandomly(s, seed ^ 0x9e3779b9);
}

export { nextPlayer, Bid };
