import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createSoloGame, type ClientState, type SoloGame } from '@tarot/net';
import type { Action } from '@tarot/engine';
import type { GameApi } from './gameApi.ts';
import { clearGame, saveGame, type GameConfig, type SavedGame } from './storage.ts';
import { CHIEN_REVEAL_MS, TRICK_PAUSE_MS } from './timing.ts';

export interface SoloGameApi extends GameApi {
  /** Always present in solo play, which is the only place it exists. */
  undo(): void;
}

const EMPTY: ClientState = { seat: null, token: null, view: null, session: null, rejection: null };

/**
 * One human seat against bots, over `LocalTransport`.
 *
 * The hook only ever holds the `TableClient`, so no screen can reach a card it
 * is not entitled to see — the same discipline a networked table will be under.
 */
export function useSoloGame(config: GameConfig | null, resume: SavedGame | null): SoloGameApi {
  const [game, setGame] = useState<SoloGame | null>(null);
  const [, force] = useState(0);
  // `resume` is only read when a game is created; a later change must not
  // restart one that is already being played.
  const resumeRef = useRef(resume);
  resumeRef.current = resume;

  // The game is built in the effect that also tears it down, rather than in a
  // `useMemo` with the teardown somewhere else. Those two were not a pair: in
  // development React mounts, unmounts and remounts every component to shake
  // out exactly this, the memo held its value across the remount, and the
  // second mount got back a game whose transport had just been closed. The
  // table went on playing and the screen sat on the first bid forever.
  useEffect(() => {
    if (!config) {
      setGame(null);
      return;
    }
    const saved = resumeRef.current;
    const created = createSoloGame({
      playerCount: config.playerCount,
      level: config.level,
      names: [config.name],
      seed: config.seed,
      trickPauseMs: TRICK_PAUSE_MS,
      chienRevealMs: CHIEN_REVEAL_MS,
      ...(saved ? { initialSession: saved.session } : {}),
    });
    setGame(created);
    return () => {
      created.close();
      setGame((current) => (current === created ? null : current));
    };
  }, [config]);

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
