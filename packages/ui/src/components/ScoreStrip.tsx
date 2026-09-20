import type { JSX } from 'react';
import type { SessionSnapshot } from '@tarot/net';
import { formatSigned } from '../state/labels.ts';

export interface ScoreStripProps {
  session: SessionSnapshot;
  self: number;
}

/**
 * A glance at where the game stands: everyone's running total, always on
 * screen during play instead of tucked behind the menu.
 */
export function ScoreStrip({ session, self }: ScoreStripProps): JSX.Element {
  return (
    <div className="score-strip" data-testid="score-strip">
      {session.seats.map((seat) => {
        const total = session.totals[seat.seat] ?? 0;
        return (
          <span key={seat.seat} className={`score-chip${seat.seat === self ? ' self' : ''}`}>
            <span className="who">{seat.name}</span>
            <span className={total > 0 ? 'pos' : total < 0 ? 'neg' : ''}>
              {formatSigned(total)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
