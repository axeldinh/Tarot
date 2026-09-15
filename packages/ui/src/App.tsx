import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { NearbyConnections, nearbyAvailable } from '@tarot/capacitor-nearby';
import type { NearbyPlugin, RelaySocketFactory, SeatKind } from '@tarot/net';
import { ScoreBreakdown } from './components/ScoreBreakdown.tsx';
import { DEFAULT_LANG, DICTS, I18nContext, type Lang } from './i18n/index.ts';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { RulesScreen } from './screens/RulesScreen.tsx';
import { SetupScreen } from './screens/SetupScreen.tsx';
import { TablePlayScreen, type TableChoice } from './screens/TablePlayScreen.tsx';
import { TableScreen } from './screens/TableScreen.tsx';
import {
  clearGame,
  loadGame,
  loadLang,
  saveLang,
  type GameConfig,
  type SavedGame,
} from './state/storage.ts';
import { useSoloGame } from './state/useSoloGame.ts';
import {
  hostOnlineTable,
  hostTable,
  joinOnlineTable,
  joinTable,
  useTable,
  type TableRole,
} from './state/useTableGame.ts';

type Screen = 'setup' | 'solo' | 'table-setup' | 'table' | 'rules';

type Live = Awaited<ReturnType<typeof hostTable>>;

/**
 * Where the web build's relay lives, so browsers can play together over the
 * internet instead of Nearby's local radio. Unset in a build nobody has
 * configured yet — table play then just isn't offered outside the Android
 * app, the same as before this existed.
 */
const RELAY_URL = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? null;

export interface AppProps {
  /** Injected in tests so a run does not touch the real store. */
  initialSaved?: SavedGame | null;
  initialLang?: Lang;
  /**
   * Start straight into a game with this configuration, skipping the setup
   * screen. A pinned seed deals the same hand every time, which is what makes a
   * bug report reproducible and a test deterministic.
   */
  initialConfig?: GameConfig | null;
  /** Injected in tests; in the app it is the Capacitor plugin, or nothing. */
  nearby?: NearbyPlugin | null;
  /** Injected in tests; in the app it is `VITE_RELAY_URL`, or nothing. */
  relayUrl?: string | null;
  /** Injected in tests; in the app it is the real `WebSocket`. */
  relaySocketFactory?: RelaySocketFactory;
}

