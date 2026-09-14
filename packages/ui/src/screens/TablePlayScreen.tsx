import { useEffect, useState, type JSX } from 'react';
import type { PlayerCount } from '@tarot/engine';
import type { Level } from '@tarot/bots';
import type { DiscoveredTable, NearbyPlugin } from '@tarot/net';
import { useI18n } from '../i18n/index.ts';
import { useNearbyTables } from '../state/useTableGame.ts';

export type TableChoice =
  | { kind: 'host'; playerCount: PlayerCount; tableName: string; level: Level }
  | { kind: 'join'; table: DiscoveredTable };

export interface TablePlayScreenProps {
  /** Null when this build has no radio — a browser, for instance. */
  plugin: NearbyPlugin | null;
  yourName: string;
  onChoose(choice: TableChoice): void;
  onBack(): void;
}

const COUNTS: PlayerCount[] = [3, 4, 5];

/**
 * Start a table or join one nearby.
 *
 * Permissions are asked for here and not before: a card game asking for
 * Bluetooth needs to say why first, and somebody who only ever plays solo should
 * never see the prompt at all.
 */
export function TablePlayScreen({
  plugin,
  yourName,
  onChoose,
  onBack,
}: TablePlayScreenProps): JSX.Element {
  const { t } = useI18n();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'choose' | 'host' | 'join'>('choose');
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4);
  const [tableName, setTableName] = useState(`${t.app.title} — ${yourName}`);
  const tables = useNearbyTables(plugin, mode === 'join' && granted === true);

  useEffect(() => {
    if (!plugin) return;
    void plugin.requestPermissions().then((result) => setGranted(result.granted));
    // Asked once, when the player first opens this screen.
  }, [plugin]);

  if (!plugin) {
    return (
      <div className="screen">
        <h2>{t.table_play.heading}</h2>
        <p className="muted">{t.table_play.androidOnly}</p>
        <button type="button" onClick={onBack}>
          {t.rules.back}
        </button>
      </div>
    );
  }

  if (granted === false) {
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
                kind: 'host',
                playerCount,
                tableName: tableName.trim() || t.app.title,
                level: 'normal',
              })
            }
          >
            {t.table_play.host}
          </button>
          <button type="button" className="ghost" onClick={() => setMode('choose')}>
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
          <button type="button" className="ghost" onClick={() => setMode('choose')}>
            {t.rules.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>{t.table_play.heading}</h2>
      <p className="muted">{t.table_play.intro}</p>
      <div className="stack">
        <button type="button" className="primary" onClick={() => setMode('host')}>
          {t.table_play.host}
        </button>
        <button type="button" onClick={() => setMode('join')}>
          {t.table_play.join}
        </button>
        <button type="button" className="ghost" onClick={onBack}>
          {t.rules.back}
        </button>
      </div>
    </div>
  );
}
