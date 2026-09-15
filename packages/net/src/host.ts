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
import type { JoinRequest, SeatInfo, SeatKind, SessionSnapshot, TableAdvert } from './protocol.ts';

export interface SeatSpec {
  name: string;
  kind: SeatKind;
  level?: Level;
  /** An empty human seat is one nobody has sat down in yet. */
  open?: boolean;
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
  /**
   * Extra pause before the first card of a new trick, on top of the usual bot
   * delay. The trick just won is still lying on the table; this is the time it
   * gets to be gathered up before the next card lands on an empty felt.
   */
  trickPauseMs?: number;
  /**
   * Least time the chien stays face up on the table before a bot taker buries
   * it, on top of the usual bot delay. Everyone at the table sees the chien,
   * not just the taker, so this floors how long it is visible even when the
   * bot itself decides almost instantly.
   */
  chienRevealMs?: number;
  /** Injected so tests do not have to wait. */
  schedule?: (fn: () => void, ms: number) => void;
  sessionId?: string;
  /** Carry the scoreboard over from a session that was interrupted. */
  initialSession?: SessionSnapshot;
  /**
   * Deal straight away (solo), or wait in a lobby until `start()` (a table).
   * Defaults to dealing straight away.
   */
  start?: 'now' | 'manual';
  /** How long a seat is held for a device that has dropped. */
  reconnectGraceMs?: number;
  /** The level a bot plays at when it stands in for someone who is away. */
  standInLevel?: Level;
  /** Shown in the list of nearby tables. */
  tableName?: string;
  /** Random token source, so tests can be deterministic. */
  makeToken?: () => string;
}

export interface Rejection {
  code: string;
  message: string;
}

type Listener = () => void;

interface SeatSlot {
  info: SeatInfo;
  /** Set once a person has claimed the seat; how they reclaim it later. */
  token: string | null;
  /** Cleared if they come back inside the grace period. */
  giveUpTimer: { cancelled: boolean } | null;
}

const DEFAULT_GRACE_MS = 45_000;

