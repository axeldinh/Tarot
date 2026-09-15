export type PeerId = string;

/** The one seat every table has, whichever socket is currently sitting in it. */
export const HOST_ID: PeerId = 'host';

/**
 * Table codes are short and typed by hand, so the alphabet stays unambiguous
 * (lower-case only — nobody should have to care which case they used) and the
 * length stays pronounceable. Shared between the Worker's routing and
 * whatever generates a code for the host to read out.
 */
export const ROOM_CODE_PATTERN = /^[a-z0-9]{4,12}$/;

export function roomPath(code: string): string {
  return `/room/${code}`;
}

/** What the relay hands a connecting socket back, and what it forwards on. */
export interface RoomSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type ClientFrame = { t: 'msg'; to: PeerId | 'all'; body: unknown };

export type ServerFrame =
  | { t: 'welcome'; id: PeerId }
  | { t: 'peer-joined'; id: PeerId }
  | { t: 'peer-left'; id: PeerId }
  | { t: 'msg'; from: PeerId; body: unknown };

interface Peer {
  id: PeerId;
  socket: RoomSocket;
}

/**
 * One table's worth of routing state, over a WebSocket instead of Nearby or an
 * in-process loopback: who is in the room, which of them holds the host seat,
 * and where a message addressed to a peer id (or `'all'`) goes.
 *
 * Deliberately dumb, the same way `LocalNetwork` and `NearbyTransport` are: it
 * carries bytes between a `TableServer` and each `TableClient` without knowing
 * a seat, a card, or a turn exist, so a bug here cannot leak a hand.
 */
export class TableRoom {
  private readonly peers = new Map<PeerId, Peer>();
  private hostId: PeerId | null = null;
  private guestCounter = 0;

  /** A socket asking to join, as host or guest. Returns the id it was given. */
  join(socket: RoomSocket, role: 'host' | 'guest'): PeerId {
    const id = this.assignId(role);
    this.peers.set(id, { id, socket });
    socket.send(encode({ t: 'welcome', id }));
    this.broadcast({ t: 'peer-joined', id }, id);
    return id;
  }

  private assignId(role: 'host' | 'guest'): PeerId {
    if (role !== 'host') {
      this.guestCounter += 1;
      return `g${this.guestCounter}`;
    }
    // A reload or a second tab replaces the previous host connection rather
    // than fighting over the seat: whichever one just spoke is the one
    // actually at the keyboard.
    if (this.hostId !== null) this.drop(this.hostId, 4000, 'superseded');
    this.hostId = HOST_ID;
    return HOST_ID;
  }

  /** A frame that arrived on `fromId`'s socket. */
  receive(fromId: PeerId, raw: string): void {
    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw) as ClientFrame;
    } catch {
      // A garbled frame is dropped, not trusted, and must not take the room
      // down for everyone else in it.
      return;
    }
    if (!frame || frame.t !== 'msg') return;
    const out: ServerFrame = { t: 'msg', from: fromId, body: frame.body };
    if (frame.to === 'all') {
      this.broadcast(out, fromId);
      return;
    }
    const target = frame.to === HOST_ID ? this.hostId : frame.to;
    if (target === null) return;
    this.peers.get(target)?.socket.send(encode(out));
  }

  /** A socket has gone, however it went. */
  leave(id: PeerId): void {
    if (!this.peers.delete(id)) return;
    if (this.hostId === id) this.hostId = null;
    this.broadcast({ t: 'peer-left', id }, id);
  }

  /** Nobody left holding the line: the Durable Object can let this room go. */
  get empty(): boolean {
    return this.peers.size === 0;
  }

  private drop(id: PeerId, code: number, reason: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.socket.close(code, reason);
    this.leave(id);
  }

  private broadcast(frame: ServerFrame, exclude: PeerId): void {
    const encoded = encode(frame);
    for (const [id, peer] of this.peers) {
      if (id !== exclude) peer.socket.send(encoded);
    }
  }
}

function encode(frame: ServerFrame): string {
  return JSON.stringify(frame);
}
