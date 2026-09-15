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
 * The court figures: a bust, drawn as a solid silhouette with its details cut
 * back out in the card's own colour.
 *
 * Silhouettes rather than outlines, because an outlined figure at the size a
 * card is actually shown collapses into grey fuzz. Everything that does not
 * help tell the four apart has been taken out again — hair, a second visor
 * slit, the valet's feather — because at 60 pixels those read as smudges
 * rather than as detail. What is left is the headgear in profile: a spiked
 * crown, a smooth coronet, a plumed helm, a soft cap worn at an angle.
 */
function Court({ rank, colour }: { rank: number; colour: string }): JSX.Element {
  const cut = 'var(--card-bg)';
  return (
    <g fill={colour}>
      <path d="M17.5 70 C17.5 61 23 56.5 30 56.5 C37 56.5 42.5 61 42.5 70 Z" />

      {rank === CAVALIER ? (
        <>
          <path d="M36.5 35 C43 28 47.5 33.5 43.5 39.5 C41.5 42 39 41.5 37.5 39 Z" />
          <path d="M22.5 55 C22.5 40 25.5 32.5 30 32.5 C34.5 32.5 37.5 40 37.5 55 Z" />
          <path d="M24 44 H36" stroke={cut} strokeWidth={2.4} />
        </>
      ) : (
        <ellipse cx={30} cy={47.5} rx={6.5} ry={7.5} />
      )}

      {rank === ROI && (
        <>
          <path d="M21 41 L21 30.5 L25 36 L27.75 26.5 L30 32.5 L32.25 26.5 L35 36 L39 30.5 L39 41 Z" />
          <path d="M26 50.5 H34" stroke={cut} strokeWidth={1.5} />
        </>
      )}
      {rank === DAME && (
        <>
          <path d="M22 41 C22 33.5 25.5 30 30 30 C34.5 30 38 33.5 38 41 Z" />
          {/* Without this the band merges into the head and the coronet
              disappears; it is the line that makes her a queen and not a
              silhouette with a dot on it. */}
          <path d="M22.5 40.5 H37.5" stroke={cut} strokeWidth={1.4} />
          <circle cx={30} cy={35.5} r={2} fill={cut} />
        </>
      )}
      {rank === VALET && (
        <>
          <ellipse cx={30} cy={38.5} rx={9.5} ry={3.8} transform="rotate(-12 30 38.5)" />
          <circle cx={30.5} cy={34.6} r={1.5} />
        </>
      )}
    </g>
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
          <Court rank={rank} colour={colour} />
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
