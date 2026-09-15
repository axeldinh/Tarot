import { useEffect, useState, type CSSProperties, type JSX } from 'react';
import type { Card, PlayerView } from '@tarot/engine';
import { CardFace } from '../cards/CardFace.tsx';
import { useI18n } from '../i18n/index.ts';
import { TRICK_GATHER_MS, TRICK_HOLD_MS } from '../state/timing.ts';

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
  /** Names the seat that has just won a trick, while it is being gathered. */
  seatName?: (seat: number) => string;
}

export function TrickArea({
  view,
  cardWidth,
  waitingFor,
  seatName,
}: TrickAreaProps): JSX.Element {
  const { t } = useI18n();
  // `null` while no trick is being gathered; 'held' for the pause that lets the
  // trick be read, then 'away' for the slide to the winner.
  const [gather, setGather] = useState<'held' | 'away' | null>(null);
  const trickCount = view.tricks.length;

  useEffect(() => {
    if (trickCount === 0) {
      setGather(null);
      return;
    }
    setGather('held');
    const slide = setTimeout(() => setGather('away'), TRICK_HOLD_MS);
    const done = setTimeout(() => setGather(null), TRICK_HOLD_MS + TRICK_GATHER_MS);
    return () => {
      clearTimeout(slide);
      clearTimeout(done);
    };
  }, [trickCount]);

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
  const open = current?.plays ?? [];
  // Between tricks the table is not cleared: the trick that has just been won
  // is held face up, then slides to whoever won it. The host waits out the
  // same span before leading again, so nothing lands on top of it.
  const gathering = open.length === 0 && gather !== null && last !== undefined;
  const plays = open.length > 0 ? open : gathering ? last.plays : [];

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

  const away = gathering && gather === 'away';
  const winnerSeat = last?.winner ?? view.self;
  const winner = seatPosition(
    (winnerSeat - view.self + view.playerCount) % view.playerCount,
    view.playerCount,
  );

  return (
    <div
      className="trick"
      data-testid="trick"
      style={{ '--gather': `${TRICK_GATHER_MS}ms` } as CSSProperties}
    >
      {plays.map((play) => {
        const relative = (play.player - view.self + view.playerCount) % view.playerCount;
        const seat = seatPosition(relative, view.playerCount);
        const at = away ? winner : seat;
        return (
          // Keyed by the card, not the seat, so the next trick's cards are new
          // nodes and play their landing animation instead of sliding out of
          // the previous trick's position.
          <div
            key={play.card}
            className={`trick-card${gathering ? ' gathering' : ''}${away ? ' away' : ''}`}
            style={{ left: at.left, top: at.top }}
          >
            <CardFace card={play.card as Card} width={cardWidth} />
          </div>
        );
      })}
      {/* In the middle, not at the winner's seat: there it landed on top of
          their own card and their badge. The cards travelling towards them say
          who won it; this only has to say what happened. */}
      {gathering && seatName && (
        <div className="trick-won">{t.table.trickTo(seatName(winnerSeat))}</div>
      )}
    </div>
  );
}
