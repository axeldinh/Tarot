import { beforeEach, describe, expect, it } from 'vitest';
import {
  Bid,
  DECK,
  isKing,
  isTrump,
  parseCard,
  parseHand,
  type Card,
} from '@tarot/engine';
import { GameHost, newSession } from '@tarot/net';
import { fr } from '../src/i18n/index.ts';
import {
  bidLabel,
  cardLabel,
  formatPoints,
  formatSigned,
  illegalLabel,
  levelLabel,
  poigneeLabel,
} from '../src/state/labels.ts';
import { affordances, ecartState, hasPlayed, highestBid, reasonFor } from '../src/state/moves.ts';
import { clearGame, loadGame, loadLang, saveGame, saveLang } from '../src/state/storage.ts';
import { installBrokenStorage, installStorage } from './setup.ts';

describe('labels', () => {
  it('name every bid and level', () => {
    expect(bidLabel(Bid.Pass, fr)).toBe('Passe');
    expect(bidLabel(Bid.Petite, fr)).toBe('Petite');
    expect(bidLabel(Bid.Garde, fr)).toBe('Garde');
    expect(bidLabel(Bid.GardeSans, fr)).toBe('Garde Sans');
    expect(bidLabel(Bid.GardeContre, fr)).toBe('Garde Contre');
    expect(levelLabel('confirme', fr)).toBe('Confirmé');
    expect(poigneeLabel('double', fr)).toBe('double');
    expect(illegalLabel('must-play-trump', fr)).toBe('Vous devez couper');
  });

  it('show half points the way players say them', () => {
    expect(formatPoints(52)).toBe('52');
    expect(formatPoints(52.5)).toBe('52.5');
    expect(formatSigned(11)).toBe('+11');
    expect(formatSigned(-11)).toBe('−11');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-0.5)).toBe('−0.5');
  });

  it('name cards for a screen reader', () => {
    expect(cardLabel(parseCard('SR'), fr)).toBe('Roi ♠');
    expect(cardLabel(parseCard('HD'), fr)).toBe('Dame ♥');
    expect(cardLabel(parseCard('T21'), fr)).toBe('Atout 21');
    expect(cardLabel(parseCard('EX'), fr)).toBe('Excuse');
    expect(cardLabel(parseCard('D7'), fr)).toBe('7 ♦');
  });
});

/** A host with the human on seat 0 and bots everywhere else. */
function soloHost(bid: Bid, taker = 0): GameHost {
  const host = new GameHost({
    playerCount: 4,
    seats: [
      { name: 'Moi', kind: 'human' },
      { name: 'B1', kind: 'bot', level: 'debutant' },
      { name: 'B2', kind: 'bot', level: 'debutant' },
      { name: 'B3', kind: 'bot', level: 'debutant' },
    ],
    seed: 4242,
    dealer: 3,
    botDelayMs: 0,
    schedule: (fn) => fn(),
  });
  if (taker === 0) host.submit(0, { type: 'Bid', player: 0, bid });
  return host;
}

describe('what the seat may do', () => {
  it('reads the highest bid on the table', () => {
    expect(highestBid([Bid.Pass, Bid.Garde, null])).toBe(Bid.Garde);
    expect(highestBid([null, null])).toBe(Bid.Pass);
    expect(highestBid([Bid.GardeContre, Bid.Petite])).toBe(Bid.GardeContre);
  });

  it('lists the legal bids while it is your turn', () => {
    const host = new GameHost({
      playerCount: 4,
      seats: [
        { name: 'Moi', kind: 'human' },
        { name: 'B1', kind: 'human' },
        { name: 'B2', kind: 'human' },
        { name: 'B3', kind: 'human' },
      ],
      seed: 1,
      dealer: 3,
      botDelayMs: 0,
      schedule: (fn) => fn(),
    });
    const fresh = affordances(host.viewFor(0));
    expect(fresh.myTurn).toBe(true);
    expect(fresh.bids).toEqual([Bid.Pass, Bid.Petite, Bid.Garde, Bid.GardeSans, Bid.GardeContre]);

    host.submit(0, { type: 'Bid', player: 0, bid: Bid.Garde });
    const next = affordances(host.viewFor(1));
    expect(next.bids).toEqual([Bid.Pass, Bid.GardeSans, Bid.GardeContre]);
    // It is not seat 0's turn any more, so seat 0 is offered nothing.
    expect(affordances(host.viewFor(0)).bids).toEqual([]);
  });

  it('knows when you have played and the poignee window has shut', () => {
    const host = soloHost(Bid.GardeSans);
    const view = host.viewFor(0);
    expect(hasPlayed(view)).toBe(false);
    expect(affordances(view).ecartSize).toBe(6);
  });
});

