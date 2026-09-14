import { describe, expect, it } from 'vitest';
import { legalCards, parseCard, parseHand, type Card, type TrickPlay } from '@tarot/engine';
import { informedCard, makeSideOf } from '../src/index.ts';
import { dealToPlay } from './helpers.ts';
import { Bid, applyAction } from '@tarot/engine';

/** Four hands, given in seat order. */
const table = (...hands: string[]): Card[][] => hands.map(parseHand);

const trick = (...spec: [number, string][]): TrickPlay[] =>
  spec.map(([player, id]) => ({ player, card: parseCard(id) }));

/** Seat 0 is the taker; 1, 2 and 3 are the defence, in partnership. */
const alone = makeSideOf(0, null);

describe('the informed rollout policy', () => {
  it('takes a trick with the cheapest card that will actually hold', () => {
    const hands = table(
      'S9 H2',
      'SD SR S2 H3', // to play: the dame is enough, the king is waste
      'S3 H4',
      'S4 H5',
    );
    // Seats 2 and 3 hold only low spades, so the dame holds up.
    expect(informedCard(hands, trick([0, 'S9']), 1, 4, alone, false)).toBe(parseCard('SD'));
  });

  it('does not throw a card at a trick an opponent behind it will take', () => {
    const hands = table(
      'S9 H2',
      'SD S2 H3',
      'S3 H4',
      'SR H5', // still to play, and holds the king
    );
    // Seat 1 is the taker here, so seat 3 is an opponent. Playing the dame in
    // front of that king would simply lose it: play low instead.
    const chosen = informedCard(hands, trick([0, 'S9']), 1, 4, makeSideOf(1, null), false);
    expect(chosen).toBe(parseCard('S2'));
  });

  it('counts a partner who can overtake as help, not as a threat', () => {
    // At four players the three defenders are partners. Seat 1 should still
    // take this trick from the taker even though seat 3 could overtake.
    const hands = table(
      'S9 H2', // the taker leads
      'SD S2 H3',
      'S3 H4',
      'SR H5', // a partner of seat 1
    );
    const defence = makeSideOf(0, null);
    const chosen = informedCard(hands, trick([0, 'S9']), 1, 4, defence, false);
    // Seat 3 is a partner, so the dame is worth playing: the trick stays with
    // the defence whichever of them ends up winning it.
    expect(chosen).toBe(parseCard('SD'));
  });

  it('gives its points to a partner who has the trick safely', () => {
    const hands = table(
      'S9 H2',
      'S2 HR H3', // last to play, void of nothing that matters
      'SR H4', // a partner, currently winning with the king
      'S3 H5',
    );
    const plays = trick([0, 'S9'], [2, 'SR'], [3, 'S3']);
    // Seat 1 plays last; the king cannot be beaten, so hand over the points.
    const chosen = informedCard(hands, plays, 1, 4, makeSideOf(0, null), false);
    expect(chosen).toBe(parseCard('S2'));
  });

  it('leads something nobody can take, and cashes the valuable one', () => {
    const hands = table(
      'SR HR S2', // king of spades and king of hearts, both unbeatable below
      'S3 H3 D2',
      'S4 H4 D3',
      'S5 H5 D4',
    );
    // Nobody holds a trump or a higher spade or heart, so both kings hold.
    // Either is worth 4.5, so either is a fine answer; what matters is that it
    // cashes a king rather than throwing the two.
    const chosen = informedCard(hands, [], 0, 4, alone, false);
    expect([parseCard('SR'), parseCard('HR')]).toContain(chosen);
  });

  it('throws its cheapest card when the lead cannot survive', () => {
    const hands = table(
      'SD S2 H2',
      'SR H3 D2', // holds the king: the dame cannot lead safely
      'S4 T5 D3',
      'S5 H5 D4',
    );
    const chosen = informedCard(hands, [], 0, 4, alone, false);
    expect(chosen).toBe(parseCard('S2'));
  });

  it('only ever returns a card the rules allow', () => {
    for (let seed = 0; seed < 40; seed++) {
      let s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans, seed: seed * 131 + 7 });
      const sideOf = makeSideOf(s.taker as number, s.partner);
      let guard = 0;
      while (s.phase === 'playing' && guard++ < 100) {
        const seat = s.currentPlayer;
        const plays = s.currentTrick?.plays ?? [];
        const card = informedCard(s.hands, plays, seat, s.playerCount, sideOf, s.tricks.length === 17);
        expect(legalCards(s.hands[seat] as Card[], plays)).toContain(card);
        s = applyAction(s, { type: 'PlayCard', player: seat, card });
      }
      expect(s.phase).toBe('done');
      expect(s.result?.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('answers at once when there is only one legal card', () => {
    const hands = table('S9', 'S2', 'S3', 'S4');
    expect(informedCard(hands, trick([0, 'S9']), 1, 4, alone, false)).toBe(parseCard('S2'));
  });
});
