import type { DiscoveredTable, TableAdvert, TablePhase } from './protocol.ts';
import {
  HOST,
  type MessageHandler,
  type PeerHandler,
  type PeerId,
  type Transport,
  type TransportEvent,
  type Unsubscribe,
} from './transport.ts';

/**
 * The slice of Google Nearby Connections this game needs.
 *
 * Deliberately small: advertise, discover, connect, send bytes, and a handful of
 * callbacks. Everything above this interface is ordinary TypeScript that runs
 * and is tested in Node, which is what keeps the part that cannot be tested
 * without two phones down to one thin native class.
 *
 * See docs/adr-transport.md for why Nearby, and for what has and has not been
 * verified on hardware.
 */
export interface NearbyPlugin {
  /** Ask for whatever the platform needs before the radio can be used. */
  requestPermissions(): Promise<{ granted: boolean }>;
  /** Start telling nearby devices this table exists. */
  startAdvertising(options: { serviceId: string; name: string }): Promise<void>;
  stopAdvertising(): Promise<void>;
  /** Start listening for tables. */
  startDiscovery(options: { serviceId: string }): Promise<void>;
  stopDiscovery(): Promise<void>;
  /** Ask to join an endpoint found by discovery. */
  requestConnection(options: { endpointId: string; name: string }): Promise<void>;
  disconnect(options: { endpointId: string }): Promise<void>;
  /** Send bytes, as a UTF-8 string, to one endpoint. */
  send(options: { endpointId: string; payload: string }): Promise<void>;
  addListener(
    event: NearbyEvent,
    handler: (event: never) => void,
  ): Promise<NearbyListener>;
}

export type NearbyEvent =
  | 'endpointFound'
  | 'endpointLost'
  | 'connected'
  | 'disconnected'
  | 'payload';

export interface NearbyListener {
  remove(): Promise<void>;
}

export interface NearbyEndpointFound {
  endpointId: string;
  /** Whatever the other device put in `startAdvertising`. */
  name: string;
}

export interface NearbyPayload {
  endpointId: string;
  payload: string;
}

/** Everything on one radio has to agree on this, and nothing else may use it. */
export const SERVICE_ID = 'net.tarot.jeu';

/**
 * Nearby gives an advertiser one short string to describe itself, and it is the
 * only thing a device can see before connecting. The advert is squeezed into it
 * so the list of nearby tables can show what you would be joining, rather than
 * needing a round trip first. Keys are one letter because the field is capped at
 * about 130 bytes.
 */
interface WireAdvert {
  i: string;
  n: string;
  p: number;
  f: number;
  s: TablePhase;
}

export function encodeAdvert(advert: TableAdvert): string {
  const wire: WireAdvert = {
    i: advert.id,
    // A very long table name would push the advert past what Nearby carries.
    n: advert.name.slice(0, 40),
    p: advert.playerCount,
    f: advert.freeSeats,
    s: advert.phase,
  };
  return JSON.stringify(wire);
}

export function decodeAdvert(encoded: string): TableAdvert | null {
  let wire: Partial<WireAdvert>;
  try {
    wire = JSON.parse(encoded) as Partial<WireAdvert>;
  } catch {
    return null;
  }
  if (!wire || typeof wire.i !== 'string' || wire.i.length === 0) return null;
  if (![3, 4, 5].includes(wire.p as number)) return null;
  if (wire.s !== 'lobby' && wire.s !== 'playing') return null;
  return {
    id: wire.i,
    name: typeof wire.n === 'string' && wire.n.length > 0 ? wire.n : 'Tarot',
    playerCount: wire.p as 3 | 4 | 5,
    freeSeats: Number.isFinite(wire.f) ? (wire.f as number) : 0,
    phase: wire.s,
  };
}

type AnyHandler = MessageHandler | PeerHandler;

/**
 * A `Transport` over Nearby Connections.
 *
 * Messages are JSON on the wire. The host addresses a client by its endpoint id;
 * a client only ever talks to `HOST`, which is the one endpoint it connected to.
 */
export class NearbyTransport implements Transport {
  readonly role: 'host' | 'client';
  readonly id: PeerId;
  private readonly plugin: NearbyPlugin;
  private readonly handlers = new Map<TransportEvent, Set<AnyHandler>>();
  private readonly listeners: NearbyListener[] = [];
  /** Host side: every endpoint currently connected, for broadcasts. */
  private readonly peers = new Set<string>();
  /** Client side: the single endpoint that is the host. */
  private hostEndpoint: string | null;
  private open = true;

  private constructor(options: {
    plugin: NearbyPlugin;
    role: 'host' | 'client';
    id: PeerId;
    hostEndpoint?: string;
  }) {
    this.plugin = options.plugin;
    this.role = options.role;
    this.id = options.id;
    this.hostEndpoint = options.hostEndpoint ?? null;
  }

