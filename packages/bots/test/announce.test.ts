import { describe, expect, it } from 'vitest';
import { EXCUSE, POIGNEE_SIZE, parseHand, trumpCard, type Card } from '@tarot/engine';
import { CONFIG, choosePoignee, shouldAnnounceChelem } from '../src/index.ts';

const trumps = (n: number, from = 1): Card[] =>
  Array.from({ length: n }, (_, i) => trumpCard(i + from));

describe('showing a poignee', () => {
  it('shows the biggest one the hand allows', () => {
    expect(choosePoignee(trumps(9), 4, CONFIG.normal)).toBeNull();
    expect(choosePoignee(trumps(10), 4, CONFIG.normal)).toBe('simple');
    expect(choosePoignee(trumps(13), 4, CONFIG.normal)).toBe('double');
    expect(choosePoignee(trumps(15), 4, CONFIG.normal)).toBe('triple');
    expect(POIGNEE_SIZE[4].triple).toBe(15);
  });

  it('uses the table s own thresholds', () => {
    expect(choosePoignee(trumps(8), 5, CONFIG.normal)).toBe('simple');
    expect(choosePoignee(trumps(8), 4, CONFIG.normal)).toBeNull();
    expect(choosePoignee(trumps(13), 3, CONFIG.normal)).toBe('simple');
  });

  it('counts the Excuse only when the hand is one trump short', () => {
    expect(choosePoignee([...trumps(9), EXCUSE], 4, CONFIG.normal)).toBe('simple');
    expect(choosePoignee([...trumps(8), EXCUSE], 4, CONFIG.normal)).toBeNull();
  });

  it('stays quiet when the config says not to', () => {
    const quiet = { ...CONFIG.normal, announcePoignee: false };
    expect(choosePoignee(trumps(15), 4, quiet)).toBeNull();
  });
});

describe('announcing a chelem', () => {
  const monster = [...trumps(15, 7), ...parseHand('T1 EX SR')];

  it('is only ever called by the taker', () => {
    expect(shouldAnnounceChelem(monster, true, CONFIG.confirme)).toBe(true);
    expect(shouldAnnounceChelem(monster, false, CONFIG.confirme)).toBe(false);
  });

  it('needs the 21, the trumps and the bouts', () => {
    const withoutTop = [...trumps(15, 6), ...parseHand('T1 EX SR')];
    expect(withoutTop.includes(trumpCard(21))).toBe(false);
    expect(shouldAnnounceChelem(withoutTop, true, CONFIG.confirme)).toBe(false);

    const thinTrumps = [...trumps(10, 12), ...parseHand('SR HR DR CR S2 H2 D2 C2')];
    expect(shouldAnnounceChelem(thinTrumps, true, CONFIG.confirme)).toBe(false);
  });

  it('is stricter at Normal than at Confirme, and never happens at Debutant', () => {
    // Two bouts and 17/18 trumps: Confirme calls it, Normal wants all three bouts.
    const twoBouts = [...trumps(17, 5), ...parseHand('T21')].slice(0, 18);
    expect(twoBouts).toHaveLength(18);
    expect(shouldAnnounceChelem(twoBouts, true, CONFIG.confirme)).toBe(true);
    expect(shouldAnnounceChelem(twoBouts, true, CONFIG.normal)).toBe(false);
    expect(shouldAnnounceChelem(monster, true, CONFIG.debutant)).toBe(false);
  });

  it('says no to an ordinary hand', () => {
    const ordinary = parseHand('SR S2 S3 HR H2 H3 DR D2 D3 CR C2 C3 T1 T2 T3 T4 T5 T21');
    expect(shouldAnnounceChelem(ordinary, true, CONFIG.confirme)).toBe(false);
  });
});
