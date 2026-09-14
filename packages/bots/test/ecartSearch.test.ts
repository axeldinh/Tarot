import { describe, expect, it } from 'vitest';
import { Bid, LAYOUT, makeRng, parseHand, validateEcart, type Card } from '@tarot/engine';
import { CONFIG, ecartCandidates, makeBot, searchEcart } from '../src/index.ts';
import { dealToPlay } from './helpers.ts';
import { createHand, playerView } from '@tarot/engine';

const weights = CONFIG.normal.ecart;

describe('the candidate ecarts', () => {
  const hand = parseHand(
    'SR HR S2 S3 S4 H2 H3 H4 D2 D3 D4 C2 C3 C4 T5 T6 T7 T8 T9 T10 T11 T12 D5 C5',
  );

  it('start from the heuristic and walk outwards from it', () => {
    const candidates = ecartCandidates(hand, 6, weights, 8);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(8);
    // Every one of them is a legal ecart.
    for (const cards of candidates) {
      expect(cards).toHaveLength(6);
      expect(validateEcart(hand, cards, 6)).toBeNull();
    }
  });

  it('are all different from each other', () => {
    const candidates = ecartCandidates(hand, 6, weights, 10);
    const keys = candidates.map((c) => [...c].sort((a, b) => a - b).join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('respect the forced number of trumps in every candidate', () => {
    // Nothing but kings, bouts and trumps: exactly six trumps have to go.
    const forced = parseHand(
      'SR HR DR CR T1 T21 EX T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18',
    );
    for (const cards of ecartCandidates(forced, 6, weights, 8)) {
      expect(validateEcart(forced, cards, 6)).toBeNull();
    }
  });

  it('stop at the limit it is given', () => {
    expect(ecartCandidates(hand, 6, weights, 3)).toHaveLength(3);
    expect(ecartCandidates(hand, 6, weights, 1)).toHaveLength(1);
  });
});

describe('searching the ecart', () => {
  /** A view of a taker who has just picked up the chien. */
  function takerView() {
    for (let seed = 1; seed < 80; seed++) {
      let state = createHand({ playerCount: 4, seed: seed * 613, dealer: 3 });
      for (let i = 0; i < 4; i++) {
        const p = state.currentPlayer;
        state = applyBid(state, p, p === 0 ? Bid.Garde : Bid.Pass);
      }
      if (state.phase === 'discard') return playerView(state, 0);
    }
    throw new Error('no deal put seat 0 in the discard phase');
  }

  function applyBid(state: ReturnType<typeof createHand>, player: number, bid: Bid) {
    // Imported lazily to keep the helper honest about what it uses.
    return applyAction(state, { type: 'Bid', player, bid });
  }

  it('returns something the engine will accept', () => {
    const view = takerView();
    const choice = searchEcart(view, weights, { candidates: 6, determinisations: 3 }, makeRng(1));
    expect(choice.cards).toHaveLength(LAYOUT[4].chienSize);
    expect(validateEcart(view.hand, choice.cards, LAYOUT[4].chienSize)).toBeNull();
    expect(choice.samples).toBe(3);
    expect(choice.expected.size).toBeGreaterThan(1);
  });

  it('picks the candidate its own search rates highest', () => {
    const view = takerView();
    const choice = searchEcart(view, weights, { candidates: 6, determinisations: 3 }, makeRng(2));
    const key = [...choice.cards].sort((a, b) => a - b).join(',');
    const best = Math.max(...choice.expected.values());
    expect(choice.expected.get(key)).toBe(best);
  });

  it('falls back to the heuristic when there is nothing to choose between', () => {
    const view = takerView();
    const choice = searchEcart(view, weights, { candidates: 1, determinisations: 5 }, makeRng(3));
    expect(choice.samples).toBe(0);
    expect(choice.cards).toHaveLength(6);
  });

  it('is what Confirme uses, and Normal does not', () => {
    expect(CONFIG.confirme.searchEcart).not.toBeNull();
    expect(CONFIG.normal.searchEcart).toBeNull();
    expect(CONFIG.debutant.searchEcart).toBeNull();
  });

  it('plays legal hands through at Confirme, ecart and all', () => {
    const bots = Array.from({ length: 4 }, (_, seat) => makeBot('confirme', { seed: 5 + seat }));
    let played = 0;
    for (let seed = 0; seed < 3; seed++) {
      const state = playOut(seed * 977 + 3, bots);
      if (state.result === null) continue;
      played++;
      expect(state.result.deltas.reduce((a, b) => a + b, 0)).toBe(0);
      expect(state.hands.every((h) => h.length === 0)).toBe(true);
    }
    expect(played).toBeGreaterThan(0);
  }, 120_000);
});

import { applyAction } from '@tarot/engine';
import { playHandWithBots, type Bot } from '../src/index.ts';

function playOut(seed: number, bots: Bot[]) {
  return playHandWithBots(createHand({ playerCount: 4, seed, dealer: 0 }), bots);
}
