import {
  applyAction,
  createHand,
  isTerminal,
  playerView,
  type Action,
  type GameState,
  type PlayerCount,
  type PlayerView,
  type Rules,
} from '@tarot/engine';
import { makeBot, type Bot, type Level } from '@tarot/bots';
import { newSession, recordHand } from './session.ts';
import type { SeatInfo, SessionSnapshot } from './protocol.ts';

export interface SeatSpec {
  name: string;
  kind: 'human' | 'bot';
  level?: Level;
}

export interface HostOptions {
  playerCount: PlayerCount;
  seats: SeatSpec[];
  seed: number;
  dealer?: number;
  rules?: Partial<Rules>;
  /** Solo only. Table play must never let a player take a card back. */
  allowUndo?: boolean;
  /** Wait this long before a bot moves. Set 0 in tests. */
  botDelayMs?: number | 'natural';
  /** Injected so tests do not have to wait. */
  schedule?: (fn: () => void, ms: number) => void;
  sessionId?: string;
  /** Carry the scoreboard over from a session that was interrupted. */
  initialSession?: SessionSnapshot;
}

export interface Rejection {
  code: string;
  message: string;
}

type Listener = () => void;

/**
 * The authoritative host.
 *
 * It owns the deal and the game state; nothing else ever sees a `GameState`.
 * Seats ask for what they want and get back their own view. Bot seats — and
 * human seats whose device has dropped — are played by the host itself.
 */
export class GameHost {
  private state: GameState;
  private session: SessionSnapshot;
  private readonly options: HostOptions;
  private readonly bots: (Bot | null)[];
  private readonly listeners = new Set<Listener>();
  private readonly schedule: (fn: () => void, ms: number) => void;
  /** State and action for every step taken, so a solo player can take one back. */
  private history: { state: GameState; action: Action }[] = [];
  private botPending = false;

  constructor(options: HostOptions) {
    this.options = options;
    this.schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms));

    const seats: SeatInfo[] = options.seats.map((spec, seat) => ({
      seat,
      name: spec.name,
      kind: spec.kind,
      ...(spec.level ? { level: spec.level } : {}),
      connected: true,
    }));
    this.bots = options.seats.map((spec, seat) =>
      spec.kind === 'bot' ? makeBot(spec.level ?? 'normal', { seed: options.seed + seat * 31 }) : null,
    );

    const fresh = newSession({
      id: options.sessionId ?? `s${options.seed}`,
      playerCount: options.playerCount,
      seats,
      dealer: options.dealer ?? 0,
    });
    // Resuming carries the totals and the history, not a half-played hand: the
    // cards are dealt again from where the scoreboard left off.
    this.session = options.initialSession
      ? { ...options.initialSession, seats, undoAvailable: false }
      : fresh;
    this.state = this.deal();
    this.kickBots();
  }

  private deal(): GameState {
    return createHand({
      playerCount: this.options.playerCount,
      dealer: this.session.dealer,
      seed: this.options.seed + this.session.handsDealt * 7919,
      ...(this.options.rules ? { rules: this.options.rules } : {}),
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.refreshSession();
    for (const listener of this.listeners) listener();
  }

  viewFor(seat: number): PlayerView {
    return playerView(this.state, seat);
  }

  getSession(): SessionSnapshot {
    return this.session;
  }

  private refreshSession(): void {
    const undoAvailable = this.canUndo;
    if (this.session.undoAvailable !== undoAvailable) {
      this.session = { ...this.session, undoAvailable };
    }
  }

  /** True when the hand is over and the table is waiting to be dealt again. */
  get handOver(): boolean {
    return isTerminal(this.state);
  }

  get canUndo(): boolean {
    if (!this.options.allowUndo) return false;
    return this.history.some((step) => step.action.type === 'PlayCard' && this.isHuman(step.action.player));
  }

  private isHuman(seat: number): boolean {
    const info = this.session.seats[seat] as SeatInfo;
    return info.kind === 'human' && info.connected;
  }

  /** Take an action from a seat. The seat may only ever act for itself. */
  submit(seat: number, action: Action): Rejection | null {
    if (action.player !== seat) {
      return { code: 'wrong-seat', message: `Seat ${seat} cannot act for seat ${action.player}` };
    }
    return this.apply(action);
  }

  private apply(action: Action): Rejection | null {
    const before = this.state;
    let next: GameState;
    try {
      next = applyAction(before, action);
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'illegal';
      return { code, message: (error as Error).message };
    }
    this.history.push({ state: before, action });
    this.state = next;
    if (isTerminal(next)) this.session = recordHand(this.session, next.result, next.dealer);
    this.emit();
    this.kickBots();
    return null;
  }

  /**
   * Take back the last card the human played, along with anything the bots
   * played after it. Solo only — `allowUndo` is never set for a real table.
   */
  undo(seat: number): Rejection | null {
    if (!this.options.allowUndo) {
      return { code: 'no-undo', message: 'Undo is only available in solo play' };
    }
    for (let i = this.history.length - 1; i >= 0; i--) {
      const step = this.history[i] as { state: GameState; action: Action };
      if (step.action.type !== 'PlayCard' || step.action.player !== seat) continue;
      this.state = step.state;
      this.history = this.history.slice(0, i);
      this.emit();
      return null;
    }
    return { code: 'nothing-to-undo', message: 'There is no card to take back' };
  }

  /** Deal the next hand. The deal passes on, including after a passed-out hand. */
  nextHand(): Rejection | null {
    if (!isTerminal(this.state)) {
      return { code: 'hand-in-progress', message: 'The hand is not finished' };
    }
    this.session = {
      ...this.session,
      dealer: (this.session.dealer + 1) % this.options.playerCount,
    };
    this.history = [];
    this.state = this.deal();
    this.emit();
    this.kickBots();
    return null;
  }

  /** Mark a seat away or back. An away seat is played by the host, like a bot. */
  setConnected(seat: number, connected: boolean): void {
    this.session = {
      ...this.session,
      seats: this.session.seats.map((info) =>
        info.seat === seat ? { ...info, connected } : info,
      ),
    };
    this.emit();
    this.kickBots();
  }

  /** Whether the host, rather than a device, plays this seat right now. */
  private hostPlays(seat: number): boolean {
    const info = this.session.seats[seat] as SeatInfo;
    return info.kind === 'bot' || !info.connected;
  }

  private botFor(seat: number): Bot {
    const existing = this.bots[seat];
    if (existing) return existing;
    // A human seat that dropped: stand a bot up for it and keep it for the seat.
    const stand = makeBot('normal', { seed: this.options.seed + seat * 31 });
    this.bots[seat] = stand;
    return stand;
  }

  /** If it is a host-played seat's turn, take its move after a human-ish pause. */
  private kickBots(): void {
    if (this.botPending || isTerminal(this.state)) return;
    const seat = this.state.currentPlayer;
    if (!this.hostPlays(seat)) return;

    const bot = this.botFor(seat);
    const delay =
      this.options.botDelayMs === 'natural'
        ? bot.thinkingDelay()
        : (this.options.botDelayMs ?? 0);

    this.botPending = true;
    this.schedule(() => {
      this.botPending = false;
      // The table may have moved on while we were thinking.
      if (isTerminal(this.state) || this.state.currentPlayer !== seat) return;
      if (!this.hostPlays(seat)) return;
      this.apply(bot.decide(this.viewFor(seat)));
    }, delay);
  }
}
