import type { JSX } from 'react';
import type { PlayerView } from '@tarot/engine';
import type { SeatInfo } from '@tarot/net';
import { useI18n } from '../i18n/index.ts';
import { bidLabel } from '../state/labels.ts';

export interface PlayerBadgeProps {
  seat: SeatInfo;
  view: PlayerView;
  tricks: number;
}

/** Name, bid and trick count for one of the other players. */
export function PlayerBadge({ seat, view, tricks }: PlayerBadgeProps): JSX.Element {
  const { t } = useI18n();
  const bid = view.bids[seat.seat];
  const isTaker = view.taker === seat.seat;
  const isPartner = view.partner === seat.seat && view.partner !== view.taker;
  const active = view.currentPlayer === seat.seat && view.phase !== 'done' && view.phase !== 'passed';

  return (
    <div className={`badge${active ? ' active' : ''}`} data-testid={`badge-${seat.seat}`}>
      <span className="name">
        {seat.name}
        {view.dealer === seat.seat ? ' ●' : ''}
      </span>
      <span className="meta">
        {bid === null || bid === undefined ? '—' : bidLabel(bid, t)}
        {view.tricks.length > 0 ? ` · ${t.table.tricks(tricks)}` : ''}
      </span>
      {(isTaker || isPartner) && (
        <span className="role">{isTaker ? t.table.taker : t.table.partner}</span>
      )}
    </div>
  );
}
