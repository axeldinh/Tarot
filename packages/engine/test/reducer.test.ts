import { describe, expect, it } from 'vitest';
import {
  Bid,
  DECK,
  EXCUSE,
  LAYOUT,
  applyAction,
  createHand,
  createHandFrom,
  highestBid,
  isTerminal,
  legalActions,
  makeRng,
  parseCard,
  playerView,
  points2,
  shuffle,
  sumPoints2,
  trumpCard,
  type Action,
  type Card,
  type GameState,
  type PlayerCount,
} from '../src/index.ts';
import { autoDiscard, bidTo, chooseEcart, handFrom, playOut, skipChelem } from './helpers.ts';

describe('starting a hand', () => {
  it('opens the bidding on the dealer s right', () => {
    const s = createHand({ playerCount: 4, dealer: 2, seed: 5 });
    expect(s.phase).toBe('bidding');
    expect(s.currentPlayer).toBe(3);
    expect(highestBid(s)).toBe(Bid.Pass);
    expect(isTerminal(s)).toBe(false);
  });

  it('rejects a deal that is not a real deal', () => {
    const { hands, chien } = { hands: [[0], [1], [2], [3]], chien: [4] };
    expect(() => createHandFrom({ playerCount: 4, hands, chien })).toThrow(/layout/);
    expect(() => createHandFrom({ playerCount: 4, hands: [[0]], chien })).toThrow(/4 hands/);

    const dupe = shuffle([...DECK], makeRng(1));
    const hands4 = [dupe.slice(0, 18), dupe.slice(18, 36), dupe.slice(36, 54), dupe.slice(0, 18)];
    expect(() =>
      createHandFrom({ playerCount: 4, hands: hands4, chien: dupe.slice(54, 60) }),
    ).toThrow(/exactly once/);
  });
});

describe('the bidding', () => {
  it('lets every player speak once, in order', () => {
    let s = createHand({ playerCount: 4, dealer: 3, seed: 5 });
    const seats: number[] = [];
    for (let i = 0; i < 4; i++) {
      seats.push(s.currentPlayer);
      s = applyAction(s, { type: 'Bid', player: s.currentPlayer, bid: Bid.Pass });
    }
    expect(seats).toEqual([0, 1, 2, 3]);
    expect(s.phase).toBe('passed');
    expect(isTerminal(s)).toBe(true);
    expect(s.taker).toBeNull();
    expect(legalActions(s)).toEqual([]);
  });

  it('requires each bid to beat the last', () => {
    let s = createHand({ playerCount: 4, dealer: 3, seed: 5 });
    s = applyAction(s, { type: 'Bid', player: 0, bid: Bid.Garde });
    expect(() => applyAction(s, { type: 'Bid', player: 1, bid: Bid.Petite })).toThrow(/beat/);
    expect(() => applyAction(s, { type: 'Bid', player: 1, bid: Bid.Garde })).toThrow(/beat/);
    expect(() => applyAction(s, { type: 'Bid', player: 2, bid: Bid.Pass })).toThrow(/player 1/);
    s = applyAction(s, { type: 'Bid', player: 1, bid: Bid.GardeContre });
    expect(legalActions(s).map((a) => (a as { bid: Bid }).bid)).toEqual([Bid.Pass]);
  });

  it('gives the contract to the highest bidder', () => {
    let s = createHand({ playerCount: 4, dealer: 3, seed: 5 });
    s = applyAction(s, { type: 'Bid', player: 0, bid: Bid.Pass });
    s = applyAction(s, { type: 'Bid', player: 1, bid: Bid.Petite });
    s = applyAction(s, { type: 'Bid', player: 2, bid: Bid.GardeSans });
    s = applyAction(s, { type: 'Bid', player: 3, bid: Bid.Pass });
    expect(s.taker).toBe(2);
    expect(s.contract).toBe(Bid.GardeSans);
  });
});

