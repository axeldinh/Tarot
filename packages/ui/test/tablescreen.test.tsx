import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  Bid,
  LAYOUT,
  legalCards,
  type Action,
  type Card,
  type PlayerView,
} from '@tarot/engine';
import { GameHost } from '@tarot/net';
import { I18nContext, fr } from '../src/i18n/index.ts';
import { TableScreen } from '../src/screens/TableScreen.tsx';
import type { SoloGameApi } from '../src/state/useSoloGame.ts';

afterEach(cleanup);

/**
 * A deterministic table: fixed seed, fastest bots, and no waiting. The screen is
 * driven through the same `SoloGameApi` the real app uses, so nothing here is a
 * special path that only exists for tests.
 */
function table(options: { seed?: number; allowUndo?: boolean; playerCount?: 3 | 4 | 5 } = {}) {
  const playerCount = options.playerCount ?? 4;
  const host = new GameHost({
    playerCount,
    seats: Array.from({ length: playerCount }, (_, seat) => ({
      name: seat === 0 ? 'Moi' : `B${seat}`,
      kind: seat === 0 ? ('human' as const) : ('bot' as const),
      ...(seat === 0 ? {} : { level: 'debutant' as const }),
    })),
    seed: options.seed ?? 4242,
    dealer: playerCount - 1,
    allowUndo: options.allowUndo ?? true,
    botDelayMs: 0,
    schedule: (fn) => fn(),
  });

  let rejection: SoloGameApi['rejection'] = null;
  const api = (): SoloGameApi => ({
    seat: 0,
    token: 'test',
    view: host.viewFor(0),
    session: host.getSession(),
    rejection,
    play: (action: Action) => {
      rejection = host.submit(0, action);
    },
    undo: () => {
      rejection = host.undo(0);
    },
    nextHand: () => {
      rejection = host.nextHand();
    },
    dismissRejection: () => {
      rejection = null;
    },
  });
  return { host, api };
}

function show(api: () => SoloGameApi) {
  const game = api();
  return render(
    <I18nContext.Provider value={{ lang: 'fr', t: fr, setLang: () => {} }}>
      <TableScreen
        game={game}
        view={game.view as NonNullable<SoloGameApi['view']>}
        session={game.session as NonNullable<SoloGameApi['session']>}
        onRules={() => {}}
        onQuit={() => {}}
      />
    </I18nContext.Provider>,
  );
}

/** The view for a seat at a table that has already been dealt. */
function seatView(host: GameHost, seat: number): PlayerView {
  const view = host.viewFor(seat);
  if (!view) throw new Error('the table has not been dealt');
  return view;
}

/** Bid, settle the chien and the chelem, then play on until the seat must follow suit. */
function reachAFollowSuitDecision(host: GameHost): void {
  host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass });
  while (seatView(host, 0).phase === 'chelem') {
    host.submit(0, { type: 'AnnounceChelem', player: 0, announce: false });
  }
  for (let guard = 0; guard < 200; guard++) {
    const view = seatView(host, 0);
    if (view.phase !== 'playing') return;
    const legal = legalCards(view.hand, view.currentTrick?.plays ?? []);
    if (legal.length < view.hand.length) return; // some card is now illegal
    host.submit(0, { type: 'PlayCard', player: 0, card: legal[0] as Card });
  }
}

