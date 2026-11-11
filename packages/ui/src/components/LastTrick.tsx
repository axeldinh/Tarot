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

export interface TrickHistoryProps {
  tricks: readonly CompletedTrick[];
  seatName(seat: number): string;
}

/**
 * Every trick of the hand so far, newest first: the latest in full (as
 * `LastTrick` shows it), the rest as compact rows with the winner outlined.
 */
export function TrickHistory({ tricks, seatName }: TrickHistoryProps): JSX.Element | null {
  const { t } = useI18n();
  const latest = tricks[tricks.length - 1];
  if (!latest) return null;
  const earlier = tricks.slice(0, -1).reverse();
  return (
    <>
      <LastTrick trick={latest} seatName={seatName} />
      {earlier.length > 0 && (
        <div className="trick-history" data-testid="trick-history">
          <h3>{t.table.earlierTricks}</h3>
          {earlier.map((trick, i) => (
            <div key={earlier.length - i} className="trick-history-row">
              <span className="n">{t.table.trickN(earlier.length - i)}</span>
              <span className="cards">
                {trick.plays.map((play) => (
                  <span
                    key={play.card}
                    className={play.player === trick.winner ? 'winner' : undefined}
                    title={seatName(play.player)}
                  >
                    <CardFace card={play.card as Card} width={30} />
                  </span>
                ))}
              </span>
              <span className="to">{seatName(trick.winner)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
