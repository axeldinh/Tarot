import {
  applyAction,
  createHand,
  isTerminal,
  playerView,
  type GameState,
  type PlayerCount,
  type Rules,
} from '@tarot/engine';
import type { Bot } from './types.ts';

/**
 * Run one hand to the end with a bot in every seat.
 *
 * Each bot is handed `playerView(state, seat)` and nothing else, which is the
 * same object a networked client would receive. That is what makes this both a
 * test harness and the reference for how the host should drive a real table.
 */
export function playHandWithBots(state: GameState, bots: readonly Bot[]): GameState {
  let s = state;
  let guard = 0;
  while (!isTerminal(s)) {
    guard++;
    /* c8 ignore next 2 -- a stuck hand is a bug, not a state to recover from */
    if (guard > 1000) throw new Error(`Hand stalled in phase ${s.phase}`);
    const seat = s.currentPlayer;
    const bot = bots[seat] as Bot;
    s = applyAction(s, bot.decide(playerView(s, seat)));
  }
  return s;
}

export interface DealOptions {
  playerCount: PlayerCount;
  seed: number;
  dealer?: number;
  rules?: Partial<Rules>;
}

/** Deal and play one hand bot-versus-bot. */
export function playDeal(options: DealOptions, bots: readonly Bot[]): GameState {
  return playHandWithBots(createHand(options), bots);
}
