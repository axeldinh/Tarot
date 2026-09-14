import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  Bid,
  DECK,
  cardId,
  isBout,
  isExcuse,
  isTrump,
  parseCard,
  parseHand,
  rankOf,
  type Card,
  type HandResult,
} from '@tarot/engine';
import { newSession, type SessionSnapshot } from '@tarot/net';
import { CardBack, CardFace } from '../src/cards/CardFace.tsx';
import { Hand } from '../src/components/Hand.tsx';
import { ScoreBreakdown } from '../src/components/ScoreBreakdown.tsx';
import { Scoreboard } from '../src/components/Scoreboard.tsx';
import { seatAnchor, seatPoint } from '../src/components/TrickArea.tsx';
import { Toast } from '../src/components/Toast.tsx';

// Globals are off in this project, so the teardown is wired up by hand.
afterEach(cleanup);

describe('the card faces', () => {
  it('draw all 78 cards, each with a readable corner index', () => {
    for (const card of DECK) {
      const { container, unmount } = render(<CardFace card={card} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-label')).toBe(cardId(card));
      const texts = [...container.querySelectorAll('text')].map((t) => t.textContent);
      // The corner index is what stays visible in a fanned hand, so it must be
      // there on every card, trumps and the Excuse included.
      expect(container.querySelector('.card-index')?.textContent).toBeTruthy();
      if (isTrump(card)) expect(texts).toContain(String(rankOf(card)));
      unmount();
    }
  });

  it('marks the three bouts and nothing else', () => {
    for (const card of DECK) {
      const { container, unmount } = render(<CardFace card={card} />);
      const marks = container.querySelectorAll('path[fill="var(--bout)"]');
      expect(marks.length).toBe(isBout(card) ? 1 : 0);
      unmount();
    }
  });

  it('gives trumps their own colour and the Excuse its own face', () => {
    const { container: trump } = render(<CardFace card={parseCard('T14')} />);
    expect(trump.querySelector('rect')?.getAttribute('fill')).toBe('var(--trump-bg)');
    cleanup();
    const { container: excuse } = render(<CardFace card={parseCard('EX')} />);
    expect(excuse.textContent).toContain('EXCUSE');
    expect(excuse.querySelector('polygon')).not.toBeNull();
    expect(isExcuse(parseCard('EX'))).toBe(true);
  });

  it('scales to the width it is given, keeping the card shape', () => {
    const { container } = render(<CardFace card={0} width={30} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('30');
    expect(svg?.getAttribute('height')).toBe('46');
  });

  it('has a back that shows nothing at all', () => {
    const { container } = render(<CardBack width={40} />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the hand', () => {
  const cards = parseHand('S2 S3 H4 T5 EX');

  function setup(playable: Card[], choosing = true) {
    const onPlay = vi.fn();
    const onBlocked = vi.fn();
    const utils = render(
      <Hand
        cards={cards}
        playable={new Set(playable)}
        cardWidth={40}
        choosing={choosing}
        onPlay={onPlay}
        onBlocked={onBlocked}
      />,
    );
    return { onPlay, onBlocked, ...utils };
  }

  it('plays a legal card and refuses an illegal one, saying so', () => {
    const { onPlay, onBlocked, container } = setup([parseCard('S2'), parseCard('S3')]);
    const buttons = [...container.querySelectorAll('.hand-card')] as HTMLElement[];
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onPlay).toHaveBeenCalledWith(parseCard('S2'));

    fireEvent.click(buttons[2] as HTMLElement);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledWith(parseCard('H4'));
  });

  it('stacks legal cards above the dimmed ones so they can always be tapped', () => {
    const { container } = setup([parseCard('T5')]);
    const buttons = [...container.querySelectorAll('.hand-card')] as HTMLElement[];
    const legal = buttons[3] as HTMLElement;
    expect(legal.className).toContain('playable');
    const legalZ = Number(legal.style.zIndex);
    for (const [i, button] of buttons.entries()) {
      if (i === 3) continue;
      expect(button.className).toContain('blocked');
      expect(Number(button.style.zIndex)).toBeLessThan(legalZ);
    }
  });

  it('shows the hand plainly when no card is being asked for', () => {
    const { container, onBlocked } = setup([], false);
    const buttons = [...container.querySelectorAll('.hand-card')] as HTMLElement[];
    for (const button of buttons) {
      expect(button.className).toContain('idle');
      expect(button.className).not.toContain('blocked');
      expect(button.getAttribute('aria-disabled')).toBe('false');
    }
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onBlocked).toHaveBeenCalled();
  });

  it('gives the legal cards more of the width than the rest', () => {
    const { container } = setup([parseCard('S2'), parseCard('S3')]);
    const inner = container.querySelector('.hand-inner') as HTMLElement;
    expect(inner.style.getPropertyValue('--wide')).toBe('2');
    expect(inner.style.getPropertyValue('--narrow')).toBe('3');
    expect(inner.style.getPropertyValue('--n')).toBe('5');
  });

  it('lifts a card under the pointer', () => {
    const { container } = setup(cards as Card[]);
    const first = container.querySelector('.hand-card') as HTMLElement;
    fireEvent.pointerEnter(first);
    expect(first.className).toContain('lifted');
    fireEvent.pointerLeave(first);
    expect(first.className).not.toContain('lifted');
  });
});

describe('seats around the table', () => {
  it('put you at the bottom and the others anticlockwise', () => {
    const self = seatPoint(0, 4, 20, 20);
    expect(self.left).toBe('50%');
    expect(Number.parseFloat(self.top)).toBeGreaterThan(50);
    const across = seatPoint(2, 4, 20, 20);
    expect(Number.parseFloat(across.top)).toBeLessThan(50);
  });

  it('pin a side badge to the edge instead of over the card it just played', () => {
    expect(seatAnchor(1, 4).side).toBe('right');
    expect(seatAnchor(3, 4).side).toBe('left');
    expect(seatAnchor(2, 4).side).toBe('top');
    expect(seatAnchor(1, 4).style.right).toBe('2%');
    expect(seatAnchor(3, 4).style.left).toBe('2%');
  });

  it('spread five seats without two landing on each other', () => {
    const spots = [1, 2, 3, 4].map((i) => seatAnchor(i, 5));
    expect(new Set(spots.map((s) => `${s.side}:${s.style.top}`)).size).toBe(4);
  });
});

describe('the score breakdown', () => {
  const session: SessionSnapshot = {
    ...newSession({
      id: 's',
      playerCount: 4,
      seats: [
        { seat: 0, name: 'Moi', kind: 'human', connected: true, awaitingReturn: false, standIn: false },
        { seat: 1, name: 'B1', kind: 'bot', connected: true, awaitingReturn: false, standIn: false },
        { seat: 2, name: 'B2', kind: 'bot', connected: true, awaitingReturn: false, standIn: false },
        { seat: 3, name: 'B3', kind: 'bot', connected: true, awaitingReturn: false, standIn: false },
      ],
      dealer: 0,
    }),
    totals: [-72, -72, -72, 216],
  };

  const result: HandResult = {
    taker: 3,
    contract: Bid.Garde,
    partner: null,
    takerPoints2: 104,
    takerPoints: 52,
    defencePoints: 39,
    bouts: 2,
    target: 41,
    diff: 11,
    made: true,
    multiplier: 2,
    petitAuBout: 0,
    petitAuBoutSide: null,
    base: 36,
    poigneeBonus: 0,
    chelemBonus: 0,
    score: 72,
    deltas: [-72, -72, -72, 216],
  };

  it('shows every number that went into the score', () => {
    render(<ScoreBreakdown result={result} session={session} onNext={() => {}} />);
    const panel = screen.getByTestId('score-breakdown');
    for (const text of ['52', '2', '41', '+11', '36', '×2', '+72']) {
      expect(within(panel).getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(panel.textContent).toContain('Contrat réussi');
    expect(panel.textContent).toContain('Garde');
    expect(panel.textContent).toContain('seul');
  });

  it('shows the bonuses only when there are any', () => {
    const { container } = render(
      <ScoreBreakdown
        result={{ ...result, poigneeBonus: 20, chelemBonus: 400, petitAuBout: -10 }}
        session={session}
        onNext={() => {}}
      />,
    );
    expect(container.textContent).toContain('Poignée');
    expect(container.textContent).toContain('Chelem');
    expect(container.textContent).toContain('Petit au bout');
    cleanup();
    const plain = render(<ScoreBreakdown result={result} session={session} onNext={() => {}} />);
    expect(plain.container.textContent).not.toContain('Poignée');
  });

  it('says so plainly when everybody passed', () => {
    const onNext = vi.fn();
    render(<ScoreBreakdown result={null} session={session} onNext={onNext} />);
    expect(screen.getByText(/Tout le monde a passé/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Donne suivante' }));
    expect(onNext).toHaveBeenCalled();
  });

  it('lists the running total beside the hand', () => {
    render(<Scoreboard session={{ ...session, hands: [{ index: 0, dealer: 0, result, totalsAfter: session.totals }] }} />);
    const table = screen.getByTestId('scoreboard');
    expect(table.textContent).toContain('+216');
    cleanup();
    render(<Scoreboard session={session} />);
    expect(screen.getByText('Aucune donne jouée.')).toBeTruthy();
  });
});

describe('the one-line reason', () => {
  it('appears and then takes itself away', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { container, rerender } = render(
      <Toast message="Vous devez couper" onDone={onDone} ms={100} />,
    );
    expect(container.textContent).toBe('Vous devez couper');
    vi.advanceTimersByTime(150);
    expect(onDone).toHaveBeenCalled();
    rerender(<Toast message={null} onDone={onDone} />);
    expect(container.textContent).toBe('');
    vi.useRealTimers();
  });
});