export function App({
  initialSaved,
  initialLang,
  initialConfig,
  nearby,
  relayUrl,
  relaySocketFactory,
}: AppProps = {}): JSX.Element {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? loadLang() ?? DEFAULT_LANG);
  const [saved, setSaved] = useState<SavedGame | null>(() =>
    initialSaved !== undefined ? initialSaved : loadGame(),
  );
  const [config, setConfig] = useState<GameConfig | null>(initialConfig ?? null);
  const [resume, setResume] = useState<SavedGame | null>(null);
  const [screen, setScreen] = useState<Screen>(initialConfig ? 'solo' : 'setup');
  const [returnTo, setReturnTo] = useState<Screen>('setup');
  const [live, setLive] = useState<Live | null>(null);
  const [role, setRole] = useState<TableRole>('guest');
  const [onlineHost, setOnlineHost] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [yourName, setYourName] = useState('');
  const relay = relayUrl !== undefined ? relayUrl : RELAY_URL;

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLang(next);
  }, []);

  const i18n = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  const solo = useSoloGame(screen === 'solo' ? config : null, resume);
  const table = useTable(live, role);

  // A browser has no radio. The plugin is only real inside the Android app.
  const plugin = useMemo<NearbyPlugin | null>(() => {
    if (nearby !== undefined) return nearby;
    return nearbyAvailable() ? (NearbyConnections as unknown as NearbyPlugin) : null;
  }, [nearby]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => () => live?.close(), [live]);

  const startSolo = useCallback((next: GameConfig) => {
    setResume(null);
    setConfig(next);
    setYourName(next.name);
    setScreen('solo');
  }, []);

  const resumeGame = useCallback((previous: SavedGame) => {
    setResume(previous);
    setConfig({ ...previous.config, seed: (previous.config.seed + 104_729) >>> 0 });
    setScreen('solo');
  }, []);

  const quit = useCallback(() => {
    setConfig(null);
    setResume(null);
    setSaved(loadGame());
    setScreen('setup');
  }, []);

  const leaveTable = useCallback(() => {
    table.leave();
    live?.close();
    setLive(null);
    setOnlineHost(false);
    setScreen('setup');
  }, [live, table]);

  const openRules = useCallback(() => {
    setReturnTo(screen);
    setScreen('rules');
  }, [screen]);

  const chooseTable = useCallback(
    (choice: TableChoice) => {
      const name = yourName || DICTS[lang].setup.defaultName;
      let started: Promise<Live>;
      switch (choice.kind) {
        case 'host':
          if (!plugin) return;
          started = hostTable({
            plugin,
            playerCount: choice.playerCount,
            tableName: choice.tableName,
            yourName: name,
            level: choice.level,
          });
          break;
        case 'join':
          if (!plugin) return;
          started = joinTable({ plugin, table: choice.table, yourName: name });
          break;
        case 'host-online':
          if (!relay) return;
          started = hostOnlineTable({
            relayUrl: relay,
            playerCount: choice.playerCount,
            tableName: choice.tableName,
            yourName: name,
            level: choice.level,
            ...(relaySocketFactory ? { socketFactory: relaySocketFactory } : {}),
          });
          break;
        case 'join-online':
          if (!relay) return;
          started = joinOnlineTable({
            relayUrl: relay,
            code: choice.code,
            yourName: name,
            ...(relaySocketFactory ? { socketFactory: relaySocketFactory } : {}),
          });
          break;
      }
      setRole(choice.kind === 'host' || choice.kind === 'host-online' ? 'host' : 'guest');
      setOnlineHost(choice.kind === 'host-online');
      setJoinError(null);
      void started
        .then((game) => {
          setLive(game);
          setScreen('table');
        })
        .catch(() => {
          setJoinError(DICTS[lang].table_play.notFound);
        });
    },
    [plugin, relay, relaySocketFactory, yourName, lang],
  );

  if (screen === 'rules') {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="app">
          <RulesScreen onBack={() => setScreen(returnTo)} />
        </div>
      </I18nContext.Provider>
    );
  }

  if (screen === 'table-setup') {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="app">
          <TablePlayScreen
            plugin={plugin}
            relayUrl={relay}
            yourName={yourName || DICTS[lang].setup.defaultName}
            onChoose={chooseTable}
            onBack={() => setScreen('setup')}
            joinError={joinError}
            onDismissJoinError={() => setJoinError(null)}
          />
        </div>
      </I18nContext.Provider>
    );
  }

  // Solo and table play share every screen from here on: the only difference is
  // which client is feeding them.
  const game = screen === 'table' ? table : solo;
  const { view, session } = game;
  const playing = (screen === 'solo' || screen === 'table') && session !== null;
  const inLobby = playing && session.phase === 'lobby';
  const handOver = playing && view !== null && (view.phase === 'done' || view.phase === 'passed');

  return (
    <I18nContext.Provider value={i18n}>
      <div className="app">
        {!playing && (
          <SetupScreen
            saved={saved}
            onStart={startSolo}
            onResume={resumeGame}
            onDiscardSaved={() => {
              clearGame();
              setSaved(null);
            }}
            onRules={openRules}
            onTablePlay={(name) => {
              setYourName(name);
              setScreen('table-setup');
            }}
          />
        )}

        {playing && inLobby && (
          <LobbyScreen
            session={session}
            self={game.seat}
            isOwner={role === 'host'}
            onSetSeat={(seat: number, kind: SeatKind, level?: string) =>
              table.setSeat(seat, kind, level)
            }
            onStart={() => table.start()}
            onLeave={leaveTable}
            rejection={game.rejection?.message ?? null}
            code={onlineHost ? session.id : null}
          />
        )}

        {playing && !inLobby && handOver && (
          <ScoreBreakdown
            result={view?.result ?? null}
            session={session}
            onNext={() => game.nextHand()}
          />
        )}

        {playing && !inLobby && !handOver && view !== null && (
          <TableScreen
            game={game}
            view={view}
            session={session}
            onRules={openRules}
            onQuit={screen === 'table' ? leaveTable : quit}
          />
        )}
      </div>
    </I18nContext.Provider>
  );
}
