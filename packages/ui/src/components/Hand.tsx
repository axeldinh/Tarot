import { useMemo, useState, type CSSProperties, type JSX } from 'react';
import { sortHand, type Card } from '@tarot/engine';
import { CardFace } from '../cards/CardFace.tsx';
import { useI18n } from '../i18n/index.ts';

export interface HandProps {
  /** The hand, in any order: it is sorted here before being fanned. */
  cards: readonly Card[];
  /** Cards that can be tapped. Everything else is dimmed and inert. */
  playable: ReadonlySet<Card>;
  chosen?: ReadonlySet<Card>;
  /**
   * Cards the taker just picked up from the chien, marked so they stand out
   * among the rest of the hand while the ecart is being built — otherwise
   * sorting mixes them in and there is no way to tell them apart.
   */
  fromChien?: ReadonlySet<Card>;
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
  /** Light the hand up: it is this player's turn to put a card down. */
  highlight?: boolean;
}

/**
 * The hand, fanned along the bottom. Legal cards lift and can be tapped; the
 * rest are dimmed and refuse the tap, but still answer when asked why.
 *
 * Cards are sorted here rather than by the caller. A hand arrives in the order
 * it was dealt, which is no order at all, and sorting at the point of display
 * means no screen can forget to do it. The order does not change as cards are
 * played, so a card stays where its neighbours put it for the whole hand.
 */
export function Hand({
  cards,
  playable,
  chosen,
  fromChien,
  cardWidth,
  choosing,
  onPlay,
  onBlocked,
  highlight,
}: HandProps): JSX.Element {
  const { t } = useI18n();
  const [lifted, setLifted] = useState<Card | null>(null);
  const ordered = useMemo(() => sortHand(cards), [cards]);
  const middle = (ordered.length - 1) / 2;
  // While a card is being asked for, the legal ones are given more of the width
  // than the rest. A fanned hand of eighteen leaves each card a sliver barely
  // wider than a pencil; spreading the playable ones makes them a real target
  // and shows at a glance what the choice actually is.
  const spread = choosing ? ordered.filter((c) => playable.has(c)).length : 0;
  // A gentle arc, flattened as the hand gets longer: at 24 cards a steep fan
  // runs off both edges of a phone.
  // Cap the whole fan angle rather than the per-card step: what runs off the
  // edge of a phone is the total swing, not the angle between neighbours.
  const step = ordered.length > 1 ? 18 / (ordered.length - 1) : 0;

  return (
    <div className={`hand${highlight ? ' your-turn' : ''}`}>
      <div
        className="hand-inner"
        style={
          {
            '--n': ordered.length,
            '--wide': spread,
            '--narrow': ordered.length - spread,
          } as CSSProperties
        }
      >
        {ordered.map((card, index) => {
          const can = playable.has(card);
          const isChosen = chosen?.has(card) ?? false;
          const isFromChien = fromChien?.has(card) ?? false;
          const offset = index - middle;
          const angle = offset * step;
          const classes = [
            'hand-card',
            can ? 'playable' : choosing ? 'blocked' : 'idle',
            isChosen ? 'chosen' : '',
            isFromChien ? 'from-chien' : '',
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
              aria-label={isFromChien ? t.ecart.fromChien : undefined}
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
