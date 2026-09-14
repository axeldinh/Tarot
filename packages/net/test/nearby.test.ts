import { describe, expect, it, vi } from 'vitest';
import { Bid } from '@tarot/engine';
import { makeBot } from '@tarot/bots';
import {
  NearbyTransport,
  SERVICE_ID,
  TableClient,
  TableServer,
  decodeAdvert,
  discoverTables,
  encodeAdvert,
  type DiscoveredTable,
  type TableAdvert,
} from '../src/index.ts';
import { FakeRadio } from './fake-nearby.ts';
import { manualSchedule, tableSeats, tokenSource } from './helpers.ts';

const ADVERT: TableAdvert = {
  id: 'table-1',
  name: 'Chez Ana',
  playerCount: 4,
  freeSeats: 2,
  phase: 'lobby',
};

describe('what a table tells the room', () => {
  it('round-trips through the one short string Nearby gives it', () => {
    const encoded = encodeAdvert(ADVERT);
    expect(decodeAdvert(encoded)).toEqual(ADVERT);
    // Nearby caps the advertised name at about 130 bytes.
    expect(new TextEncoder().encode(encoded).length).toBeLessThan(131);
  });

  it('stays inside the cap even with a silly table name', () => {
    const encoded = encodeAdvert({ ...ADVERT, name: 'x'.repeat(500) });
    expect(new TextEncoder().encode(encoded).length).toBeLessThan(131);
    expect(decodeAdvert(encoded)?.name).toHaveLength(40);
  });

  it('ignores anything it cannot make sense of', () => {
    expect(decodeAdvert('not json')).toBeNull();
    expect(decodeAdvert('{}')).toBeNull();
    expect(decodeAdvert(JSON.stringify({ i: 'x', p: 7, s: 'lobby' }))).toBeNull();
    expect(decodeAdvert(JSON.stringify({ i: 'x', p: 4, s: 'elsewhere' }))).toBeNull();
    // A missing name and a missing seat count are filled in rather than refused.
    const sparse = decodeAdvert(JSON.stringify({ i: 'x', p: 4, s: 'lobby' }));
    expect(sparse).toMatchObject({ name: 'Tarot', freeSeats: 0 });
  });
});

describe('finding a table', () => {
  it('lists the ones in range and drops them when they go', async () => {
    const radio = new FakeRadio();
    const table = radio.device('table');
    const phone = radio.device('phone');

    const seen: DiscoveredTable[][] = [];
    const stop = await discoverTables(phone, (tables) => seen.push(tables));
    expect(phone.discovering).toBe(true);

    await table.startAdvertising({ serviceId: SERVICE_ID, name: encodeAdvert(ADVERT) });
    expect(seen.at(-1)).toEqual([{ ...ADVERT, endpoint: 'table' }]);

    await table.stopAdvertising();
    expect(seen.at(-1)).toEqual([]);
    await stop();
    expect(phone.discovering).toBe(false);
  });

  it('sees a table that was already advertising when it started looking', async () => {
    const radio = new FakeRadio();
    const table = radio.device('table');
    await table.startAdvertising({ serviceId: SERVICE_ID, name: encodeAdvert(ADVERT) });

    const phone = radio.device('phone');
    const seen: DiscoveredTable[][] = [];
    await discoverTables(phone, (tables) => seen.push(tables));
    expect(seen.at(-1)).toEqual([{ ...ADVERT, endpoint: 'table' }]);
  });

  it('leaves out adverts from something else on the same radio', async () => {
    const radio = new FakeRadio();
    const noise = radio.device('noise');
    const phone = radio.device('phone');
    const seen: DiscoveredTable[][] = [];
    await discoverTables(phone, (tables) => seen.push(tables));
    await noise.startAdvertising({ serviceId: SERVICE_ID, name: 'some other app' });
    expect(seen).toEqual([]);
  });
});

