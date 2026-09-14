import { describe, expect, it } from 'vitest';
import { Bid, createHand, parseHand, type Card, type PlayerCount } from '@tarot/engine';
import { CONFIG, bidForHand, chooseBid, evaluateHand, shapeOf } from '../src/index.ts';

const config = CONFIG.normal;
const w = config.bidding;

const ALL_TRUMPS = parseHand(
  'T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18 EX SR HR',
);
const JUNK = parseHand('S2 S3 S4 S5 H2 H3 H4 H5 D2 D3 D4 D5 C2 C3 C4 C5 C6 C7');

describe('reading a hand', () => {
  it('counts what is actually in it', () => {
    const shape = shapeOf(parseHand('SR SD S2 HR H3 T1 T21 T17 EX'));
    expect(shape.kings).toBe(2);
    expect(shape.dames).toBe(1);
    expect(shape.bouts).toBe(3);
    expect(shape.has21).toBe(true);
    expect(shape.hasPetit).toBe(true);
    expect(shape.hasExcuse).toBe(true);
    expect(shape.trumps).toHaveLength(3);
    expect(shape.highTrumps).toHaveLength(2);
    expect(shape.suitLengths).toEqual([3, 2, 0, 0]);
    expect(shape.voids).toBe(2);
    expect(shape.singletons).toBe(0);
  });

  it('rates a monster far above a bag of nothing', () => {
    expect(evaluateHand(ALL_TRUMPS, w)).toBeGreaterThan(evaluateHand(JUNK, w) + 20);
  });

  it('rewards bouts, trumps, kings and short suits', () => {
    const base = parseHand('S2 S3 S4 H5 H6 D7 D8 C9 C10 T5 T6 T7');
    const richer = (extra: string, drop: string): number =>
      evaluateHand([...base.filter((c) => !parseHand(drop).includes(c)), ...parseHand(extra)], w);
    // Swapping a plain card for a bout, a king, or a high trump all help.
    expect(richer('T21', 'S2')).toBeGreaterThan(evaluateHand(base, w));
    expect(richer('SR', 'S2')).toBeGreaterThan(evaluateHand(base, w));
    expect(richer('T20', 'S2')).toBeGreaterThan(evaluateHand(base, w));
  });

  it('charges for cards beyond five in one side suit', () => {
    const long = parseHand('S2 S3 S4 S5 S6 S7 S8 T5 T6 T7');
    expect(evaluateHand(long, w)).toBe(evaluateHand(long, { ...w, longSuitPenalty: 0 }) - 1);
  });

  it('still prefers a hand that can ruff to a flat one', () => {
    // Three voids and three trumps beats a card in every suit, long suit or not.
    const ruffing = parseHand('S2 S3 S4 S5 S6 S7 S8 T5 T6 T7');
    const flat = parseHand('S2 S3 H4 H5 D6 D7 C8 T5 T6 T7');
    expect(evaluateHand(ruffing, w)).toBeGreaterThan(evaluateHand(flat, w));
  });

  it('values a void more than a singleton', () => {
    expect(w.voidSuit).toBeGreaterThan(w.singleton);
  });
});

describe('choosing a bid', () => {
  it.each([3, 4, 5] as PlayerCount[])('climbs the ladder with the hand at %i players', (n) => {
    const t = config.thresholds[n];
    expect(t.petite).toBeLessThan(t.garde);
    expect(t.garde).toBeLessThan(t.gardeSans);
    expect(t.gardeSans).toBeLessThan(t.gardeContre);
    expect(bidForHand(JUNK, n, config)).toBe(Bid.Pass);
    expect(bidForHand(ALL_TRUMPS, n, config)).toBe(Bid.GardeContre);
  });

  it('passes rather than overbid to hold the contract', () => {
    // A hand worth a Petite says nothing once a Garde is on the table.
    const modest = [...JUNK.slice(0, 12), ...parseHand('T21 T19 T18 T17 SR HR')] as Card[];
    const wanted = bidForHand(modest, 4, config);
    expect(wanted).toBeGreaterThan(Bid.Pass);
    expect(chooseBid(modest, 4, Bid.Pass, config)).toBe(wanted);
    expect(chooseBid(modest, 4, Bid.GardeContre, config)).toBe(Bid.Pass);
    expect(chooseBid(modest, 4, wanted, config)).toBe(Bid.Pass);
  });

  it('only ever names a bid the engine would accept', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = createHand({ playerCount: 4, seed, dealer: 0 });
      for (const hand of state.hands) {
        const bid = chooseBid(hand, 4, Bid.Garde, config);
        expect(bid === Bid.Pass || bid > Bid.Garde).toBe(true);
      }
    }
  });

  it('has a beginner who takes on less', () => {
    for (const n of [3, 4, 5] as PlayerCount[]) {
      expect(CONFIG.debutant.thresholds[n].petite).toBeLessThan(config.thresholds[n].petite);
    }
  });
});
