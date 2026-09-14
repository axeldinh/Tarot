/**
 * The one interface every way of getting bytes between devices hides behind.
 *
 * `LocalTransport` runs everything in one process and is what solo play and the
 * tests use. The p2p implementation chosen in docs/adr-transport.md slots in
 * here without anything above this file noticing.
 */

export type PeerId = string;

export const HOST: PeerId = 'host';

export type TransportEvent = 'message' | 'peer-joined' | 'peer-left';

export type MessageHandler = (from: PeerId, message: unknown) => void;
export type PeerHandler = (peer: PeerId) => void;
export type Unsubscribe = () => void;

export interface Transport {
  readonly role: 'host' | 'client';
  /** This endpoint's own address. */
  readonly id: PeerId;
  send(to: PeerId | 'all', message: unknown): void;
  on(event: 'message', handler: MessageHandler): Unsubscribe;
  on(event: 'peer-joined' | 'peer-left', handler: PeerHandler): Unsubscribe;
  close(): void;
}

type AnyHandler = MessageHandler | PeerHandler;

class Endpoint implements Transport {
  readonly role: 'host' | 'client';
  readonly id: PeerId;
  private readonly handlers = new Map<TransportEvent, Set<AnyHandler>>();
  private readonly network: LocalNetwork;
  private open = true;

  constructor(network: LocalNetwork, id: PeerId, role: 'host' | 'client') {
    this.network = network;
    this.id = id;
    this.role = role;
  }

  send(to: PeerId | 'all', message: unknown): void {
    if (!this.open) return;
    this.network.deliver(this.id, to, message);
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
    this.network.drop(this.id);
  }

  /** @internal */
  emitMessage(from: PeerId, message: unknown): void {
    if (!this.open) return;
    for (const handler of this.handlers.get('message') ?? []) {
      (handler as MessageHandler)(from, message);
    }
  }

  /** @internal */
  emitPeer(event: 'peer-joined' | 'peer-left', peer: PeerId): void {
    if (!this.open) return;
    for (const handler of this.handlers.get(event) ?? []) (handler as PeerHandler)(peer);
  }
}

/**
 * Every endpoint in one process, wired straight together. Messages are still
 * structured-cloned on the way through, so a bug that relies on sharing an
 * object between host and client shows up here rather than on a real device.
 */
export class LocalNetwork {
  private readonly endpoints = new Map<PeerId, Endpoint>();
  readonly host: Transport;

  constructor() {
    const host = new Endpoint(this, HOST, 'host');
    this.endpoints.set(HOST, host);
    this.host = host;
  }

  /** Add a client endpoint and tell everyone else it arrived. */
  connect(id: PeerId): Transport {
    const endpoint = new Endpoint(this, id, 'client');
    this.endpoints.set(id, endpoint);
    for (const [otherId, other] of this.endpoints) {
      if (otherId !== id) other.emitPeer('peer-joined', id);
    }
    return endpoint;
  }

  /** @internal */
  deliver(from: PeerId, to: PeerId | 'all', message: unknown): void {
    const copy = structuredClone(message);
    if (to === 'all') {
      for (const [id, endpoint] of this.endpoints) {
        if (id !== from) endpoint.emitMessage(from, structuredClone(copy));
      }
      return;
    }
    this.endpoints.get(to)?.emitMessage(from, copy);
  }

  /** @internal */
  drop(id: PeerId): void {
    if (!this.endpoints.delete(id)) return;
    for (const endpoint of this.endpoints.values()) endpoint.emitPeer('peer-left', id);
  }
}
