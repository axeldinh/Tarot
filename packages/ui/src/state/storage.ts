import { isSessionSnapshot, type SessionSnapshot } from '@tarot/net';
import type { Level } from '@tarot/bots';
import type { PlayerCount } from '@tarot/engine';
import type { Lang } from '../i18n/index.ts';

const KEY = 'tarot.session.v1';
const LANG_KEY = 'tarot.lang.v1';

export interface GameConfig {
  playerCount: PlayerCount;
  level: Level;
  name: string;
  seed: number;
}

export interface SavedGame {
  config: GameConfig;
  session: SessionSnapshot;
}

/**
 * Local storage only — there is no account and no server. Everything here is
 * defensive: a browser may refuse storage outright, and a saved blob may be
 * from an older build, so a bad read is treated as "nothing saved".
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveGame(saved: SavedGame): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(saved));
  } catch {
    // A full or blocked store is not worth interrupting a game for.
  }
}

export function loadGame(): SavedGame | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!isSessionSnapshot(parsed.session)) return null;
    const config = parsed.config;
    if (!config || typeof config.seed !== 'number' || typeof config.name !== 'string') return null;
    if (![3, 4, 5].includes(config.playerCount)) return null;
    return { config, session: parsed.session };
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

export function saveLang(lang: Lang): void {
  try {
    storage()?.setItem(LANG_KEY, lang);
  } catch {
    // Ignore.
  }
}

export function loadLang(): Lang | null {
  try {
    const raw = storage()?.getItem(LANG_KEY);
    return raw === 'fr' || raw === 'en' ? raw : null;
  } catch {
    return null;
  }
}
