import type { JSX } from 'react';
import type { SessionSnapshot, SeatKind } from '@tarot/net';
import { SeatList } from '../components/SeatList.tsx';
import { useI18n } from '../i18n/index.ts';

export interface LobbyScreenProps {
  session: SessionSnapshot;
  self: number | null;
  isOwner: boolean;
  onSetSeat(seat: number, kind: SeatKind, level?: string): void;
  onStart(): void;
  onLeave(): void;
  rejection: string | null;
  /** The code to read out to other players, for the device running an online table. */
  code?: string | null;
}

/** Who is at the table, and — for the device running it — the deal button. */
export function LobbyScreen({
  session,
  self,
  isOwner,
  onSetSeat,
  onStart,
  onLeave,
  rejection,
  code,
}: LobbyScreenProps): JSX.Element {
  const { t } = useI18n();
  const waiting = session.seats.filter(
    (s) => s.kind === 'human' && !s.connected && !s.standIn && !s.awaitingReturn,
  ).length;

  return (
    <div className="screen">
      <h2>{t.table_play.lobby}</h2>
      {code && (
        <p className="muted">
          {t.table_play.shareCode}
          <br />
          <strong data-testid="table-code" style={{ fontSize: '1.5em', letterSpacing: '0.15em' }}>
            {code}
          </strong>
        </p>
      )}
      <p className="muted">{waiting > 0 ? t.table_play.waiting : ''}</p>

      <SeatList seats={session.seats} self={self} canArrange={isOwner} onSetSeat={onSetSeat} />

      {rejection && <p className="note" style={{ color: 'var(--danger)' }}>{rejection}</p>}

      <div className="stack" style={{ marginTop: 20 }}>
        {isOwner && (
          <button type="button" className="primary" disabled={waiting > 0} onClick={onStart}>
            {t.table_play.startGame}
          </button>
        )}
        <button type="button" className="ghost" onClick={onLeave}>
          {t.table_play.leaveTable}
        </button>
      </div>
    </div>
  );
}
