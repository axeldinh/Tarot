import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { NearbyPlugin, SeatInfo, SessionSnapshot } from '@tarot/net';
import { newSession } from '@tarot/net';
import { App } from '../src/App.tsx';
import { LobbyScreen } from '../src/screens/LobbyScreen.tsx';
import { TablePlayScreen } from '../src/screens/TablePlayScreen.tsx';
import { SeatList } from '../src/components/SeatList.tsx';
import { I18nContext, fr } from '../src/i18n/index.ts';
import { installStorage } from './setup.ts';
import { FakeRadio } from '../../net/test/fake-nearby.ts';
import { FakeRelay } from '../../net/test/fake-relay.ts';

afterEach(cleanup);

const withFrench = (node: React.ReactNode) => (
  <I18nContext.Provider value={{ lang: 'fr', t: fr, setLang: () => {} }}>{node}</I18nContext.Provider>
);

function seat(over: Partial<SeatInfo> & { seat: number }): SeatInfo {
  return {
    name: `Joueur ${over.seat + 1}`,
    kind: 'human',
    connected: false,
    awaitingReturn: false,
    standIn: false,
    ...over,
  };
}

describe('the seat list', () => {
  it('says what each chair is doing', () => {
    const seats: SeatInfo[] = [
      seat({ seat: 0, name: 'Ana', connected: true }),
      seat({ seat: 1, name: 'Ben', awaitingReturn: true }),
      seat({ seat: 2, name: 'Cam', standIn: true }),
      seat({ seat: 3, kind: 'bot', level: 'confirme', connected: true }),
    ];
    render(withFrench(<SeatList seats={seats} self={0} canArrange={false} />));
    const list = screen.getByTestId('seat-list');
    expect(list.textContent).toContain('Ana');
    expect(list.textContent).toContain('vous');
    expect(list.textContent).toContain('Reconnexion');
    expect(list.textContent).toContain('robot remplaçant');
    expect(list.textContent).toContain('Confirmé');
  });

  it('shows an empty chair as free', () => {
    render(withFrench(<SeatList seats={[seat({ seat: 0 })]} self={null} canArrange={false} />));
    expect(screen.getByTestId('seat-list').textContent).toContain('Place libre');
  });

  it('only offers the arranging buttons to the device running the table', () => {
    const seats = [seat({ seat: 0 }), seat({ seat: 1, kind: 'bot', connected: true })];
    const onSetSeat = vi.fn();
    const { rerender } = render(
      withFrench(<SeatList seats={seats} self={null} canArrange={false} onSetSeat={onSetSeat} />),
    );
    expect(screen.queryByRole('button', { name: 'Mettre un robot' })).toBeNull();

    rerender(
      withFrench(<SeatList seats={seats} self={null} canArrange onSetSeat={onSetSeat} />),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mettre un robot' }));
    expect(onSetSeat).toHaveBeenCalledWith(0, 'bot', 'normal');
    fireEvent.click(screen.getByRole('button', { name: 'Libérer la place' }));
    expect(onSetSeat).toHaveBeenCalledWith(1, 'human');
  });
});

describe('the lobby', () => {
  function session(seats: SeatInfo[]): SessionSnapshot {
    return { ...newSession({ id: 't', playerCount: 4, seats, dealer: 0 }), seats };
  }

  it('holds the deal until every chair is filled', () => {
    const onStart = vi.fn();
    const waiting = session([
      seat({ seat: 0, name: 'Ana', connected: true }),
      seat({ seat: 1 }),
      seat({ seat: 2, kind: 'bot', connected: true }),
      seat({ seat: 3, kind: 'bot', connected: true }),
    ]);
    const { rerender } = render(
      withFrench(
        <LobbyScreen
          session={waiting}
          self={0}
          isOwner
          onSetSeat={() => {}}
          onStart={onStart}
          onLeave={() => {}}
          rejection={null}
        />,
      ),
    );
    expect(screen.getByText(/En attente des joueurs/)).toBeTruthy();
    const deal = screen.getByRole('button', { name: 'Distribuer' });
    expect(deal.hasAttribute('disabled')).toBe(true);

    const full = session(waiting.seats.map((s) => ({ ...s, connected: true })));
    rerender(
      withFrench(
        <LobbyScreen
          session={full}
          self={0}
          isOwner
          onSetSeat={() => {}}
          onStart={onStart}
          onLeave={() => {}}
          rejection={null}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Distribuer' }));
    expect(onStart).toHaveBeenCalled();
  });

  it('offers the deal button only to the device running the table', () => {
    const onLeave = vi.fn();
    render(
      withFrench(
        <LobbyScreen
          session={session([seat({ seat: 0, connected: true })])}
          self={0}
          isOwner={false}
          onSetSeat={() => {}}
          onStart={() => {}}
          onLeave={onLeave}
          rejection="Seul l'appareil qui tient la table peut faire cela"
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: 'Distribuer' })).toBeNull();
    expect(screen.getByText(/Seul l'appareil/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitter la tablée' }));
    expect(onLeave).toHaveBeenCalled();
  });
});

describe('starting table play', () => {
  it('says plainly that a browser cannot do it', async () => {
    installStorage();
    render(<App initialSaved={null} nearby={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    expect(screen.getByText(/application Android/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    });
    expect(screen.getByText('Nouvelle partie')).toBeTruthy();
  });

  it('explains why it wants Bluetooth, and copes with being told no', async () => {
    installStorage();
    const radio = new FakeRadio();
    const device = radio.device('phone');
    device.granted = false;
    render(<App initialSaved={null} nearby={device as unknown as NearbyPlugin} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    await waitFor(() => expect(screen.getByText(/Bluetooth et le Wi-Fi/)).toBeTruthy());
    expect(screen.getByText(/seul le jeu en solo est possible/)).toBeTruthy();

    // Say yes on the second attempt.
    device.granted = true;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Autoriser' }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer une tablée' })).toBeTruthy());
  });

  it('hosts a table, seats the players who join, and deals', async () => {
    installStorage();
    const radio = new FakeRadio();
    const phone = radio.device('phone');
    render(<App initialSaved={null} nearby={phone as unknown as NearbyPlugin} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    await waitFor(() => screen.getByRole('button', { name: 'Créer une tablée' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer une tablée' }));
    });
    // Three seats, so the test only needs two more phones.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '3' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer une tablée' }));
    });

    // The lobby comes up, waiting for the other two.
    await waitFor(() => expect(screen.getByText('Salon')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Distribuer' }).hasAttribute('disabled')).toBe(true);

    // Two more phones find the table and sit down.
    const { joinTable } = await import('../src/state/useTableGame.ts');
    const { discoverTables } = await import('@tarot/net');
    const guests: Awaited<ReturnType<typeof joinTable>>[] = [];
    for (const [i, name] of ['Ben', 'Cam'].entries()) {
      const guestDevice = radio.device(`guest-${i}`);
      let found: Awaited<ReturnType<typeof discoverTables>> | null = null;
      const tables: { endpoint: string }[] = [];
      found = await discoverTables(guestDevice as unknown as NearbyPlugin, (list) => {
        tables.length = 0;
        tables.push(...list);
      });
      await found();
      expect(tables).toHaveLength(1);
      await act(async () => {
        guests.push(
          await joinTable({
            plugin: guestDevice as unknown as NearbyPlugin,
            table: tables[0] as never,
            yourName: name,
          }),
        );
      });
    }

    await waitFor(() =>
      expect(within(screen.getByTestId('seat-list')).getByText('Ben')).toBeTruthy(),
    );
    const deal = screen.getByRole('button', { name: 'Distribuer' });
    expect(deal.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      fireEvent.click(deal);
    });
    // Everybody has cards, and this device is playing.
    await waitFor(() => expect(document.querySelectorAll('.hand-card').length).toBe(24));
    for (const guest of guests) {
      expect(guest.client.getState().view?.hand).toHaveLength(24);
    }
    // Nobody can take a card back at a real table.
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    for (const guest of guests) guest.close();
  }, 30_000);

  it('lists the tables it can see and joins one', async () => {
    installStorage();
    const radio = new FakeRadio();
    const { hostTable } = await import('../src/state/useTableGame.ts');
    const hostDevice = radio.device('table');
    const hosted = await hostTable({
      plugin: hostDevice as unknown as NearbyPlugin,
      playerCount: 3,
      tableName: 'Chez Ana',
      yourName: 'Ana',
      level: 'debutant',
      seed: 7,
    });

    const phone = radio.device('phone');
    render(<App initialSaved={null} nearby={phone as unknown as NearbyPlugin} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    await waitFor(() => screen.getByRole('button', { name: 'Rejoindre une tablée' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rejoindre une tablée' }));
    });

    await waitFor(() => expect(screen.getByText('Chez Ana')).toBeTruthy());
    expect(screen.getByTestId('nearby-tables').textContent).toContain('places libres');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));
    });
    await waitFor(() => expect(screen.getByText('Salon')).toBeTruthy());
    // A guest gets no deal button.
    expect(screen.queryByRole('button', { name: 'Distribuer' })).toBeNull();
    hosted.close();
  }, 30_000);
});

