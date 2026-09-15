import { describe, expect, it } from 'vitest';
import { makeBot } from '@tarot/bots';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  RelayTransport,
  TableClient,
  TableServer,
  generateTableCode,
  type SessionSnapshot,
} from '../src/index.ts';
import { FakeRelay } from './fake-relay.ts';
import { manualSchedule, tableSeats, tokenSource } from './helpers.ts';

describe('a table code', () => {
  it('is short, lower-case, and free of characters people mix up', () => {
    const code = generateTableCode();
    expect(code).toHaveLength(CODE_LENGTH);
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
    expect(code).not.toMatch(/[0o1lI]/);
  });

  it("doesn't hand out the same code every time", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateTableCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('a table over the relay', () => {
  /** The host device's transport and the server sitting behind it. */
  async function relayTable(humans: number, code = 'abc123') {
    const relay = new FakeRelay();
    const clock = manualSchedule();
    const hostTransport = await RelayTransport.host({
      url: relay.url,
      code,
      socketFactory: relay.factory,
    });
    const server = new TableServer(hostTransport, {
      playerCount: 4,
      seats: tableSeats(4, humans),
      seed: 909,
      dealer: 3,
      botDelayMs: 0,
      schedule: clock.schedule,
      start: 'manual',
      reconnectGraceMs: 30_000,
      standInLevel: 'debutant',
      makeToken: tokenSource(),
    });
    return { relay, clock, server, hostTransport, code };
  }

  async function joinAs(relay: FakeRelay, code: string, name: string, token?: string) {
    const transport = await RelayTransport.join({ url: relay.url, code, socketFactory: relay.factory });
    const client = new TableClient(transport, { name, ...(token ? { token } : {}) });
    return { transport, client };
  }

  it('carries a whole hand between four browsers', async () => {
    const { relay, server, code } = await relayTable(4);
    const players = [];
    for (const name of ['Ana', 'Ben', 'Cam', 'Dee']) {
      players.push(await joinAs(relay, code, name));
    }
    players[0]?.client.start();
    expect(server.host.getSession().phase).toBe('playing');

    const brains = players.map((_, i) => makeBot('debutant', { seed: 3 + i * 5 }));
    for (let step = 0; step < 500; step++) {
      const turn = players.findIndex(({ client }) => {
        const view = client.getState().view;
        return (
          view !== null &&
          view.currentPlayer === view.self &&
          view.phase !== 'done' &&
          view.phase !== 'passed'
        );
      });
      if (turn < 0) break;
      const { client } = players[turn] as { client: TableClient };
      const view = client.getState().view as NonNullable<ReturnType<TableClient['getState']>['view']>;
      client.play((brains[turn] as ReturnType<typeof makeBot>).decide(view));
    }

    const session = (players[0] as { client: TableClient }).client.getState().session as SessionSnapshot;
    expect(session.hands).toHaveLength(1);
    expect(session.totals.reduce((a, b) => a + b, 0)).toBe(0);
    // Nobody was ever sent anyone else's cards.
    const hands = players.map((p) => p.client.getState().view?.hand ?? []);
    expect(hands.every((h) => h.length === 0)).toBe(true);
  });

  it('never needs to learn who the host actually is: the relay resolves that', async () => {
    const { relay, server, code } = await relayTable(1);
    const ana = await joinAs(relay, code, 'Ana');
    ana.client.start();
    expect(server.host.getSession().phase).toBe('playing');
  });

  it('gives a seat back to a tab that reconnects with its token', async () => {
    const { relay, server, clock, code } = await relayTable(2);
    const ana = await joinAs(relay, code, 'Ana');
    await joinAs(relay, code, 'Ben');
    ana.client.start();
    const token = ana.client.getState().token as string;
    expect(token).toBe('token-0');

    ana.transport.close();
    expect(server.host.getSession().seats[0]).toMatchObject({
      connected: false,
      awaitingReturn: true,
    });

    // A reconnect is a brand new socket, with a brand new relay-assigned id.
    const again = await joinAs(relay, code, 'Ana', token);
    expect(again.client.getState().seat).toBe(0);
    expect(server.host.getSession().seats[0]).toMatchObject({
      connected: true,
      awaitingReturn: false,
      standIn: false,
    });
    clock.flush();
    expect(server.host.getSession().seats[0]?.standIn).toBe(false);
  });

  it('plays a seat out with a bot if the tab never comes back', async () => {
    const { relay, server, clock, code } = await relayTable(1);
    const ana = await joinAs(relay, code, 'Ana');
    ana.client.start();
    expect(server.host.handOver).toBe(false);

    ana.transport.close();
    clock.flush();
    expect(server.host.handOver).toBe(true);
    expect(server.host.getSession().seats[0]?.standIn).toBe(true);
  });

  it('survives a garbled frame rather than taking the table down', async () => {
    const { relay, code } = await relayTable(1);
    const ana = await joinAs(relay, code, 'Ana');
    const before = ana.client.getState();
    relay.lastSocket?.deliverRaw('{not json');
    expect(ana.client.getState()).toEqual(before);
  });

  it("resolves 'host' to whoever holds the seat, without the client tracking it", async () => {
    const { relay, code } = await relayTable(1);
    const guest = await joinAs(relay, code, 'Ana');

    // A second connection claiming the host role replaces the first, the way
    // a reloaded tab would.
    const secondHost = await RelayTransport.host({ url: relay.url, code, socketFactory: relay.factory });
    const heard: unknown[] = [];
    secondHost.on('message', (_from, message) => heard.push(message));

    guest.transport.send('host', { type: 'leave' });
    expect(heard).toEqual([{ type: 'leave' }]);
  });

  it('rejects when the relay cannot be reached', async () => {
    const brokenFactory = () => {
      const socket = {
        readyState: 0,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null as (() => void) | null,
        send: () => {},
        close: () => {},
      };
      queueMicrotask(() => socket.onerror?.());
      return socket;
    };
    await expect(
      RelayTransport.join({ url: 'https://nowhere.test', code: 'abc123', socketFactory: brokenFactory }),
    ).rejects.toThrow();
  });

  it('marks itself closed if the socket errors out after connecting', async () => {
    const { relay, code } = await relayTable(1);
    const ana = await joinAs(relay, code, 'Ana');
    relay.lastSocket?.onerror?.();
    expect(() => ana.transport.send('host', { type: 'leave' })).not.toThrow();
  });

  it('drops a send to somebody who is no longer there, without throwing', async () => {
    const { relay, code } = await relayTable(2);
    const ana = await joinAs(relay, code, 'Ana');
    ana.transport.close();
    expect(() => ana.transport.send('host', { type: 'leave' })).not.toThrow();
  });
});
