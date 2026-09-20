import type { JSX } from 'react';
import { sideOf, sumPoints2, type PlayerView } from '@tarot/engine';
import { useI18n } from '../i18n/index.ts';
import { formatPoints } from '../state/labels.ts';

export interface RoundScoreProps {
  view: PlayerView;
}

/**
 * Where the hand in progress stands: card points won in tricks so far,
 * taker's side against the defence's. Live for the whole round, not just at
 * the end — the ecart (and, on a Garde Sans, the chien) only settle the
 * final score once the hand is over, so this is a running look at the
 * tricks alone.
 */
export function RoundScore({ view }: RoundScoreProps): JSX.Element | null {
  const { t } = useI18n();
  if (view.taker === null) return null;

  let takerPoints2 = 0;
  let defencePoints2 = 0;
  for (const trick of view.tricks) {
    const points2 = sumPoints2(trick.plays.map((play) => play.card));
    if (sideOf(trick.winner, view.taker, view.partner) === 'taker') takerPoints2 += points2;
    else defencePoints2 += points2;
  }

  return (
    <div className="round-score" data-testid="round-score">
      <span className="round-score-side taker">
        <span className="who">{t.table.taker}</span>
        <span className="amount">{formatPoints(takerPoints2 / 2)}</span>
      </span>
      <span className="round-score-side defence">
        <span className="who">{t.table.defence}</span>
        <span className="amount">{formatPoints(defencePoints2 / 2)}</span>
      </span>
    </div>
  );
}