describe('the chien', () => {
  it.each([Bid.Petite, Bid.Garde])('is turned up and taken in on a %s', (bid) => {
    let s = createHand({ playerCount: 4, dealer: 3, seed: 9 });
    s = bidTo(s, 1, bid);
    expect(s.phase).toBe('discard');
    expect(s.chienRevealed).toBe(true);
    expect(s.hands[1]).toHaveLength(18 + 6);
    expect(playerView(s, 1).chien).toHaveLength(6);
    expect(playerView(s, 2).chien).toHaveLength(6);

    const ecart = chooseEcart(s.hands[1] as Card[], 6);
    s = applyAction(s, { type: 'Discard', player: 1, cards: ecart });
    expect(s.hands[1]).toHaveLength(18);
    expect(s.ecart).toEqual(ecart);
    expect(s.phase).toBe('chelem');
    expect(playerView(s, 1).ecart).toEqual(ecart);
    expect(playerView(s, 2).ecart).toBeNull();
  });

  it('stays face down on a Garde Sans or a Garde Contre', () => {
    for (const bid of [Bid.GardeSans, Bid.GardeContre]) {
      const s = bidTo(createHand({ playerCount: 4, dealer: 3, seed: 9 }), 1, bid);
      expect(s.phase).toBe('chelem');
      expect(s.chienRevealed).toBe(false);
      expect(s.chien).toHaveLength(6);
      expect(playerView(s, 1).chien).toBeNull();
      expect(s.hands[1]).toHaveLength(18);
    }
  });

  it('counts for the taker on a Garde Sans and for the defence on a Garde Contre', () => {
    const deal = handFrom(4, { 0: 'T21 T20 T19' }, { dealer: 3, seed: 33 });
    const chienPoints = sumPoints2(deal.chien);

    const sans = playOut(skipChelem(bidTo(deal, 0, Bid.GardeSans)));
    const contre = playOut(skipChelem(bidTo(deal, 0, Bid.GardeContre)));

    expect(sans.tricks.map((t) => t.winner)).toEqual(contre.tricks.map((t) => t.winner));
    expect((sans.result as { takerPoints2: number }).takerPoints2).toBe(
      (contre.result as { takerPoints2: number }).takerPoints2 + chienPoints,
    );
  });

  it('refuses an illegal ecart and insists on the taker making it', () => {
    const s = bidTo(createHand({ playerCount: 4, dealer: 3, seed: 9 }), 1, Bid.Garde);
    expect(() => applyAction(s, { type: 'Discard', player: 1, cards: [] })).toThrow(/wrong-size/);
    expect(() => applyAction(s, { type: 'Discard', player: 2, cards: [] })).toThrow(/player 1/);
    expect(legalActions(s)).toEqual([]);
    expect(() => applyAction(s, { type: 'PlayCard', player: 1, card: 0 })).toThrow(/No card/);
  });

  it('shows the table any trumps that had to be buried', () => {
    // A taker with almost nothing but trumps has to bury some of them.
    const monster = 'T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18 T19';
    let s = handFrom(4, { 0: monster }, { dealer: 3, seed: 4, chien: 'SR HR DR CR S2 H2' });
    s = bidTo(s, 0, Bid.Petite);
    s = autoDiscard(s);
    expect(s.ecartTrumpsShown.length).toBe(4);
    expect(s.ecart.filter((c) => c >= 56).length).toBe(4);
  });
});

describe('the chelem announcement', () => {
  it('is offered to everyone once and then starts the play', () => {
    let s = skipChelem(bidTo(createHand({ playerCount: 4, dealer: 3, seed: 9 }), 1, Bid.GardeSans));
    expect(s.phase).toBe('playing');
    expect(s.currentPlayer).toBe(0);
    expect(s.chelemAnnouncedBy).toBeNull();
    expect(() => applyAction(s, { type: 'AnnounceChelem', player: 0, announce: true })).toThrow(
      /phase/,
    );
    s = createHand({ playerCount: 4, dealer: 3, seed: 9 });
    s = bidTo(s, 1, Bid.GardeSans);
    expect(legalActions(s)).toHaveLength(2);
  });

  it('lets the announcer lead the first trick', () => {
    let s = bidTo(createHand({ playerCount: 4, dealer: 3, seed: 9 }), 1, Bid.GardeSans);
    s = applyAction(s, { type: 'AnnounceChelem', player: 0, announce: false });
    s = applyAction(s, { type: 'AnnounceChelem', player: 1, announce: false });
    s = applyAction(s, { type: 'AnnounceChelem', player: 2, announce: true });
    expect(legalActions(s)).toHaveLength(1);
    s = applyAction(s, { type: 'AnnounceChelem', player: 3, announce: false });
    expect(s.chelemAnnouncedBy).toBe(2);
    expect(s.currentPlayer).toBe(2);
    expect(s.currentTrick?.leader).toBe(2);
  });

  it('allows only one chelem at the table', () => {
    let s = bidTo(createHand({ playerCount: 4, dealer: 3, seed: 9 }), 1, Bid.GardeSans);
    s = applyAction(s, { type: 'AnnounceChelem', player: 0, announce: true });
    expect(() => applyAction(s, { type: 'AnnounceChelem', player: 1, announce: true })).toThrow(
      /already been announced/,
    );
  });
});

