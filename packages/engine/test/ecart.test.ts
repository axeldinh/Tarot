import { describe, expect, it } from 'vitest';
import {
  ECART_ERROR_MESSAGES,
  discardableCards,
  forcedTrumpCount,
  formatHand,
  parseCard,
  parseHand,
  validateEcart,
} from '../src/index.ts';

const check = (hand: string, ecart: string, size: number) =>
  validateEcart(parseHand(hand), parseHand(ecart), size);

describe('the ecart', () => {
  it('excludes kings and bouts from what may be buried', () => {
    const hand = parseHand('S1 S2 SR T1 T21 EX T5 HR H3');
    expect(formatHand(discardableCards(hand))).toBe('S1 S2 T5 H3');
  });

  it('accepts a plain discard of the right size', () => {
    expect(check('S1 S2 S3 H4 H5 H6 SR T1', 'S1 S2 S3 H4 H5 H6', 6)).toBeNull();
  });

  it('rejects the wrong number of cards', () => {
    expect(check('S1 S2 S3 H4 H5 H6 SR T1', 'S1 S2', 6)).toBe('wrong-size');
  });

  it('rejects duplicates and cards you do not hold', () => {
    expect(check('S1 S2 S3 H4 H5 H6', 'S1 S1 S2 S3 H4 H5', 6)).toBe('duplicate');
    expect(check('S1 S2 S3 H4 H5 H6', 'S1 S2 S3 H4 H5 D9', 6)).toBe('not-in-hand');
  });

  it('refuses kings and bouts', () => {
    expect(check('SR S2 S3 H4 H5 H6 H7', 'SR S2 S3 H4 H5 H6', 6)).toBe('no-king');
    expect(check('T1 S2 S3 H4 H5 H6 H7', 'T1 S2 S3 H4 H5 H6', 6)).toBe('no-bout');
    expect(check('EX S2 S3 H4 H5 H6 H7', 'EX S2 S3 H4 H5 H6', 6)).toBe('no-bout');
    expect(check('T21 S2 S3 H4 H5 H6 H7', 'T21 S2 S3 H4 H5 H6', 6)).toBe('no-bout');
  });

  it('allows a trump only when nothing else is left, and no more than needed', () => {
    // Four spare plain cards, so exactly two trumps must go in a six-card ecart.
    const hand = 'S2 S3 H4 H5 SR HR T2 T3 T4 T21';
    expect(forcedTrumpCount(parseHand(hand), 6)).toBe(2);
    expect(check(hand, 'S2 S3 H4 H5 T2 T3', 6)).toBeNull();
    expect(check(hand, 'S2 S3 H4 T2 T3 T4', 6)).toBe('too-many-trumps');
  });

  it('never forces a trump when there is enough else to throw', () => {
    const hand = parseHand('S2 S3 S4 S5 S6 S7 T2 T3');
    expect(forcedTrumpCount(hand, 6)).toBe(0);
    expect(check('S2 S3 S4 S5 S6 S7 T2 T3', 'S2 S3 S4 S5 S6 T2', 6)).toBe('too-many-trumps');
  });

  it('has a French message for every failure mode', () => {
    for (const key of Object.keys(ECART_ERROR_MESSAGES)) {
      expect(ECART_ERROR_MESSAGES[key as keyof typeof ECART_ERROR_MESSAGES]).toBeTruthy();
    }
    expect(parseCard('S1')).toBe(0);
  });
});
