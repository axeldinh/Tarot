import { describe, expect, it } from 'vitest';
import { misereKinds, scoreHand, trumpCard, suitCard, EXCUSE, Bid, SPADES, HEARTS } from '../src/index.ts';

describe('misère', () => {
  it('detects no trumps and no heads, the Excuse counting as neither', () => {
    expect(misereKinds([suitCard(SPADES, 2), suitCard(HEARTS, 5), EXCUSE])).toEqual(['atouts', 'tetes']);
    expect(misereKinds([suitCard(SPADES, 2), trumpCard(3)])).toEqual(['tetes']);
    expect(misereKinds([suitCard(SPADES, 11), suitCard(HEARTS, 5)])).toEqual(['atouts']);
    expect(misereKinds([suitCard(SPADES, 14), trumpCard(1)])).toEqual([]);
  });

  it('pays 10 from every other player, outside the contract, summing to zero', () => {
    for (const playerCount of [3, 4, 5] as const) {
      const base = {
        playerCount, taker: 0, partner: null, contract: Bid.Garde, takerPoints2: 102, bouts: 1,
        petitAuBoutSide: null, poignees: [], chelem: { achievedBy: null, announcedBy: null },
        rules: { petitAuBoutIndependentOfContract: false },
      };
      const plain = scoreHand(base);
      const withMisere = scoreHand({ ...base, miseres: [{ player: 1, kind: 'tetes' }] });
      expect(withMisere.score).toBe(plain.score);
      expect(withMisere.deltas.reduce((a, b) => a + b, 0)).toBe(0);
      expect((withMisere.deltas[1] as number) - (plain.deltas[1] as number)).toBe(10 * (playerCount - 1));
      expect((withMisere.deltas[0] as number) - (plain.deltas[0] as number)).toBe(-10);
    }
  });
});
