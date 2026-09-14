import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  chooseCall,
  chooseEcart,
  ecartCost,
} from '../src/index.ts';
import {
  DAME,
  ROI,
  SUITS,
  createHand,
  formatHand,
  isBout,
  isKing,
  isTrump,
  king,
  legalCalls,
  parseHand,
  suitCard,
  suitOf,
  validateEcart,
  type Card,
} from '@tarot/engine';

const w = CONFIG.normal.ecart;

describe('choosing the ecart', () => {
  it('always produces something the engine accepts', () => {
    for (let seed = 0; seed < 300; seed++) {
      const state = createHand({ playerCount: 4, seed, dealer: 0 });
      const hand = [...(state.hands[0] as Card[]), ...state.chien];
      const ecart = chooseEcart(hand, 6, w);
      expect(validateEcart(hand, ecart, 6)).toBeNull();
    }
  });

  it('never buries a king or a bout', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createHand({ playerCount: 5, seed, dealer: 0 });
      const hand = [...(state.hands[0] as Card[]), ...state.chien];
      for (const card of chooseEcart(hand, 3, w)) {
        expect(isKing(card)).toBe(false);
        expect(isBout(card)).toBe(false);
      }
    }
  });

  it('buries the shortest suit to make a void', () => {
    // One lonely heart, plenty of spare clubs: the heart should go.
    const hand = parseHand('H3 S2 S3 S4 S5 S6 S7 S8 C2 C3 C4 C5 SR CR T10 T11 T12 T13 T14 T15');
    const ecart = chooseEcart(hand, 6, w);
    expect(ecart).toContain(parseHand('H3')[0]);
    expect(ecart.filter((c) => suitOf(c) === 1)).toHaveLength(1);
  });

  it('keeps trumps in hand until the rules force them out', () => {
    const plenty = parseHand('S2 S3 S4 S5 S6 S7 H2 H3 T10 T11 T12 T13 T14 T15 SR HR DR CR');
    expect(chooseEcart(plenty, 6, w).filter(isTrump)).toHaveLength(0);

    // Nothing but kings, bouts and trumps: four trumps have to be buried.
    const forced = parseHand('SR HR DR CR T1 T21 EX T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12');
    const ecart = chooseEcart(forced, 6, w);
    expect(ecart.filter(isTrump)).toHaveLength(6);
    // And it buries the lowest ones it is allowed to.
    expect(formatHand(ecart)).toBe('T2 T3 T4 T5 T6 T7');
  });

  it('does not strip a dame bare when there is an alternative', () => {
    const hand = parseHand('SD S2 H2 H3 H4 H5 H6 H7 CR C2 C3 C4 T10 T11 T12 T13 T14 T15');
    const ecart = chooseEcart(hand, 6, w);
    // The guarded dame keeps its guard: S2 stays while hearts go.
    expect(ecart).not.toContain(parseHand('S2')[0]);
    expect(ecart).not.toContain(suitCard(0, DAME));
  });

  it('prices a card by what it costs to lose it', () => {
    const hand = parseHand('S2 S3 S4 H9 HD H2');
    // A singleton-ish cheap card in a suit with no king is the cheapest thing to bury.
    const cheap = ecartCost(parseHand('S2')[0] as Card, hand, w);
    const dame = ecartCost(suitCard(1, DAME), hand, w);
    expect(cheap).toBeLessThan(dame);
  });
});

describe('calling a king', () => {
  it('calls a king it does not hold', () => {
    const hand = parseHand('SR S2 S3 H2 H3 H4 D2 D3 C2 C3 T5 T6 T7 T8 T9');
    const called = chooseCall(hand, legalCalls(hand), w);
    expect(hand).not.toContain(called);
    expect(SUITS.map((s) => king(s))).toContain(called);
  });

  it('looks for the king in a suit it can actually help with', () => {
    // Void in clubs, three hearts: hearts is where the partner can be reached.
    const hand = parseHand('S2 H2 H3 H4 D2 D3 D4 D5 D6 D7 T5 T6 T7 T8 T9');
    expect(chooseCall(hand, legalCalls(hand), w)).toBe(king(1));
  });

  it('drops to the dames when it holds all four kings', () => {
    const hand = parseHand('SR HR DR CR SD HD S2 H2 T5 T6 T7 T8 T9 T10 T11');
    const legal = legalCalls(hand);
    expect(legal.map((c) => c)).toEqual(SUITS.map((s) => suitCard(s, DAME)));
    const called = chooseCall(hand, legal, w);
    // Two dames are already in hand, so it reaches for one of the other two.
    expect(hand).not.toContain(called);
    expect(legal).toContain(called);
    expect(ROI).toBe(14);
  });

  it('still answers when every candidate is one it holds', () => {
    // legalCalls can never hand this over, but the function must not fall apart.
    const hand = parseHand('SR HR DR CR SD HD DD CD T5 T6 T7 T8 T9 T10 T11');
    const held = SUITS.map((s) => king(s));
    expect(held).toContain(chooseCall(hand, held, w));
  });
});
