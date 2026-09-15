import { isSessionSnapshot, type SessionSnapshot } from '@tarot/net';
import type { Level } from '@tarot/bots';
import type { PlayerCount } from '@tarot/engine';
import type { Lang } from '../i18n/index.ts';

const KEY = 'tarot.session.v1';
const LANG_KEY = 'tarot.lang.v1';
const TABLE_KEY = 'tarot.table.v1';

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

/**
 * Enough to get a device back to the table it was sitting at over the web
 * relay, after the page itself is torn down and rebuilt by a reload — the
 * game is otherwise gone the instant that tab closes, since it lives only in
 * memory. A guest reclaims its seat with `token`; a host redeals the current
 * hand with the scoreboard carried over, the same way solo play resumes.
 */
interface OnlineTableCommon {
  code: string;
  yourName: string;
  /** How the seat is reclaimed. Always set once the host has seated us. */
  token: string | null;
  playerCount: PlayerCount;
  session: SessionSnapshot;
}

export type OnlineTableState =
  | (OnlineTableCommon & { role: 'guest' })
  | (OnlineTableCommon & { role: 'host'; tableName: string; level: Level });

export function saveOnlineTable(state: OnlineTableState): void {
  try {
    storage()?.setItem(TABLE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked store is not worth interrupting a game for.
  }
}

export function loadOnlineTable(): OnlineTableState | null {
  try {
    const raw = storage()?.getItem(TABLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnlineTableState>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.code !== 'string' || typeof parsed.yourName !== 'string') return null;
    if (![3, 4, 5].includes(parsed.playerCount as number)) return null;
    if (!isSessionSnapshot(parsed.session)) return null;
    const token = typeof parsed.token === 'string' ? parsed.token : null;
    if (parsed.role === 'guest') {
      return {
        role: 'guest',
        code: parsed.code,
        yourName: parsed.yourName,
        token,
        playerCount: parsed.playerCount as PlayerCount,
        session: parsed.session,
      };
    }
    if (parsed.role === 'host' && typeof parsed.tableName === 'string' && parsed.level) {
      return {
        role: 'host',
        code: parsed.code,
        yourName: parsed.yourName,
        token,
        playerCount: parsed.playerCount as PlayerCount,
        session: parsed.session,
        tableName: parsed.tableName,
        level: parsed.level,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearOnlineTable(): void {
  try {
    storage()?.removeItem(TABLE_KEY);
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
