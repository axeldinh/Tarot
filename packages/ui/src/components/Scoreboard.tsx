import type { JSX } from 'react';
import type { SessionSnapshot } from '@tarot/net';
import { useI18n } from '../i18n/index.ts';
import { formatSigned } from '../state/labels.ts';

/** Running totals and the hand-by-hand history for the sitting. */
export function Scoreboard({ session }: { session: SessionSnapshot }): JSX.Element {
  const { t } = useI18n();
  if (session.hands.length === 0) return <p className="muted">{t.scoreboard.none}</p>;

  return (
    <table className="scores" data-testid="scoreboard">
      <thead>
        <tr>
          <th>{t.scoreboard.hand}</th>
          {session.seats.map((seat) => (
            <th key={seat.seat}>{seat.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {session.hands.map((hand) => (
          <tr key={hand.index}>
            <td>
              {hand.index + 1}
              {hand.result ? '' : ` (${t.scoreboard.passedShort})`}
            </td>
            {session.seats.map((seat) => {
              const delta = hand.result ? (hand.result.deltas[seat.seat] as number) : 0;
              return (
                <td key={seat.seat} className={delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}>
                  {hand.result ? formatSigned(delta) : '—'}
                </td>
              );
            })}
          </tr>
        ))}
        <tr>
          <th>{t.score.running}</th>
          {session.seats.map((seat) => (
            <th key={seat.seat}>{formatSigned(session.totals[seat.seat] ?? 0)}</th>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
