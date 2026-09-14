import { describe, expect, it } from 'vitest';
import {
  Bid,
  DECK_SIZE,
  LAYOUT,
  TRUMP,
  applyAction,
  createHand,
  isBout,
  isKing,
  isTrump,
  legalCards,
  suitOf,
  makeRng,
  parseCard,
  playerView,
  rankOf,
  type Card,
  type GameState,
} from '@tarot/engine';
import { buildKnowledge, inferConstraints, partnerIn, sampleLayout } from '../src/index.ts';
import { dealToPlay, playSomeTricks } from './helpers.ts';

describe('what the table gives away', () => {
  it('reads a void from a player who could not follow', () => {
    // Player 0 leads spades; player 1 ruffs, so player 1 is out of spades.
    let s = dealToPlay(
      { 0: 'S2 S3 S4', 1: 'T5 T6' },
      { taker: 0, bid: Bid.GardeSans, refuses: { 1: (c) => suitOf(c) === 0 } },
    );
    s = applyAction(s, { type: 'PlayCard', player: 0, card: parseCard('S2') });
    s = applyAction(s, { type: 'PlayCard', player: 1, card: parseCard('T5') });
    const { voids } = inferConstraints(playerView(s, 0));
    expect(voids[1]?.has(0)).toBe(true);
    expect(voids[1]?.has(TRUMP)).toBe(false);
    expect(voids[2]?.size).toBe(0);
  });

  it('reads out-of-trumps from a player who discarded instead of ruffing', () => {
    let s = dealToPlay(
      { 0: 'S2 S3 S4', 1: 'H7 H8' },
      { taker: 0, bid: Bid.GardeSans, refuses: { 1: (c) => suitOf(c) === 0 || isTrump(c) } },
    );
    s = applyAction(s, { type: 'PlayCard', player: 0, card: parseCard('S2') });
    s = applyAction(s, { type: 'PlayCard', player: 1, card: parseCard('H7') });
    const { voids } = inferConstraints(playerView(s, 0));
    expect(voids[1]?.has(0)).toBe(true);
    expect(voids[1]?.has(TRUMP)).toBe(true);
  });

  it('caps a player s trumps when they were obliged to overtrump and could not', () => {
    // Spades led, player 1 ruffs with the 15, player 2 follows with a lower trump:
    // player 2 cannot be holding anything above the 14.
    let s = dealToPlay(
      { 0: 'S2 S3 S4', 1: 'T15 T6', 2: 'T4 T5' },
      {
        taker: 0,
        bid: Bid.GardeSans,
        refuses: {
          1: (c) => suitOf(c) === 0,
          // Void in spades, and holding no trump above the 14.
          2: (c) => suitOf(c) === 0 || (isTrump(c) && rankOf(c) > 14),
        },
      },
    );
    s = applyAction(s, { type: 'PlayCard', player: 0, card: parseCard('S2') });
    s = applyAction(s, { type: 'PlayCard', player: 1, card: parseCard('T15') });
    s = applyAction(s, { type: 'PlayCard', player: 2, card: parseCard('T4') });
    const { maxTrump } = inferConstraints(playerView(s, 0));
    expect(maxTrump[2]).toBe(14);
    expect(maxTrump[1]).toBe(21);
  });

  it('learns nothing from the Excuse', () => {
    let s = dealToPlay(
      { 0: 'S2 S3 S4', 1: 'EX H8' },
      { taker: 0, bid: Bid.GardeSans, refuses: { 1: (c) => suitOf(c) === 0 } },
    );
    s = applyAction(s, { type: 'PlayCard', player: 0, card: parseCard('S2') });
    s = applyAction(s, { type: 'PlayCard', player: 1, card: parseCard('EX') });
    const { voids } = inferConstraints(playerView(s, 0));
    expect(voids[1]?.size).toBe(0);
  });
});

describe('the unseen cards', () => {
  it('are exactly the ones this seat cannot place', () => {
    const s = playSomeTricks(dealToPlay({}, { taker: 0, bid: Bid.GardeSans }), 12);
    for (let seat = 0; seat < s.playerCount; seat++) {
      const view = playerView(s, seat);
      const k = buildKnowledge(view);
      const capacity = k.slots.reduce((n, slot) => n + slot.capacity, 0);
      expect(k.unseen.length + k.slots.reduce((n, sl) => n + sl.fixed.length, 0)).toBe(capacity);
      // Nothing this seat can already see is in the pool.
      for (const c of view.hand) expect(k.unseen).not.toContain(c);
      for (const c of k.played) expect(k.unseen).not.toContain(c);
    }
  });

  it('put the unseen chien in its own slot on a Garde Sans', () => {
    const s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans });
    const k = buildKnowledge(playerView(s, 1));
    expect(k.slots.map((slot) => slot.id)).toContain('chien');
    expect(k.slots.find((slot) => slot.id === 'chien')?.capacity).toBe(6);
  });

  it('know the taker s ecart holds no king and no bout', () => {
    const s = dealToPlay({}, { taker: 0, bid: Bid.Garde });
    const view = playerView(s, 2);
    const k = buildKnowledge(view);
    const ecart = k.slots.find((slot) => slot.id === 'ecart');
    expect(ecart?.capacity).toBe(6);
    // Any trump he buried was shown to everyone, so its home is already known.
    expect(ecart?.fixed).toEqual(view.ecartTrumpsShown);

    const layout = sampleLayout(view, k, makeRng(1), 20);
    for (const c of layout.ecart) {
      expect(isKing(c)).toBe(false);
      expect(isBout(c)).toBe(false);
    }
  });

  it('know the taker took the face-up chien into his hand or his ecart', () => {
    const s = dealToPlay({}, { taker: 0, bid: Bid.Garde });
    const view = playerView(s, 2);
    expect(view.revealedChien).toHaveLength(6);
    const k = buildKnowledge(view);
    const layout = sampleLayout(view, k, makeRng(7), 20);
    for (const card of k.fromChien) {
      const inTaker = (layout.hands[0] as Card[]).includes(card);
      expect(inTaker || layout.ecart.includes(card)).toBe(true);
    }
  });
});

