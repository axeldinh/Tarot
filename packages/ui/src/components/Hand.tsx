import { useState, type CSSProperties, type JSX } from 'react';
import type { Card } from '@tarot/engine';
import { CardFace } from '../cards/CardFace.tsx';

export interface HandProps {
  cards: readonly Card[];
  /** Cards that can be tapped. Everything else is dimmed and inert. */
  playable: ReadonlySet<Card>;
  chosen?: ReadonlySet<Card>;
  cardWidth: number;
  /**
   * Whether a card is being asked for at all. While the table is bidding or
   * waiting on somebody else there is no illegal move to warn about, so the
   * hand is shown plainly rather than greyed from end to end.
   */
  choosing: boolean;
  onPlay(card: Card): void;
  /** Called when a dimmed card is tapped, so the screen can say why. */
  onBlocked?(card: Card): void;
}

/**
 * The hand, fanned along the bottom. Legal cards lift and can be tapped; the
 * rest are dimmed and refuse the tap, but still answer when asked why.
 */
export function Hand({
  cards,
  playable,
  chosen,
  cardWidth,
  choosing,
  onPlay,
  onBlocked,
}: HandProps): JSX.Element {
  const [lifted, setLifted] = useState<Card | null>(null);
  const middle = (cards.length - 1) / 2;
  // While a card is being asked for, the legal ones are given more of the width
  // than the rest. A fanned hand of eighteen leaves each card a sliver barely
  // wider than a pencil; spreading the playable ones makes them a real target
  // and shows at a glance what the choice actually is.
  const spread = choosing ? cards.filter((c) => playable.has(c)).length : 0;
  // A gentle arc, flattened as the hand gets longer: at 24 cards a steep fan
  // runs off both edges of a phone.
  // Cap the whole fan angle rather than the per-card step: what runs off the
  // edge of a phone is the total swing, not the angle between neighbours.
  const step = cards.length > 1 ? 18 / (cards.length - 1) : 0;

  return (
    <div className="hand">
      <div
        className="hand-inner"
        style={
          {
            '--n': cards.length,
            '--wide': spread,
            '--narrow': cards.length - spread,
          } as CSSProperties
        }
      >
        {cards.map((card, index) => {
          const can = playable.has(card);
          const isChosen = chosen?.has(card) ?? false;
          const offset = index - middle;
          const angle = offset * step;
          const classes = [
            'hand-card',
            can ? 'playable' : choosing ? 'blocked' : 'idle',
            isChosen ? 'chosen' : '',
            lifted === card && can ? 'lifted' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={card}
              type="button"
              className={classes}
              aria-disabled={choosing && !can}
              data-card={card}
              style={
                {
                  '--angle': `${angle.toFixed(2)}deg`,
                  '--arc': `${(Math.abs(offset) ** 1.8 * 0.16).toFixed(2)}px`,
                  // Playable cards stack above the dimmed ones so a legal move
                  // can always be tapped, whatever the fan puts on top of it.
                  zIndex: can ? 100 + index : index,
                } as CSSProperties
              }
              onPointerEnter={() => setLifted(card)}
              onPointerLeave={() => setLifted((c) => (c === card ? null : c))}
              onClick={() => (can ? onPlay(card) : onBlocked?.(card))}
            >
              <CardFace card={card} width={cardWidth} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
