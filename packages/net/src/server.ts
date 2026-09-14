import { GameHost, type HostOptions } from './host.ts';
import type { ClientMessage, ServerMessage } from './protocol.ts';
import { HOST, type PeerId, type Transport } from './transport.ts';

/** Which peer is sitting in which seat. */
export type SeatMap = Map<PeerId, number>;

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
  private readonly seatOf: SeatMap = new Map();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(transport: Transport, options: HostOptions) {
    this.transport = transport;
    this.host = new GameHost(options);

    this.unsubscribe.push(
      this.transport.on('message', (from, message) =>
        this.receive(from, message as ClientMessage),
      ),
      this.transport.on('peer-left', (peer) => {
        const seat = this.seatOf.get(peer);
        if (seat === undefined) return;
        this.seatOf.delete(peer);
        this.host.setConnected(seat, false);
      }),
      this.host.subscribe(() => this.broadcast()),
    );
  }

  private receive(from: PeerId, message: ClientMessage): void {
    switch (message.type) {
      case 'hello':
        this.seatOf.set(from, message.seat);
        this.host.setConnected(message.seat, true);
        this.sendTo(from, message.seat);
        return;
      case 'intent':
        this.reply(from, message.seat, this.host.submit(message.seat, message.action));
        return;
      case 'undo':
        this.reply(from, message.seat, this.host.undo(message.seat));
        return;
      case 'next-hand':
        this.reply(from, message.seat, this.host.nextHand());
        return;
      /* c8 ignore next 2 -- unknown messages are dropped, not trusted */
      default:
        return;
    }
  }

  private reply(peer: PeerId, seat: number, rejection: { code: string; message: string } | null): void {
    if (!rejection) return;
    const response: ServerMessage = {
      type: 'rejected',
      seat,
      code: rejection.code,
      message: rejection.message,
    };
    this.transport.send(peer, response);
  }

  private sendTo(peer: PeerId, seat: number): void {
    const view: ServerMessage = { type: 'view', seat, view: this.host.viewFor(seat) };
    this.transport.send(peer, view);
    this.transport.send(peer, { type: 'session', session: this.host.getSession() });
  }

  private broadcast(): void {
    for (const [peer, seat] of this.seatOf) this.sendTo(peer, seat);
  }

  close(): void {
    for (const off of this.unsubscribe) off();
  }
}

export { HOST };
