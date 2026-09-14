import {
  Bid,
  LAYOUT,
  PETIT,
  isBout,
  isExcuse,
  isTrump,
  legalCards,
  points2,
  rankOf,
  scoreHand,
  trickWinner,
  type Card,
  type CompletedTrick,
  type PlayerView,
  type Side,
  type TrickPlay,
} from '@tarot/engine';
import type { Layout } from './knowledge.ts';

/** 0 is the taker's side, 1 the defence — array indices are cheaper than strings. */
type SideIndex = 0 | 1;

export interface Tally {
  points2: [number, number];
  bouts: [number, number];
  tricks: [number, number];
  /** Tricks won per seat, which decides whether an Excuse debt can be paid. */
  tricksByPlayer: number[];
  /** Every time the Excuse went home owing its winner a low card. */
  excuseDebts: { owner: number; winner: number }[];
}

export function emptyTally(playerCount: number): Tally {
  return {
    points2: [0, 0],
    bouts: [0, 0],
    tricks: [0, 0],
    tricksByPlayer: new Array<number>(playerCount).fill(0),
    excuseDebts: [],
  };
}

/** Book one finished trick into the tally, Excuse and all. */
function recordTrick(
  tally: Tally,
  plays: readonly TrickPlay[],
  winner: number,
  excusePlay: TrickPlay | undefined,
  sideOf: (p: number) => SideIndex,
): void {
  const winnerSide = sideOf(winner);
  tally.tricks[winnerSide]++;
  tally.tricksByPlayer[winner] = (tally.tricksByPlayer[winner] as number) + 1;

  for (const play of plays) {
    const keeper = play === excusePlay ? sideOf(play.player) : winnerSide;
    tally.points2[keeper] += points2(play.card);
    if (isBout(play.card)) tally.bouts[keeper]++;
  }
  if (excusePlay && excusePlay.player !== winner) {
    const owner = sideOf(excusePlay.player);
    if (owner !== winnerSide) {
      tally.points2[owner] -= 1;
      tally.points2[winnerSide] += 1;
    }
    tally.excuseDebts.push({ owner: excusePlay.player, winner });
  }
}

/**
 * Settle the Excuse at the end of the hand. A player who took no trick at all
 * has no low card to hand over, so the Excuse itself goes to the player who was
 * owed it — which is worth four points either way and decides a bout.
 */
export function settleExcuse(tally: Tally, sideOf: (p: number) => SideIndex): void {
  for (const debt of tally.excuseDebts) {
    if ((tally.tricksByPlayer[debt.owner] as number) > 0) continue;
    const from = sideOf(debt.owner);
    const to = sideOf(debt.winner);
    if (from === to) continue;
    // Give the Excuse over, and take back the low card that was never paid.
    tally.points2[from] -= 9 - 1;
    tally.points2[to] += 9 - 1;
    tally.bouts[from] -= 1;
    tally.bouts[to] += 1;
  }
  tally.excuseDebts = [];
}

export function makeSideOf(taker: number, partner: number | null): (p: number) => SideIndex {
  return (p) => (p === taker || (partner !== null && p === partner) ? 0 : 1);
}

/**
 * Points and bouts already banked from the finished tricks.
 *
 * The Excuse stays with the player who played it and buys the trick winner a
 * low card instead; between two sides that is a swap of 4.5 for 0.5, and within
 * one side it nets to nothing.
 */
export function tallyTricks(
  tricks: readonly CompletedTrick[],
  sideOf: (p: number) => SideIndex,
  playerCount: number,
): Tally {
  const tally = emptyTally(playerCount);
  for (const trick of tricks) {
    const excusePlay = trick.excuseKept ? trick.plays.find((p) => isExcuse(p.card)) : undefined;
    recordTrick(tally, trick.plays, trick.winner, excusePlay, sideOf);
  }
  return tally;
}

/** What it costs to throw a card away on a trick we are not trying to win. */
function dumpCost(card: Card, lastTrick: boolean): number {
  if (isExcuse(card)) return lastTrick ? 100 : 1.5;
  return points2(card);
}

/** What it costs to take the trick with this card. */
function winCost(card: Card): number {
  return (isTrump(card) ? 50 : 0) + rankOf(card) + (isBout(card) ? 30 : 0);
}

/**
 * The fast policy used inside rollouts, and by the Debutant level for real.
 * Take the trick cheaply when an opponent holds it, pile points on when a
 * partner does, and otherwise throw the least valuable thing in hand.
 */
