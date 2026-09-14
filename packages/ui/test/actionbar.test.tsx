import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Bid, king, parseHand, type PlayerView } from '@tarot/engine';
import { ActionBar } from '../src/components/ActionBar.tsx';
import { ecartState, type Affordances } from '../src/state/moves.ts';

afterEach(cleanup);

const baseView: PlayerView = {
  playerCount: 4,
  self: 0,
  dealer: 3,
  phase: 'bidding',
  hand: parseHand('S2 S3 H4 T5 T6 EX'),
  chien: null,
  revealedChien: [],
  bids: [null, null, null, null],
  currentPlayer: 0,
  taker: null,
  contract: null,
  calledCard: null,
  partner: null,
  ecart: null,
  ecartTrumpsShown: [],
  chelemAnnouncedBy: null,
  poignees: [],
  currentTrick: null,
  tricks: [],
  cardsLeft: [6, 6, 6, 6],
  result: null,
};

const baseCan: Affordances = {
  myTurn: true,
  legal: [],
  bids: [],
  calls: [],
  ecartSize: 6,
  poignee: null,
  hasPlayed: false,
};

function show(view: Partial<PlayerView>, can: Partial<Affordances> = {}) {
  const handlers = {
    onBid: vi.fn(),
    onCall: vi.fn(),
    onConfirmEcart: vi.fn(),
    onAutoEcart: vi.fn(),
    onChelem: vi.fn(),
    onPoignee: vi.fn(),
  };
  const merged = { ...baseView, ...view };
  const utils = render(
    <ActionBar
      view={merged}
      can={{ ...baseCan, ...can }}
      ecart={ecartState(merged.hand, [], 6)}
      seatName={(seat) => `Joueur ${seat + 1}`}
      {...handlers}
    />,
  );
  return { ...handlers, ...utils };
}

describe('the action bar', () => {
  it('asks for a bid and reports the one that was chosen', () => {
    const { onBid } = show({}, { bids: [Bid.Pass, Bid.GardeSans] });
    expect(screen.getByText('À vous d’enchérir')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Garde Sans' }));
    expect(onBid).toHaveBeenCalledWith(Bid.GardeSans);
  });

  it('offers the four kings to call', () => {
    const calls = [king(0), king(1), king(2), king(3)];
    const { onCall, container } = show({ phase: 'calling' }, { calls });
    expect(container.querySelectorAll('svg[data-card]')).toHaveLength(4);
    fireEvent.click(container.querySelectorAll('button')[1] as HTMLElement);
    expect(onCall).toHaveBeenCalledWith(king(1));
  });

  it('counts the ecart down and only lets it be confirmed when it is complete', () => {
    const { onAutoEcart, onConfirmEcart } = show({ phase: 'discard' });
    expect(screen.getByText(/Encore 6 cartes à écarter/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Valider l’écart' });
    expect(confirm.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Écart automatique' }));
    expect(onAutoEcart).toHaveBeenCalled();
    expect(onConfirmEcart).not.toHaveBeenCalled();
  });

  it('puts the chelem question with what it is worth', () => {
    const { onChelem } = show({ phase: 'chelem' });
    expect(screen.getByText(/\+400/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chelem !' }));
    expect(onChelem).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Non' }));
    expect(onChelem).toHaveBeenCalledWith(false);
  });

  it('offers a poignee before the first card and can be waved away', () => {
    const { onPoignee } = show({ phase: 'playing' }, { poignee: 'double' });
    expect(screen.getByText(/Montrer une poignée double/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Montrer' }));
    expect(onPoignee).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Non merci' }));
    expect(onPoignee).toHaveBeenCalledWith(false);
  });

  it('just says whose turn it is once the cards are out', () => {
    show({ phase: 'playing' });
    expect(screen.getByText('À vous de jouer')).toBeTruthy();
    cleanup();
    show({ phase: 'playing', currentPlayer: 2 }, { myTurn: false });
    expect(screen.getByText(/Joueur 3/)).toBeTruthy();
  });

  it('names who the table is waiting on outside the play', () => {
    show({ phase: 'bidding', currentPlayer: 1 }, { myTurn: false });
    expect(screen.getByText(/Joueur 2/)).toBeTruthy();
  });
});
