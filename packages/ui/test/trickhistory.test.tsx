// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompletedTrick } from '@tarot/engine';
import { TrickHistory } from '../src/components/LastTrick.tsx';
import { I18nContext, DICTS } from '../src/i18n/index.ts';

const trick = (cards: string[], winner: number): CompletedTrick =>
  ({ plays: cards.map((card, player) => ({ player, card })), winner, leader: 0 }) as unknown as CompletedTrick;

describe('TrickHistory', () => {
  it('shows the latest trick in full and every earlier one as a row', () => {
    const tricks = [
      trick(['1S', '2S', '3S', '4S'], 3),
      trick(['1H', '2H', '3H', '4H'], 0),
      trick(['1D', '2D', '3D', '4D'], 1),
    ];
    const { container } = render(
      <I18nContext.Provider value={{ lang: 'fr', t: DICTS.fr } as never}>
        <TrickHistory tricks={tricks} seatName={(s) => `P${s}`} />
      </I18nContext.Provider>,
    );
    expect(container.querySelectorAll('.last-trick-play')).toHaveLength(4);
    const rows = container.querySelectorAll('.trick-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Pli 2');
    expect(rows[1]?.querySelectorAll('.winner')).toHaveLength(1);
  });
});