export function greedyCard(
  hand: readonly Card[],
  plays: readonly TrickPlay[],
  me: number,
  playerCount: number,
  sideOf: (p: number) => SideIndex,
  lastTrick: boolean,
): Card {
  const legal = legalCards(hand, plays);
  const pick = (cards: readonly Card[], cost: (c: Card) => number): Card => {
    let best = cards[0] as Card;
    let bestCost = cost(best);
    for (const c of cards.slice(1)) {
      const value = cost(c);
      if (value < bestCost) {
        best = c;
        bestCost = value;
      }
    }
    return best;
  };

  if (plays.length === 0) {
    const kings = legal.filter((c) => !isTrump(c) && rankOf(c) === 14);
    if (kings.length > 0) return kings[0] as Card;
    const trumps = legal.filter(isTrump);
    // With a long trump holding, draw them: it protects the honours behind.
    if (trumps.length >= 5) return trumps.reduce((a, b) => (rankOf(a) > rankOf(b) ? a : b));
    const plain = legal.filter((c) => !isTrump(c) && !isExcuse(c));
    return pick(plain.length > 0 ? plain : legal, (c) => dumpCost(c, lastTrick));
  }

  const holder = trickWinner(plays);
  const friendly = sideOf(holder) === sideOf(me);
  const last = plays.length === playerCount - 1;

  if (!friendly) {
    const winners = legal.filter(
      (c) => !isExcuse(c) && trickWinner([...plays, { player: me, card: c }]) === me,
    );
    if (winners.length > 0) return pick(winners, winCost);
  } else if (last) {
    // A partner has it: give them the points.
    const gifts = legal.filter((c) => !isExcuse(c));
    if (gifts.length > 0) return gifts.reduce((a, b) => (points2(a) >= points2(b) ? a : b));
  }

  return pick(legal, (c) => dumpCost(c, lastTrick));
}

export interface RolloutResult {
  takerPoints2: number;
  bouts: number;
  petitAuBoutSide: Side | null;
  chelemSide: Side | null;
}

/**
 * Play the hand out from here with the greedy policy and report what the taker
 * ends up with. `forced` is the card we are testing; everything after it is the
 * policy's business.
 */
export function rollout(
  view: PlayerView,
  layout: Layout,
  partner: number | null,
  forced: Card,
): RolloutResult {
  const taker = view.taker as number;
  const sideOf = makeSideOf(taker, partner);
  const playerCount = view.playerCount;
  const totalTricks = LAYOUT[playerCount].cardsPerPlayer;

  const hands = layout.hands.map((h) => [...h]);
  const tally = tallyTricks(view.tricks, sideOf, playerCount);
  let plays: TrickPlay[] = view.currentTrick ? [...view.currentTrick.plays] : [];
  let leader = view.currentTrick?.leader ?? view.self;
  let turn = view.self;
  let done = view.tricks.length;
  let petitAuBout: Side | null = null;
  let next = forced;

  while (done < totalTricks) {
    const lastTrick = done + 1 === totalTricks;
    const hand = hands[turn] as Card[];
    const card =
      next >= 0 ? next : greedyCard(hand, plays, turn, playerCount, sideOf, lastTrick);
    next = -1;
    hand.splice(hand.indexOf(card), 1);
    plays.push({ player: turn, card });

    if (plays.length < playerCount) {
      turn = (turn + 1) % playerCount;
      continue;
    }

    const excusePlay = plays.find((p) => isExcuse(p.card));
    const excuseWins =
      excusePlay !== undefined &&
      lastTrick &&
      view.chelemAnnouncedBy === excusePlay.player &&
      leader === excusePlay.player &&
      tally.tricks[sideOf(excusePlay.player) === 0 ? 1 : 0] === 0;
    const winner = trickWinner(plays, { excuseWins });
    const keepsExcuse = excusePlay !== undefined && !excuseWins && !lastTrick;
    recordTrick(tally, plays, winner, keepsExcuse ? excusePlay : undefined, sideOf);
    if (lastTrick && plays.some((p) => p.card === PETIT)) {
      const winnerSide = sideOf(winner);
      petitAuBout = winnerSide === 0 ? 'taker' : 'defence';
    }

    done++;
    plays = [];
    leader = winner;
    turn = winner;
  }
  settleExcuse(tally, sideOf);

  let takerPoints2 = tally.points2[0];
  let bouts = tally.bouts[0];
  const extra = view.contract === Bid.GardeSans ? layout.chien : [];
  for (const c of [...layout.ecart, ...extra]) {
    takerPoints2 += points2(c);
    if (isBout(c)) bouts++;
  }

  const chelemSide =
    tally.tricks[1] === 0 ? 'taker' : tally.tricks[0] === 0 ? 'defence' : null;

  return { takerPoints2, bouts, petitAuBoutSide: petitAuBout, chelemSide };
}

/** Turn a finished rollout into this seat's own point delta. */
export function scoreRollout(
  view: PlayerView,
  partner: number | null,
  result: RolloutResult,
): number {
  const taker = view.taker as number;
  const sideOf = makeSideOf(taker, partner);
  const scored = scoreHand({
    playerCount: view.playerCount,
    taker,
    partner,
    contract: view.contract as Bid,
    takerPoints2: result.takerPoints2,
    bouts: result.bouts,
    petitAuBoutSide: result.petitAuBoutSide,
    poignees: view.poignees.map((p) => ({
      side: sideOf(p.player) === 0 ? ('taker' as const) : ('defence' as const),
      kind: p.kind,
    })),
    chelem: {
      achievedBy: result.chelemSide,
      announcedBy:
        view.chelemAnnouncedBy === null
          ? null
          : sideOf(view.chelemAnnouncedBy) === 0
            ? 'taker'
            : 'defence',
    },
    rules: { petitAuBoutIndependentOfContract: false },
  });
  return scored.deltas[view.self] as number;
}
