import type { JSX } from 'react';
import type { Card, PlayerView } from '@tarot/engine';
import { CardFace } from '../cards/CardFace.tsx';
import { useI18n } from '../i18n/index.ts';

/**
 * Where a seat sits around the table. The human is always at the bottom and the
 * others run anticlockwise from there, so the table reads the same way whichever
 * seat you are in. `radiusX` / `radiusY` put the trick cards near the middle and
 * the player badges out at the edge.
 */
export function seatPoint(
  relative: number,
  playerCount: number,
  radiusX: number,
  radiusY: number,
): { left: string; top: string } {
  const angle = (2 * Math.PI * relative) / playerCount;
  return {
    left: `${50 + radiusX * Math.sin(angle)}%`,
    top: `${50 + radiusY * Math.cos(angle)}%`,
  };
}

export function seatPosition(relative: number, playerCount: number): { left: string; top: string } {
  return seatPoint(relative, playerCount, 22, 24);
}

export interface SeatAnchor {
  style: Record<string, string>;
  side: 'left' | 'right' | 'top';
}

/**
 * Where a player's badge goes. Badges are wide and cards are not, so a badge on
 * the left or right of the table is pinned to that edge rather than centred on
 * its seat: centring it walks the badge over the card that seat just played.
 */
export function seatAnchor(relative: number, playerCount: number): SeatAnchor {
  const angle = (2 * Math.PI * relative) / playerCount;
  const x = Math.sin(angle);
  const top = `${50 + 39 * Math.cos(angle)}%`;
  if (x < -0.3) return { side: 'left', style: { left: '2%', top, transform: 'translateY(-50%)' } };
  if (x > 0.3) return { side: 'right', style: { right: '2%', top, transform: 'translateY(-50%)' } };
  return { side: 'top', style: { left: '50%', top, transform: 'translate(-50%, -50%)' } };
}

export interface TrickAreaProps {
  view: PlayerView;
  cardWidth: number;
  /** Name of whoever the table is waiting on, for the empty state. */
  waitingFor?: string;
}

export function TrickArea({ view, cardWidth, waitingFor }: TrickAreaProps): JSX.Element {
  const { t } = useI18n();

  // On a Petite or a Garde the chien is turned face up for everyone to see
  // before the taker buries anything, so that is what the middle of the table
  // shows while the ecart is being made.
  if (view.chien && view.chien.length > 0) {
    return (
      <div className="trick">
        <div className="chien" data-testid="chien">
          <div className="cards">
            {view.chien.map((card) => (
              <CardFace key={card} card={card} width={cardWidth * 0.8} />
            ))}
          </div>
          <div className="caption">
            {t.chien.heading}
            {view.taker === view.self ? ` \u2014 ${t.chien.takeIn}` : ''}
          </div>
        </div>
      </div>
    );
  }

  const current = view.currentTrick;
  const last = view.tricks[view.tricks.length - 1];
  // Between tricks the table is empty; keep the last one up so the player can
  // see what just happened instead of a blank felt.
  const plays = current && current.plays.length > 0 ? current.plays : (last?.plays ?? []);

  if (plays.length === 0) {
    return (
      <div className="trick">
        <div className="trick-empty">
          {view.phase !== 'playing'
            ? ''
            : view.currentPlayer === view.self
              ? t.table.yourTurn
              : `${waitingFor ?? ''}\u2026`}
        </div>
      </div>
    );
  }

  return (
    <div className="trick" data-testid="trick">
      {plays.map((play) => {
        const relative = (play.player - view.self + view.playerCount) % view.playerCount;
        const { left, top } = seatPosition(relative, view.playerCount);
        return (
          <div key={play.player} className="trick-card" style={{ left, top }}>
            <CardFace card={play.card as Card} width={cardWidth} />
          </div>
        );
      })}
    </div>
  );
}