let tokenCounter = 0;
function defaultToken(): string {
  tokenCounter += 1;
  return `t${Date.now().toString(36)}${tokenCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The authoritative host.
 *
 * It owns the deal and the game state; nothing else ever sees a `GameState`.
 * Seats ask for what they want and get back their own view. Bot seats — and
 * human seats whose device has dropped and not come back — are played by the
 * host itself.
 */
export class GameHost {
  private state: GameState | null = null;
  private session: SessionSnapshot;
  private readonly options: HostOptions;
  private readonly slots: SeatSlot[];
  private readonly bots: (Bot | null)[];
  private readonly listeners = new Set<Listener>();
  private readonly schedule: (fn: () => void, ms: number) => void;
  private readonly newToken: () => string;
  /** State and action for every step taken, so a solo player can take one back. */
  private history: { state: GameState; action: Action }[] = [];
  private botPending = false;

  constructor(options: HostOptions) {
    this.options = options;
    this.schedule = options.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
    this.newToken = options.makeToken ?? defaultToken;

    this.slots = options.seats.map((spec, seat) => ({
      info: {
        seat,
        name: spec.name,
        kind: spec.kind,
        ...(spec.level ? { level: spec.level } : {}),
        // An open seat is a person-shaped hole: nobody is connected to it yet.
        connected: spec.kind === 'bot' ? true : !spec.open,
        awaitingReturn: false,
        standIn: false,
      },
      token: null,
      giveUpTimer: null,
    }));
    this.bots = options.seats.map((spec, seat) =>
      spec.kind === 'bot'
        ? makeBot(spec.level ?? 'normal', { seed: options.seed + seat * 31 })
        : null,
    );

    const fresh = newSession({
      id: options.sessionId ?? `s${options.seed}`,
      playerCount: options.playerCount,
      seats: this.seatInfos(),
      dealer: options.dealer ?? 0,
    });
    // Resuming carries the totals and the history, not a half-played hand: the
    // cards are dealt again from where the scoreboard left off.
    this.session = options.initialSession
      ? { ...options.initialSession, seats: this.seatInfos(), undoAvailable: false, phase: 'lobby' }
      : fresh;

    if ((options.start ?? 'now') === 'now') this.start();
  }

  private seatInfos(): SeatInfo[] {
    return this.slots.map((slot) => ({ ...slot.info }));
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
    this.session = {
      ...this.session,
      seats: this.seatInfos(),
      undoAvailable: this.canUndo,
    };
    for (const listener of this.listeners) listener();
  }

  /** A seat's view. Null while the table is still filling up. */
  viewFor(seat: number): PlayerView | null {
    return this.state ? playerView(this.state, seat) : null;
  }

  getSession(): SessionSnapshot {
    return this.session;
  }

  advert(): TableAdvert {
    return {
      id: this.session.id,
      name: this.options.tableName ?? 'Tarot',
      playerCount: this.options.playerCount,
      freeSeats: this.slots.filter((s) => this.isOpen(s)).length,
      phase: this.session.phase,
    };
  }

  /** A seat waiting for somebody: human-shaped and nobody holding it. */
  private isOpen(slot: SeatSlot): boolean {
    return slot.info.kind === 'human' && slot.token === null && !slot.info.connected;
  }

  get handOver(): boolean {
    return this.state !== null && isTerminal(this.state);
  }

  get started(): boolean {
    return this.state !== null;
  }

  get canUndo(): boolean {
    if (!this.options.allowUndo) return false;
    return this.history.some(
      (step) => step.action.type === 'PlayCard' && this.slots[step.action.player]?.info.kind === 'human',
    );
  }

  /** Deal the first hand. Refused until every seat is accounted for. */
  start(): Rejection | null {
    if (this.state) return { code: 'already-started', message: 'The table is already playing' };
    const waiting = this.slots.filter((s) => this.isOpen(s)).length;
    if (waiting > 0) {
      return { code: 'seats-empty', message: `${waiting} seat(s) still waiting for a player` };
    }
    this.session = { ...this.session, phase: 'playing' };
    this.state = this.deal();
    this.emit();
    this.kickBots();
    return null;
  }

  // ---------------------------------------------------------------- seating

  /**
   * Sit a device down, or let one that dropped reclaim the seat it had.
   *
   * The token is what makes a seat survive a reconnection: over a radio the
   * endpoint id changes when the link drops, so it cannot be the identity.
   */
  join(request: JoinRequest): { seat: number; token: string } | Rejection {
    if (request.token) {
      const slot = this.slots.find((s) => s.token === request.token);
      if (slot) {
        this.welcomeBack(slot, request.name);
        return { seat: slot.info.seat, token: slot.token as string };
      }
      // An unknown token is treated as a fresh arrival rather than an error:
      // the table may have been restarted while the device was away.
    }

    const wanted =
      request.seat === undefined ? undefined : this.slots[request.seat];
    if (request.seat !== undefined && (!wanted || !this.isOpen(wanted))) {
      return { code: 'seat-taken', message: `Seat ${request.seat} is not free` };
    }
    const slot = wanted ?? this.slots.find((s) => this.isOpen(s));
    if (!slot) return { code: 'table-full', message: 'Every seat is taken' };

    slot.token = this.newToken();
    slot.info = {
      ...slot.info,
      name: request.name || slot.info.name,
      kind: 'human',
      connected: true,
      awaitingReturn: false,
      standIn: false,
    };
    this.emit();
    this.kickBots();
    return { seat: slot.info.seat, token: slot.token };
  }

  private welcomeBack(slot: SeatSlot, name: string): void {
    if (slot.giveUpTimer) slot.giveUpTimer.cancelled = true;
    slot.giveUpTimer = null;
    slot.info = {
      ...slot.info,
      name: name || slot.info.name,
      connected: true,
      awaitingReturn: false,
      // Whoever was standing in for them stands down.
      standIn: false,
    };
    this.emit();
  }

  /**
   * A device has gone. Hold the seat for a while — a radio link drops for all
   * sorts of dull reasons — and only hand it to a bot once it is clear the
   * player is not coming straight back.
   */
  markAway(seat: number): void {
    const slot = this.slots[seat];
    if (!slot || slot.info.kind !== 'human' || !slot.info.connected) return;

    slot.info = { ...slot.info, connected: false, awaitingReturn: true };
    const timer = { cancelled: false };
    slot.giveUpTimer = timer;
    this.emit();

    this.schedule(() => {
      if (timer.cancelled) return;
      slot.giveUpTimer = null;
      slot.info = { ...slot.info, awaitingReturn: false, standIn: true };
      this.emit();
      this.kickBots();
    }, this.options.reconnectGraceMs ?? DEFAULT_GRACE_MS);
  }

  /** Give up a seat deliberately, rather than by dropping off the air. */
  leave(seat: number): void {
    const slot = this.slots[seat];
    if (!slot) return;
    if (this.state) {
      // Mid-hand, a seat cannot simply vanish: a bot plays it out.
      this.markAway(seat);
      return;
    }
    if (slot.giveUpTimer) slot.giveUpTimer.cancelled = true;
    slot.giveUpTimer = null;
    slot.token = null;
    slot.info = {
      ...slot.info,
      name: `Joueur ${seat + 1}`,
      connected: false,
      awaitingReturn: false,
      standIn: false,
    };
    this.emit();
  }

  /** Before the table starts, the host can make a seat a bot, or open it up. */
  setSeat(seat: number, kind: SeatKind, level?: Level): Rejection | null {
    if (this.state) return { code: 'already-started', message: 'The table is already playing' };
    const slot = this.slots[seat];
    if (!slot) return { code: 'no-such-seat', message: `There is no seat ${seat}` };
    if (slot.token !== null) {
      return { code: 'seat-taken', message: 'Somebody is already sitting there' };
    }
    slot.info = {
      ...slot.info,
      kind,
      ...(kind === 'bot' ? { level: level ?? 'normal' } : {}),
      connected: kind === 'bot',
      awaitingReturn: false,
      standIn: false,
    };
    this.bots[seat] = kind === 'bot' ? makeBot(level ?? 'normal', { seed: this.options.seed + seat * 31 }) : null;
    this.emit();
    return null;
  }

  // ------------------------------------------------------------------- play

  /** Take an action from a seat. The seat may only ever act for itself. */
  submit(seat: number, action: Action): Rejection | null {
    if (!this.state) return { code: 'not-started', message: 'The table has not started' };
    if (action.player !== seat) {
      return { code: 'wrong-seat', message: `Seat ${seat} cannot act for seat ${action.player}` };
    }
    return this.apply(action);
  }

  private apply(action: Action): Rejection | null {
    const before = this.state as GameState;
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
    if (!this.state) return { code: 'not-started', message: 'The table has not started' };
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

  /** Whether the host, rather than a device, plays this seat right now. */
  private hostPlays(seat: number): boolean {
    const info = this.slots[seat]?.info;
    if (!info) return false;
    if (info.kind === 'bot') return true;
    // While a seat is being held open the table waits rather than plays on.
    return !info.connected && !info.awaitingReturn;
  }

  private botFor(seat: number): Bot {
    const existing = this.bots[seat];
    if (existing) return existing;
    // A human seat that dropped: stand a bot up for it and keep it for the seat.
    const stand = makeBot(this.options.standInLevel ?? 'normal', {
      seed: this.options.seed + seat * 31,
    });
    this.bots[seat] = stand;
    return stand;
  }

  /** If it is a host-played seat's turn, take its move after a human-ish pause. */
  private kickBots(): void {
    if (this.botPending || !this.state || isTerminal(this.state)) return;
    const seat = this.state.currentPlayer;
    if (!this.hostPlays(seat)) return;

    const bot = this.botFor(seat);
    const thinking =
      this.options.botDelayMs === 'natural'
        ? bot.thinkingDelay()
        : (this.options.botDelayMs ?? 0);
    // Nobody leads the next trick while the last one is still on the table.
    const between =
      this.state.phase === 'playing' &&
      this.state.tricks.length > 0 &&
      (this.state.currentTrick === null || this.state.currentTrick.plays.length === 0);
    // The pause absorbs the thinking time rather than being added to it: a bot
    // that wants 800ms to think has already used most of the pause up, and
    // stacking the two makes every trick feel like the table is asleep.
    const pause = between
      ? (this.options.trickPauseMs ?? 0)
      : this.state.phase === 'discard'
        ? (this.options.chienRevealMs ?? 0)
        : 0;
    const delay = Math.max(thinking, pause);

    this.botPending = true;
    this.schedule(() => {
      this.botPending = false;
      // The table may have moved on while we were thinking.
      const state = this.state;
      if (!state || isTerminal(state) || state.currentPlayer !== seat) return;
      if (!this.hostPlays(seat)) return;
      this.apply(bot.decide(playerView(state, seat)));
    }, delay);
  }
}
