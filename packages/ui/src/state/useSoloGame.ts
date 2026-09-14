import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createSoloGame, type ClientState, type SoloGame } from '@tarot/net';
import type { Action } from '@tarot/engine';
import { clearGame, saveGame, type GameConfig, type SavedGame } from './storage.ts';

export interface SoloGameApi extends ClientState {
  play(action: Action): void;
  undo(): void;
  nextHand(): void;
  dismissRejection(): void;
}

const EMPTY: ClientState = { view: null, session: null, rejection: null };

/**
 * One human seat against bots, over `LocalTransport`.
 *
 * The hook only ever holds the `TableClient`, so no screen can reach a card it
 * is not entitled to see — the same discipline a networked table will be under.
 */
export function useSoloGame(config: GameConfig | null, resume: SavedGame | null): SoloGameApi {
  const gameRef = useRef<SoloGame | null>(null);
  const [, force] = useState(0);

  const game = useMemo(() => {
    gameRef.current?.close();
    if (!config) {
      gameRef.current = null;
      return null;
    }
    const created = createSoloGame({
      playerCount: config.playerCount,
      level: config.level,
      names: [config.name],
      seed: config.seed,
      ...(resume ? { initialSession: resume.session } : {}),
    });
    gameRef.current = created;
    return created;
    // `resume` is only read at creation; a later change must not restart a game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useEffect(() => () => gameRef.current?.close(), []);

  const subscribe = useCallback(
    (listener: () => void) => (game ? game.client.subscribe(listener) : () => {}),
    [game],
  );
  const snapshot = useCallback(() => (game ? game.client.getState() : EMPTY), [game]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  // Keep the scoreboard on disk so an interrupted sitting can be picked up.
  useEffect(() => {
    if (!config || !state.session) return;
    if (state.session.handsDealt === 0) return;
    saveGame({ config, session: state.session });
  }, [config, state.session]);

  const play = useCallback((action: Action) => game?.client.play(action), [game]);
  const undo = useCallback(() => game?.client.undo(), [game]);
  const nextHand = useCallback(() => game?.client.nextHand(), [game]);
  const dismissRejection = useCallback(() => {
    game?.client.dismissRejection();
    force((n) => n + 1);
  }, [game]);

  return { ...state, play, undo, nextHand, dismissRejection };
}

export { clearGame };
