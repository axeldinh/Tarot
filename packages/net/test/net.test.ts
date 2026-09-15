import { describe, expect, it, vi } from 'vitest';
import { Bid, LAYOUT, type Action, type PlayerCount, type PlayerView } from '@tarot/engine';
import { makeBot } from '@tarot/bots';
import {
  GameHost,
  LocalNetwork,
  TableClient,
  TableServer,
  createSoloGame,
  isSessionSnapshot,
  newSession,
  recordHand,
  type SeatSpec,
} from '../src/index.ts';

/** Run scheduled work straight away, so tests never wait on a bot. */
const immediate = (fn: () => void): void => fn();

/** The view for a seat at a table that has already been dealt. */
function seatView(host: GameHost, seat: number): PlayerView {
  const view = host.viewFor(seat);
  if (!view) throw new Error('the table has not been dealt');
  return view;
}

const botSeats = (n: number): SeatSpec[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Bot ${i}`, kind: 'bot' as const, level: 'debutant' as const }));

/** Seat 0 is a person already sitting down; the rest are bots. */
function soloSeats(n: number): SeatSpec[] {
  const seats = botSeats(n);
  seats[0] = { name: 'Moi', kind: 'human' };
  return seats;
}

describe('the local transport', () => {
  it('carries messages between the host and its clients', () => {
    const network = new LocalNetwork();
    const fromHost: unknown[] = [];
    const fromClient: unknown[] = [];
    const client = network.connect('a');
    client.on('message', (_from, m) => fromHost.push(m));
    network.host.on('message', (_from, m) => fromClient.push(m));

    network.host.send('a', { hello: 1 });
    client.send('host', { hi: 2 });
    expect(fromHost).toEqual([{ hello: 1 }]);
    expect(fromClient).toEqual([{ hi: 2 }]);
    expect(client.role).toBe('client');
    expect(network.host.role).toBe('host');
  });

  it('copies messages instead of sharing them', () => {
    const network = new LocalNetwork();
    const received: { list: number[] }[] = [];
    const client = network.connect('a');
    client.on('message', (_f, m) => received.push(m as { list: number[] }));
    const sent = { list: [1] };
    network.host.send('a', sent);
    sent.list.push(2);
    expect(received[0]?.list).toEqual([1]);
  });

  it('broadcasts to everyone but the sender', () => {
    const network = new LocalNetwork();
    const a: unknown[] = [];
    const b: unknown[] = [];
    network.connect('a').on('message', (_f, m) => a.push(m));
    network.connect('b').on('message', (_f, m) => b.push(m));
    network.host.send('all', 'ping');
    expect(a).toEqual(['ping']);
    expect(b).toEqual(['ping']);
  });

  it('tells the table when somebody joins or leaves', () => {
    const network = new LocalNetwork();
    const joined: string[] = [];
    const left: string[] = [];
    network.host.on('peer-joined', (p) => joined.push(p));
    network.host.on('peer-left', (p) => left.push(p));
    const a = network.connect('a');
    network.connect('b');
    a.close();
    expect(joined).toEqual(['a', 'b']);
    expect(left).toEqual(['a']);
    // Closing twice, and sending after closing, are both no-ops.
    a.close();
    a.send('host', 'ignored');
    expect(left).toEqual(['a']);
  });

  it('stops delivering to a handler that unsubscribed', () => {
    const network = new LocalNetwork();
    const seen: unknown[] = [];
    const client = network.connect('a');
    const off = client.on('message', (_f, m) => seen.push(m));
    network.host.send('a', 1);
    off();
    network.host.send('a', 2);
    network.host.send('nobody', 3);
    expect(seen).toEqual([1]);
  });
});

describe('the session scoreboard', () => {
  it('starts at nothing and stays zero-sum', () => {
    let session = newSession({
      id: 's1',
      playerCount: 4,
      seats: soloSeats(4).map((s, seat) => ({
        ...s,
        seat,
        connected: true,
        awaitingReturn: false,
        standIn: false,
      })),
      dealer: 0,
    });
    expect(session.totals).toEqual([0, 0, 0, 0]);

    session = recordHand(session, { deltas: [90, -30, -30, -30] } as never, 0);
    session = recordHand(session, { deltas: [-20, 60, -20, -20] } as never, 1);
    expect(session.totals).toEqual([70, 30, -50, -50]);
    expect(session.totals.reduce((a, b) => a + b, 0)).toBe(0);
    expect(session.handsDealt).toBe(2);
    expect(session.hands[1]?.totalsAfter).toEqual([70, 30, -50, -50]);
  });

  it('counts a passed-out deal without moving the score', () => {
    let session = newSession({ id: 's', playerCount: 3, seats: [], dealer: 2 });
    session = recordHand(session, null, 2);
    expect(session.totals).toEqual([0, 0, 0]);
    expect(session.hands[0]?.result).toBeNull();
    expect(session.handsDealt).toBe(1);
  });

  it('recognises a session read back from storage, and rejects rubbish', () => {
    const session = newSession({ id: 's', playerCount: 4, seats: [], dealer: 0 });
    expect(isSessionSnapshot(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(isSessionSnapshot(null)).toBe(false);
    expect(isSessionSnapshot('nope')).toBe(false);
    expect(isSessionSnapshot({ ...session, totals: [1] })).toBe(false);
  });
});

describe('the host', () => {
  it('plays a whole table of bots through to a result', () => {
    const host = new GameHost({
      playerCount: 4,
      seats: botSeats(4),
      seed: 12,
      botDelayMs: 0,
      schedule: immediate,
    });
    expect(host.handOver).toBe(true);
    const session = host.getSession();
    expect(session.hands).toHaveLength(1);
    expect(session.totals.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it.each([3, 4, 5] as PlayerCount[])('deals and rotates at %i players', (playerCount) => {
    const host = new GameHost({
      playerCount,
      seats: botSeats(playerCount),
      seed: 5,
      dealer: 0,
      botDelayMs: 0,
      schedule: immediate,
    });
    for (let i = 0; i < 4; i++) {
      expect(host.handOver).toBe(true);
      expect(host.getSession().dealer).toBe(i % playerCount);
      expect(host.nextHand()).toBeNull();
    }
    const session = host.getSession();
    expect(session.handsDealt).toBe(5);
    expect(session.totals.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('waits for the human and refuses to deal over a live hand', () => {
    const host = new GameHost({
      playerCount: 4,
      seats: soloSeats(4),
      seed: 3,
      dealer: 3,
      botDelayMs: 0,
      schedule: immediate,
    });
    expect(host.handOver).toBe(false);
    expect(seatView(host, 0).currentPlayer).toBe(0);
    expect(host.nextHand()).toMatchObject({ code: 'hand-in-progress' });
  });

  it('lets a seat act only for itself, and only legally', () => {
    const host = new GameHost({
      playerCount: 4,
      seats: soloSeats(4),
      seed: 3,
      dealer: 3,
      botDelayMs: 0,
      schedule: immediate,
    });
    expect(host.submit(1, { type: 'Bid', player: 0, bid: Bid.Petite })).toMatchObject({
      code: 'wrong-seat',
    });
    expect(host.submit(0, { type: 'PlayCard', player: 0, card: 0 })).toMatchObject({
      code: 'wrong-phase',
    });
    expect(host.submit(0, { type: 'Bid', player: 0, bid: Bid.Pass })).toBeNull();
  });

  it('never hands out anything but a view', () => {
    const host = new GameHost({
      playerCount: 5,
      seats: soloSeats(5),
      seed: 8,
      dealer: 4,
      botDelayMs: 0,
      schedule: immediate,
    });
    const view: PlayerView = seatView(host, 0);
    expect(Object.keys(view)).not.toContain('hands');
    expect(Object.keys(view)).not.toContain('piles');
    expect(view.hand).toHaveLength(LAYOUT[5].cardsPerPlayer);
  });

  it('stands a bot up for a seat whose device has dropped', () => {
    const host = new GameHost({
      playerCount: 4,
      seats: soloSeats(4),
      seed: 3,
      dealer: 3,
      botDelayMs: 0,
      // `immediate` runs the grace timer at once, so the seat is given up
      // straight away; the waiting itself is covered in table.test.ts.
      schedule: immediate,
      reconnectGraceMs: 1,
    });
    expect(host.handOver).toBe(false);
    host.markAway(0);
    // With nobody left to wait for, the hand runs to the end on its own.
    expect(host.handOver).toBe(true);
    expect(host.getSession().seats[0]?.standIn).toBe(true);
  });
});

describe('taking a card back', () => {
  function soloHost(allowUndo: boolean): GameHost {
    return new GameHost({
      playerCount: 4,
      seats: soloSeats(4),
      seed: 21,
      dealer: 3,
      allowUndo,
      botDelayMs: 0,
      schedule: immediate,
    });
  }

  function reachPlay(host: GameHost): void {
    const bot = makeBot('debutant', { seed: 1 });
    let guard = 0;
    while (!host.handOver && seatView(host, 0).phase !== 'playing' && guard++ < 50) {
      const view = seatView(host, 0);
      if (view.currentPlayer !== 0) break;
      host.submit(0, bot.decide(view));
    }
  }

  it('rewinds the human s last card and everything the bots played after it', () => {
    const host = soloHost(true);
    reachPlay(host);
    const view = seatView(host, 0);
    expect(view.phase).toBe('playing');
    expect(host.canUndo).toBe(false);

    const before = seatView(host, 0);
    const card = before.hand[0] as number;
    // Only act when it is actually our turn to play.
    if (before.currentPlayer !== 0) return;
    expect(host.submit(0, { type: 'PlayCard', player: 0, card } as Action)).toBeNull();
    expect(host.canUndo).toBe(true);
    expect(seatView(host, 0).hand).not.toContain(card);

    expect(host.undo(0)).toBeNull();
    const after = seatView(host, 0);
    expect(after.hand).toContain(card);
    expect(after.currentPlayer).toBe(0);
    expect(after.tricks).toEqual(before.tricks);
    expect(host.canUndo).toBe(false);
    expect(host.undo(0)).toMatchObject({ code: 'nothing-to-undo' });
  });

  it('is refused outright when the table did not allow it', () => {
    const host = soloHost(false);
    expect(host.canUndo).toBe(false);
    expect(host.undo(0)).toMatchObject({ code: 'no-undo' });
  });
});

describe('a seat talking to the host over a transport', () => {
  it('gets its own view and the scoreboard, and can act', () => {
    const network = new LocalNetwork();
    const server = new TableServer(network.host, {
      playerCount: 4,
      seats: [{ name: 'Moi', kind: 'human', open: true }, ...botSeats(3)],
      seed: 3,
      dealer: 3,
      botDelayMs: 0,
      schedule: immediate,
      start: 'manual',
    });
    const client = new TableClient(network.connect('seat-0'), { name: 'Moi', seat: 0 });
    const seen = vi.fn();
    client.subscribe(seen);
    client.start();

    const state = client.getState();
    expect(state.seat).toBe(0);
    expect(state.view?.self).toBe(0);
    expect(state.session?.totals).toEqual([0, 0, 0, 0]);
    expect(state.view?.phase).toBe('bidding');

    client.play({ type: 'Bid', player: 0, bid: Bid.Pass });
    expect(seen).toHaveBeenCalled();
    expect(client.getState().view?.bids[0]).toBe(Bid.Pass);
    server.close();
  });

  it('is told why the host refused something, and can clear the message', () => {
    const network = new LocalNetwork();
    new TableServer(network.host, {
      playerCount: 4,
      seats: [{ name: 'Moi', kind: 'human', open: true }, ...botSeats(3)],
      seed: 3,
      dealer: 3,
      botDelayMs: 0,
      schedule: immediate,
      start: 'manual',
    });
    const client = new TableClient(network.connect('seat-0'), { name: 'Moi' });
    client.start();
    client.play({ type: 'PlayCard', player: 0, card: 0 });
    expect(client.getState().rejection).toMatchObject({ code: 'wrong-phase' });
    client.dismissRejection();
    expect(client.getState().rejection).toBeNull();
    client.dismissRejection();
    expect(client.getState().rejection).toBeNull();
  });

  it('has a bot take the seat over when the device goes away', () => {
    const network = new LocalNetwork();
    const server = new TableServer(network.host, {
      playerCount: 4,
      seats: [{ name: 'Moi', kind: 'human', open: true }, ...botSeats(3)],
      seed: 3,
      dealer: 3,
      botDelayMs: 0,
      schedule: immediate,
      reconnectGraceMs: 1,
      start: 'manual',
    });
    const transport = network.connect('seat-0');
    const client = new TableClient(transport, { name: 'Moi' });
    client.start();
    expect(server.host.handOver).toBe(false);
    client.close();
    expect(server.host.handOver).toBe(true);
  });
});

describe('a solo game', () => {
  it('plays out through the same host, protocol and client as a real table', () => {
    const game = createSoloGame({
      playerCount: 4,
      level: 'debutant',
      names: ['Moi', 'Nord', 'Est', 'Sud'],
      seed: 99,
      dealer: 3,
      botDelayMs: 0,
      schedule: immediate,
    });
    const bot = makeBot('debutant', { seed: 2 });

    let guard = 0;
    for (;;) {
      const { view } = game.client.getState();
      if (!view || view.phase === 'done' || view.phase === 'passed') break;
      if (guard++ > 400) throw new Error(`stuck in ${view.phase}`);
      if (view.currentPlayer !== 0) throw new Error('the bots should have moved');
      game.client.play(bot.decide(view));
    }

    const { view, session } = game.client.getState();
    expect(view?.phase === 'done' || view?.phase === 'passed').toBe(true);
    expect(session?.hands).toHaveLength(1);
    expect(session?.totals.reduce((a, b) => a + b, 0)).toBe(0);

    game.client.nextHand();
    expect(game.client.getState().view?.phase).not.toBe('done');
    expect(game.client.getState().session?.dealer).toBe(0);
    game.close();
  });

  it('names the seats and marks who is a bot', () => {
    const game = createSoloGame({
      playerCount: 5,
      seat: 2,
      level: 'normal',
      names: ['A', 'B', 'C'],
      seed: 1,
      botDelayMs: 0,
      schedule: immediate,
    });
    const seats = game.client.getState().session?.seats ?? [];
    expect(seats.map((s) => s.kind)).toEqual(['bot', 'bot', 'human', 'bot', 'bot']);
    expect(seats.map((s) => s.name)).toEqual(['A', 'B', 'C', 'Joueur 4', 'Joueur 5']);
    expect(seats[0]?.level).toBe('normal');
    game.close();
  });

  it('deals even when the player is not sitting in seat zero', () => {
    // The solo device runs the table, wherever its player happens to sit; an
    // owner check that assumed seat 0 would leave this game stuck in the lobby.
    for (const seat of [0, 1, 2, 3]) {
      const game = createSoloGame({
        playerCount: 4,
        seat,
        level: 'debutant',
        names: [],
        seed: 5,
        dealer: 3,
        botDelayMs: 0,
        schedule: immediate,
      });
      const state = game.client.getState();
      expect(state.seat).toBe(seat);
      expect(state.session?.phase).toBe('playing');
      expect(state.view).not.toBeNull();
      expect(state.rejection).toBeNull();
      game.close();
    }
  });

  it('pauses for a natural moment by default', () => {
    const delays: number[] = [];
    const game = createSoloGame({
      playerCount: 4,
      level: 'normal',
      names: [],
      seed: 4,
      schedule: (fn, ms) => {
        delays.push(ms);
        fn();
      },
    });
    expect(delays.length).toBeGreaterThan(0);
    for (const ms of delays) {
      expect(ms).toBeGreaterThanOrEqual(550);
      expect(ms).toBeLessThanOrEqual(950);
    }
    game.close();
  });

  it('holds the chien on the table long enough for a bot taker to bury it', () => {
    const delays: number[] = [];
    const host = new GameHost({
      playerCount: 4,
      seats: botSeats(4),
      seed: 2,
      botDelayMs: 40,
      chienRevealMs: 1800,
      schedule: (fn, ms) => {
        delays.push(ms);
        fn();
      },
    });
    expect(host.handOver).toBe(true);
    // Exactly one seat discards the chien, and its bot move is held to the
    // reveal floor rather than firing after its own 40ms "thinking" delay.
    expect(delays.filter((ms) => ms === 1800)).toHaveLength(1);
    expect(new Set(delays)).toContain(1800);
  });

  it('holds the table between tricks so the last one can be gathered up', () => {
    const delays: number[] = [];
    const host = new GameHost({
      playerCount: 4,
      seats: botSeats(4),
      seed: 12,
      botDelayMs: 40,
      trickPauseMs: 900,
      schedule: (fn, ms) => {
        delays.push(ms);
        fn();
      },
    });
    expect(host.handOver).toBe(true);
    // A whole hand of four players is 18 tricks; every one of them but the
    // first is led after the pause.
    expect(delays.filter((ms) => ms === 900)).toHaveLength(17);
    // The pause absorbs the thinking time rather than stacking on top of it.
    expect(Math.max(...delays)).toBe(900);
    expect(new Set(delays)).toEqual(new Set([40, 900]));
  });
});
