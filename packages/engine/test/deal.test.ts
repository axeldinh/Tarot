import { describe, expect, it } from 'vitest';
import {
  DECK_SIZE,
  LAYOUT,
  PACKET_SIZE,
  chienPositions,
  deal,
  makeRng,
  nextPlayer,
  previousPlayer,
  shuffle,
  type PlayerCount,
} from '../src/index.ts';

const COUNTS: PlayerCount[] = [3, 4, 5];

describe('the deal', () => {
  it.each(COUNTS)('deals the right shape for %i players', (n) => {
    const { cardsPerPlayer, chienSize } = LAYOUT[n];
    expect(cardsPerPlayer * n + chienSize).toBe(DECK_SIZE);
    const { hands, chien } = deal(n, 0, makeRng(42));
    expect(hands).toHaveLength(n);
    for (const h of hands) expect(h).toHaveLength(cardsPerPlayer);
    expect(chien).toHaveLength(chienSize);
  });

  it.each(COUNTS)('uses every card exactly once at %i players', (n) => {
    for (let seed = 0; seed < 50; seed++) {
      const { hands, chien } = deal(n, seed % n, makeRng(seed));
      const all = [...hands.flat(), ...chien];
      expect(all).toHaveLength(DECK_SIZE);
      expect(new Set(all).size).toBe(DECK_SIZE);
    }
  });

  it('is reproducible from the seed', () => {
    const a = deal(4, 1, makeRng(1234));
    const b = deal(4, 1, makeRng(1234));
    expect(a).toEqual(b);
    expect(deal(4, 1, makeRng(1235))).not.toEqual(a);
  });

  it('deals in packets of three', () => {
    expect(PACKET_SIZE).toBe(3);
    for (const n of COUNTS) expect(LAYOUT[n].cardsPerPlayer % PACKET_SIZE).toBe(0);
  });

  it('never gives the chien the first or last card, nor two in a row', () => {
    for (let seed = 0; seed < 200; seed++) {
      const positions = chienPositions(6, makeRng(seed));
      expect(positions).toHaveLength(6);
      expect(Math.min(...positions)).toBeGreaterThan(0);
      expect(Math.max(...positions)).toBeLessThan(DECK_SIZE - 1);
      for (let i = 1; i < positions.length; i++) {
        expect((positions[i] as number) - (positions[i - 1] as number)).toBeGreaterThan(1);
      }
    }
  });

  it('runs anticlockwise, which is the next seat', () => {
    expect(nextPlayer(3, 4)).toBe(0);
    expect(previousPlayer(0, 4)).toBe(3);
    expect(nextPlayer(0, 5)).toBe(1);
  });
});

describe('the rng', () => {
  it('is deterministic and stays in range', () => {
    const a = makeRng(7);
    const b = makeRng(7);
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      expect(a.nextInt(5)).toBeLessThan(5);
      b.nextInt(5);
    }
  });

  it('shuffles without losing or duplicating anything', () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    const shuffled = shuffle([...items], makeRng(3));
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });
});
