import type { Action } from '@tarot/engine';
import type { ClientState } from '@tarot/net';

/**
 * What every screen needs from a game, whoever is running it.
 *
 * `undo` is optional on purpose: taking a card back exists in solo play and
 * nowhere else. The host refuses it at a real table regardless — `undoAvailable`
 * in the session is the authority — but there is no reason for the type to
 * pretend the button is there.
 */
export interface GameApi extends ClientState {
  play(action: Action): void;
  nextHand(): void;
  dismissRejection(): void;
  undo?(): void;
}
