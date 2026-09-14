import { describe, expect, it } from 'vitest';
import {
  Bid,
  DAME,
  ROI,
  SUITS,
  applyAction,
  king,
  legalActions,
  legalCalls,
  parseCard,
  parseHand,
  playerView,
  rankOf,
  suitCard,
  type Card,
  type GameState,
} from '../src/index.ts';
import { bidTo, handFrom, playOut, skipChelem } from './helpers.ts';

const CALLABLE = (hand: string) => legalCalls(parseHand(hand)).map(rankOf);

describe('what the taker may call', () => {
  it('is any king, even one he holds himself', () => {
    expect(legalCalls(parseHand('S1 S2 SR'))).toEqual(SUITS.map((s) => king(s)));
  });

  it('drops to the dames only when he holds all four kings', () => {
    expect(CALLABLE('SR HR DR CR T1')).toEqual([DAME, DAME, DAME, DAME]);
    expect(CALLABLE('SR HR DR T1')).toEqual([ROI, ROI, ROI, ROI]);
  });

  it('keeps going down when he holds the dames too', () => {
    expect(CALLABLE('SR HR DR CR SD HD DD CD')).toEqual([12, 12, 12, 12]);
  });
});

/** Five-handed Garde Sans, so nobody touches the chien and the hands stay as dealt. */
function fiveHanded(fixed: Record<number, string>, chien?: string): GameState {
  const s = handFrom(5, fixed, { dealer: 4, seed: 21, ...(chien ? { chien } : {}) });
  return bidTo(s, 0, Bid.GardeSans);
}

describe('the called king at five players', () => {
  it('makes the holder a secret partner until the card is played', () => {
    let s = fiveHanded({ 0: 'T21 T20 T19', 3: 'HR' });
    s = applyAction(s, { type: 'CallKing', player: 0, card: king(1) });
    s = skipChelem(s);

    expect(s.partner).toBe(3);
    expect(s.partnerRevealed).toBe(false);
    // Only the partner himself knows, because he can see the called card in his hand.
    expect(playerView(s, 3).partner).toBe(3);
    expect(playerView(s, 1).partner).toBeNull();
    expect(playerView(s, 0).partner).toBeNull();
    expect(playerView(s, 2).calledCard).toBe(king(1));

    s = playOut(s);
    expect(s.partnerRevealed).toBe(true);
    expect(s.result?.partner).toBe(3);
    expect(playerView(s, 1).partner).toBe(3);
    // Taker twice, partner once, three defenders once each.
    const d = s.result?.deltas as number[];
    const unit = d[3] as number;
    expect(d[0]).toBe(2 * unit);
    expect([d[1], d[2], d[4]]).toEqual([-unit, -unit, -unit]);
    expect(d.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('leaves the taker alone when he calls a king he holds', () => {
    let s = fiveHanded({ 0: 'SR T21 T20' });
    s = applyAction(s, { type: 'CallKing', player: 0, card: king(0) });
    s = skipChelem(s);
    expect(s.partner).toBe(0);
    expect(playerView(s, 2).partner).toBeNull();

    s = playOut(s);
    const d = s.result?.deltas as number[];
    expect(s.result?.partner).toBe(0);
    expect(d[0]).toBe(-4 * (d[1] as number));
    expect(d.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('leaves him alone too when the called king is buried in an unseen chien', () => {
    let s = fiveHanded({ 0: 'T21 T20 T19' }, 'DR S2 S3');
    s = applyAction(s, { type: 'CallKing', player: 0, card: king(2) });
    s = skipChelem(s);
    expect(s.partner).toBeNull();

    s = playOut(s);
    const d = s.result?.deltas as number[];
    expect(d[0]).toBe(-4 * (d[1] as number));
    expect(d.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('offers the four kings as the legal actions', () => {
    const s = fiveHanded({ 0: 'T21 T20 T19' });
    expect(s.phase).toBe('calling');
    expect(legalActions(s)).toEqual(
      SUITS.map((suit) => ({ type: 'CallKing', player: 0, card: king(suit) })),
    );
  });

  it('refuses a call the taker is not allowed to make', () => {
    const s = fiveHanded({ 0: 'T21 T20 T19' });
    expect(() => applyAction(s, { type: 'CallKing', player: 0, card: parseCard('S1') })).toThrow(
      /cannot be called/,
    );
    expect(() =>
      applyAction(s, { type: 'CallKing', player: 1, card: suitCard(0, ROI) as Card }),
    ).toThrow(/player 0/);
  });
});
