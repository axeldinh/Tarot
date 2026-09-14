import { describe, expect, it } from 'vitest';
import {
  BID_MULTIPLIER,
  BID_NAMES,
  Bid,
  DEFAULT_RULES,
  TARGET_BY_BOUTS,
  chelemPoints,
  scoreHand,
  settle,
  sideOf,
  sideSign,
  targetForBouts,
  type PlayerCount,
  type Rules,
  type ScoringInput,
  type Side,
} from '../src/index.ts';

const base = (over: Partial<ScoringInput> = {}): ScoringInput => ({
  playerCount: 4,
  taker: 0,
  partner: null,
  contract: Bid.Petite,
  takerPoints2: 112,
  bouts: 0,
  petitAuBoutSide: null,
  poignees: [],
  chelem: { achievedBy: null, announcedBy: null },
  rules: DEFAULT_RULES,
  ...over,
});

/** Card points -> half-points. */
const pts = (p: number) => Math.round(p * 2);

describe('the contract target', () => {
  it('is 56 / 51 / 41 / 36 by bout count', () => {
    expect(TARGET_BY_BOUTS).toEqual([56, 51, 41, 36]);
    expect(targetForBouts(0)).toBe(56);
    expect(targetForBouts(1)).toBe(51);
    expect(targetForBouts(2)).toBe(41);
    expect(targetForBouts(3)).toBe(36);
  });

  it.each([
    [0, 56],
    [1, 51],
    [2, 41],
    [3, 36],
  ])('is exactly made at %i bouts with %i points', (bouts, target) => {
    const r = scoreHand(base({ bouts, takerPoints2: pts(target) }));
    expect(r.made).toBe(true);
    expect(r.diff).toBe(0);
    expect(r.score).toBe(25);
  });

  it.each([
    [0, 56],
    [1, 51],
    [2, 41],
    [3, 36],
  ])('is failed at %i bouts one point short of %i', (bouts, target) => {
    const r = scoreHand(base({ bouts, takerPoints2: pts(target - 1) }));
    expect(r.made).toBe(false);
    expect(r.diff).toBe(-1);
    expect(r.score).toBe(-26);
  });
});

describe('the contract multipliers', () => {
  it.each([
    [Bid.Petite, 1],
    [Bid.Garde, 2],
    [Bid.GardeSans, 4],
    [Bid.GardeContre, 6],
  ])('%s multiplies by %i', (contract, multiplier) => {
    expect(BID_MULTIPLIER[contract]).toBe(multiplier);
    const made = scoreHand(base({ contract, bouts: 1, takerPoints2: pts(61) }));
    expect(made.diff).toBe(10);
    expect(made.score).toBe((25 + 10) * multiplier);

    const failed = scoreHand(base({ contract, bouts: 1, takerPoints2: pts(41) }));
    expect(failed.diff).toBe(-10);
    expect(failed.score).toBe(-(25 + 10) * multiplier);
  });

  it('names every bid in French', () => {
    expect(BID_NAMES[Bid.Pass]).toBe('Passe');
    expect(BID_NAMES[Bid.Petite]).toBe('Petite');
    expect(BID_NAMES[Bid.Garde]).toBe('Garde');
    expect(BID_NAMES[Bid.GardeSans]).toBe('Garde Sans');
    expect(BID_NAMES[Bid.GardeContre]).toBe('Garde Contre');
    expect(BID_MULTIPLIER[Bid.Pass]).toBe(0);
  });
});

describe('petit au bout', () => {
  it('adds 10 to the base for the taker and is multiplied with it', () => {
    const r = scoreHand(base({ contract: Bid.Garde, bouts: 1, takerPoints2: pts(56), petitAuBoutSide: 'taker' }));
    expect(r.petitAuBout).toBe(10);
    expect(r.base).toBe(25 + 5 + 10);
    expect(r.score).toBe(80);
  });

  it('subtracts 10 when the defence wins it', () => {
    const r = scoreHand(base({ contract: Bid.Garde, bouts: 1, takerPoints2: pts(56), petitAuBoutSide: 'defence' }));
    expect(r.petitAuBout).toBe(-10);
    expect(r.base).toBe(25 + 5 - 10);
    expect(r.score).toBe(40);
  });

  it('is nothing when the Petit did not fall on the last trick', () => {
    expect(scoreHand(base()).petitAuBout).toBe(0);
    expect(scoreHand(base()).petitAuBoutSide).toBeNull();
  });

  it('can be credited to its winner regardless of the contract (FFT variant)', () => {
    const rules: Rules = { petitAuBoutIndependentOfContract: true };
    // Contract failed by 5, defence has the petit au bout: it costs the taker more.
    const spec = scoreHand(base({ contract: Bid.Garde, bouts: 1, takerPoints2: pts(46), petitAuBoutSide: 'defence' }));
    const fft = scoreHand(base({ contract: Bid.Garde, bouts: 1, takerPoints2: pts(46), petitAuBoutSide: 'defence', rules }));
    expect(spec.score).toBe(-(25 + 5 - 10) * 2);
    expect(fft.score).toBe(-(25 + 5) * 2 - 10 * 2);
  });
});