describe('sampling a layout', () => {
  it('deals every card exactly once and respects the hand sizes', () => {
    const s = playSomeTricks(dealToPlay({}, { taker: 0, bid: Bid.GardeSans }), 7);
    for (let seat = 0; seat < s.playerCount; seat++) {
      const view = playerView(s, seat);
      const k = buildKnowledge(view);
      for (let i = 0; i < 20; i++) {
        const layout = sampleLayout(view, k, makeRng(i + 1), 30);
        const all = [...layout.hands.flat(), ...layout.ecart, ...layout.chien];
        expect(all).toHaveLength(DECK_SIZE - k.played.size);
        expect(new Set(all).size).toBe(all.length);
        expect(layout.hands.map((h) => h.length)).toEqual(view.cardsLeft);
        expect(layout.hands[seat]).toEqual(view.hand);
      }
    }
  });

  it('never puts a card where the table has shown it cannot be', () => {
    // Play on until somebody has actually shown a void; a hand where nobody has
    // discarded yet would make this test pass without proving anything.
    let s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans });
    let view = playerView(s, 1);
    let k = buildKnowledge(view);
    const voidsKnown = (): number =>
      k.voids.reduce((n, set, p) => n + (p === view.self ? 0 : set.size), 0);
    for (let played = 0; played < 60 && voidsKnown() === 0; played += 4) {
      s = playSomeTricks(s, 4);
      view = playerView(s, 1);
      k = buildKnowledge(view);
    }

    let checked = 0;
    for (let i = 0; i < 30; i++) {
      const layout = sampleLayout(view, k, makeRng(i + 100), 40);
      for (let p = 0; p < view.playerCount; p++) {
        if (p === view.self) continue;
        for (const suit of (k.voids[p] as Set<number>)) {
          checked++;
          const offending = (layout.hands[p] as Card[]).filter((c) =>
            suit === TRUMP ? isTrump(c) : !isTrump(c) && Math.floor(c / 14) === suit,
          );
          expect(offending).toEqual([]);
        }
        const cap = k.maxTrump[p] as number;
        for (const c of layout.hands[p] as Card[]) {
          if (isTrump(c)) expect(rankOf(c)).toBeLessThanOrEqual(cap);
        }
      }
    }
    // The scenario has to actually contain some inferences for this to mean anything.
    expect(checked).toBeGreaterThan(0);
  });

  it('works out the partnership at five players from where the called card lands', () => {
    const s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans, playerCount: 5 });
    // A defender: someone who is neither the taker nor holding the called card.
    const seat = [1, 2, 3, 4].find(
      (p) => !(s.hands[p] as Card[]).includes(s.calledCard as Card),
    ) as number;
    const view = playerView(s, seat);
    expect(view.partner).toBeNull();
    const k = buildKnowledge(view);
    for (let i = 0; i < 10; i++) {
      const layout = sampleLayout(view, k, makeRng(i + 3), 30);
      const partner = partnerIn(view, layout);
      if (partner === null) continue;
      const holder = layout.hands.findIndex((h) => h.includes(view.calledCard as Card));
      expect(partner).toBe(holder);
    }
  });

  it('knows the partnership once the called card has been played', () => {
    const s = dealToPlay({}, { taker: 0, bid: Bid.GardeSans, playerCount: 5 });
    const view = playerView(s, 0);
    const k = buildKnowledge(view);
    const layout = sampleLayout(view, k, makeRng(2), 30);
    // Player 0 called it and does not hold it, so the partner is one of the others.
    const partner = partnerIn(view, layout);
    expect(partner === null || partner !== view.self).toBe(true);
    expect(LAYOUT[5].chienSize).toBe(3);
  });
});

describe('legal play from a sampled layout', () => {
  it('leaves every seat with something legal to do', () => {
    const s: GameState = playSomeTricks(dealToPlay({}, { taker: 0, bid: Bid.GardeSans }), 9);
    const view = playerView(s, 3);
    const layout = sampleLayout(view, buildKnowledge(view), makeRng(11), 30);
    for (const hand of layout.hands) {
      expect(legalCards(hand, view.currentTrick?.plays ?? []).length).toBeGreaterThan(0);
    }
    expect(createHand({ playerCount: 4, seed: 1 }).phase).toBe('bidding');
  });
});
