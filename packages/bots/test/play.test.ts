import { describe, expect, it } from 'vitest';
import {
  Bid,
  legalCards,
  makeRng,
  playerView,
  type Card,
} from '@tarot/engine';
import { CONFIG, chooseCard, greedyChoice } from '../src/index.ts';
import { dealToPlay, playSomeTricks } from './helpers.ts';

const fastConfig = {
  ...CONFIG.normal,
  play: { budgetMs: 1000, maxDeterminisations: 6, samplingAttempts: 30 },
};

describe('choosing a card', () => {
  it('answers instantly when there is only one legal card', () => {
    // Deep into the hand somebody is usually down to a forced card.
    let s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans, seed: 31 });
    s = playSomeTricks(s, 66);
    while (s.phase === 'playing') {
      const view = playerView(s, s.currentPlayer);
      const legal = legalCards(view.hand, view.currentTrick?.plays ?? []);
      if (legal.length === 1) {
        const choice = chooseCard(view, fastConfig, makeRng(1), () => 0);
        expect(choice.card).toBe(legal[0]);
        expect(choice.samples).toBe(0);
        return;
      }
      s = playSomeTricks(s, 1);
    }
    throw new Error('never reached a forced card');
  });

  it('searches, and picks the card its search rates highest', () => {
    const s = playSomeTricks(dealToPlay({}, { taker: 0, bid: Bid.Garde, seed: 55 }), 20);
    const view = playerView(s, s.currentPlayer);
    const legal = legalCards(view.hand, view.currentTrick?.plays ?? []);
    const choice = chooseCard(view, fastConfig, makeRng(2), () => 0);

    expect(choice.samples).toBe(6);
    expect(legal).toContain(choice.card);
    expect([...choice.expected.keys()].sort()).toEqual([...legal].sort());
    const best = Math.max(...choice.expected.values());
    expect(choice.expected.get(choice.card)).toBe(best);
  });

  it('stops as soon as the move budget is gone', () => {
    const s = playSomeTricks(dealToPlay({}, { taker: 0, bid: Bid.Garde, seed: 56 }), 12);
    const view = playerView(s, s.currentPlayer);
    // A clock that jumps a second per reading: the budget is spent immediately,
    // but one determinisation always runs so there is something to choose from.
    let tick = 0;
    const choice = chooseCard(
      view,
      { ...CONFIG.confirme, play: { ...CONFIG.confirme.play, budgetMs: 10 } },
      makeRng(3),
      () => (tick += 1000),
    );
    expect(choice.samples).toBe(1);
    expect(legalCards(view.hand, view.currentTrick?.plays ?? [])).toContain(choice.card);
  });

  it('falls back to the heuristic when the level has no search', () => {
    const s = playSomeTricks(dealToPlay({}, { taker: 0, bid: Bid.Garde, seed: 57 }), 8);
    const view = playerView(s, s.currentPlayer);
    const choice = chooseCard(view, CONFIG.debutant, makeRng(4), () => 0);
    expect(choice.samples).toBe(0);
    expect(choice.card).toBe(greedyChoice(view));
    expect(choice.expected.size).toBe(0);
  });

  it('always returns a legal card, at every table size', () => {
    for (const playerCount of [3, 4, 5] as const) {
      let s = dealToPlay({}, { taker: 0, bid: Bid.Garde, seed: 71, playerCount });
      let steps = 0;
      while (s.phase === 'playing' && steps < 12) {
        const view = playerView(s, s.currentPlayer);
        const legal = legalCards(view.hand, view.currentTrick?.plays ?? []);
        const choice = chooseCard(view, fastConfig, makeRng(steps + 1), () => 0);
        expect(legal).toContain(choice.card as Card);
        s = playSomeTricks(s, 1);
        steps++;
      }
    }
  });
});
