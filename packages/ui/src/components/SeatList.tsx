import type { JSX } from 'react';
import type { SeatInfo, SeatKind } from '@tarot/net';
import { useI18n } from '../i18n/index.ts';
import { levelLabel } from '../state/labels.ts';
import type { Level } from '@tarot/bots';

export interface SeatListProps {
  seats: readonly SeatInfo[];
  /** Which seat is this device. */
  self: number | null;
  /** Only the device running the table may rearrange it. */
  canArrange: boolean;
  onSetSeat?(seat: number, kind: SeatKind, level?: string): void;
}

/** What each chair at the table is doing: empty, a person, a bot, or away. */
export function SeatList({ seats, self, canArrange, onSetSeat }: SeatListProps): JSX.Element {
  const { t } = useI18n();

  const describe = (seat: SeatInfo): string => {
    if (seat.kind === 'bot') return levelLabel((seat.level ?? 'normal') as Level, t);
    if (seat.standIn) return t.table_play.standIn;
    if (seat.awaitingReturn) return t.table_play.reconnecting;
    if (!seat.connected) return t.table_play.empty;
    return seat.seat === self ? t.table_play.you : '';
  };

  return (
    <ul className="seats" data-testid="seat-list">
      {seats.map((seat) => {
        const empty = seat.kind === 'human' && !seat.connected && !seat.standIn && !seat.awaitingReturn;
        return (
          <li key={seat.seat} className={`seat-row${empty ? ' empty' : ''}`}>
            <span className="who">
              <strong>{empty ? t.table_play.empty : seat.name}</strong>
              <span className="muted"> {describe(seat)}</span>
            </span>
            {canArrange && onSetSeat && (
              <span className="seat-actions">
                {seat.kind === 'human' && !seat.connected && (
                  <button
                    type="button"
                    className="small ghost"
                    onClick={() => onSetSeat(seat.seat, 'bot', 'normal')}
                  >
                    {t.table_play.addBot}
                  </button>
                )}
                {seat.kind === 'bot' && (
                  <button
                    type="button"
                    className="small ghost"
                    onClick={() => onSetSeat(seat.seat, 'human')}
                  >
                    {t.table_play.openSeat}
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
