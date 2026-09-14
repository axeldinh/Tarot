import type { JSX } from 'react';
import { Bid, type HandResult } from '@tarot/engine';
import type { SessionSnapshot } from '@tarot/net';
import { useI18n } from '../i18n/index.ts';
import { bidLabel, formatPoints, formatSigned } from '../state/labels.ts';

const DOT = '\u00b7';

export interface ScoreBreakdownProps {
  result: HandResult | null;
  session: SessionSnapshot;
  onNext(): void;
}

function Line({ label, value, total }: { label: string; value: string; total?: boolean }): JSX.Element {
  return (
    <div className={`line${total ? ' total' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

/**
 * The screen people argue over, so every number that went into the score is on
 * it: points, bouts, target, difference, multiplier, each bonus, and who pays
 * whom. Nothing is rolled up.
 */
export function ScoreBreakdown({ result, session, onNext }: ScoreBreakdownProps): JSX.Element {
  const { t } = useI18n();
  const name = (seat: number): string => session.seats[seat]?.name ?? `#${seat + 1}`;

  if (!result) {
    return (
      <div className="screen centred">
        <h2>{t.score.heading}</h2>
        <p className="muted">{t.score.passed}</p>
        <button type="button" className="primary" onClick={onNext}>
          {t.score.next}
        </button>
      </div>
    );
  }

  const partner =
    result.partner !== null && result.partner !== result.taker
      ? t.score.withPartner(name(result.partner))
      : t.score.alone;

  return (
    <div className="screen" data-testid="score-breakdown">
      <h2>{t.score.heading}</h2>
      <p className="muted">
        {t.score.takerLabel(name(result.taker))} · {bidLabel(result.contract as Bid, t)} ·{' '}
        {partner}
      </p>

      <div className={`verdict ${result.made ? 'made' : 'failed'}`}>
        {result.made ? t.score.made : t.score.failed}
      </div>

      <div className="lines">
        <Line label={t.score.points} value={formatPoints(result.takerPoints)} />
        <Line label={t.score.bouts} value={String(result.bouts)} />
        <Line label={t.score.target} value={String(result.target)} />
        <Line label={t.score.diff} value={formatSigned(result.diff)} />
        {result.petitAuBout !== 0 && (
          <Line label={t.score.petitAuBout} value={formatSigned(result.petitAuBout)} />
        )}
        <Line label={t.score.base} value={formatPoints(result.base)} />
        <Line label={t.score.multiplier} value={`×${result.multiplier}`} />
        {result.poigneeBonus !== 0 && (
          <Line label={t.score.poignee} value={formatSigned(result.poigneeBonus)} />
        )}
        {result.chelemBonus !== 0 && (
          <Line label={t.score.chelem} value={formatSigned(result.chelemBonus)} />
        )}
        <Line label={t.score.total} value={formatSigned(result.score)} total />
      </div>
      <p className="note">{t.score.formula}</p>

      <h3>{t.score.deltas}</h3>
      <table className="scores">
        <tbody>
          {result.deltas.map((delta, seat) => (
            <tr key={seat}>
              <td>{name(seat)}</td>
              <td className={delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}>{formatSigned(delta)}</td>
              <td>{formatSigned(session.totals[seat] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="stack" style={{ marginTop: 20 }}>
        <button type="button" className="primary" onClick={onNext}>
          {t.score.next}
        </button>
      </div>
    </div>
  );
}
