import type { RelaySocket, RelaySocketFactory } from '../src/relay.ts';

/**
 * A fake relay.
 *
 * It models the wire contract `RelayTransport` speaks to `packages/relay`
 * (documented at the top of `src/relay.ts`) without either package importing
 * the other — the same arm's-length relationship `FakeRadio` has with the real
 * Nearby plugin. It is not the real Durable Object logic; `packages/relay/test`
 * covers that independently. What is exercised here is everything above the
 * wire: connecting, addressing, host takeover, and drops.
 */
export class FakeRelay {
  readonly url = 'https://fake-relay.test';
  private readonly rooms = new Map<string, FakeRoom>();
  /** The socket the factory most recently handed out, for tests that need to
   *  poke the wire directly rather than through a `RelayTransport`. */
  lastSocket: FakeRelaySocket | null = null;

  private room(code: string): FakeRoom {
    let room = this.rooms.get(code);
    if (!room) {
      room = new FakeRoom();
      this.rooms.set(code, room);
    }
    return room;
  }

  readonly factory: RelaySocketFactory = (url) => {
    const match = /\/room\/([^/?]+)\?role=(host|guest)/.exec(url);
    if (!match) throw new Error(`fake relay: cannot parse ${url}`);
    const code = match[1] as string;
    const role = match[2] as 'host' | 'guest';
    const socket = new FakeRelaySocket();
    this.lastSocket = socket;
    // A real connection is never open synchronously; matching that shakes out
    // bugs where something is used before the transport has actually resolved.
    queueMicrotask(() => {
      if (socket.closed) return;
      socket.readyState = 1;
      socket.onopen?.();
      socket.attach(this.room(code), role);
    });
    return socket;
  };

  /** Cut every socket in a room, as the Worker restarting would. */
  drop(code: string): void {
    this.rooms.get(code)?.dropAll();
    this.rooms.delete(code);
  }
}

type WireFrame = { t: string; [key: string]: unknown };

class FakeRoom {
  private readonly peers = new Map<string, FakeRelaySocket>();
  private hostId: string | null = null;
  private guestCounter = 0;

  join(socket: FakeRelaySocket, role: 'host' | 'guest'): string {
    const id = this.assignId(role);
    this.peers.set(id, socket);
    socket.deliver({ t: 'welcome', id });
    this.broadcast({ t: 'peer-joined', id }, id);
    return id;
  }

  private assignId(role: 'host' | 'guest'): string {
    if (role !== 'host') {
      this.guestCounter += 1;
      return `g${this.guestCounter}`;
    }
    if (this.hostId !== null) this.peers.get(this.hostId)?.close();
    this.hostId = 'host';
    return 'host';
  }

  receive(fromId: string, raw: string): void {
    let frame: { t: string; to?: string; body?: unknown };
    try {
      frame = JSON.parse(raw) as { t: string; to?: string; body?: unknown };
    } catch {
      return;
    }
    if (frame.t !== 'msg' || frame.to === undefined) return;
    const out: WireFrame = { t: 'msg', from: fromId, body: frame.body };
    if (frame.to === 'all') {
      this.broadcast(out, fromId);
      return;
    }
    const target = frame.to === 'host' ? this.hostId : frame.to;
    if (target === null) return;
    this.peers.get(target)?.deliver(out);
  }

  leave(id: string): void {
    if (!this.peers.delete(id)) return;
    if (this.hostId === id) this.hostId = null;
    this.broadcast({ t: 'peer-left', id }, id);
  }

  dropAll(): void {
    for (const socket of [...this.peers.values()]) socket.close();
  }

  private broadcast(frame: WireFrame, exclude: string): void {
    for (const [id, socket] of this.peers) {
      if (id !== exclude) socket.deliver(frame);
    }
  }
}

export class FakeRelaySocket implements RelaySocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private id: string | null = null;
  private room: FakeRoom | null = null;

  attach(room: FakeRoom, role: 'host' | 'guest'): void {
    this.room = room;
    this.id = room.join(this, role);
  }

  /** @internal delivered by the room this socket is sitting in. */
  deliver(frame: WireFrame): void {
    this.deliverRaw(JSON.stringify(frame));
  }

  /** However malformed: what a garbled frame arriving over the wire looks like. */
  deliverRaw(data: string): void {
    if (this.closed) return;
    this.onmessage?.({ data });
  }

  send(data: string): void {
    if (this.closed || !this.room || this.id === null) return;
    this.room.receive(this.id, data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    if (this.room && this.id !== null) this.room.leave(this.id);
    this.onclose?.();
  }
}