describe('the poignee at the table', () => {
  const bigTrumps = 'T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12 T13 T14 T15';
  const start = (): GameState =>
    skipChelem(
      bidTo(handFrom(4, { 0: bigTrumps }, { dealer: 3, seed: 8 }), 0, Bid.GardeSans),
    );

  it('is shown before your first card', () => {
    let s = start();
    expect(
      legalActions(s)
        .filter((a) => a.type === 'AnnouncePoignee')
        .map((a) => (a as { kind: string }).kind),
    ).toEqual(['simple', 'double', 'triple']);

    s = applyAction(s, { type: 'AnnouncePoignee', player: 0, kind: 'double' });
    expect(s.poignees).toHaveLength(1);
    expect(s.poignees[0]?.cards).toHaveLength(13);
    expect(playerView(s, 2).poignees[0]?.cards).toHaveLength(13);
  });

  it('cannot be shown twice, late, out of turn, or without the trumps', () => {
    let s = start();
    s = applyAction(s, { type: 'AnnouncePoignee', player: 0, kind: 'simple' });
    expect(() => applyAction(s, { type: 'AnnouncePoignee', player: 0, kind: 'double' })).toThrow(
      /already shown/,
    );
    expect(() => applyAction(s, { type: 'AnnouncePoignee', player: 1, kind: 'simple' })).toThrow(
      /player 0/,
    );

    s = applyAction(s, { type: 'PlayCard', player: 0, card: trumpCard(1) });
    const next = s.currentPlayer;
    expect(() =>
      applyAction(s, { type: 'AnnouncePoignee', player: next, kind: 'simple' }),
    ).toThrow(/enough trumps/);

    s = playOut(s);
    expect(() => applyAction(s, { type: 'AnnouncePoignee', player: 0, kind: 'simple' })).toThrow(
      /during the play/,
    );
  });

  it('adds its flat bonus to the hand it was shown in', () => {
    let s = start();
    s = applyAction(s, { type: 'AnnouncePoignee', player: 0, kind: 'simple' });
    const withPoignee = playOut(s);
    const without = playOut(start());

    expect(withPoignee.tricks.map((t) => t.winner)).toEqual(without.tricks.map((t) => t.winner));
    const shown = withPoignee.result as NonNullable<typeof withPoignee.result>;
    const bare = without.result as NonNullable<typeof without.result>;
    // Same cards, same play: the only difference is the flat 20.
    expect(shown.base).toBe(bare.base);
    expect(shown.score - bare.score).toBe(shown.made ? 20 : -20);
    expect(shown.deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('is refused once you have played', () => {
    let s = start();
    s = applyAction(s, { type: 'PlayCard', player: 0, card: trumpCard(1) });
    while (s.currentPlayer !== 0) {
      const legal = legalActions(s).filter((a) => a.type === 'PlayCard');
      s = applyAction(s, legal[0] as Action);
    }
    expect(() => applyAction(s, { type: 'AnnouncePoignee', player: 0, kind: 'simple' })).toThrow(
      /before your first card/,
    );
  });
});

describe('the player view', () => {
  it('shows a player their own hand and nobody else s', () => {
    let s = bidTo(createHand({ playerCount: 5, dealer: 4, seed: 3 }), 0, Bid.GardeSans);
    s = applyAction(s, { type: 'CallKing', player: 0, card: parseCard('SR') });
    s = skipChelem(s);
    const view = playerView(s, 2);
    expect(view.hand).toEqual(s.hands[2]);
    expect(view.cardsLeft).toEqual([15, 15, 15, 15, 15]);
    expect(Object.values(view).flat()).not.toContain(s.hands[0]);
    expect(view.self).toBe(2);
    expect(view.tricks).toEqual([]);
    expect(view.result).toBeNull();
    expect(view.currentTrick?.plays).toEqual([]);
  });
});

describe('playing out a hand', () => {
  it.each([3, 4, 5] as PlayerCount[])('deals every card into a pile at %i players', (n) => {
    let s = createHand({ playerCount: n, dealer: 0, seed: 77 });
    s = bidTo(s, 1, Bid.Petite);
    if (s.phase === 'calling') {
      s = applyAction(s, { type: 'CallKing', player: 1, card: parseCard('SR') });
    }
    s = autoDiscard(s);
    s = playOut(skipChelem(s));

    expect(s.phase).toBe('done');
    expect(s.tricks).toHaveLength(LAYOUT[n].cardsPerPlayer);
    const all = [...s.piles.flat(), ...s.ecart];
    expect(all).toHaveLength(78);
    expect(new Set(all).size).toBe(78);
    expect(sumPoints2(all)).toBe(182);
    expect(s.result?.deltas.reduce((a, b) => a + b, 0)).toBe(0);
    expect(isTerminal(s)).toBe(true);
    expect(s.currentTrick).toBeNull();
  });

  it('refuses an illegal card and a card out of turn', () => {
    const s = skipChelem(
      bidTo(handFrom(4, { 0: 'S1 S2 S3' }, { dealer: 3, seed: 2 }), 0, Bid.GardeSans),
    );
    expect(() => applyAction(s, { type: 'PlayCard', player: 1, card: 0 })).toThrow(/player 0/);
    const notInHand = DECK.find((c) => !(s.hands[0] as Card[]).includes(c)) as Card;
    expect(() => applyAction(s, { type: 'PlayCard', player: 0, card: notInHand })).toThrow(
      /cannot be played/,
    );
  });

  it('rejects an unknown action', () => {
    const s = createHand({ playerCount: 4, dealer: 0, seed: 1 });
    expect(() => applyAction(s, { type: 'Nope' } as unknown as Action)).toThrow(/Unknown action/);
  });

  it('never mutates the state it was given', () => {
    const s = createHand({ playerCount: 4, dealer: 3, seed: 12 });
    const before = JSON.stringify(s);
    applyAction(s, { type: 'Bid', player: 0, bid: Bid.Garde });
    expect(JSON.stringify(s)).toBe(before);
    expect(points2(EXCUSE)).toBe(9);
  });
});
