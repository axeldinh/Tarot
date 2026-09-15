import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  SPADES,
  parseCard,
  parseHand,
  type CompletedTrick,
  type PlayerView,
} from '@tarot/engine';
import { TrickArea } from '../src/components/TrickArea.tsx';
import { TRICK_GATHER_MS, TRICK_HOLD_MS } from '../src/state/timing.ts';

afterEach(cleanup);

const baseView: PlayerView = {
  playerCount: 4,
  self: 0,
  dealer: 3,
  phase: 'playing',
  hand: parseHand('S2 S3 H4'),
  chien: null,
  revealedChien: [],
  bids: [null, null, null, null],
  currentPlayer: 2,
  taker: 1,
  contract: null,
  calledCard: null,
  partner: null,
  ecart: null,
  ecartTrumpsShown: [],
  chelemAnnouncedBy: null,
  poignees: [],
  currentTrick: null,
  tricks: [],
  cardsLeft: [3, 3, 3, 3],
  result: null,
};

const won: CompletedTrick = {
  index: 0,
  leader: 0,
  winner: 2,
  followSuit: SPADES,
  excuseKept: false,
  plays: [
    { player: 0, card: parseCard('S5') },
    { player: 1, card: parseCard('S9') },
    { player: 2, card: parseCard('T4') },
    { player: 3, card: parseCard('S7') },
  ],
};

const seatName = (seat: number): string => `Joueur ${seat + 1}`;

function cards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('.trick-card')] as HTMLElement[];
}

describe('gathering up a trick', () => {
  it('holds the trick, slides it to the winner, then clears the table', () => {
    vi.useFakeTimers();
    try {
      // A trick in progress, then the same trick completed.
      const playing = { ...baseView, currentTrick: { leader: 0, plays: won.plays } };
      const { container, rerender } = render(
        <TrickArea view={playing} cardWidth={40} seatName={seatName} />,
      );
      expect(cards(container)).toHaveLength(4);
      expect(container.querySelector('.trick-won')).toBeNull();

      const gathered: PlayerView = { ...baseView, currentTrick: null, tricks: [won] };
      act(() => {
        rerender(<TrickArea view={gathered} cardWidth={40} seatName={seatName} />);
      });

      // Held: still where they were played, and the table says who won it.
      expect(cards(container)).toHaveLength(4);
      expect(cards(container).every((c) => !c.classList.contains('away'))).toBe(true);
      expect(container.querySelector('.trick-won')?.textContent).toBe('Pli pour Joueur 3');

      // Then on their way to the winner's seat.
      act(() => void vi.advanceTimersByTime(TRICK_HOLD_MS + 10));
      const flying = cards(container);
      expect(flying).toHaveLength(4);
      expect(flying.every((c) => c.classList.contains('away'))).toBe(true);
      // All four converge on the seat that won it, whoever played them.
      const places = new Set(flying.map((c) => `${c.style.left}/${c.style.top}`));
      expect(places.size).toBe(1);

      // And then the felt is clear.
      act(() => void vi.advanceTimersByTime(TRICK_GATHER_MS + 10));
      expect(cards(container)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives way the moment the next card is played', () => {
    vi.useFakeTimers();
    try {
      const gathered: PlayerView = { ...baseView, currentTrick: null, tricks: [won] };
      const { container, rerender } = render(
        <TrickArea view={gathered} cardWidth={40} seatName={seatName} />,
      );
      expect(cards(container)).toHaveLength(4);

      // Somebody leads before the animation has finished: the new trick wins.
      const next: PlayerView = {
        ...baseView,
        tricks: [won],
        currentTrick: { leader: 2, plays: [{ player: 2, card: parseCard('H9') }] },
      };
      act(() => {
        rerender(<TrickArea view={next} cardWidth={40} seatName={seatName} />);
      });
      expect(cards(container)).toHaveLength(1);
      expect(container.querySelector('.trick-won')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
