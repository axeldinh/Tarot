import { describe, expect, it } from 'vitest';
import { Bid, type PlayerCount } from '@tarot/engine';
import { makeBot } from '@tarot/bots';
import {
  GameHost,
  LocalNetwork,
  TableClient,
  TableServer,
  type Rejection,
} from '../src/index.ts';
import { botSeats, manualSchedule, tableSeats, tokenSource } from './helpers.ts';

function lobby(options: { playerCount?: PlayerCount; humans?: number; grace?: number } = {}) {
  const playerCount = options.playerCount ?? 4;
  const clock = manualSchedule();
  const host = new GameHost({
    playerCount,
    seats: tableSeats(playerCount, options.humans ?? 2),
    seed: 4242,
    dealer: playerCount - 1,
    botDelayMs: 0,
    schedule: clock.schedule,
    start: 'manual',
    reconnectGraceMs: options.grace ?? 30_000,
    standInLevel: 'debutant',
    makeToken: tokenSource(),
  });
  return { host, clock };
}

describe('filling a table', () => {
  it('waits in the lobby until every seat has somebody', () => {
    const { host } = lobby();
    expect(host.started).toBe(false);
    expect(host.getSession().phase).toBe('lobby');
    expect(host.viewFor(0)).toBeNull();
    expect(host.advert()).toMatchObject({ playerCount: 4, freeSeats: 2, phase: 'lobby' });

    expect(host.start()).toMatchObject({ code: 'seats-empty' });

    expect(host.join({ name: 'Ana' })).toMatchObject({ seat: 0, token: 'token-0' });
    expect(host.start()).toMatchObject({ code: 'seats-empty' });
    expect(host.join({ name: 'Ben' })).toMatchObject({ seat: 1, token: 'token-1' });

    expect(host.advert().freeSeats).toBe(0);
    expect(host.start()).toBeNull();
    expect(host.started).toBe(true);
    expect(host.getSession().phase).toBe('playing');
    expect(host.viewFor(0)?.hand).toHaveLength(18);
  });

  it('seats people where they ask, or in the first free seat', () => {
    const { host } = lobby({ humans: 3 });
    expect(host.join({ name: 'Ana', seat: 2 })).toMatchObject({ seat: 2 });
    expect(host.join({ name: 'Ben' })).toMatchObject({ seat: 0 });
    expect(host.join({ name: 'Cam' })).toMatchObject({ seat: 1 });
    expect(host.getSession().seats.map((s) => s.name)).toEqual(['Ben', 'Cam', 'Ana', 'Bot 4']);
  });

  it('refuses a seat that is taken, and a table that is full', () => {
    const { host } = lobby({ humans: 1 });
    expect(host.join({ name: 'Ana', seat: 0 })).toMatchObject({ seat: 0 });
    expect(host.join({ name: 'Ben', seat: 0 })).toMatchObject({ code: 'seat-taken' });
    // Seat 1 is a bot, not an empty chair.
    expect(host.join({ name: 'Ben', seat: 1 })).toMatchObject({ code: 'seat-taken' });
    expect(host.join({ name: 'Ben' })).toMatchObject({ code: 'table-full' });
  });

  it('lets the table be rearranged before it starts, but not after', () => {
    const { host } = lobby({ humans: 2 });
    expect(host.setSeat(1, 'bot', 'normal')).toBeNull();
    expect(host.advert().freeSeats).toBe(1);
    expect(host.join({ name: 'Ana' })).toMatchObject({ seat: 0 });
    expect(host.start()).toBeNull();

    expect(host.setSeat(1, 'human')).toMatchObject({ code: 'already-started' });
    expect(host.start()).toMatchObject({ code: 'already-started' });
  });

  it('will not turn an occupied seat into a bot', () => {
    const { host } = lobby({ humans: 2 });
    host.join({ name: 'Ana', seat: 0 });
    expect(host.setSeat(0, 'bot')).toMatchObject({ code: 'seat-taken' });
    expect(host.setSeat(9, 'bot')).toMatchObject({ code: 'no-such-seat' });
  });

  it('gives up a seat that is left before the cards are out', () => {
    const { host } = lobby({ humans: 2 });
    host.join({ name: 'Ana', seat: 0 });
    expect(host.advert().freeSeats).toBe(1);
    host.leave(0);
    expect(host.advert().freeSeats).toBe(2);
    expect(host.join({ name: 'Ben', seat: 0 })).toMatchObject({ seat: 0 });
  });

  it('refuses to play before it has started', () => {
    const { host } = lobby();
    expect(host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass })).toMatchObject({
      code: 'not-started',
    });
    expect(host.nextHand()).toMatchObject({ code: 'not-started' });
  });
});

