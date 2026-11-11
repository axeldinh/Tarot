import type { JSX } from 'react';
import { CAVALIER, DAME, ROI, VALET, type Suit } from '@tarot/engine';
import { Pip } from './pips.tsx';

/**
 * Illustrated court figures, drawn from scratch as plain SVG geometry (no deck
 * artwork, nothing traced). Each rank has its own figure and attribute; each
 * suit adds its emblem, so all sixteen courts are told apart at a glance:
 *
 *   King    crowned, bearded, ermine collar, sceptre
 *   Queen   coronet, long veil, flower
 *   Cavalier  helmeted rider on a rearing horse, lance and pennant
 *   Valet   feathered cap, tunic, halberd
 *
 * The art lives in the panel x 15..45, y 22..70, clear of the corner indices.
 */

const SKIN = '#f2d5b4';
const GOLD = '#d9a520';
const GOLD_DARK = '#a87a10';
const FUR = '#ffffff';

function King({ colour, cut }: { colour: string; cut: string }): JSX.Element {
  return (
    <g>
      {/* robe */}
      <path d="M16 70 L16 61 C16 55 22 52 30 52 C38 52 44 55 44 61 L44 70 Z" fill={colour} />
      {/* ermine collar with its tails */}
      <path d="M19 57 Q30 65 41 57 L41 61 Q30 70 19 61 Z" fill={FUR} stroke={cut} strokeWidth={0.4} />
      {[24, 30, 36].map((x) => (
        <path key={x} d={`M${x} 62.5 l0.9 3 l-1.8 0 Z`} fill="#1b1b1b" />
      ))}
      {/* sceptre */}
      <path d="M41.5 31 V62" stroke={GOLD_DARK} strokeWidth={1.3} />
      <circle cx={41.5} cy={30} r={2.4} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.5} />
      {/* head, beard, face */}
      <ellipse cx={30} cy={44.5} rx={6.8} ry={7.8} fill={SKIN} />
      <path d="M23.2 44 C23 54 37 54 36.8 44 C34.5 48.5 25.5 48.5 23.2 44 Z" fill={colour} />
      <path d="M27 51 H33" stroke={cut} strokeWidth={1} strokeLinecap="round" />
      <circle cx={27.3} cy={43} r={0.9} fill="#1b1b1b" />
      <circle cx={32.7} cy={43} r={0.9} fill="#1b1b1b" />
      {/* crown */}
      <path
        d="M22.5 39.5 L22.5 29.5 L26.5 34 L30 27 L33.5 34 L37.5 29.5 L37.5 39.5 Z"
        fill={GOLD}
        stroke={GOLD_DARK}
        strokeWidth={0.6}
      />
      <circle cx={30} cy={36.5} r={1.4} fill={colour} />
    </g>
  );
}

function Queen({ colour, cut }: { colour: string; cut: string }): JSX.Element {
  return (
    <g>
      {/* veil falling behind the shoulders */}
      <path d="M22.5 38 C18 46 19 58 16.5 66 L26 62 L26 44 Z" fill={colour} opacity={0.55} />
      <path d="M37.5 38 C42 46 41 58 43.5 66 L34 62 L34 44 Z" fill={colour} opacity={0.55} />
      {/* gown */}
      <path d="M16 70 L18 61 C19 55 24 52 30 52 C36 52 41 55 42 61 L44 70 Z" fill={colour} />
      <path d="M24 53.5 L30 62 L36 53.5" fill="none" stroke={GOLD} strokeWidth={1.1} />
      <circle cx={30} cy={62} r={1.3} fill={GOLD} />
      {/* head */}
      <ellipse cx={30} cy={45} rx={6.2} ry={7.6} fill={SKIN} />
      <path d="M23.6 43 C24 37 36 37 36.4 43 C33 40.5 27 40.5 23.6 43 Z" fill={colour} opacity={0.85} />
      <circle cx={27.5} cy={45} r={0.85} fill="#1b1b1b" />
      <circle cx={32.5} cy={45} r={0.85} fill="#1b1b1b" />
      <path d="M28 49.8 Q30 51.3 32 49.8" fill="none" stroke={colour} strokeWidth={0.9} strokeLinecap="round" />
      {/* coronet */}
      <path
        d="M23.5 38.5 C23.5 33 25.5 31 27 33.5 C28 29.5 32 29.5 33 33.5 C34.5 31 36.5 33 36.5 38.5 Z"
        fill={GOLD}
        stroke={GOLD_DARK}
        strokeWidth={0.6}
      />
      <circle cx={30} cy={35.5} r={1.3} fill={cut} stroke={GOLD_DARK} strokeWidth={0.4} />
      {/* flower held up */}
      <path d="M40.5 69 V57" stroke="#3b7a3b" strokeWidth={1} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx={40.5}
          cy={53.8}
          rx={1.3}
          ry={2}
          fill={GOLD}
          transform={`rotate(${a} 40.5 55.5) translate(0 -1.2)`}
        />
      ))}
    </g>
  );
}

