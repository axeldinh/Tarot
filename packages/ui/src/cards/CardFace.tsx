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
import { Court } from './courts.tsx';
import { Pip, SUIT_COLOUR, SUIT_SYMBOL } from './pips.tsx';

/**
 * Card faces drawn from scratch: no deck artwork, nothing traced, no image
 * files. Every card is geometry, so the whole 78-card deck costs a few hundred
 * bytes, scales to any screen without blurring, and carries no licence.
 *
 * Two things drive the layout. The corner index is the only part of a card that
 * survives being fanned, so it is large and always present. The middle of the
 * card is only ever read at full size — in the trick, in the chien — so it can
 * afford the classic pip arrangement and a drawn figure for the courts.
 */

const COURT_LETTERS: Record<number, string> = {
  [VALET]: 'V',
  [CAVALIER]: 'C',
  [DAME]: 'D',
  [ROI]: 'R',
};

export const CARD_WIDTH = 60;
export const CARD_HEIGHT = 92;

/** Half-way down the card: pips below this line are drawn upside down. */
const MIDLINE = 46;

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

/**
 * The index and suit glyph in the top-left, repeated upside down in the
 * bottom-right by rotating a copy about the middle of the card — which is
 * exactly how a real card is printed.
 */
function Corners({
  index,
  symbol,
  colour,
}: {
  index: string;
  symbol: string;
  colour: string;
}): JSX.Element {
  const pair = (
    <>
      <text x={10} y={17} className="card-index" fill={colour}>
        {index}
      </text>
      <text x={10} y={27} className="card-index-suit" fill={colour}>
        {symbol}
      </text>
    </>
  );
  return (
    <>
      {pair}
      <g transform={`rotate(180 ${CARD_WIDTH / 2} ${CARD_HEIGHT / 2})`}>{pair}</g>
    </>
  );
}

/**
 * Where the pips go on a numbered card, in the traditional arrangement: the
 * ace alone and large, 2-3 down the middle, 4-10 in columns with the spare
 * pips filling the gaps.
 */
const PIP_LAYOUT: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[30, 46]],
  2: [
    [30, 28],
    [30, 64],
  ],
  3: [
    [30, 28],
    [30, 46],
    [30, 64],
  ],
  4: [
    [22.5, 28],
    [37.5, 28],
    [22.5, 64],
    [37.5, 64],
  ],
  5: [
    [22.5, 28],
    [37.5, 28],
    [30, 46],
    [22.5, 64],
    [37.5, 64],
  ],
  6: [
    [22.5, 28],
    [37.5, 28],
    [22.5, 46],
    [37.5, 46],
    [22.5, 64],
    [37.5, 64],
  ],
  7: [
    [22.5, 28],
    [37.5, 28],
    [30, 37],
    [22.5, 46],
    [37.5, 46],
    [22.5, 64],
    [37.5, 64],
  ],
  8: [
    [22.5, 28],
    [37.5, 28],
    [30, 37],
    [22.5, 46],
    [37.5, 46],
    [30, 55],
    [22.5, 64],
    [37.5, 64],
  ],
  9: [
    [22.5, 27],
    [37.5, 27],
    [22.5, 39],
    [37.5, 39],
    [30, 46],
    [22.5, 53],
    [37.5, 53],
    [22.5, 65],
    [37.5, 65],
  ],
  10: [
    [22.5, 27],
    [37.5, 27],
    [30, 33],
    [22.5, 39],
    [37.5, 39],
    [22.5, 53],
    [37.5, 53],
    [30, 59],
    [22.5, 65],
    [37.5, 65],
  ],
};

function pipSize(rank: number): number {
  if (rank === 1) return 26;
  return rank >= 9 ? 10 : 12.5;
}

function Pips({ suit, rank }: { suit: Suit; rank: number }): JSX.Element {
  const size = pipSize(rank);
  return (
    <>
      {(PIP_LAYOUT[rank] ?? []).map(([x, y], i) => (
        <Pip key={i} suit={suit} x={x} y={y} size={size} flip={y > MIDLINE} />
      ))}
    </>
  );
}

/**
 * Trumps carry their strength as colour: a pale tile at atout 1 darkening
 * steadily to atout 21, so which of two trumps is the bigger is visible before
 * the numbers are read.
 */
