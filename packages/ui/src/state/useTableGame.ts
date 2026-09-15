import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  LocalNetwork,
  NearbyTransport,
  RelayTransport,
  TableClient,
  TableServer,
  combineTransports,
  discoverTables,
  generateTableCode,
  type ClientState,
  type DiscoveredTable,
  type NearbyPlugin,
  type RelaySocketFactory,
  type SeatKind,
  type SeatSpec,
} from '@tarot/net';
import type { PlayerCount } from '@tarot/engine';
import type { Level } from '@tarot/bots';
import type { GameApi } from './gameApi.ts';
import { CHIEN_REVEAL_MS, TRICK_PAUSE_MS } from './timing.ts';

export type TableRole = 'host' | 'guest';

export interface TableGameApi extends GameApi {
  role: TableRole;
  setSeat(seat: number, kind: SeatKind, level?: string): void;
  start(): void;
  leave(): void;
}

const EMPTY: ClientState = { seat: null, token: null, view: null, session: null, rejection: null };

export interface HostTableOptions {
  plugin: NearbyPlugin;
  playerCount: PlayerCount;
  tableName: string;
  yourName: string;
  level: Level;
  seed?: number;
}

export interface JoinTableOptions {
  plugin: NearbyPlugin;
  table: DiscoveredTable;
  yourName: string;
  /** Held from a previous sitting, to get the same seat back. */
  token?: string;
}

interface Live {
  client: TableClient;
  server?: TableServer;
  close(): void;
}

/**
 * Run a table on this device: advertise it, host the game, and sit at it.
 *
 * The host device is both server and client. It talks to itself through the
 * same transport everyone else uses, so there is no privileged path and no
 * second copy of the game loop.
 */
export async function hostTable(options: HostTableOptions): Promise<Live> {
  const seed = options.seed ?? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const seats: SeatSpec[] = Array.from({ length: options.playerCount }, (_, i) => ({
    name: `Joueur ${i + 1}`,
    kind: 'human' as const,
    open: true,
  }));

  const radio = await NearbyTransport.host(options.plugin, {
    id: `t${seed.toString(36)}`,
    name: options.tableName,
    playerCount: options.playerCount,
    freeSeats: options.playerCount,
    phase: 'lobby',
  });

  // This device's own player is not on the radio: they are right here. A
  // loopback link puts them through the same protocol as everybody else, so the
  // host is not a privileged special case in the game loop.
  const loopback = new LocalNetwork();
  const server = new TableServer(combineTransports([radio, loopback.host]), {
    playerCount: options.playerCount,
    seats,
    seed,
    sessionId: `t${seed.toString(36)}`,
    tableName: options.tableName,
    start: 'manual',
    botDelayMs: 'natural',
    trickPauseMs: TRICK_PAUSE_MS,
    chienRevealMs: CHIEN_REVEAL_MS,
    standInLevel: options.level,
    hostPeer: LOCAL_PLAYER,
  });

  // Keep the advert honest as seats fill up and the game starts.
  const stopWatching = server.host.subscribe(() => {
    void radio.republish(server.host.advert());
  });

  const client = new TableClient(loopback.connect(LOCAL_PLAYER), {
    name: options.yourName,
    seat: 0,
  });
  return {
    client,
    server,
    close: () => {
      stopWatching();
      client.close();
      server.close();
    },
  };
}

/** The host device's own player, on the loopback rather than the radio. */
const LOCAL_PLAYER = 'this-device';

/** Sit down at somebody else's table. */
export async function joinTable(options: JoinTableOptions): Promise<Live> {
  const transport = await NearbyTransport.join(options.plugin, options.table, options.yourName);
  const client = new TableClient(transport, {
    name: options.yourName,
    ...(options.token ? { token: options.token } : {}),
  });
  return { client, close: () => client.close() };
}

export interface HostOnlineTableOptions {
  relayUrl: string;
  playerCount: PlayerCount;
  tableName: string;
  yourName: string;
  level: Level;
  seed?: number;
  /** Injected in tests; defaults to the real `WebSocket`. */
  socketFactory?: RelaySocketFactory;
}

/**
 * Run a table over the web relay instead of Nearby: any browser can play,
 * not just two phones in the same room. The session id doubles as the code
 * the host reads out — nothing else needs to hand it out separately.
 */
