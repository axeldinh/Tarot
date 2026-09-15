import { useEffect, useState, type JSX } from 'react';
import type { PlayerCount } from '@tarot/engine';
import type { Level } from '@tarot/bots';
import { CODE_LENGTH, type DiscoveredTable, type NearbyPlugin } from '@tarot/net';
import { useI18n } from '../i18n/index.ts';
import { useNearbyTables } from '../state/useTableGame.ts';

export type TableChoice =
  | { kind: 'host'; playerCount: PlayerCount; tableName: string; level: Level }
  | { kind: 'join'; table: DiscoveredTable }
  | { kind: 'host-online'; playerCount: PlayerCount; tableName: string; level: Level }
  | { kind: 'join-online'; code: string };

export interface TablePlayScreenProps {
  /** Null when this build has no radio — a browser, for instance. */
  plugin: NearbyPlugin | null;
  /** Null when this build has no relay configured, so online play is off too. */
  relayUrl: string | null;
  yourName: string;
  onChoose(choice: TableChoice): void;
  onBack(): void;
  /** Set after a join-online attempt that never found a table. */
  joinError: string | null;
  onDismissJoinError(): void;
}

const COUNTS: PlayerCount[] = [3, 4, 5];

/**
 * Start a table or join one, over whichever transport this build has: Nearby
 * on Android, the web relay in a browser.
 *
 * Nearby's permissions are asked for here and not before: a card game asking
 * for Bluetooth needs to say why first, and somebody who only ever plays solo
 * should never see the prompt at all. Online play needs no such prompt — a
 * WebSocket needs nobody's permission.
 */
export function TablePlayScreen({
  plugin,
  relayUrl,
  yourName,
  onChoose,
  onBack,
  joinError,
  onDismissJoinError,
}: TablePlayScreenProps): JSX.Element {
  const { t } = useI18n();
  const online = !plugin && relayUrl !== null;
  const [granted, setGranted] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'choose' | 'host' | 'join'>('choose');
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [tableName, setTableName] = useState(`${t.app.title} — ${yourName}`);
  const [codeInput, setCodeInput] = useState('');
  const tables = useNearbyTables(plugin, mode === 'join' && granted === true);

  useEffect(() => {
    if (!plugin) return;
    void plugin.requestPermissions().then((result) => setGranted(result.granted));
    // Asked once, when the player first opens this screen.
  }, [plugin]);

  const chooseMode = (next: 'choose' | 'host' | 'join'): void => {
    onDismissJoinError();
    setMode(next);
  };

  if (!plugin && !online) {
    return (
      <div className="screen">
        <h2>{t.table_play.heading}</h2>
        <p className="muted">{t.table_play.notConfigured}</p>
        <button type="button" onClick={onBack}>
          {t.rules.back}
        </button>
      </div>
    );
  }

  if (granted === false && plugin) {
    return (
      <div className="screen">
        <h2>{t.table_play.permissions}</h2>
        <p className="muted">{t.table_play.permissionsWhy}</p>
        <p className="muted">{t.table_play.denied}</p>
        <div className="stack">
          <button
            type="button"
            className="primary"
            onClick={() => void plugin.requestPermissions().then((r) => setGranted(r.granted))}
          >
            {t.table_play.grant}
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            {t.rules.back}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'host') {
    return (
      <div className="screen">
        <h2>{t.table_play.host}</h2>
        <div className="field">
          <label htmlFor="table-name">{t.table_play.tableName}</label>
          <input
            id="table-name"
            type="text"
            maxLength={30}
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="table-seats">{t.table_play.seats}</label>
          <div className="choices" id="table-seats">
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
        <div className="stack">
          <button
            type="button"
            className="primary"
            onClick={() =>
              onChoose({
                kind: online ? 'host-online' : 'host',
                playerCount,
                tableName: tableName.trim() || t.app.title,
                level: 'normal',
              })
            }
          >
            {t.table_play.host}
          </button>
          <button type="button" className="ghost" onClick={() => chooseMode('choose')}>
            {t.rules.back}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'join' && online) {
    const code = codeInput.trim().toLowerCase();
    const valid = code.length === CODE_LENGTH;
    return (
      <div className="screen">
        <h2>{t.table_play.join}</h2>
        <div className="field">
          <label htmlFor="table-code">{t.table_play.codeLabel}</label>
          <input
            id="table-code"
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={CODE_LENGTH}
            placeholder={t.table_play.codePlaceholder}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
          />
        </div>
        {joinError && (
          <p className="note" style={{ color: 'var(--danger)' }}>
            {joinError}
          </p>
        )}
        <div className="stack">
          <button
            type="button"
            className="primary"
            disabled={!valid}
            onClick={() => onChoose({ kind: 'join-online', code })}
          >
            {t.table_play.joinShort}
          </button>
          <button type="button" className="ghost" onClick={() => chooseMode('choose')}>
            {t.rules.back}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'join') {
    return (
      <div className="screen">
        <h2>{t.table_play.join}</h2>
        <p className="muted">{tables.length === 0 ? t.table_play.searching : ''}</p>
        {tables.length === 0 && <p className="muted">{t.table_play.noTables}</p>}
        <ul className="seats" data-testid="nearby-tables">
          {tables.map((table) => (
            <li key={table.endpoint} className="seat-row">
              <span className="who">
                <strong>{table.name}</strong>
                <span className="muted">
                  {' '}
                  {table.phase === 'playing'
                    ? t.table_play.inProgress
                    : t.table_play.freeSeats(table.freeSeats)}
                </span>
              </span>
              <button
                type="button"
                className="small primary"
                disabled={table.freeSeats === 0 && table.phase === 'lobby'}
                onClick={() => onChoose({ kind: 'join', table })}
              >
                {t.table_play.joinShort}
              </button>
            </li>
          ))}
        </ul>
        <div className="stack">
          <button type="button" className="ghost" onClick={() => chooseMode('choose')}>
            {t.rules.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>{t.table_play.heading}</h2>
      <p className="muted">{online ? t.table_play.onlineIntro : t.table_play.intro}</p>
      <div className="stack">
        <button type="button" className="primary" onClick={() => chooseMode('host')}>
          {t.table_play.host}
        </button>
        <button type="button" onClick={() => chooseMode('join')}>
          {t.table_play.join}
        </button>
        <button type="button" className="ghost" onClick={onBack}>
          {t.rules.back}
        </button>
      </div>
    </div>
  );
}