describe('building an ecart', () => {
  const hand = parseHand('SR HR T1 T21 EX S2 S3 H4 H5 D6 D7 C8 C9 C10 T5 T6 T7 T8 T9 T10 D2 D3 H6 H7');

  it('refuses kings and bouts outright', () => {
    const state = ecartState(hand, [], 6);
    for (const card of hand) {
      if (isKing(card) || card === parseCard('T1') || card === parseCard('T21') || card === parseCard('EX')) {
        expect(state.forbidden.has(card)).toBe(true);
      }
    }
    expect(state.trumpsAllowed).toBe(0);
    expect(state.remaining).toBe(6);
    expect(state.complete).toBe(false);
  });

  it('counts down as cards are chosen and validates the finished ecart', () => {
    const chosen = [parseCard('S2'), parseCard('S3'), parseCard('H4'), parseCard('H5'), parseCard('D6'), parseCard('D7')];
    const state = ecartState(hand, chosen, 6);
    expect(state.remaining).toBe(0);
    expect(state.complete).toBe(true);
    expect(state.error).toBeNull();
  });

  it('opens up trumps only when the rules force it, and closes them again', () => {
    // Nothing but kings, bouts and trumps: four trumps have to go.
    const forced = parseHand('SR HR DR CR T1 T21 EX T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12');
    const empty = ecartState(forced, [], 6);
    expect(empty.trumpsAllowed).toBe(6);
    expect(empty.forbidden.has(parseCard('T2'))).toBe(false);

    const full = ecartState(forced, parseHand('T2 T3 T4 T5 T6 T7'), 6);
    // Six trumps are already down, so the rest are closed off.
    expect(full.forbidden.has(parseCard('T8'))).toBe(true);
    expect(full.forbidden.has(parseCard('T2'))).toBe(false);
    expect(full.complete).toBe(true);
    expect(full.error).toBeNull();
  });

  it('reports an ecart the engine would reject', () => {
    const state = ecartState(hand, [parseCard('SR'), ...parseHand('S2 S3 H4 H5 D6')], 6);
    expect(state.error).toBe('no-king');
  });
});

describe('why a card is refused', () => {
  it('answers with the engine s own reason', () => {
    const host = soloHost(Bid.GardeSans);
    let view = host.viewFor(0);
    while (view.phase === 'chelem') {
      host.submit(view.currentPlayer, {
        type: 'AnnounceChelem',
        player: view.currentPlayer,
        announce: false,
      });
      view = host.viewFor(0);
    }
    expect(view.phase).toBe('playing');
    const notInHand = DECK.find((c) => !view.hand.includes(c)) as Card;
    expect(reasonFor(view, notInHand)).toBe('not-in-hand');
    expect(reasonFor(view, view.hand[0] as Card)).toBeNull();
    expect(isTrump(parseCard('T5'))).toBe(true);
  });
});

describe('what is kept on disk', () => {
  beforeEach(() => {
    installStorage();
  });

  const config = { playerCount: 4 as const, level: 'normal' as const, name: 'Moi', seed: 7 };
  const session = newSession({ id: 's', playerCount: 4, seats: [], dealer: 0 });

  it('round-trips a session', () => {
    expect(loadGame()).toBeNull();
    saveGame({ config, session });
    expect(loadGame()).toEqual({ config, session });
    clearGame();
    expect(loadGame()).toBeNull();
  });

  it('remembers the language', () => {
    expect(loadLang()).toBeNull();
    saveLang('en');
    expect(loadLang()).toBe('en');
  });

  it('treats anything it does not recognise as nothing saved', () => {
    const store = installStorage();
    store.setItem('tarot.session.v1', 'not json');
    expect(loadGame()).toBeNull();
    store.setItem('tarot.session.v1', JSON.stringify({ config, session: { nope: 1 } }));
    expect(loadGame()).toBeNull();
    store.setItem('tarot.session.v1', JSON.stringify({ session }));
    expect(loadGame()).toBeNull();
    store.setItem('tarot.session.v1', JSON.stringify({ config: { ...config, playerCount: 9 }, session }));
    expect(loadGame()).toBeNull();
    store.setItem('tarot.lang.v1', 'de');
    expect(loadLang()).toBeNull();
  });

  it('survives a browser that refuses storage altogether', () => {
    installBrokenStorage();
    expect(() => saveGame({ config, session })).not.toThrow();
    expect(loadGame()).toBeNull();
    expect(() => clearGame()).not.toThrow();
    expect(() => saveLang('fr')).not.toThrow();
    expect(loadLang()).toBeNull();
  });
});
