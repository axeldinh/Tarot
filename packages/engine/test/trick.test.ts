import { describe, expect, it } from 'vitest';
import {
  EXCUSE,
  TRUMP,
  cardId,
  formatHand,
  illegalReason,
  legalCards,
  parseCard,
  parseHand,
  trickFollowSuit,
  trickWinner,
  highestTrumpRank,
  type Card,
  type TrickPlay,
} from '../src/index.ts';

const plays = (spec: string): TrickPlay[] =>
  spec
    .split(/\s+/)
    .filter(Boolean)
    .map((id, i) => ({ player: i, card: parseCard(id) }));

const legal = (hand: string, table: string): string =>
  formatHand(legalCards(parseHand(hand), plays(table)).sort((a: Card, b: Card) => a - b));

describe('following suit', () => {
  it('lets the leader play anything', () => {
    expect(legal('S1 H2 T3 EX', '')).toBe('S1 H2 T3 EX');
  });

  it('forces the led suit when you hold it', () => {
    expect(legal('S1 S5 H2 T3', 'S9')).toBe('S1 S5');
  });

  it('always allows the Excuse on top of the obligation', () => {
    expect(legal('S1 H2 EX', 'S9')).toBe('S1 EX');
    expect(legal('H2 T3 EX', 'S9')).toBe('T3 EX');
  });

  it('forces a trump when you are void in the led suit', () => {
    expect(legal('H2 H5 T3 T8', 'S9')).toBe('T3 T8');
  });

  it('lets you play anything when void in the suit and out of trumps', () => {
    expect(legal('H2 D5 CR', 'S9')).toBe('H2 D5 CR');
  });

  it('sets the suit from the first real card when the Excuse is led', () => {
    expect(trickFollowSuit(plays('EX'))).toBeNull();
    expect(legal('S1 H2 T3', 'EX')).toBe('S1 H2 T3');
    expect(trickFollowSuit(plays('EX S9'))).toBe(0);
    expect(legal('S1 H2 T3', 'EX S9')).toBe('S1');
  });
});

describe('monter a l atout', () => {
  it('forces an overtrump when you can beat the table', () => {
    expect(legal('T2 T9 T15 H4', 'S9 T8')).toBe('T9 T15');
    expect(highestTrumpRank(plays('S9 T8'))).toBe(8);
  });

  it('still forces a trump when you cannot beat it', () => {
    expect(legal('T2 T3 H4 CR', 'S9 T18')).toBe('T2 T3');
  });

  it('applies when trump is led too', () => {
    expect(legal('T2 T9 T15 H4', 'T8')).toBe('T9 T15');
    expect(legal('T2 T3 H4', 'T18')).toBe('T2 T3');
    expect(trickFollowSuit(plays('T8'))).toBe(TRUMP);
  });

  it('lets you play anything on a trump lead when you hold no trumps', () => {
    expect(legal('S1 H2 CR', 'T8')).toBe('S1 H2 CR');
    expect(legal('S1 EX', 'T8')).toBe('S1 EX');
  });

  it('leaves a hand of nothing but the Excuse playable', () => {
    expect(legal('EX', 'S9')).toBe('EX');
    expect(legal('EX', 'T9')).toBe('EX');
  });
});

describe('why a card is refused', () => {
  const why = (hand: string, table: string, card: string) =>
    illegalReason(parseHand(hand), plays(table), parseCard(card));

  it('explains each obligation', () => {
    expect(why('S1 H2', 'S9', 'H2')).toBe('must-follow-suit');
    expect(why('H2 T3', 'S9', 'H2')).toBe('must-play-trump');
    expect(why('T2 T9', 'S9 T8', 'T2')).toBe('must-overtrump');
    expect(why('T2 T9 H4', 'T8', 'H4')).toBe('must-follow-trump');
    expect(why('T2 T9', 'T8', 'T2')).toBe('must-overtrump');
    expect(why('S1 H2', 'S9', 'D3')).toBe('not-in-hand');
    expect(why('S1 H2', 'S9', 'S1')).toBeNull();
    expect(why('H2 T3 T9', 'S9 T8', 'H2')).toBe('must-play-trump');
  });
});

describe('who takes the trick', () => {
  it('gives it to the highest card of the led suit', () => {
    expect(trickWinner(plays('S9 S12 S3 S1'))).toBe(1);
  });

  it('gives it to the highest trump when there is one', () => {
    expect(trickWinner(plays('S9 T2 SR T7'))).toBe(3);
  });

  it('never lets the Excuse win', () => {
    expect(trickWinner(plays('EX S2 S3 S1'))).toBe(2);
    expect(trickWinner(plays('S9 EX S3 S1'))).toBe(0);
  });

  it('lets the Excuse win only under the chelem exception', () => {
    expect(trickWinner(plays('EX S2 S3 S1'), { excuseWins: true })).toBe(0);
    expect(trickWinner(plays('S9 S2 S3 S1'), { excuseWins: true })).toBe(0);
  });

  it('ignores cards that neither follow suit nor trump', () => {
    expect(cardId(parseCard('S9'))).toBe('S9');
    expect(trickWinner(plays('S9 HR D2 S3'))).toBe(0);
  });

  it('counts the Excuse as nothing when measuring trumps', () => {
    expect(highestTrumpRank(plays('EX S2'))).toBe(0);
    expect(legalCards(parseHand('S1'), plays('EX'))).toEqual([parseCard('S1')]);
    expect(EXCUSE).toBe(77);
  });
});