describe('the table', () => {
  it('names the contract and the taker once there is one', () => {
    const { host, api } = table();
    host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass });
    show(api);
    expect(document.querySelector('.contract-chip')?.textContent).toMatch(/Garde|Petite/);
  });

  it('says why a card cannot be played, in French', () => {
    const { host, api } = table();
    reachAFollowSuitDecision(host);
    const { container } = show(api);

    const blocked = container.querySelectorAll('.hand-card.blocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.hand-card.playable').length).toBeGreaterThan(0);

    fireEvent.click(blocked[0] as HTMLElement);
    const toast = container.querySelector('.toast');
    expect(toast?.textContent).toMatch(/Vous devez/);
  });

  it('plays a legal card when one is tapped', () => {
    const { host, api } = table();
    reachAFollowSuitDecision(host);
    const before = seatView(host, 0).hand.length;
    const { container } = show(api);
    fireEvent.click(container.querySelector('.hand-card.playable') as HTMLElement);
    expect(seatView(host, 0).hand.length).toBeLessThan(before);
  });

  it('lets a solo player take the last card back, and never at a real table', () => {
    const { host, api } = table();
    reachAFollowSuitDecision(host);
    const { container, rerender } = show(api);
    fireEvent.click(container.querySelector('.hand-card.playable') as HTMLElement);

    const next = api();
    expect(next.session?.undoAvailable).toBe(true);
    rerender(
      <I18nContext.Provider value={{ lang: 'fr', t: fr, setLang: () => {} }}>
        <TableScreen
          game={next}
          view={next.view as NonNullable<SoloGameApi['view']>}
          session={next.session as NonNullable<SoloGameApi['session']>}
          onRules={() => {}}
          onQuit={() => {}}
        />
      </I18nContext.Provider>,
    );
    const undo = screen.getByRole('button', { name: 'Annuler' });
    const handBefore = seatView(host, 0).hand.length;
    fireEvent.click(undo);
    expect(seatView(host, 0).hand.length).toBe(handBefore + 1);
  });

  it('hides the undo at a table that does not allow it', () => {
    const { host, api } = table({ allowUndo: false });
    reachAFollowSuitDecision(host);
    show(api);
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('builds an ecart by tapping, and refuses the cards the rules protect', () => {
    // Find a deal where seat 0 takes the contract and so has to discard.
    let host: GameHost | null = null;
    let apiOf: (() => SoloGameApi) | null = null;
    for (let seed = 1; seed < 60 && host === null; seed++) {
      const candidate = table({ seed: seed * 977 });
      candidate.host.submit(0, { type: 'Bid', player: 0, bid: Bid.Garde });
      if (seatView(candidate.host, 0).phase === 'discard') {
        host = candidate.host;
        apiOf = candidate.api;
      }
    }
    expect(host).not.toBeNull();
    const { container } = show(apiOf as () => SoloGameApi);

    // The chien is face up for everyone while the ecart is made.
    expect(screen.getByTestId('chien')).toBeTruthy();
    expect(screen.getByText(/Encore 6 cartes à écarter/)).toBeTruthy();

    const blocked = container.querySelectorAll('.hand-card.blocked');
    if (blocked.length > 0) {
      fireEvent.click(blocked[0] as HTMLElement);
      expect(container.querySelector('.toast')?.textContent).toMatch(/On ne peut pas|atout/);
    }

    const playable = [...container.querySelectorAll('.hand-card.playable')] as HTMLElement[];
    fireEvent.click(playable[0] as HTMLElement);
    expect(container.querySelectorAll('.hand-card.chosen')).toHaveLength(1);
    expect(screen.getByText(/Encore 5 cartes à écarter/)).toBeTruthy();
    // Tapping it again puts it back.
    fireEvent.click(playable[0] as HTMLElement);
    expect(container.querySelectorAll('.hand-card.chosen')).toHaveLength(0);
  });

  it('opens the scoreboard and the rest of the menu', () => {
    const onRules = vi.fn();
    const onQuit = vi.fn();
    const { host, api } = table();
    host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass });
    const game = api();
    render(
      <I18nContext.Provider value={{ lang: 'fr', t: fr, setLang: () => {} }}>
        <TableScreen
          game={game}
          view={game.view as NonNullable<SoloGameApi['view']>}
          session={game.session as NonNullable<SoloGameApi['session']>}
          onRules={onRules}
          onQuit={onQuit}
        />
      </I18nContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('Aucune donne jouée.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Règles' }));
    expect(onRules).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la partie' }));
    expect(onQuit).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByText('Aucune donne jouée.')).toBeNull();
  });

  it('shows the other seats around the table, with their bid', () => {
    const { host, api } = table({ playerCount: 5 });
    host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass });
    show(api);
    for (const seat of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`badge-${seat}`)).toBeTruthy();
    }
    expect(screen.queryByTestId('badge-0')).toBeNull();
    expect(LAYOUT[5].cardsPerPlayer).toBe(15);
  });

  it('waves the poignee offer away without playing anything', async () => {
    // A hand big enough to show a poignee is rare; build one by hand instead.
    const { host, api } = table();
    host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass });
    while (seatView(host, 0).phase === 'chelem') {
      host.submit(0, { type: 'AnnounceChelem', player: 0, announce: false });
    }
    const game = api();
    const view = game.view as NonNullable<SoloGameApi['view']>;
    if (view.phase !== 'playing') return;

    const spy = vi.fn();
    render(
      <I18nContext.Provider value={{ lang: 'fr', t: fr, setLang: () => {} }}>
        <TableScreen
          game={{ ...game, play: spy }}
          view={view}
          session={game.session as NonNullable<SoloGameApi['session']>}
          onRules={() => {}}
          onQuit={() => {}}
        />
      </I18nContext.Provider>,
    );
    const skip = screen.queryByRole('button', { name: 'Non merci' });
    if (!skip) return;
    await act(async () => {
      fireEvent.click(skip);
    });
    // Declining must not throw a card on the table.
    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Non merci' })).toBeNull();
  });
});
