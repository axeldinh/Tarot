import { useState, type JSX } from 'react';
import type { PlayerCount } from '@tarot/engine';
import type { Level } from '@tarot/bots';
import { useI18n } from '../i18n/index.ts';
import { levelLabel } from '../state/labels.ts';
import type { GameConfig, SavedGame } from '../state/storage.ts';

export interface SetupScreenProps {
  saved: SavedGame | null;
  onStart(config: GameConfig): void;
  onResume(saved: SavedGame): void;
  onDiscardSaved(): void;
  onRules(): void;
}

const COUNTS: PlayerCount[] = [3, 4, 5];
const LEVELS: Level[] = ['debutant', 'normal', 'confirme'];

export function SetupScreen({
  saved,
  onStart,
  onResume,
  onDiscardSaved,
  onRules,
}: SetupScreenProps): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [level, setLevel] = useState<Level>('normal');
  const [name, setName] = useState(t.setup.defaultName);

  return (
    <div className="screen">
      <div className="topbar" style={{ background: 'none', border: 'none', padding: 0 }}>
        <h1>{t.app.title}</h1>
        <span className="spacer" />
        <button
          type="button"
          className="small ghost"
          onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        >
          {t.app.language}
        </button>
      </div>
      <p className="muted">{t.app.subtitle}</p>

      {saved && (
        <div className="field" style={{ marginTop: 16 }}>
          <button type="button" className="primary" onClick={() => onResume(saved)} style={{ width: '100%' }}>
            {t.setup.resume}
          </button>
          <p className="note">
            {t.setup.playersAt(saved.config.playerCount)} &middot;{' '}
            {t.setup.resumeDetail(saved.session.handsDealt)}{' '}
            <button type="button" className="small ghost" onClick={onDiscardSaved}>
              {t.setup.discard}
            </button>
          </p>
        </div>
      )}

      <h2 style={{ marginTop: 20 }}>{t.setup.heading}</h2>

      <div className="field">
        <label htmlFor="players">{t.setup.players}</label>
        <div className="choices" id="players">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={playerCount === n}
              onClick={() => setPlayerCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="level">{t.setup.level}</label>
        <div className="choices" id="level">
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
              {levelLabel(l, t)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="name">{t.setup.yourName}</label>
        <input
          id="name"
          type="text"
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="stack">
        <button
          type="button"
          className="primary"
          onClick={() =>
            onStart({
              playerCount,
              level,
              name: name.trim() || t.setup.defaultName,
              seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0,
            })
          }
        >
          {t.setup.start}
        </button>
        <button type="button" className="ghost" onClick={onRules}>
          {t.setup.rules}
        </button>
      </div>
    </div>
  );
}
