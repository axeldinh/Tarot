import { describe, expect, it } from 'vitest';
import {
  CARDS_PER_SUIT,
  DAME,
  DECK,
  DECK_SIZE,
  EXCUSE,
  PETIT,
  ROI,
  SUITS,
  TOTAL_POINTS_2,
  TRUMP,
  TRUMP_21,
  TRUMP_COUNT,
  cardId,
  compareForDisplay,
  countBouts,
  followSuitOf,
  formatHand,
  isBout,
  isExcuse,
  isKing,
  isLowCard,
  isSuitCard,
  isTrump,
  king,
  parseCard,
  parseHand,
  points2,
  rankOf,
  sortHand,
  suitCard,
  suitOf,
  sumPoints2,
  trumpCard,
} from '../src/index.ts';

describe('the deck', () => {
  it('has 78 cards: 4 x 14 suit cards, 21 trumps and the Excuse', () => {
    expect(DECK).toHaveLength(DECK_SIZE);
    expect(DECK.filter(isSuitCard)).toHaveLength(4 * CARDS_PER_SUIT);
    expect(DECK.filter(isTrump)).toHaveLength(TRUMP_COUNT);
    expect(DECK.filter(isExcuse)).toHaveLength(1);
    for (const s of SUITS) {
      expect(DECK.filter((c) => suitOf(c) === s)).toHaveLength(CARDS_PER_SUIT);
    }
  });

  it('totals exactly 91 points', () => {
    expect(sumPoints2(DECK)).toBe(TOTAL_POINTS_2);
    expect(sumPoints2(DECK) / 2).toBe(91);
  });

  it('has exactly three bouts: Petit, 21 and the Excuse', () => {
    expect(DECK.filter(isBout)).toEqual([PETIT, TRUMP_21, EXCUSE]);
    expect(countBouts(DECK)).toBe(3);
  });

  it('values the honours 4.5 / 3.5 / 2.5 / 1.5 and everything else 0.5', () => {
    expect(points2(king(0)) / 2).toBe(4.5);
    expect(points2(suitCard(1, DAME)) / 2).toBe(3.5);
    expect(points2(suitCard(2, 12)) / 2).toBe(2.5);
    expect(points2(suitCard(3, 11)) / 2).toBe(1.5);
    expect(points2(suitCard(0, 7)) / 2).toBe(0.5);
    expect(points2(trumpCard(10)) / 2).toBe(0.5);
    expect(points2(PETIT) / 2).toBe(4.5);
    expect(points2(TRUMP_21) / 2).toBe(4.5);
    expect(points2(EXCUSE) / 2).toBe(4.5);
  });

  it('treats only 0.5 cards as low cards', () => {
    expect(isLowCard(suitCard(0, 4))).toBe(true);
    expect(isLowCard(trumpCard(5))).toBe(true);
    expect(isLowCard(PETIT)).toBe(false);
    expect(isLowCard(king(2))).toBe(false);
  });
});

describe('card identity', () => {
  it('round-trips every card through its short id', () => {
    for (const c of DECK) expect(parseCard(cardId(c))).toBe(c);
  });

  it('accepts both letter and numeric honours', () => {
    expect(parseCard('SR')).toBe(parseCard('S14'));
    expect(parseCard('hd')).toBe(suitCard(1, DAME));
    expect(parseCard('T21')).toBe(TRUMP_21);
    expect(parseCard('EX')).toBe(EXCUSE);
  });

  it('rejects nonsense', () => {
    expect(() => parseCard('T22')).toThrow(/Unknown card/);
    expect(() => parseCard('Z1')).toThrow(/Unknown card/);
  });

  it('parses and formats hands', () => {
    const hand = parseHand('S1 SR, T21  EX');
    expect(hand).toEqual([suitCard(0, 1), king(0), TRUMP_21, EXCUSE]);
    expect(formatHand(hand)).toBe('S1 SR T21 EX');
    expect(parseHand('   ')).toEqual([]);
  });

  it('reports ranks and follow-suits', () => {
    expect(rankOf(suitCard(0, 1))).toBe(1);
    expect(rankOf(king(3))).toBe(ROI);
    expect(rankOf(trumpCard(21))).toBe(21);
    expect(rankOf(EXCUSE)).toBe(0);
    expect(suitOf(trumpCard(3))).toBeNull();
    expect(followSuitOf(king(1))).toBe(1);
    expect(followSuitOf(trumpCard(3))).toBe(TRUMP);
    expect(followSuitOf(EXCUSE)).toBeNull();
    expect(isKing(king(2))).toBe(true);
    expect(isKing(suitCard(2, DAME))).toBe(false);
    expect(isKing(trumpCard(14))).toBe(false);
  });

  it('sorts for display by suit then trump then Excuse', () => {
    const sorted = sortHand([EXCUSE, trumpCard(1), king(3), suitCard(0, 2)]);
    expect(formatHand(sorted)).toBe('S2 CR T1 EX');
    expect(compareForDisplay(1, 5)).toBeLessThan(0);
  });
});
