import type { Action, PlayerView } from '@tarot/engine';

export type Level = 'debutant' | 'normal' | 'confirme';

export const LEVELS: readonly Level[] = ['debutant', 'normal', 'confirme'];

export const LEVEL_NAMES: Record<Level, string> = {
  debutant: 'Debutant',
  normal: 'Normal',
  confirme: 'Confirme',
};

/**
 * The bot API.
 *
 * `decide` takes a `PlayerView` and nothing else. That is the type boundary the
 * spec asks for: a `PlayerView` has no field holding another player's hand, the
 * unseen chien or the taker's ecart, so a bot physically cannot read hidden
 * information — there is no convention to break and no audit to keep up.
 */
export interface Bot {
  readonly level: Level;
  /** The action this bot wants to take, given only what its seat can see. */
  decide(view: PlayerView): Action;
  /** How long a UI should pause before showing this move, in milliseconds. */
  thinkingDelay(): number;
}