function trumpTile(rank: number): { fill: string; ink: string } {
  const lightness = 86 - (rank - 1) * 2.2;
  return {
    fill: `hsl(232 45% ${lightness.toFixed(1)}%)`,
    ink: lightness < 62 ? '#ffffff' : 'hsl(232 55% 26%)',
  };
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

  if (isExcuse(card)) {
    return (
      <svg {...shared}>
        <Frame fill="var(--excuse-bg)" stroke="var(--excuse-ink)" />
        <Corners index={'★'} symbol={'✻'} colour="var(--excuse-ink)" />
        <g opacity={0.25}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (Math.PI / 4) * i;
            return (
              <path
                key={i}
                d={`M${30 + 18 * Math.cos(a)} ${46 + 18 * Math.sin(a)} L${30 + 23 * Math.cos(a)} ${46 + 23 * Math.sin(a)}`}
                stroke="var(--excuse-ink)"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            );
          })}
        </g>
        <Star cx={30} cy={46} r={15} fill="var(--excuse-ink)" />
        {/* Below the upside-down index rather than beside it: centred at y=80
            the last letter ran into the corner glyph. */}
        <text x={30} y={85.5} className="card-name" fill="var(--excuse-ink)">
          EXCUSE
        </text>
        <BoutMark />
      </svg>
    );
  }

  if (isTrump(card)) {
    const rank = rankOf(card);
    const { fill, ink } = trumpTile(rank);
    return (
      <svg {...shared}>
        <Frame fill="var(--trump-bg)" stroke="var(--trump-ink)" />
        <Corners index={String(rank)} symbol={'✦'} colour="var(--trump-ink)" />
        {/* No caption under the tile: at atout 10 and above it collided with
            the upside-down index in the corner. The tile and the corner glyph
            already say "trump" on their own. */}
        <rect x={13} y={23} width={34} height={46} rx={4} fill={fill} />
        <text x={30} y={54} className="card-trump-number" fill={ink}>
          {rank}
        </text>
        {rank === 21 && <Laurel />}
        {rank === 1 && <Bateleur />}
        {isBout(card) && <BoutMark />}
      </svg>
    );
  }

  const suit = suitOf(card) as Suit;
  const rank = rankOf(card);
  const colour = SUIT_COLOUR[suit];
  const isCourt = rank in COURT_LETTERS;

  return (
    <svg {...shared}>
      <Frame fill="var(--card-bg)" stroke="var(--card-edge)" />
      <Corners index={cornerIndex(card)} symbol={SUIT_SYMBOL[suit]} colour={colour} />
      {isCourt ? (
        <>
          <Court rank={rank} suit={suit} colour={colour} />
          <Pip suit={suit} x={30} y={80} size={11} />
        </>
      ) : (
        <Pips suit={suit} rank={rank} />
      )}
    </svg>
  );
}

function Frame({ fill, stroke }: { fill: string; stroke: string }): JSX.Element {
  return (
    <>
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
      <rect
        x={4}
        y={4}
        width={CARD_WIDTH - 8}
        height={CARD_HEIGHT - 8}
        rx={3}
        fill="none"
        stroke={stroke}
        strokeWidth={0.6}
        opacity={0.35}
      />
    </>
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

/** The 21, the World: its number sits inside a laurel wreath. */
function Laurel(): JSX.Element {
  const leaves = Array.from({ length: 9 }, (_, i) => 28 + (i * 124) / 8);
  const side = (flip: boolean): JSX.Element => (
    <g transform={flip ? 'translate(60 0) scale(-1 1)' : undefined}>
      {leaves.map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = 30 + 17 * Math.cos(Math.PI - a);
        const y = 46 + 17 * Math.sin(Math.PI - a) * 1.15;
        return (
          <ellipse
            key={deg}
            cx={x}
            cy={y}
            rx={1.2}
            ry={2.8}
            fill="#e2b93b"
            transform={`rotate(${deg - 90 + 180} ${x} ${y})`}
          />
        );
      })}
    </g>
  );
  return (
    <g opacity={0.95}>
      {side(false)}
      {side(true)}
      <path d="M26 71 Q30 73.5 34 71" fill="none" stroke="#c0392b" strokeWidth={1.2} />
    </g>
  );
}

/** The Petit, atout 1, the Bateleur: a juggler's wide-brimmed hat over the number. */
function Bateleur(): JSX.Element {
  return (
    <g>
      <ellipse cx={30} cy={37} rx={9} ry={2.4} fill="#e2b93b" stroke="#a87a10" strokeWidth={0.5} />
      <path d="M24.5 36.5 C24.5 29 35.5 29 35.5 36.5 Z" fill="#e2b93b" stroke="#a87a10" strokeWidth={0.5} />
      <path d="M24.8 35 H35.2" stroke="#c0392b" strokeWidth={1.2} />
      <path d="M30 28.5 C33 25.5 36.5 27.5 36 30" fill="none" stroke="#c0392b" strokeWidth={1} />
    </g>
  );
}