export async function hostOnlineTable(options: HostOnlineTableOptions): Promise<Live> {
  const seed = options.seed ?? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const code = generateTableCode();
  const seats: SeatSpec[] = Array.from({ length: options.playerCount }, (_, i) => ({
    name: `Joueur ${i + 1}`,
    kind: 'human' as const,
    open: true,
  }));

  const radio = await RelayTransport.host({
    url: options.relayUrl,
    code,
    ...(options.socketFactory ? { socketFactory: options.socketFactory } : {}),
  });
  // Same reasoning as hostTable(): the host's own player goes through the
  // loopback, so the host is not a privileged special case in the game loop.
  const loopback = new LocalNetwork();
  const server = new TableServer(combineTransports([radio, loopback.host]), {
    playerCount: options.playerCount,
    seats,
    seed,
    sessionId: code,
    tableName: options.tableName,
    start: 'manual',
    botDelayMs: 'natural',
    trickPauseMs: TRICK_PAUSE_MS,
    standInLevel: options.level,
    hostPeer: LOCAL_PLAYER,
  });

  const client = new TableClient(loopback.connect(LOCAL_PLAYER), {
    name: options.yourName,
    seat: 0,
  });
  return {
    client,
    server,
    close: () => {
      client.close();
      server.close();
    },
  };
}

export interface JoinOnlineTableOptions {
  relayUrl: string;
  code: string;
  yourName: string;
  /** Held from a previous sitting, to get the same seat back. */
  token?: string;
  /** How long to wait for a seat before giving up. Shortened in tests. */
  timeoutMs?: number;
  /** Injected in tests; defaults to the real `WebSocket`. */
  socketFactory?: RelaySocketFactory;
}

const JOIN_TIMEOUT_MS = 8_000;

/**
 * Sit down at a table over the relay, by its code. Unlike Nearby's discovery
 * list, a mistyped code fails silently at the transport level — the relay
 * happily opens an empty room for it — so this waits for an actual seat and
 * gives up rather than leaving the caller staring at a lobby that never
 * arrives.
 */
export async function joinOnlineTable(options: JoinOnlineTableOptions): Promise<Live> {
  const transport = await RelayTransport.join({
    url: options.relayUrl,
    code: options.code,
    ...(options.socketFactory ? { socketFactory: options.socketFactory } : {}),
  });
  const client = new TableClient(transport, {
    name: options.yourName,
    ...(options.token ? { token: options.token } : {}),
  });
  try {
    await waitForSeat(client, options.timeoutMs ?? JOIN_TIMEOUT_MS);
  } catch (error) {
    client.close();
    throw error;
  }
  return { client, close: () => client.close() };
}

function waitForSeat(client: TableClient, timeoutMs: number): Promise<void> {
  if (client.getState().seat !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('no-such-table'));
    }, timeoutMs);
    const off = client.subscribe(() => {
      if (client.getState().seat === null) return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

/** Subscribe a component to a table this device is already part of. */
export function useTable(live: Live | null, role: TableRole): TableGameApi {
  const [, force] = useState(0);
  const subscribe = useCallback(
    (listener: () => void) => (live ? live.client.subscribe(listener) : () => {}),
    [live],
  );
  const snapshot = useCallback(() => (live ? live.client.getState() : EMPTY), [live]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  return {
    ...state,
    role,
    play: (action) => live?.client.play(action),
    nextHand: () => live?.client.nextHand(),
    setSeat: (seat, kind, level) => live?.client.setSeat(seat, kind, level),
    start: () => live?.client.start(),
    leave: () => live?.client.leave(),
    dismissRejection: () => {
      live?.client.dismissRejection();
      force((n) => n + 1);
    },
  };
}

/** Watch for tables nearby for as long as the component is on screen. */
export function useNearbyTables(plugin: NearbyPlugin | null, active: boolean): DiscoveredTable[] {
  const [tables, setTables] = useState<DiscoveredTable[]>([]);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!plugin || !active) return;
    let cancelled = false;
    void discoverTables(plugin, (found) => {
      if (!cancelled) setTables(found);
    }).then((stop) => {
      stopRef.current = stop;
      if (cancelled) void stop();
    });
    return () => {
      cancelled = true;
      void stopRef.current?.();
      stopRef.current = null;
      setTables([]);
    };
  }, [plugin, active]);

  return tables;
}
