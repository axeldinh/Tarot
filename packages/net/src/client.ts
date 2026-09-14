import type { Action, PlayerView } from '@tarot/engine';
import type { ClientMessage, ServerMessage, SessionSnapshot } from './protocol.ts';
import { HOST, type Transport } from './transport.ts';

export interface ClientState {
  view: PlayerView | null;
  session: SessionSnapshot | null;
  /** The last thing the host refused, for the one-line reason in the UI. */
  rejection: { code: string; message: string } | null;
}

/**
 * A seat's whole window onto the game. It holds a `PlayerView` and a scoreboard
 * and nothing else, so no screen can render a card it is not entitled to see.
 */
export class TableClient {
  private readonly transport: Transport;
  readonly seat: number;
  private state: ClientState = { view: null, session: null, rejection: null };
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;

  constructor(transport: Transport, seat: number) {
    this.transport = transport;
    this.seat = seat;
    this.off = this.transport.on('message', (_from, message) =>
      this.receive(message as ServerMessage),
    );
    this.send({ type: 'hello', seat });
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'view':
        if (message.seat !== this.seat) return;
        this.state = { ...this.state, view: message.view, rejection: null };
        break;
      case 'session':
        this.state = { ...this.state, session: message.session };
        break;
      case 'rejected':
        if (message.seat !== this.seat) return;
        this.state = {
          ...this.state,
          rejection: { code: message.code, message: message.message },
        };
        break;
      /* c8 ignore next 2 */
      default:
        return;
    }
    this.emit();
  }

  private send(message: ClientMessage): void {
    this.transport.send(HOST, message);
  }

  getState(): ClientState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  play(action: Action): void {
    this.send({ type: 'intent', seat: this.seat, action });
  }

  undo(): void {
    this.send({ type: 'undo', seat: this.seat });
  }

  nextHand(): void {
    this.send({ type: 'next-hand', seat: this.seat });
  }

  /** Clear a refusal once the player has read it. */
  dismissRejection(): void {
    if (!this.state.rejection) return;
    this.state = { ...this.state, rejection: null };
    this.emit();
  }

  close(): void {
    this.off();
    this.transport.close();
  }
}