describe('the poignee', () => {
  it('is flat and goes to the winning side whoever showed it', () => {
    const shown = [{ side: 'defence' as Side, kind: 'simple' as const }];
    const made = scoreHand(base({ bouts: 1, takerPoints2: pts(56), poignees: shown }));
    expect(made.poigneeBonus).toBe(20);
    expect(made.score).toBe(25 + 5 + 20);

    const failed = scoreHand(base({ bouts: 1, takerPoints2: pts(46), poignees: shown }));
    expect(failed.poigneeBonus).toBe(-20);
    expect(failed.score).toBe(-(25 + 5) - 20);
  });

  it('is never multiplied by the contract', () => {
    const r = scoreHand(
      base({
        contract: Bid.GardeContre,
        bouts: 1,
        takerPoints2: pts(51),
        poignees: [{ side: 'taker', kind: 'triple' }],
      }),
    );
    expect(r.score).toBe(25 * 6 + 40);
  });

  it('adds up when several are shown', () => {
    const r = scoreHand(
      base({
        bouts: 1,
        takerPoints2: pts(51),
        poignees: [
          { side: 'taker', kind: 'simple' },
          { side: 'defence', kind: 'double' },
        ],
      }),
    );
    expect(r.poigneeBonus).toBe(50);
    expect(r.score).toBe(75);
  });
});

describe('the chelem', () => {
  it('pays 400 announced and made, -200 announced and failed, 200 unannounced', () => {
    expect(chelemPoints({ announcedBy: 'taker', achievedBy: 'taker' })).toBe(400);
    expect(chelemPoints({ announcedBy: 'taker', achievedBy: null })).toBe(-200);
    expect(chelemPoints({ announcedBy: null, achievedBy: 'taker' })).toBe(200);
    expect(chelemPoints({ announcedBy: null, achievedBy: null })).toBe(0);
  });

  it('mirrors the signs for a defence chelem', () => {
    expect(chelemPoints({ announcedBy: 'defence', achievedBy: 'defence' })).toBe(-400);
    expect(chelemPoints({ announcedBy: 'defence', achievedBy: null })).toBe(200);
    expect(chelemPoints({ announcedBy: null, achievedBy: 'defence' })).toBe(-200);
  });

  it('charges the failed announcement and credits the side that actually did it', () => {
    expect(chelemPoints({ announcedBy: 'taker', achievedBy: 'defence' })).toBe(-400);
  });

  it('is flat, like the poignee', () => {
    const r = scoreHand(
      base({
        contract: Bid.GardeSans,
        bouts: 3,
        takerPoints2: pts(91),
        chelem: { announcedBy: 'taker', achievedBy: 'taker' },
      }),
    );
    expect(r.chelemBonus).toBe(400);
    expect(r.score).toBe((25 + 55) * 4 + 400);
  });
});

describe('settlement', () => {
  it.each([3, 4] as PlayerCount[])('makes every defender pay the taker at %i players', (n) => {
    const deltas = settle(30, n, 1, null);
    expect(deltas[1]).toBe(30 * (n - 1));
    expect(deltas.filter((_, i) => i !== 1)).toEqual(new Array(n - 1).fill(-30));
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('pays the taker twice and the partner once at 5 players', () => {
    const deltas = settle(30, 5, 0, 3);
    expect(deltas).toEqual([60, -30, -30, 30, -30]);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('pays a taker who called himself four times', () => {
    const deltas = settle(30, 5, 2, 2);
    expect(deltas).toEqual([-30, -30, 120, -30, -30]);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('treats a missing partner as playing alone', () => {
    expect(settle(10, 5, 0, null)).toEqual([40, -10, -10, -10, -10]);
  });

  it('is zero-sum for a negative score too', () => {
    for (const deltas of [settle(-42, 3, 0, null), settle(-42, 5, 1, 4), settle(-42, 5, 1, 1)]) {
      expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('knows which side a seat is on', () => {
    expect(sideOf(0, 0, 3)).toBe('taker');
    expect(sideOf(3, 0, 3)).toBe('taker');
    expect(sideOf(2, 0, 3)).toBe('defence');
    expect(sideOf(2, 0, null)).toBe('defence');
    expect(sideSign('taker')).toBe(1);
    expect(sideSign('defence')).toBe(-1);
  });
});

describe('a full settlement, at every table size', () => {
  it.each([3, 4, 5] as PlayerCount[])('is zero-sum at %i players', (n) => {
    const r = scoreHand(
      base({
        playerCount: n,
        taker: 1,
        partner: n === 5 ? 3 : null,
        contract: Bid.Garde,
        bouts: 2,
        takerPoints2: pts(50),
        petitAuBoutSide: 'taker',
        poignees: [{ side: 'taker', kind: 'simple' }],
      }),
    );
    expect(r.target).toBe(41);
    expect(r.diff).toBe(9);
    expect(r.base).toBe(25 + 9 + 10);
    expect(r.score).toBe(44 * 2 + 20);
    expect(r.deltas).toHaveLength(n);
    expect(r.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(r.takerPoints).toBe(50);
    expect(r.defencePoints).toBe(41);
  });
});