function Cavalier({ colour, cut }: { colour: string; cut: string }): JSX.Element {
  return (
    <g>
      {/* lance with pennant */}
      <path d="M19 70 L41 25" stroke={GOLD_DARK} strokeWidth={1.1} />
      <path d="M41 25 L45 28.5 L38.5 29.5 Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.4} />
      {/* horse: neck, head, mane */}
      <path
        d="M27 70 C27 58 31 49 37 43 L38 35 L41.5 38 L44.5 46 C43.5 49 41.5 49.5 39.5 49 C37.5 55 38.5 62 42.5 70 Z"
        fill={colour}
      />
      <path d="M37 43 C33 47 30 55 29.5 63" fill="none" stroke={cut} strokeWidth={1.3} strokeDasharray="1.6 1.4" />
      <circle cx={40.5} cy={42} r={0.9} fill={cut} />
      <path d="M38 35 L36.7 31.8 L40 34.2 Z" fill={colour} />
      {/* rider: torso, plumed helmet */}
      <path d="M16 70 L17 59 C18 54 22 52 25.5 52 C29 52 31 55 31 59 L31 70 Z" fill={colour} opacity={0.85} />
      <path d="M20 56 L28 56" stroke={GOLD} strokeWidth={1} />
      <ellipse cx={24} cy={47} rx={4.8} ry={5.6} fill={SKIN} />
      <path d="M19 46 C19 38.5 29 38.5 29 46 L29 47.5 L19 47.5 Z" fill="#8a93a0" stroke="#5a6270" strokeWidth={0.5} />
      <path d="M20 46.6 H28" stroke="#3b4048" strokeWidth={0.9} />
      <path d="M24 39 C22 32 27 29 31 31 C28 31.5 27.5 34 28 38 Z" fill={GOLD} />
    </g>
  );
}

function Valet({ colour, cut }: { colour: string; cut: string }): JSX.Element {
  return (
    <g>
      {/* halberd */}
      <path d="M17.5 70 V30" stroke={GOLD_DARK} strokeWidth={1.2} />
      <path d="M17.5 29 L21.5 34.5 L17.5 36 L14.5 34.5 Z" fill="#aab2bd" stroke="#6b7480" strokeWidth={0.4} />
      {/* tunic with a chequered front */}
      <path d="M20 70 L20 60 C20 55 25 52 30 52 C35 52 40 55 40 60 L40 70 Z" fill={colour} />
      <path d="M26 56 H34 V70 H26 Z" fill={FUR} opacity={0.9} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i % 2 ? 26 : 30} y={56 + i * 4.6} width={4} height={2.3} fill={colour} />
      ))}
      <path d="M20 60 C20 55 25 52 30 52 C35 52 40 55 40 60" fill="none" stroke={GOLD} strokeWidth={0.9} />
      {/* face */}
      <ellipse cx={30} cy={45.5} rx={6} ry={7} fill={SKIN} />
      <circle cx={27.5} cy={45} r={0.85} fill="#1b1b1b" />
      <circle cx={32.5} cy={45} r={0.85} fill="#1b1b1b" />
      <path d="M28.2 49.2 Q30 50.5 31.8 49.2" fill="none" stroke={colour} strokeWidth={0.9} strokeLinecap="round" />
      {/* soft cap and feather */}
      <path d="M23 42 C22 34 33 31 38 37.5 C38 40 36.5 42 36 42.5 C31 40 27 40.5 23 42 Z" fill={colour} />
      <path d="M23 42 H37" stroke={GOLD} strokeWidth={1.2} />
      <path d="M36 37 C41 31 45 29.5 44.5 25.5 C41.5 28 38 30 34.5 34 Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.4} />
    </g>
  );
}

export function Court({ rank, suit, colour }: { rank: number; suit: Suit; colour: string }): JSX.Element {
  const cut = 'var(--card-bg)';
  const Figure = rank === ROI ? King : rank === DAME ? Queen : rank === CAVALIER ? Cavalier : Valet;
  return (
    <g>
      <clipPath id={`court-clip-${rank}`}>
        <rect x={15} y={22} width={30} height={48} rx={3} />
      </clipPath>
      <rect x={15} y={22} width={30} height={48} rx={3} fill={colour} opacity={0.09} />
      <g clipPath={`url(#court-clip-${rank})`}>
        <Figure colour={colour} cut={cut} />
      </g>
      <rect x={15} y={22} width={30} height={48} rx={3} fill="none" stroke={colour} strokeWidth={0.7} opacity={0.6} />
      {/* the suit's emblem, top right of the panel */}
      <Pip suit={suit} x={39.5} y={27.5} size={6.5} />
    </g>
  );
}

export const COURT_RANKS: readonly number[] = [VALET, CAVALIER, DAME, ROI];