describe('a device that drops', () => {
  function started(grace = 30_000) {
    const { host, clock } = lobby({ humans: 1, grace });
    const joined = host.join({ name: 'Ana', seat: 0 }) as { seat: number; token: string };
    host.start();
    return { host, clock, token: joined.token };
  }

  it('holds the seat, and the table waits rather than plays on', () => {
    const { host, clock } = started();
    // Dealer is seat 3, so seat 0 is first to speak and the table is on them.
    expect(host.viewFor(0)?.currentPlayer).toBe(0);

    host.markAway(0);
    const seat = host.getSession().seats[0];
    expect(seat).toMatchObject({ connected: false, awaitingReturn: true, standIn: false });
    // Nothing has moved: it is still this seat's turn.
    expect(host.viewFor(0)?.currentPlayer).toBe(0);
    expect(host.handOver).toBe(false);
    expect(clock.pending()).toBe(1);
  });

  it('lets them back in with their token, and gives the seat straight back', () => {
    const { host, clock, token } = started();
    host.markAway(0);
    const back = host.join({ name: 'Ana', token });
    expect(back).toMatchObject({ seat: 0, token });
    expect(host.getSession().seats[0]).toMatchObject({
      connected: true,
      awaitingReturn: false,
      standIn: false,
    });

    // The abandoned timer must not fire later and hand the seat to a bot.
    clock.flush();
    expect(host.getSession().seats[0]?.standIn).toBe(false);
    expect(host.viewFor(0)?.currentPlayer).toBe(0);
  });

  it('hands the seat to a bot once the grace period runs out', () => {
    const { host, clock } = started();
    host.markAway(0);
    clock.flush();

    expect(host.getSession().seats[0]).toMatchObject({
      connected: false,
      awaitingReturn: false,
      standIn: true,
      // Still theirs: the seat keeps their name and their score.
      kind: 'human',
      name: 'Ana',
    });
    // And the hand is played out without them.
    expect(host.handOver).toBe(true);
    expect(host.getSession().totals.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('takes the seat back from the stand-in when they return', () => {
    const { host, clock, token } = started();
    host.markAway(0);
    clock.flush();
    expect(host.getSession().seats[0]?.standIn).toBe(true);

    host.join({ name: 'Ana', token });
    expect(host.getSession().seats[0]).toMatchObject({ standIn: false, connected: true });
  });

  it('treats an unknown token as a new arrival rather than an error', () => {
    const { host } = lobby({ humans: 1 });
    const result = host.join({ name: 'Ana', token: 'from-another-table' });
    expect(result).toMatchObject({ seat: 0 });
    expect((result as { token: string }).token).not.toBe('from-another-table');
  });

  it('will not let a seat vanish in the middle of a hand', () => {
    const { host, clock } = started();
    host.leave(0);
    // Leaving mid-hand is a disconnection, not an empty chair: somebody has to
    // play those cards.
    expect(host.getSession().seats[0]?.awaitingReturn).toBe(true);
    expect(host.advert().freeSeats).toBe(0);
    clock.flush();
    expect(host.handOver).toBe(true);
  });

  it('ignores a drop from a seat that is not a connected person', () => {
    const { host, clock } = started();
    host.markAway(1); // a bot
    expect(clock.pending()).toBe(0);
    host.markAway(0);
    host.markAway(0); // already away
    expect(clock.pending()).toBe(1);
    host.leave(9);
    expect(host.getSession().seats).toHaveLength(4);
  });
});

describe('a table over a transport', () => {
  function table(humans: number, playerCount: PlayerCount = 4) {
    const clock = manualSchedule();
    const network = new LocalNetwork();
    const server = new TableServer(network.host, {
      playerCount,
      seats: tableSeats(playerCount, humans),
      seed: 909,
      dealer: playerCount - 1,
      botDelayMs: 0,
      schedule: clock.schedule,
      start: 'manual',
      reconnectGraceMs: 30_000,
      standInLevel: 'debutant',
      makeToken: tokenSource(),
    });
    return { network, server, clock };
  }

  it('seats a client, tells it its token, and shows it the lobby', () => {
    const { network, server } = table(2);
    const ana = new TableClient(network.connect('ana'), { name: 'Ana' });
    expect(ana.getState()).toMatchObject({ seat: 0, token: 'token-0' });
    expect(ana.getState().session?.phase).toBe('lobby');
    expect(ana.getState().view).toBeNull();

    const ben = new TableClient(network.connect('ben'), { name: 'Ben' });
    expect(ben.seat).toBe(1);
    // Both are told about each other.
    expect(ana.getState().session?.seats.map((s) => s.name)).toEqual([
      'Ana',
      'Ben',
      'Bot 3',
      'Bot 4',
    ]);
    server.close();
  });

  it('only lets the device that created the table arrange it and start it', () => {
    const { network, server } = table(2);
    const ana = new TableClient(network.connect('ana'), { name: 'Ana' });
    const ben = new TableClient(network.connect('ben'), { name: 'Ben' });

    ben.start();
    expect(ben.getState().rejection).toMatchObject({ code: 'not-owner' });
    ben.setSeat(2, 'human');
    expect(ben.getState().rejection).toMatchObject({ code: 'not-owner' });

    ana.start();
    expect(ana.getState().rejection).toBeNull();
    expect(ana.getState().session?.phase).toBe('playing');
    expect(ana.getState().view?.hand).toHaveLength(18);
    expect(ben.getState().view?.hand).toHaveLength(18);
    server.close();
  });

  it('refuses to act for somebody who is not sitting down', () => {
    const { network, server } = table(2);
    const stranger = network.connect('stranger');
    const heard: unknown[] = [];
    stranger.on('message', (_f, m) => heard.push(m));
    stranger.send('host', { type: 'intent', action: { type: 'Bid', player: 0, bid: Bid.Pass } });
    expect(heard).toEqual([
      { type: 'rejected', code: 'not-seated', message: 'You are not sitting at this table' },
    ]);
    stranger.send('host', { type: 'undo' });
    stranger.send('host', { type: 'next-hand' });
    expect(heard).toHaveLength(3);
    // And leaving when you never sat down is simply nothing.
    stranger.send('host', { type: 'leave' });
    expect(heard).toHaveLength(3);
    server.close();
  });

  it('never lets a client see another seat s cards', () => {
    const { network, server } = table(4);
    const clients = ['a', 'b', 'c', 'd'].map(
      (id) => new TableClient(network.connect(id), { name: id.toUpperCase() }),
    );
    (clients[0] as TableClient).start();

    const hands = clients.map((c) => c.getState().view?.hand ?? []);
    for (let i = 0; i < hands.length; i++) {
      for (let j = 0; j < hands.length; j++) {
        if (i === j) continue;
        const mine = new Set(hands[i]);
        // Not one card in common: eighteen cards each, all different.
        expect((hands[j] as number[]).filter((c) => mine.has(c))).toEqual([]);
      }
      // And the view carries no field that could hold anyone else's cards.
      // (`session.hands` is the score history, not a hand of cards.)
      const view = clients[i]?.getState().view as object;
      expect(Object.keys(view)).not.toContain('hands');
      expect(Object.keys(view)).not.toContain('piles');
      expect(JSON.stringify(clients[i]?.getState().view)).not.toContain('"piles"');
    }
    server.close();
  });

  it('plays a whole hand with four people at four devices', () => {
    const { network, server, clock } = table(4);
    const clients = ['a', 'b', 'c', 'd'].map(
      (id) => new TableClient(network.connect(id), { name: id.toUpperCase() }),
    );
    (clients[0] as TableClient).start();
    void clock;

    // Each seat decides for itself, from its own view and nothing else.
    const brains = clients.map((_, i) => makeBot('debutant', { seed: 11 + i * 7 }));
    for (let step = 0; step < 500; step++) {
      const turn = clients.findIndex((c) => {
        const view = c.getState().view;
        return view !== null && view.currentPlayer === view.self && view.phase !== 'done' && view.phase !== 'passed';
      });
      if (turn < 0) break;
      const client = clients[turn] as TableClient;
      const view = client.getState().view as NonNullable<ReturnType<TableClient['getState']>['view']>;
      client.play((brains[turn] as ReturnType<typeof makeBot>).decide(view));
    }

    const session = (clients[0] as TableClient).getState().session;
    expect(session?.hands).toHaveLength(1);
    expect(session?.totals.reduce((a, b) => a + b, 0)).toBe(0);
    // Everybody sees the same scoreboard.
    for (const client of clients) {
      expect(client.getState().session?.totals).toEqual(session?.totals);
    }
    server.close();
  });

  it('holds a seat when its device drops, and gives it back on reconnect', () => {
    const { network, server, clock } = table(2);
    const anaLink = network.connect('ana');
    const ana = new TableClient(anaLink, { name: 'Ana' });
    new TableClient(network.connect('ben'), { name: 'Ben' });
    ana.start();
    const token = ana.getState().token as string;

    anaLink.close();
    expect(server.host.getSession().seats[0]).toMatchObject({
      connected: false,
      awaitingReturn: true,
    });

    // Back on a brand new endpoint, as a radio link would be.
    const again = new TableClient(network.connect('ana-2'), { name: 'Ana', token });
    expect(again.getState().seat).toBe(0);
    expect(server.host.getSession().seats[0]).toMatchObject({
      connected: true,
      awaitingReturn: false,
    });
    clock.flush();
    expect(server.host.getSession().seats[0]?.standIn).toBe(false);
    server.close();
  });

  it('plays a dropped seat out with a bot once its grace runs out', () => {
    const { network, server, clock } = table(1);
    const link = network.connect('ana');
    const ana = new TableClient(link, { name: 'Ana' });
    ana.start();
    expect(server.host.handOver).toBe(false);

    link.close();
    clock.flush();
    expect(server.host.handOver).toBe(true);
    expect(server.host.getSession().seats[0]?.standIn).toBe(true);
    server.close();
  });

  it.each([3, 4, 5] as PlayerCount[])('works at %i seats', (playerCount) => {
    const { network, server } = table(playerCount, playerCount);
    const clients = Array.from(
      { length: playerCount },
      (_, i) => new TableClient(network.connect(`p${i}`), { name: `P${i}` }),
    );
    (clients[0] as TableClient).start();
    expect(server.host.getSession().phase).toBe('playing');
    for (const client of clients) expect(client.getState().view).not.toBeNull();
    expect(new Set(clients.map((c) => c.seat)).size).toBe(playerCount);
    server.close();
  });
});

describe('a table of nothing but bots', () => {
  it('starts on its own and plays itself', () => {
    const clock = manualSchedule();
    const host = new GameHost({
      playerCount: 4,
      seats: botSeats(4),
      seed: 7,
      botDelayMs: 0,
      schedule: clock.schedule,
    });
    expect(host.started).toBe(true);
    expect(host.handOver).toBe(true);
    const rejection: Rejection | null = host.start();
    expect(rejection).toMatchObject({ code: 'already-started' });
  });
});