describe('a table over the radio', () => {
  /** Host and clients on a fake radio, wired to the real server and clients. */
  async function radioTable(humans: number) {
    const radio = new FakeRadio();
    const clock = manualSchedule();
    const hostDevice = radio.device('table');
    const hostTransport = await NearbyTransport.host(hostDevice, { ...ADVERT, freeSeats: humans });
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
    return { radio, clock, server, hostDevice, hostTransport };
  }

  async function joinAs(radio: FakeRadio, id: string, name: string, token?: string) {
    const device = radio.device(id);
    const transport = await NearbyTransport.join(
      device,
      { ...ADVERT, endpoint: 'table' },
      name,
    );
    const client = new TableClient(transport, { name, ...(token ? { token } : {}) });
    return { device, transport, client };
  }

  it('carries a whole hand between four devices', async () => {
    const { radio, server } = await radioTable(4);
    const players = [];
    for (const [i, name] of ['Ana', 'Ben', 'Cam', 'Dee'].entries()) {
      players.push(await joinAs(radio, `phone-${i}`, name));
    }
    (players[0] as { client: TableClient }).client.start();
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

    const session = (players[0] as { client: TableClient }).client.getState().session;
    expect(session?.hands).toHaveLength(1);
    expect(session?.totals.reduce((a, b) => a + b, 0)).toBe(0);
    // Nobody was ever sent anyone else's cards.
    const hands = players.map((p) => p.client.getState().view?.hand ?? []);
    expect(hands.every((h) => h.length === 0)).toBe(true);
  });

  it('gives a seat back to a device that comes back on a new endpoint', async () => {
    const { radio, server, clock } = await radioTable(2);
    const ana = await joinAs(radio, 'phone-a', 'Ana');
    await joinAs(radio, 'phone-b', 'Ben');
    ana.client.start();
    const token = ana.client.getState().token as string;
    expect(token).toBe('token-0');

    // Ana walks out of range.
    radio.unplug('phone-a');
    expect(server.host.getSession().seats[0]).toMatchObject({
      connected: false,
      awaitingReturn: true,
    });

    // She comes back; over a radio that means a brand new endpoint id.
    const again = await joinAs(radio, 'phone-a2', 'Ana', token);
    expect(again.client.getState().seat).toBe(0);
    expect(server.host.getSession().seats[0]).toMatchObject({
      connected: true,
      awaitingReturn: false,
      standIn: false,
    });
    clock.flush();
    expect(server.host.getSession().seats[0]?.standIn).toBe(false);
  });

  it('plays a seat out with a bot if the device never comes back', async () => {
    const { radio, server, clock } = await radioTable(1);
    const ana = await joinAs(radio, 'phone-a', 'Ana');
    ana.client.start();
    expect(server.host.handOver).toBe(false);

    radio.unplug('phone-a');
    clock.flush();
    expect(server.host.handOver).toBe(true);
    expect(server.host.getSession().seats[0]?.standIn).toBe(true);
  });

  it('survives a garbled frame rather than taking the table down', async () => {
    const { radio } = await radioTable(1);
    const ana = await joinAs(radio, 'phone-a', 'Ana');
    const before = ana.client.getState();
    ana.device.fire('payload', { endpointId: 'table', payload: '{not json' });
    expect(ana.client.getState()).toEqual(before);
  });

  it('keeps the advert up to date as seats fill', async () => {
    const { radio, hostTransport, hostDevice, server } = await radioTable(2);
    await joinAs(radio, 'phone-a', 'Ana');
    await hostTransport.republish(server.host.advert());
    expect(decodeAdvert(hostDevice.advertisedName as string)).toMatchObject({ freeSeats: 1 });
  });

  it('stops advertising when the table closes', async () => {
    const { hostTransport, hostDevice } = await radioTable(2);
    expect(hostDevice.advertisedName).not.toBeNull();
    hostTransport.close();
    await Promise.resolve();
    expect(hostDevice.advertisedName).toBeNull();
    // Closing twice is harmless.
    hostTransport.close();
  });

  it('hangs up on the host when a client closes', async () => {
    const { radio, server } = await radioTable(2);
    const ana = await joinAs(radio, 'phone-a', 'Ana');
    ana.transport.close();
    await Promise.resolve();
    expect(server.host.getSession().seats[0]).toMatchObject({ awaitingReturn: true });
  });

  it('asks for permission before it touches the radio', async () => {
    const radio = new FakeRadio();
    const device = radio.device('phone');
    expect(await device.requestPermissions()).toEqual({ granted: true });
    device.granted = false;
    expect(await device.requestPermissions()).toEqual({ granted: false });
  });

  it('drops a send to somebody who is no longer there, without throwing', async () => {
    const { radio } = await radioTable(2);
    const ana = await joinAs(radio, 'phone-a', 'Ana');
    radio.unplug('phone-a');
    expect(() => ana.transport.send('table', { type: 'leave' })).not.toThrow();
    // And a client with no host endpoint left simply does nothing.
    const spy = vi.spyOn(ana.device, 'send');
    ana.transport.send('host', { type: 'leave' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses to play a seat that never sat down', async () => {
    const { radio } = await radioTable(2);
    const stray = radio.device('stray');
    const transport = await NearbyTransport.join(stray, { ...ADVERT, endpoint: 'table' }, 'Nobody');
    const heard: unknown[] = [];
    transport.on('message', (_from, m) => heard.push(m));
    transport.send('host', { type: 'intent', action: { type: 'Bid', player: 0, bid: Bid.Pass } });
    expect(heard).toEqual([
      { type: 'rejected', code: 'not-seated', message: 'You are not sitting at this table' },
    ]);
  });
});