  private async listen(): Promise<void> {
    const on = async <E>(event: NearbyEvent, handler: (e: E) => void): Promise<void> => {
      this.listeners.push(
        await this.plugin.addListener(event, handler as unknown as (e: never) => void),
      );
    };
    await on<NearbyPayload>('payload', (event) => this.onPayload(event));
    await on<{ endpointId: string }>('connected', (event) => {
      this.peers.add(event.endpointId);
      this.emitPeer('peer-joined', event.endpointId);
    });
    await on<{ endpointId: string }>('disconnected', (event) => {
      this.peers.delete(event.endpointId);
      if (this.hostEndpoint === event.endpointId) this.hostEndpoint = null;
      this.emitPeer('peer-left', event.endpointId);
    });
  }

  /** The device running the table: advertise, and let people ask to join. */
  static async host(plugin: NearbyPlugin, advert: TableAdvert): Promise<NearbyTransport> {
    const transport = new NearbyTransport({ plugin, role: 'host', id: HOST });
    await transport.listen();
    await plugin.startAdvertising({ serviceId: SERVICE_ID, name: encodeAdvert(advert) });
    return transport;
  }

  /** A device joining a table it found. */
  static async join(
    plugin: NearbyPlugin,
    table: DiscoveredTable,
    name: string,
  ): Promise<NearbyTransport> {
    const transport = new NearbyTransport({
      plugin,
      role: 'client',
      id: table.endpoint,
      hostEndpoint: table.endpoint,
    });
    await transport.listen();
    await plugin.requestConnection({ endpointId: table.endpoint, name });
    return transport;
  }

  /** Update what the table tells the room about itself. */
  async republish(advert: TableAdvert): Promise<void> {
    if (!this.open || this.role !== 'host') return;
    await this.plugin.stopAdvertising();
    await this.plugin.startAdvertising({ serviceId: SERVICE_ID, name: encodeAdvert(advert) });
  }

  private onPayload(event: NearbyPayload): void {
    if (!this.open) return;
    let message: unknown;
    try {
      message = JSON.parse(event.payload);
    } catch {
      // A garbled frame is dropped. There is nothing useful to do with it, and
      // one bad payload must not take the table down.
      return;
    }
    const from = this.role === 'client' ? HOST : event.endpointId;
    for (const handler of this.handlers.get('message') ?? []) {
      (handler as MessageHandler)(from, message);
    }
  }

  private emitPeer(event: 'peer-joined' | 'peer-left', peer: PeerId): void {
    if (!this.open) return;
    for (const handler of this.handlers.get(event) ?? []) (handler as PeerHandler)(peer);
  }

  send(to: PeerId | 'all', message: unknown): void {
    if (!this.open) return;
    const payload = JSON.stringify(message);
    const targets =
      to === 'all'
        ? [...this.peers]
        : [to === HOST && this.role === 'client' ? this.hostEndpoint : to];
    for (const target of targets) {
      if (!target) continue;
      // Fire and forget: a failed send shows up as a disconnection, which the
      // table already knows how to handle.
      void this.plugin.send({ endpointId: target, payload }).catch(() => {});
    }
  }

  on(event: 'message', handler: MessageHandler): Unsubscribe;
  on(event: 'peer-joined' | 'peer-left', handler: PeerHandler): Unsubscribe;
  on(event: TransportEvent, handler: AnyHandler): Unsubscribe {
    const set = this.handlers.get(event) ?? new Set<AnyHandler>();
    set.add(handler);
    this.handlers.set(event, set);
    return () => set.delete(handler);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    for (const listener of this.listeners) void listener.remove().catch(() => {});
    this.listeners.length = 0;
    if (this.role === 'host') void this.plugin.stopAdvertising().catch(() => {});
    else if (this.hostEndpoint) {
      void this.plugin.disconnect({ endpointId: this.hostEndpoint }).catch(() => {});
    }
  }
}

/**
 * Watch for tables nearby. Returns a function that stops looking.
 *
 * Adverts that do not decode are ignored rather than shown: another app sharing
 * the radio, or a newer build of this one, should not put nonsense in the list.
 */
export async function discoverTables(
  plugin: NearbyPlugin,
  onChange: (tables: DiscoveredTable[]) => void,
): Promise<() => Promise<void>> {
  const found = new Map<string, DiscoveredTable>();
  const publish = (): void => onChange([...found.values()]);

  const listeners: NearbyListener[] = [
    await plugin.addListener('endpointFound', ((event: NearbyEndpointFound) => {
      const advert = decodeAdvert(event.name);
      if (!advert) return;
      found.set(event.endpointId, { ...advert, endpoint: event.endpointId });
      publish();
    }) as unknown as (e: never) => void),
    await plugin.addListener('endpointLost', ((event: { endpointId: string }) => {
      if (found.delete(event.endpointId)) publish();
    }) as unknown as (e: never) => void),
  ];

  await plugin.startDiscovery({ serviceId: SERVICE_ID });
  return async () => {
    for (const listener of listeners) await listener.remove();
    await plugin.stopDiscovery();
  };
}
