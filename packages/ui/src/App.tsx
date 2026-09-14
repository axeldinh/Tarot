import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { ScoreBreakdown } from './components/ScoreBreakdown.tsx';
import { DEFAULT_LANG, DICTS, I18nContext, type Lang } from './i18n/index.ts';
import { RulesScreen } from './screens/RulesScreen.tsx';
import { SetupScreen } from './screens/SetupScreen.tsx';
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

type Screen = 'setup' | 'table' | 'rules';

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
}

export function App({ initialSaved, initialLang, initialConfig }: AppProps = {}): JSX.Element {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? loadLang() ?? DEFAULT_LANG);
  const [saved, setSaved] = useState<SavedGame | null>(() =>
    initialSaved !== undefined ? initialSaved : loadGame(),
  );
  const [config, setConfig] = useState<GameConfig | null>(initialConfig ?? null);
  const [resume, setResume] = useState<SavedGame | null>(null);
  const [screen, setScreen] = useState<Screen>(initialConfig ? 'table' : 'setup');
  const [returnTo, setReturnTo] = useState<Screen>('setup');

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLang(next);
  }, []);

  const i18n = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  const game = useSoloGame(config, resume);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const start = useCallback((next: GameConfig) => {
    setResume(null);
    setConfig(next);
    setScreen('table');
  }, []);

  const resumeGame = useCallback((previous: SavedGame) => {
    setResume(previous);
    setConfig({ ...previous.config, seed: (previous.config.seed + 104_729) >>> 0 });
    setScreen('table');
  }, []);

  const quit = useCallback(() => {
    setConfig(null);
    setResume(null);
    setSaved(loadGame());
    setScreen('setup');
  }, []);

  const openRules = useCallback(() => {
    setReturnTo(screen);
    setScreen('rules');
  }, [screen]);

  if (screen === 'rules') {
    return (
      <I18nContext.Provider value={i18n}>
        <div className="app">
          <RulesScreen onBack={() => setScreen(returnTo)} />
        </div>
      </I18nContext.Provider>
    );
  }

  const { view, session } = game;
  const playing = screen === 'table' && view !== null && session !== null;
  const handOver = playing && (view.phase === 'done' || view.phase === 'passed');

  return (
    <I18nContext.Provider value={i18n}>
      <div className="app">
        {!playing && (
          <SetupScreen
            saved={saved}
            onStart={start}
            onResume={resumeGame}
            onDiscardSaved={() => {
              clearGame();
              setSaved(null);
            }}
            onRules={openRules}
          />
        )}

        {playing && handOver && (
          <ScoreBreakdown
            result={view.result}
            session={session}
            onNext={() => game.nextHand()}
          />
        )}

        {playing && !handOver && (
          <TableScreen
            game={game}
            view={view}
            session={session}
            onRules={openRules}
            onQuit={quit}
          />
        )}
      </div>
    </I18nContext.Provider>
  );
}
