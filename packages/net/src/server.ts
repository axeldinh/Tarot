import { GameHost, type HostOptions, type Rejection } from './host.ts';
import type { ClientMessage, ServerMessage, SeatKind } from './protocol.ts';
import { HOST, type PeerId, type Transport } from './transport.ts';
import type { Level } from '@tarot/bots';

/**
 * Puts a `GameHost` behind a transport: intents in, views out.
 *
 * Each seat is only ever sent its own view, so a client cannot learn another
 * hand even if it wanted to — the same guarantee the bots get from `PlayerView`,
 * enforced at the wire instead of at a function signature.
 */
export class TableServer {
  readonly host: GameHost;
  private readonly transport: Transport;
  /** Which peer is sitting in which seat, right now. */
  private readonly seatOf = new Map<PeerId, number>();
  private readonly unsubscribe: (() => void)[] = [];
  /** The peer allowed to start the table and arrange the seats. */
  private hostPeer: PeerId | null;

  constructor(transport: Transport, options: HostOptions & { hostPeer?: PeerId }) {
    this.transport = transport;
    this.host = new GameHost(options);
    this.hostPeer = options.hostPeer ?? null;

    this.unsubscribe.push(
      this.transport.on('message', (from, message) =>
        this.receive(from, message as ClientMessage),
      ),
      this.transport.on('peer-left', (peer) => this.dropped(peer)),
      this.host.subscribe(() => this.broadcast()),
    );
  }

  private dropped(peer: PeerId): void {
    const seat = this.seatOf.get(peer);
    if (seat === undefined) return;
    this.seatOf.delete(peer);
    this.host.markAway(seat);
  }

  private receive(from: PeerId, message: ClientMessage): void {
    switch (message.type) {
      case 'join': {
        const result = this.host.join(message.join);
        if ('code' in result) {
          this.refuse(from, result);
          return;
        }
        // A rejoining device may be a different endpoint to the one that left.
        for (const [peer, seat] of [...this.seatOf]) {
          if (seat === result.seat && peer !== from) this.seatOf.delete(peer);
        }
        this.seatOf.set(from, result.seat);
        this.send(from, { type: 'seated', seat: result.seat, token: result.token });
        this.sendState(from, result.seat);
        return;
      }
      case 'leave': {
        const seat = this.seatOf.get(from);
        if (seat === undefined) return;
        this.seatOf.delete(from);
        this.host.leave(seat);
        return;
      }
      case 'intent': {
        const seat = this.seatOf.get(from);
        if (seat === undefined) return this.refuse(from, NOT_SEATED);
        this.refuse(from, this.host.submit(seat, message.action));
        return;
      }
      case 'undo': {
        const seat = this.seatOf.get(from);
        if (seat === undefined) return this.refuse(from, NOT_SEATED);
        this.refuse(from, this.host.undo(seat));
        return;
      }
      case 'next-hand': {
        if (this.seatOf.get(from) === undefined) return this.refuse(from, NOT_SEATED);
        this.refuse(from, this.host.nextHand());
        return;
      }
      case 'set-seat': {
        if (!this.isTableOwner(from)) return this.refuse(from, NOT_OWNER);
        this.refuse(
          from,
          this.host.setSeat(message.seat, message.kind as SeatKind, message.level as Level),
        );
        return;
      }
      case 'start': {
        if (!this.isTableOwner(from)) return this.refuse(from, NOT_OWNER);
        this.refuse(from, this.host.start());
        return;
      }
      /* c8 ignore next 2 -- unknown messages are dropped, not trusted */
      default:
        return;
    }
  }

  /**
   * Only the device running the table may arrange seats or start it. When no
   * owner was named, whoever took seat 0 is treated as the owner — that is the
   * device that created the table.
   */
  private isTableOwner(peer: PeerId): boolean {
    if (this.hostPeer !== null) return this.hostPeer === peer;
    return this.seatOf.get(peer) === 0;
  }

  private refuse(peer: PeerId, rejection: Rejection | null): void {
    if (!rejection) return;
    this.send(peer, { type: 'rejected', code: rejection.code, message: rejection.message });
  }

  private send(peer: PeerId, message: ServerMessage): void {
    this.transport.send(peer, message);
  }

  private sendState(peer: PeerId, seat: number): void {
    const view = this.host.viewFor(seat);
    if (view) this.send(peer, { type: 'view', seat, view });
    this.send(peer, { type: 'session', session: this.host.getSession() });
  }

  private broadcast(): void {
    for (const [peer, seat] of this.seatOf) this.sendState(peer, seat);
  }

  close(): void {
    for (const off of this.unsubscribe) off();
    // Unsubscribing stops this server reacting to the transport; it does not
    // stop the transport itself, which over a real radio or a relay socket
    // is a connection somebody is still holding open — and, for the host
    // role, still holding the table's seat at the relay. Leaving it dangling
    // meant a discarded host could keep squatting on a seat a fresh one
    // needed.
    this.transport.close();
  }
}

const NOT_SEATED: Rejection = { code: 'not-seated', message: 'You are not sitting at this table' };
const NOT_OWNER: Rejection = {
  code: 'not-owner',
  message: 'Only the device running the table can do that',
};

export { HOST };
