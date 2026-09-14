import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { newSession } from '@tarot/net';
import { App } from '../src/App.tsx';
import { installStorage } from './setup.ts';

afterEach(cleanup);

/** Click a button by its visible label, if it is on screen. */
async function clickIfPresent(label: RegExp): Promise<boolean> {
  const buttons = screen.queryAllByRole('button', { name: label });
  if (buttons.length === 0) return false;
  await act(async () => {
    fireEvent.click(buttons[0] as HTMLElement);
  });
  return true;
}

function legalCards(): HTMLElement[] {
  return [...document.querySelectorAll('.hand-card.playable')] as HTMLElement[];
}

describe('the app', () => {
  it('opens in French and can be switched to English and back', async () => {
    installStorage();
    render(<App initialSaved={null} />);
    expect(screen.getByText('Nouvelle partie')).toBeTruthy();
    expect(document.documentElement.lang).toBe('fr');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'English' }));
    });
    expect(screen.getByText('New game')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Francais' }));
    });
    expect(screen.getByText('Nouvelle partie')).toBeTruthy();
  });

  it('shows the rules reference without starting a game', async () => {
    installStorage();
    render(<App initialSaved={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Règles du jeu' }));
    });
    expect(screen.getByText('Règles et aide-mémoire')).toBeTruthy();
    expect(screen.getByText('Les enchères')).toBeTruthy();
    expect(screen.getByText(/base = 25/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    });
    expect(screen.getByText('Nouvelle partie')).toBeTruthy();
  });

  it('deals a hand and hands the seat a set of legal cards', async () => {
    installStorage();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A pinned seed, so this deals the same three-handed hand every run.
    render(
      <App
        initialSaved={null}
        initialConfig={{ playerCount: 3, level: 'debutant', name: 'Moi', seed: 20260914 }}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Bid, decline the chelem, and take whatever the table offers until it is
    // our turn to play a card.
    for (let i = 0; i < 60; i++) {
      if (legalCards().length > 0) break;
      // A passed-out deal is redealt rather than played.
      if (await clickIfPresent(/^Donne suivante$/)) continue;
      if (await clickIfPresent(/^Passe$/)) continue;
      if (await clickIfPresent(/^Non$/)) continue;
      if (await clickIfPresent(/^Non merci$/)) continue;
      if (await clickIfPresent(/^Écart automatique$/)) {
        await clickIfPresent(/^Valider/);
        continue;
      }
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
    }

    expect(legalCards().length).toBeGreaterThan(0);
    // 24 cards each at three players.
    expect(document.querySelectorAll('.hand-card')).toHaveLength(24);
    vi.useRealTimers();
  }, 30_000);

  it('offers to pick up a session that was interrupted', async () => {
    installStorage();
    const saved = {
      config: { playerCount: 4 as const, level: 'debutant' as const, name: 'Moi', seed: 11 },
      session: {
        ...newSession({
          id: 's',
          playerCount: 4,
          seats: [
            { seat: 0, name: 'Moi', kind: 'human' as const, connected: true, awaitingReturn: false, standIn: false },
            { seat: 1, name: 'B1', kind: 'bot' as const, connected: true, awaitingReturn: false, standIn: false },
            { seat: 2, name: 'B2', kind: 'bot' as const, connected: true, awaitingReturn: false, standIn: false },
            { seat: 3, name: 'B3', kind: 'bot' as const, connected: true, awaitingReturn: false, standIn: false },
          ],
          dealer: 1,
        }),
        totals: [30, -10, -10, -10],
        handsDealt: 3,
        hands: [
          {
            index: 0,
            dealer: 0,
            result: { deltas: [30, -10, -10, -10] } as never,
            totalsAfter: [30, -10, -10, -10],
          },
        ],
      },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App initialSaved={saved} />);
    expect(screen.getByText(/3 donnes jouées/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reprendre la partie' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    // The scoreboard carried over; the cards did not.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    });
    await waitFor(() => expect(screen.getByTestId('scoreboard')).toBeTruthy());
    expect(screen.getByTestId('scoreboard').textContent).toContain('+30');
    vi.useRealTimers();
  }, 30_000);

  it('throws away a saved session when asked', async () => {
    const store = installStorage();
    store.setItem('tarot.session.v1', 'anything');
    const saved = {
      config: { playerCount: 4 as const, level: 'normal' as const, name: 'Moi', seed: 1 },
      session: newSession({ id: 's', playerCount: 4, seats: [], dealer: 0 }),
    };
    render(<App initialSaved={saved} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    });
    expect(screen.queryByRole('button', { name: 'Reprendre la partie' })).toBeNull();
    expect(store.getItem('tarot.session.v1')).toBeNull();
  });
});
