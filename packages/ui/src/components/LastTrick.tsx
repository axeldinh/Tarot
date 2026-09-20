import type { JSX } from 'react';
import type { Card, CompletedTrick } from '@tarot/engine';
import { CardFace } from '../cards/CardFace.tsx';
import { useI18n } from '../i18n/index.ts';

export interface LastTrickProps {
  trick: CompletedTrick;
  seatName(seat: number): string;
}

/**
 * The trick that has just been swept away, shown on demand: `TrickArea`
 * already holds it face up for a moment before gathering it to the winner,
 * but once that animation finishes there is otherwise no way back to it.
 */
export function LastTrick({ trick, seatName }: LastTrickProps): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="last-trick" data-testid="last-trick">
      {trick.plays.map((play) => (
        <div
          key={play.card}
          className={`last-trick-play${play.player === trick.winner ? ' winner' : ''}`}
        >
          <CardFace card={play.card as Card} width={54} />
          <span className="who">{seatName(play.player)}</span>
        </div>
      ))}
      <p className="note">{t.table.trickTo(seatName(trick.winner))}</p>
    </div>
  );
}
