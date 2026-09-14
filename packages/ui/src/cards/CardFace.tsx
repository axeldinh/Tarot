import type { JSX } from 'react';
import {
  CAVALIER,
  DAME,
  ROI,
  VALET,
  cardId,
  isBout,
  isExcuse,
  isTrump,
  rankOf,
  suitOf,
  type Card,
  type Suit,
} from '@tarot/engine';
import { Pip, SUIT_COLOUR, SUIT_SYMBOL } from './pips.tsx';

/**
 * Card faces drawn from scratch: no deck artwork, nothing traced.
 *
 * At the size a card is actually shown on a phone, a classic pip layout is
 * unreadable, so each card leads with a large index and one big pip. Trumps are
 * numbered tiles in their own colour, as the spec asks, and the three bouts
 * carry a small marker so they can be picked out at a glance.
 */

const COURT_LETTERS: Record<number, string> = {
  [VALET]: 'V',
  [CAVALIER]: 'C',
  [DAME]: 'D',
  [ROI]: 'R',
};

export const CARD_WIDTH = 60;
export const CARD_HEIGHT = 92;

export interface CardFaceProps {
  card: Card;
  /** Rendered width in CSS pixels; the height follows. */
  width?: number;
  className?: string;
}

function cornerIndex(card: Card): string {
  if (isExcuse(card)) return '★';
  if (isTrump(card)) return String(rankOf(card));
  const rank = rankOf(card);
  return COURT_LETTERS[rank] ?? String(rank);
}

/** A small diamond marks the Petit, the 21 and the Excuse. */
function BoutMark(): JSX.Element {
  return <path d="M48 8 L52 13 L48 18 L44 13 Z" fill="var(--bout)" />;
}

export function CardFace({ card, width = CARD_WIDTH, className }: CardFaceProps): JSX.Element {
  const height = (width / CARD_WIDTH) * CARD_HEIGHT;
  const label = cardId(card);
  const shared = {
    className,
    width,
    height,
    viewBox: `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`,
    role: 'img' as const,
    'aria-label': label,
    'data-card': label,
  };

  // The corner index is the only part of a card that stays visible in a fanned
  // hand, so every card gets one — a trump you cannot read is no use.
  if (isExcuse(card)) {
    return (
      <svg {...shared}>
        <Frame fill="var(--excuse-bg)" stroke="var(--excuse-ink)" />
        <text x={11} y={19} className="card-index" fill="var(--excuse-ink)">
          {'\u2605'}
        </text>
        <Star cx={34} cy={48} r={16} fill="var(--excuse-ink)" />
        <text x={32} y={80} className="card-name" fill="var(--excuse-ink)">
          EXCUSE
        </text>
        <BoutMark />
      </svg>
    );
  }

  if (isTrump(card)) {
    const rank = rankOf(card);
    return (
      <svg {...shared}>
        <Frame fill="var(--trump-bg)" stroke="var(--trump-ink)" />
        <text x={11} y={19} className="card-index" fill="var(--trump-ink)">
          {rank}
        </text>
        <text x={11} y={29} className="card-index-suit" fill="var(--trump-ink)">
          {'\u2726'}
        </text>
        <text x={34} y={60} className="card-trump-number" fill="var(--trump-ink)">
          {rank}
        </text>
        <text x={32} y={80} className="card-name" fill="var(--trump-ink)">
          ATOUT
        </text>
        {isBout(card) && <BoutMark />}
      </svg>
    );
  }

  const suit = suitOf(card) as Suit;
  const rank = rankOf(card);
  const colour = SUIT_COLOUR[suit];
  const court = COURT_LETTERS[rank];

  return (
    <svg {...shared}>
      <Frame fill="var(--card-bg)" stroke="var(--card-edge)" />
      <text x={11} y={19} className="card-index" fill={colour}>
        {cornerIndex(card)}
      </text>
      <text x={11} y={29} className="card-index-suit" fill={colour}>
        {SUIT_SYMBOL[suit]}
      </text>
      {court ? (
        <>
          <rect x={17} y={34} width={26} height={34} rx={3} fill={colour} opacity={0.12} />
          <text x={30} y={58} className="card-court" fill={colour}>
            {court}
          </text>
          <Pip suit={suit} x={30} y={77} size={15} />
        </>
      ) : (
        <Pip suit={suit} x={30} y={56} size={30} />
      )}
      <text x={49} y={84} className="card-index card-index-flipped" fill={colour}>
        {cornerIndex(card)}
      </text>
    </svg>
  );
}

function Frame({ fill, stroke }: { fill: string; stroke: string }): JSX.Element {
  return (
    <rect
      x={1}
      y={1}
      width={CARD_WIDTH - 2}
      height={CARD_HEIGHT - 2}
      rx={5}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }): JSX.Element {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.44;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return <polygon points={points.join(' ')} fill={fill} />;
}

export function CardBack({ width = CARD_WIDTH, className }: { width?: number; className?: string }): JSX.Element {
  const height = (width / CARD_WIDTH) * CARD_HEIGHT;
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
      aria-hidden="true"
    >
      <Frame fill="var(--back-bg)" stroke="var(--back-edge)" />
      <rect x={6} y={6} width={CARD_WIDTH - 12} height={CARD_HEIGHT - 12} rx={3} fill="none" stroke="var(--back-edge)" strokeWidth={1} opacity={0.7} />
      <path
        d={`M6 ${CARD_HEIGHT / 2} L${CARD_WIDTH / 2} 6 L${CARD_WIDTH - 6} ${CARD_HEIGHT / 2} L${CARD_WIDTH / 2} ${CARD_HEIGHT - 6} Z`}
        fill="none"
        stroke="var(--back-edge)"
        strokeWidth={1}
        opacity={0.7}
      />
    </svg>
  );
}
