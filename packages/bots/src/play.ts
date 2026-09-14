import {
  LAYOUT,
  legalCards,
  type Card,
  type PlayerView,
  type Rng,
} from '@tarot/engine';
import type { BotConfig } from './config.ts';
import { buildKnowledge, partnerIn, sampleLayout } from './knowledge.ts';
import { greedyCard, makeSideOf, rollout, scoreRollout } from './rollout.ts';

export type Clock = () => number;

function isLastTrick(view: PlayerView): boolean {
  return view.tricks.length + 1 === LAYOUT[view.playerCount].cardsPerPlayer;
}

/** The heuristic card, with no search. This is the Debutant level's whole game. */
export function greedyChoice(view: PlayerView): Card {
  const plays = view.currentTrick?.plays ?? [];
  const sideOf = makeSideOf(view.taker ?? view.self, view.partner);
  return greedyCard(view.hand, plays, view.self, view.playerCount, sideOf, isLastTrick(view));
}

export interface CardChoice {
  card: Card;
  /** Determinisations actually run — 0 when the greedy policy answered. */
  samples: number;
  /** Average point delta the search expects, per candidate card. */
  expected: Map<Card, number>;
}

/**
 * Monte-Carlo determinisation.
 *
 * Deal the unseen cards into a layout consistent with what this seat has worked
 * out, play every legal candidate out to the end with the greedy policy, score
 * the hand properly, and keep the running average. Repeat until the move budget
 * runs out. Sampling and rollout both work from the `PlayerView` alone, so the
 * search cannot see anything the seat could not.
 */
export function chooseCard(
  view: PlayerView,
  config: BotConfig,
  rng: Rng,
  now: Clock,
): CardChoice {
  const plays = view.currentTrick?.plays ?? [];
  const legal = legalCards(view.hand, plays);
  const expected = new Map<Card, number>();

  if (legal.length === 1) return { card: legal[0] as Card, samples: 0, expected };
  const { budgetMs, maxDeterminisations, samplingAttempts } = config.play;
  if (maxDeterminisations === 0 || view.taker === null) {
    return { card: greedyChoice(view), samples: 0, expected };
  }

  const knowledge = buildKnowledge(view);
  const totals = new Map<Card, number>(legal.map((c) => [c, 0]));
  const deadline = now() + budgetMs;
  let samples = 0;

  for (let i = 0; i < maxDeterminisations; i++) {
    if (i > 0 && now() >= deadline) break;
    const layout = sampleLayout(view, knowledge, rng, samplingAttempts);
    const partner = partnerIn(view, layout);
    for (const card of legal) {
      const outcome = rollout(view, layout, partner, card);
      totals.set(card, (totals.get(card) as number) + scoreRollout(view, partner, outcome));
    }
    samples++;
  }

  /* c8 ignore next -- the loop always runs at least once */
  if (samples === 0) return { card: greedyChoice(view), samples: 0, expected };

  let best = legal[0] as Card;
  let bestValue = -Infinity;
  for (const card of legal) {
    const value = (totals.get(card) as number) / samples;
    expected.set(card, value);
    if (value > bestValue) {
      best = card;
      bestValue = value;
    }
  }
  return { card: best, samples, expected };
}
