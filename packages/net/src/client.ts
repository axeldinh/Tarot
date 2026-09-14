import type { Action, PlayerView } from '@tarot/engine';
import type {
  ClientMessage,
  JoinRequest,
  SeatKind,
  ServerMessage,
  SessionSnapshot,
} from './protocol.ts';
import { HOST, type Transport } from './transport.ts';

export interface ClientState {
  /** Null until the host has seated us. */
  seat: number | null;
  /** How this seat is reclaimed if the link drops. Worth keeping on disk. */
  token: string | null;
  view: PlayerView | null;
  session: SessionSnapshot | null;
  /** The last thing the host refused, for the one-line reason in the UI. */
  rejection: { code: string; message: string } | null;
}

const EMPTY: ClientState = {
  seat: null,
  token: null,
  view: null,
  session: null,
  rejection: null,
};

/**
 * A seat's whole window onto the game. It holds a `PlayerView` and a scoreboard
 * and nothing else, so no screen can render a card it is not entitled to see.
 */
export class TableClient {
  private readonly transport: Transport;
  private state: ClientState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly off: () => void;

  constructor(transport: Transport, join: JoinRequest) {
    this.transport = transport;
    this.off = this.transport.on('message', (_from, message) =>
      this.receive(message as ServerMessage),
    );
    this.send({ type: 'join', join });
  }

  /** The seat this client holds. Null until the host has answered. */
  get seat(): number | null {
    return this.state.seat;
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'seated':
        this.state = { ...this.state, seat: message.seat, token: message.token, rejection: null };
        break;
      case 'view':
        if (message.seat !== this.state.seat) return;
        this.state = { ...this.state, view: message.view, rejection: null };
        break;
      case 'session':
        this.state = { ...this.state, session: message.session };
        break;
      case 'rejected':
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
    this.send({ type: 'intent', action });
  }

  undo(): void {
    this.send({ type: 'undo' });
  }

  nextHand(): void {
    this.send({ type: 'next-hand' });
  }

  /** Host device only: fill a seat with a bot, or open it up again. */
  setSeat(seat: number, kind: SeatKind, level?: string): void {
    this.send({ type: 'set-seat', seat, kind, ...(level ? { level } : {}) });
  }

  /** Host device only: deal the first hand. */
  start(): void {
    this.send({ type: 'start' });
  }

  /** Give up the seat deliberately. */
  leave(): void {
    this.send({ type: 'leave' });
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
