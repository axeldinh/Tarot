import { describe, expect, it } from 'vitest';
import {
  Bid,
  EXCUSE,
  TOTAL_POINTS_2,
  applyAction,
  createHand,
  isBout,
  isTrump,
  legalCards,
  parseCard,
  parseHand,
  playerView,
  points2,
  rankOf,
  sumPoints2,
  trickWinner,
  type Card,
  type GameState,
  type TrickPlay,
} from '@tarot/engine';
import {
  buildKnowledge,
  greedyCard,
  makeBot,
  makeSideOf,
  partnerIn,
  playHandWithBots,
  rollout,
  sampleLayout,
  scoreRollout,
  settleExcuse,
  tallyTricks,
  type Bot,
} from '../src/index.ts';
import { dealToPlay } from './helpers.ts';
import { makeRng } from '@tarot/engine';

function finishedHand(seed: number, playerCount: 3 | 4 | 5 = 4): GameState {
  const bots: Bot[] = Array.from({ length: playerCount }, (_, seat) =>
    makeBot('debutant', { seed: seed + seat }),
  );
  return playHandWithBots(createHand({ playerCount, seed, dealer: 0 }), bots);
}

describe('counting the tricks that are already in', () => {
  it('agrees with the engine about who holds what', () => {
    let checked = 0;
    let sawExcuseKept = false;
    for (let seed = 0; seed < 120; seed++) {
      const s = finishedHand(seed * 31 + 1);
      if (s.result === null) continue;
      checked++;
      sawExcuseKept ||= s.tricks.some((t) => t.excuseKept);

      const sideOf = makeSideOf(s.taker as number, s.partner);
      const tally = tallyTricks(s.tricks, sideOf, s.playerCount);
      settleExcuse(tally, sideOf);
      const extra = s.contract === Bid.GardeSans ? s.chien : [];
      const takerPoints2 = tally.points2[0] + sumPoints2([...s.ecart, ...extra]);
      const bouts = tally.bouts[0] + [...s.ecart, ...extra].filter(isBout).length;

      expect(takerPoints2).toBe(s.result.takerPoints2);
      expect(bouts).toBe(s.result.bouts);
      expect(tally.points2[0] + tally.points2[1]).toBe(
        TOTAL_POINTS_2 - sumPoints2([...s.ecart, ...s.chien]),
      );
    }
    expect(checked).toBeGreaterThan(80);
    // The Excuse changing hands is the interesting case; make sure it happened.
    expect(sawExcuseKept).toBe(true);
  });
});

describe('the greedy policy', () => {
  const sideOf = makeSideOf(0, null);

  it('only ever returns a legal card', () => {
    for (let seed = 0; seed < 60; seed++) {
      let s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans, seed: seed * 97 + 3 });
      while (s.phase === 'playing') {
        const seat = s.currentPlayer;
        const plays = s.currentTrick?.plays ?? [];
        const card = greedyCard(s.hands[seat] as Card[], plays, seat, 4, sideOf, false);
        expect(legalCards(s.hands[seat] as Card[], plays)).toContain(card);
        s = applyAction(s, { type: 'PlayCard', player: seat, card });
      }
    }
  });

  it('takes a trick it can win, as cheaply as it can', () => {
    const hand = parseHand('S5 SD SR T2 T18');
    const plays: TrickPlay[] = [{ player: 0, card: parseCard('S9') }];
    // The dame beats the nine; the king would be an extravagance.
    expect(greedyCard(hand, plays, 1, 4, sideOf, false)).toBe(parseCard('SD'));
  });

  it('ruffs with the smallest trump that does the job', () => {
    const hand = parseHand('H2 H3 T2 T9 T18');
    const plays: TrickPlay[] = [{ player: 0, card: parseCard('S9') }];
    expect(greedyCard(hand, plays, 1, 4, sideOf, false)).toBe(parseCard('T2'));
  });

  it('throws its cheapest card when it cannot win', () => {
    const hand = parseHand('S2 SR SD');
    const plays: TrickPlay[] = [
      { player: 0, card: parseCard('S9') },
      { player: 3, card: parseCard('T18') },
    ];
    expect(greedyCard(hand, plays, 1, 4, sideOf, false)).toBe(parseCard('S2'));
  });

  it('gives its points to a partner who already holds the trick', () => {
    const partnered = makeSideOf(0, 1);
    const hand = parseHand('H2 HR H5');
    const plays: TrickPlay[] = [
      { player: 0, card: parseCard('S9') },
      { player: 2, card: parseCard('S3') },
      { player: 3, card: parseCard('S4') },
    ];
    // Seat 1 is last, void in spades and out of trumps: hand over the king.
    expect(greedyCard(hand, plays, 1, 4, partnered, false)).toBe(parseCard('HR'));
  });

  it('holds the Excuse back on the last trick, where it would be lost', () => {
    const hand = parseHand('EX H2');
    const plays: TrickPlay[] = [{ player: 0, card: parseCard('S9') }];
    expect(greedyCard(hand, plays, 1, 4, sideOf, true)).toBe(parseCard('H2'));
    // Earlier in the hand, letting the Excuse go instead of a real card is fine.
    expect(greedyCard(parseHand('EX HR'), plays, 1, 4, sideOf, false)).toBe(EXCUSE);
  });

  it('leads a king when it has one', () => {
    const hand = parseHand('S2 HR T5');
    expect(greedyCard(hand, [], 0, 4, sideOf, false)).toBe(parseCard('HR'));
  });

  it('draws trumps when it is long in them', () => {
    const hand = parseHand('S2 T5 T6 T7 T8 T19');
    expect(greedyCard(hand, [], 0, 4, sideOf, false)).toBe(parseCard('T19'));
    expect(rankOf(parseCard('T19'))).toBe(19);
  });
});