describe('starting table play online', () => {
  it('hosts a table over the relay, seats the players who type in the code, and deals', async () => {
    installStorage();
    const relay = new FakeRelay();
    render(
      <App
        initialSaved={null}
        nearby={null}
        relayUrl={relay.url}
        relaySocketFactory={relay.factory}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    await waitFor(() => screen.getByRole('button', { name: 'Créer une tablée' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer une tablée' }));
    });
    // Three seats, so the test only needs two more browsers.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '3' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Créer une tablée' }));
    });

    await waitFor(() => expect(screen.getByText('Salon')).toBeTruthy());
    const code = screen.getByTestId('table-code').textContent as string;
    expect(code).toHaveLength(6);

    const { joinOnlineTable } = await import('../src/state/useTableGame.ts');
    const guests: Awaited<ReturnType<typeof joinOnlineTable>>[] = [];
    for (const name of ['Ben', 'Cam']) {
      await act(async () => {
        guests.push(
          await joinOnlineTable({
            relayUrl: relay.url,
            code,
            yourName: name,
            socketFactory: relay.factory,
          }),
        );
      });
    }

    await waitFor(() =>
      expect(within(screen.getByTestId('seat-list')).getByText('Ben')).toBeTruthy(),
    );
    const deal = screen.getByRole('button', { name: 'Distribuer' });
    expect(deal.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      fireEvent.click(deal);
    });
    await waitFor(() => expect(document.querySelectorAll('.hand-card').length).toBe(24));
    for (const guest of guests) {
      expect(guest.client.getState().view?.hand).toHaveLength(24);
      guest.close();
    }
  }, 30_000);

  it('joins a table over the relay by typing in its code', async () => {
    installStorage();
    const relay = new FakeRelay();
    const { hostOnlineTable } = await import('../src/state/useTableGame.ts');
    const hosted = await hostOnlineTable({
      relayUrl: relay.url,
      playerCount: 3,
      tableName: 'Chez Ana',
      yourName: 'Ana',
      level: 'debutant',
      seed: 7,
      socketFactory: relay.factory,
    });
    const code = hosted.server?.host.getSession().id as string;

    render(
      <App
        initialSaved={null}
        nearby={null}
        relayUrl={relay.url}
        relaySocketFactory={relay.factory}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    await waitFor(() => screen.getByRole('button', { name: 'Rejoindre une tablée' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rejoindre une tablée' }));
    });

    fireEvent.change(screen.getByLabelText('Code de la tablée'), { target: { value: code } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));
    });

    await waitFor(() => expect(screen.getByText('Salon')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Distribuer' })).toBeNull();
    hosted.close();
  });

  it('gives up and says so if nobody is behind the code', async () => {
    const relay = new FakeRelay();
    const { joinOnlineTable } = await import('../src/state/useTableGame.ts');
    await expect(
      joinOnlineTable({
        relayUrl: relay.url,
        code: 'zzzzzz',
        yourName: 'Ana',
        timeoutMs: 20,
        socketFactory: relay.factory,
      }),
    ).rejects.toThrow();
  });

  it('shows the error the app surfaces for a code nobody is behind', () => {
    render(
      withFrench(
        <TablePlayScreen
          plugin={null}
          relayUrl="https://relay.test"
          yourName="Ana"
          onChoose={() => {}}
          onBack={() => {}}
          joinError="Aucune tablée avec ce code. Vérifiez le code et réessayez."
          onDismissJoinError={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre une tablée' }));
    expect(screen.getByText(/Aucune tablée avec ce code/)).toBeTruthy();
  });

  it('says plainly that a browser with no relay configured cannot do it either', async () => {
    installStorage();
    render(<App initialSaved={null} nearby={null} relayUrl={null} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Jouer en tablée' }));
    });
    expect(screen.getByText(/ni via un relais en ligne/)).toBeTruthy();
  });
});
