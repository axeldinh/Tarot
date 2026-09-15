import type { JSX } from 'react';
import { CLUBS, DIAMONDS, HEARTS, SPADES, type Suit } from '@tarot/engine';

/**
 * The four standard pips, drawn from scratch as plain geometry. Each path is
 * authored inside a 100 x 100 box and scaled by the caller.
 */
const PATHS: Record<Suit, string> = {
  [SPADES]:
    'M50 8 C50 8 14 38 14 60 a20 20 0 0 0 33 15 C45 84 40 90 32 94 h36 c-8-4-13-10-15-19 a20 20 0 0 0 33-15 C86 38 50 8 50 8 Z',
  [HEARTS]:
    'M50 92 C22 70 10 54 10 38 A22 22 0 0 1 50 26 A22 22 0 0 1 90 38 C90 54 78 70 50 92 Z',
  [DIAMONDS]: 'M50 6 L88 50 L50 94 L12 50 Z',
  [CLUBS]:
    'M50 6 a17 17 0 0 1 13 28 a17 17 0 1 1 -7 27 C57 74 61 86 68 94 H32 c7-8 11-20 12-33 a17 17 0 1 1 -7-27 A17 17 0 0 1 50 6 Z',
};

export const SUIT_COLOUR: Record<Suit, string> = {
  [SPADES]: 'var(--suit-black)',
  [HEARTS]: 'var(--suit-red)',
  [DIAMONDS]: 'var(--suit-red)',
  [CLUBS]: 'var(--suit-black)',
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  [SPADES]: '♠',
  [HEARTS]: '♥',
  [DIAMONDS]: '♦',
  [CLUBS]: '♣',
};

export interface PipProps {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  opacity?: number;
  /**
   * Turn the pip upside down. On a real card every pip below the middle is
   * inverted, so the face reads the same way up from either end.
   */
  flip?: boolean;
}

export function Pip({ suit, x, y, size, opacity, flip }: PipProps): JSX.Element {
  const scale = size / 100;
  const spin = flip ? `rotate(180 ${x} ${y}) ` : '';
  return (
    <path
      d={PATHS[suit]}
      fill={SUIT_COLOUR[suit]}
      opacity={opacity}
      transform={`${spin}translate(${x - size / 2} ${y - size / 2}) scale(${scale})`}
    />
  );
}
