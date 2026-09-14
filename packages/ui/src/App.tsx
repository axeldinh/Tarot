import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { NearbyConnections, nearbyAvailable } from '@tarot/capacitor-nearby';
import type { NearbyPlugin, SeatKind } from '@tarot/net';
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
import { hostTable, joinTable, useTable, type TableRole } from './state/useTableGame.ts';

type Screen = 'setup' | 'solo' | 'table-setup' | 'table' | 'rules';

type Live = Awaited<ReturnType<typeof hostTable>>;

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
}

export function App({ initialSaved, initialLang, initialConfig, nearby }: AppProps = {}): JSX.Element {
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
  const [yourName, setYourName] = useState('');

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
    setScreen('setup');
  }, [live, table]);

  const openRules = useCallback(() => {
    setReturnTo(screen);
    setScreen('rules');
  }, [screen]);

  const chooseTable = useCallback(
    (choice: TableChoice) => {
      if (!plugin) return;
      const name = yourName || DICTS[lang].setup.defaultName;
      const started =
        choice.kind === 'host'
          ? hostTable({
              plugin,
              playerCount: choice.playerCount,
              tableName: choice.tableName,
              yourName: name,
              level: choice.level,
            })
          : joinTable({ plugin, table: choice.table, yourName: name });
      setRole(choice.kind === 'host' ? 'host' : 'guest');
      void started.then((game) => {
        setLive(game);
        setScreen('table');
      });
    },
    [plugin, yourName, lang],
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
            yourName={yourName || DICTS[lang].setup.defaultName}
            onChoose={chooseTable}
            onBack={() => setScreen('setup')}
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
