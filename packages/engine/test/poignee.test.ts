import { describe, expect, it } from 'vitest';
import {
  EXCUSE,
  POIGNEE_BONUS,
  POIGNEE_KINDS,
  POIGNEE_SIZE,
  bestPoignee,
  canAnnouncePoignee,
  formatHand,
  poigneeCards,
  trumpCard,
  type Card,
  type PlayerCount,
} from '../src/index.ts';

const trumps = (n: number): Card[] => Array.from({ length: n }, (_, i) => trumpCard(i + 1));

describe('the poignee', () => {
  it('uses the published thresholds', () => {
    expect(POIGNEE_SIZE[3]).toEqual({ simple: 13, double: 15, triple: 18 });
    expect(POIGNEE_SIZE[4]).toEqual({ simple: 10, double: 13, triple: 15 });
    expect(POIGNEE_SIZE[5]).toEqual({ simple: 8, double: 10, triple: 13 });
    expect(POIGNEE_BONUS).toEqual({ simple: 20, double: 30, triple: 40 });
    expect(POIGNEE_KINDS).toEqual(['simple', 'double', 'triple']);
  });

  it.each([
    [4 as PlayerCount, 9, null],
    [4 as PlayerCount, 10, 'simple'],
    [4 as PlayerCount, 13, 'double'],
    [4 as PlayerCount, 15, 'triple'],
    [3 as PlayerCount, 13, 'simple'],
    [3 as PlayerCount, 18, 'triple'],
    [5 as PlayerCount, 8, 'simple'],
    [5 as PlayerCount, 13, 'triple'],
  ])('at %i players %i trumps shows a %s', (n, count, expected) => {
    expect(bestPoignee(trumps(count), n)).toBe(expected);
  });

  it('shows the highest trumps', () => {
    const cards = poigneeCards(trumps(12), 10) as Card[];
    expect(formatHand(cards)).toBe('T12 T11 T10 T9 T8 T7 T6 T5 T4 T3');
  });

  it('counts the Excuse only when you would otherwise be one short', () => {
    const nineAndExcuse = [...trumps(9), EXCUSE];
    expect(canAnnouncePoignee(nineAndExcuse, 4, 'simple')).toBe(true);
    expect((poigneeCards(nineAndExcuse, 10) as Card[]).includes(EXCUSE)).toBe(true);

    // Ten trumps plus the Excuse: the Excuse stays out of the ten shown.
    const tenAndExcuse = [...trumps(10), EXCUSE];
    expect((poigneeCards(tenAndExcuse, 10) as Card[]).includes(EXCUSE)).toBe(false);

    // Two short is still short, Excuse or not.
    expect(canAnnouncePoignee([...trumps(8), EXCUSE], 4, 'simple')).toBe(false);
    expect(poigneeCards([...trumps(8), EXCUSE], 10)).toBeNull();
  });
});
