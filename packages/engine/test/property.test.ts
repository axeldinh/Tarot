import { describe, expect, it } from 'vitest';
import {
  BID_MULTIPLIER,
  Bid,
  DECK_SIZE,
  LAYOUT,
  TOTAL_POINTS_2,
  countBouts,
  sumPoints2,
  targetForBouts,
  type Card,
  type PlayerCount,
} from '../src/index.ts';
import { randomHand } from './helpers.ts';

const DEALS_PER_TABLE = Number(process.env.TAROT_PROPERTY_DEALS ?? 10_000);

describe('randomised hands', () => {
  it.each([3, 4, 5] as PlayerCount[])(
    'settle to exactly zero at %i players',
    (n) => {
      let played = 0;
      let passed = 0;

      for (let seed = 0; seed < DEALS_PER_TABLE; seed++) {
        const s = randomHand(n, seed * 7919 + n);
        if (s.phase === 'passed') {
          passed++;
          expect(s.taker).toBeNull();
          continue;
        }
        played++;

        const result = s.result as NonNullable<typeof s.result>;

        // Every card ends up somewhere, exactly once.
        const all = [...s.piles.flat(), ...s.ecart, ...s.chien] as Card[];
        expect(all).toHaveLength(DECK_SIZE);
        expect(new Set(all).size).toBe(DECK_SIZE);
        expect(sumPoints2(all)).toBe(TOTAL_POINTS_2);

        // Points split cleanly between the two sides.
        expect(result.takerPoints + result.defencePoints).toBe(91);

        // The contract was judged against the right target.
        expect(result.target).toBe(targetForBouts(result.bouts));
        expect(result.diff).toBe(result.takerPoints - result.target);
        expect(result.made).toBe(result.diff >= 0);
        expect(result.multiplier).toBe(BID_MULTIPLIER[result.contract as Bid]);
        expect(result.bouts).toBeGreaterThanOrEqual(0);
        expect(result.bouts).toBeLessThanOrEqual(3);

        // Every hand was played to the end, one trick per card.
        expect(s.tricks).toHaveLength(LAYOUT[n].cardsPerPlayer);
        expect(s.hands.every((h) => h.length === 0)).toBe(true);
        expect(s.excuseDebts).toHaveLength(0);

        // And the whole table nets out to nothing.
        expect(result.deltas).toHaveLength(n);
        expect(result.deltas.reduce((a, b) => a + b, 0)).toBe(0);
        // The taker collects from, or pays, everyone who is not on his side.
        const opponents = result.deltas.filter((_, p) => p !== result.taker && p !== result.partner);
        expect(opponents).toEqual(new Array(opponents.length).fill(-result.score));
        if (n !== 5) expect(result.deltas[result.taker]).toBe(result.score * (n - 1));
      }

      // The sampler is supposed to produce mostly played hands.
      expect(played).toBeGreaterThan(DEALS_PER_TABLE * 0.9);
      expect(played + passed).toBe(DEALS_PER_TABLE);
    },
    120_000,
  );

  it('produces every contract and every bout count across the sample', () => {
    const contracts = new Set<Bid>();
    const bouts = new Set<number>();
    for (let seed = 0; seed < 600; seed++) {
      const s = randomHand(4, seed * 31 + 5);
      if (s.result === null) continue;
      contracts.add(s.result.contract as Bid);
      bouts.add(s.result.bouts);
      expect(countBouts([...s.piles.flat(), ...s.ecart, ...s.chien])).toBe(3);
    }
    expect([...contracts].sort()).toEqual([Bid.Petite, Bid.Garde, Bid.GardeSans, Bid.GardeContre]);
    expect([...bouts].sort()).toEqual([0, 1, 2, 3]);
  });
});