describe('a rollout', () => {
  it('plays every remaining card and scores a whole hand', () => {
    const s = dealToPlay({}, { taker: 0, bid: Bid.Garde, seed: 909 });
    const view = playerView(s, 0);
    const layout = sampleLayout(view, buildKnowledge(view), makeRng(5), 30);
    const legal = legalCards(view.hand, []);
    const result = rollout(view, layout, partnerIn(view, layout), legal[0] as Card);

    expect(result.takerPoints2 + result.bouts * 0).toBeGreaterThan(0);
    expect(result.takerPoints2).toBeLessThanOrEqual(TOTAL_POINTS_2);
    expect(result.bouts).toBeGreaterThanOrEqual(0);
    expect(result.bouts).toBeLessThanOrEqual(3);

    const delta = scoreRollout(view, partnerIn(view, layout), result);
    expect(Number.isFinite(delta)).toBe(true);
  });

  it('reproduces the engine exactly when the layout is the real one', () => {
    // Hand the rollout the true hands: the greedy policy then drives both, so the
    // rollout's bookkeeping must land on the engine's own numbers.
    const start = dealToPlay({}, { taker: 0, bid: Bid.GardeSans, seed: 4242 });
    const view = playerView(start, start.currentPlayer);
    const truth = {
      hands: start.hands.map((h) => [...h]),
      ecart: [...start.ecart],
      chien: [...start.chien],
    };
    const sideOf = makeSideOf(start.taker as number, start.partner);
    const first = greedyCard(
      start.hands[start.currentPlayer] as Card[],
      [],
      start.currentPlayer,
      4,
      sideOf,
      false,
    );
    const predicted = rollout(view, truth, start.partner, first);

    let s = start;
    while (s.phase === 'playing') {
      const seat = s.currentPlayer;
      const card = greedyCard(
        s.hands[seat] as Card[],
        s.currentTrick?.plays ?? [],
        seat,
        4,
        sideOf,
        s.tricks.length + 1 === 18,
      );
      s = applyAction(s, { type: 'PlayCard', player: seat, card });
    }

    expect(predicted.takerPoints2).toBe(s.result?.takerPoints2);
    expect(predicted.bouts).toBe(s.result?.bouts);
    expect(predicted.petitAuBoutSide).toBe(s.result?.petitAuBoutSide);
    expect(scoreRollout(view, start.partner, predicted)).toBe(s.result?.deltas[view.self]);
  });

  it('spots a trump card is worth more than a spot card', () => {
    expect(points2(parseCard('SR'))).toBe(9);
    expect(isTrump(parseCard('T5'))).toBe(true);
    expect(trickWinner([{ player: 0, card: parseCard('T5') }])).toBe(0);
  });
});
