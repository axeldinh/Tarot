import { describe, expect, it } from 'vitest';
import {
  Bid,
  EXCUSE,
  applyAction,
  formatHand,
  isLowCard,
  sideOf,
  type Card,
  type GameState,
} from '../src/index.ts';
import { bidTo, handFrom, playCards, playOut, skipChelem } from './helpers.ts';

/** Player 0 holds the Excuse and every trump from 5 up: he cannot lose a trick. */
const EXCUSE_AND_TOP_TRUMPS =
  'EX T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18 T19 T20 T21';

function trumpMonster(options: { chelem?: boolean } = {}): GameState {
  // Dealer 3 means player 0 leads; Garde Sans leaves his hand untouched.
  let s = handFrom(4, { 0: EXCUSE_AND_TOP_TRUMPS }, { dealer: 3, seed: 11 });
  s = bidTo(s, 0, Bid.GardeSans);
  if (options.chelem) {
    while (s.phase === 'chelem') {
      s = applyAction(s, {
        type: 'AnnounceChelem',
        player: s.currentPlayer,
        announce: s.currentPlayer === 0,
      });
    }
    return s;
  }
  return skipChelem(s);
}

describe('the Excuse in the middle of a hand', () => {
  it('goes home to its owner, who pays a low card from his tricks', () => {
    let s = trumpMonster();
    s = playCards(s, 4); // trick 1: player 0 leads his lowest trump and takes it
    expect(s.tricks[0]?.winner).toBe(0);
    expect(s.piles[0]).toHaveLength(4);

    s = applyAction(s, { type: 'PlayCard', player: 0, card: EXCUSE });
    s = playCards(s, 3);

    const trick2 = s.tricks[1];
    expect(trick2?.excuseKept).toBe(true);
    expect(trick2?.winner).not.toBe(0);
    // Paid on the spot: the Excuse came home and one low card went the other way.
    expect(s.excuseDebts).toHaveLength(0);
    expect((s.piles[0] as Card[]).includes(EXCUSE)).toBe(true);
    expect(s.piles[0]).toHaveLength(4);
    expect((s.piles[trick2?.winner as number] as Card[]).filter(isLowCard).length).toBeGreaterThan(
      0,
    );
  });

  it('is owed when its owner has not taken a trick yet, and paid at the end', () => {
    let s = trumpMonster();
    s = applyAction(s, { type: 'PlayCard', player: 0, card: EXCUSE });
    s = playCards(s, 3);

    const first = s.tricks[0];
    expect(first?.excuseKept).toBe(true);
    expect(first?.winner).not.toBe(0);
    expect(s.excuseDebts).toEqual([{ debtor: 0, creditor: first?.winner }]);
    expect(s.piles[0]).toEqual([EXCUSE]);

    s = playOut(s);
    expect(s.excuseDebts).toHaveLength(0);
    expect((s.piles[0] as Card[]).includes(EXCUSE)).toBe(true);
    expect((s.piles[first?.winner as number] as Card[]).filter(isLowCard).length).toBeGreaterThan(
      0,
    );
  });
});

describe('the Excuse on the last trick', () => {
  it('is lost to the winner of the trick', () => {
    let s = trumpMonster();
    s = playOut(s);
    const last = s.tricks[s.tricks.length - 1];
    expect(last?.leader).toBe(0);
    expect(last?.plays[0]?.card).toBe(EXCUSE);
    expect(last?.excuseKept).toBe(false);
    expect(last?.winner).not.toBe(0);
    expect((s.piles[0] as Card[]).includes(EXCUSE)).toBe(false);
    expect((s.piles[last?.winner as number] as Card[]).includes(EXCUSE)).toBe(true);
    // 17 tricks to player 0, the last one to the defence: no chelem.
    expect(s.result?.chelemBonus).toBe(0);
  });

  it('wins the last trick and stays home when it completes an announced chelem', () => {
    let s = trumpMonster({ chelem: true });
    expect(s.chelemAnnouncedBy).toBe(0);
    s = playOut(s);
    const last = s.tricks[s.tricks.length - 1];
    expect(last?.leader).toBe(0);
    expect(last?.plays[0]?.card).toBe(EXCUSE);
    expect(last?.excuseKept).toBe(true);
    expect(last?.winner).toBe(0);
    expect(s.tricks.every((t) => t.winner === 0)).toBe(true);
    // All 91 points and all three bouts: target 36, so (25 + 55) x 4 + 400.
    expect(s.result).toMatchObject({
      takerPoints: 91,
      defencePoints: 0,
      bouts: 3,
      target: 36,
      diff: 55,
      made: true,
      multiplier: 4,
      base: 80,
      chelemBonus: 400,
      score: 720,
      deltas: [2160, -720, -720, -720],
    });
    expect(s.result?.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(formatHand(s.hands[0] as Card[])).toBe('');
  });

  it('does not rescue the Excuse for a player who announced nothing', () => {
    const s = playOut(trumpMonster());
    expect(s.tricks.filter((t) => sideOf(t.winner, 0, null) === 'taker')).toHaveLength(17);
  });
});
