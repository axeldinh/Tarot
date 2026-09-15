import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { NearbyConnections, nearbyAvailable } from '@tarot/capacitor-nearby';
import type { NearbyPlugin, RelaySocketFactory, SeatKind } from '@tarot/net';
import type { Level } from '@tarot/bots';
import { ScoreBreakdown } from './components/ScoreBreakdown.tsx';
import { DEFAULT_LANG, DICTS, I18nContext, type Lang } from './i18n/index.ts';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { RulesScreen } from './screens/RulesScreen.tsx';
import { SetupScreen } from './screens/SetupScreen.tsx';
import { TablePlayScreen, type TableChoice } from './screens/TablePlayScreen.tsx';
import { TableScreen } from './screens/TableScreen.tsx';
import {
  clearGame,
  clearOnlineTable,
  loadGame,
  loadLang,
  loadOnlineTable,
  saveLang,
  saveOnlineTable,
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

type Screen = 'setup' | 'solo' | 'table-setup' | 'table' | 'table-resuming' | 'rules';

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
  const relay = relayUrl !== undefined ? relayUrl : RELAY_URL;
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? loadLang() ?? DEFAULT_LANG);
  const [saved, setSaved] = useState<SavedGame | null>(() =>
    initialSaved !== undefined ? initialSaved : loadGame(),
  );
  const [config, setConfig] = useState<GameConfig | null>(initialConfig ?? null);
  const [resume, setResume] = useState<SavedGame | null>(null);
  // A table this device was sitting at over the relay when a reload wiped the
  // page out from under it — read once, so the same reload that lost the game
  // is the one that gets it straight back rather than dumping the player at
  // setup. Read even when this build has no relay: `online` and the resume
  // effect below both check `relay` again before acting on it.
  const [resumeTable] = useState(() => loadOnlineTable());
  const [screen, setScreen] = useState<Screen>(() => {
    if (initialConfig) return 'solo';
    if (resumeTable && relay) return 'table-resuming';
    return 'setup';
  });
  const [returnTo, setReturnTo] = useState<Screen>('setup');
  const [live, setLive] = useState<Live | null>(null);
  const [role, setRole] = useState<TableRole>('guest');
  /** Set only while sitting at a table over the relay — not Nearby, which a
   *  reload cannot resume the same way (no radio survives a page reload). */
  const [online, setOnline] = useState(false);
  const [hostMeta, setHostMeta] = useState<{ tableName: string; level: Level } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
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

  // Pick a saved table back up, once, right after mount — the reload that
  // wiped the page is the same one that should get the player back to their
  // seat rather than stranding them at setup. A guest reclaims its seat by
  // token; a host redeals the current hand under the same code, carrying the
  // scoreboard over the same way solo play resumes an interrupted sitting.
  //
  // The connection this opens is asynchronous, so — unlike `useSoloGame`,
  // which builds its resource synchronously and can just close it in the
  // cleanup — a `cancelled` flag is what stands in for "close the one
  // StrictMode's dev-mode double-invoke made redundant": without it, mount →
  // cleanup → remount opens a second relay connection while the first is
  // still pending, and only closing the loser once it resolves keeps a table
  // from ending up wired to a dead socket that live traffic can no longer
  // move through — the connection sits there looking fine, having received
  // its last good state before going quiet.
  useEffect(() => {
    if (!resumeTable || !relay) return;
    let cancelled = false;
    setYourName(resumeTable.yourName);
    setRole(resumeTable.role);
    setOnline(true);
    if (resumeTable.role === 'host') {
      setHostMeta({ tableName: resumeTable.tableName, level: resumeTable.level });
    }
    const started: Promise<Live> =
      resumeTable.role === 'host'
        ? hostOnlineTable({
            relayUrl: relay,
            code: resumeTable.code,
            playerCount: resumeTable.playerCount,
            tableName: resumeTable.tableName,
            yourName: resumeTable.yourName,
            level: resumeTable.level,
            initialSession: resumeTable.session,
            ...(relaySocketFactory ? { socketFactory: relaySocketFactory } : {}),
          })
        : joinOnlineTable({
            relayUrl: relay,
            code: resumeTable.code,
            yourName: resumeTable.yourName,
            ...(resumeTable.token ? { token: resumeTable.token } : {}),
            ...(relaySocketFactory ? { socketFactory: relaySocketFactory } : {}),
          });
    void started
      .then((game) => {
        if (cancelled) {
          game.close();
          return;
        }
        setLive(game);
        setScreen('table');
      })
      .catch(() => {
        if (cancelled) return;
        // The table is gone, or the code no longer leads anywhere: nothing
        // left to reclaim, so fall back to a normal cold start.
        clearOnlineTable();
        setOnline(false);
        setScreen('setup');
      });
    return () => {
      cancelled = true;
    };
    // `resumeTable` is read from storage once, in its own initializer, and
    // never changes; `relay` and `relaySocketFactory` are likewise fixed for
    // the life of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep enough of an online table on disk to get back to it after a reload:
  // updated on every state change while seated, the same way solo play's
  // scoreboard is kept current.
  useEffect(() => {
    if (!online || !relay || screen !== 'table') return;
    const session = table.session;
    if (!session || table.seat === null) return;
    saveOnlineTable(
      role === 'host' && hostMeta
        ? {
            role: 'host',
            code: session.id,
            yourName,
            token: table.token,
            playerCount: session.playerCount,
            session,
            tableName: hostMeta.tableName,
            level: hostMeta.level,
          }
        : {
            role: 'guest',
            code: session.id,
            yourName,
            token: table.token,
            playerCount: session.playerCount,
            session,
          },
    );
  }, [online, relay, screen, role, hostMeta, yourName, table.session, table.seat, table.token]);

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
    setOnline(false);
    setHostMeta(null);
    clearOnlineTable();
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
      setOnline(choice.kind === 'host-online' || choice.kind === 'join-online');
      setHostMeta(
        choice.kind === 'host-online'
          ? { tableName: choice.tableName, level: choice.level }
          : null,
      );
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

  if (screen === 'table-resuming') {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="app">
          <div className="screen">
            <h2>{DICTS[lang].table_play.heading}</h2>
            <p className="muted">{DICTS[lang].table_play.resuming}</p>
          </div>
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
            code={online && role === 'host' ? session.id : null}
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
