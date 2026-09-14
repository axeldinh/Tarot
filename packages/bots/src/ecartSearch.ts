import {
  LAYOUT,
  discardableCards,
  forcedTrumpCount,
  isTrump,
  type Card,
  type PlayerView,
  type Rng,
} from '@tarot/engine';
import type { EcartSearch, EcartWeights } from './config.ts';
import { chooseEcart, ecartCost } from './ecart.ts';
import { buildKnowledge, partnerIn, sampleLayout } from './knowledge.ts';
import { rollout, scoreRollout } from './rollout.ts';

/**
 * Candidate ecarts, cheapest first.
 *
 * The full choice is astronomically large — six cards out of twenty-four — so
 * this walks outwards from the heuristic's answer rather than enumerating: the
 * heuristic's pick, then the swaps that replace its dearest card with each of
 * the next cheapest alternatives. That covers the decision the heuristic is most
 * likely to be getting wrong, which is where to stop burying a suit.
 */
export function ecartCandidates(
  hand: readonly Card[],
  size: number,
  weights: EcartWeights,
  limit: number,
): Card[][] {
  const first = chooseEcart(hand, size, weights);
  const candidates: Card[][] = [first];
  const seen = new Set<string>([key(first)]);

  const forced = forcedTrumpCount(hand, size);
  const pool = discardableCards(hand)
    .filter((c) => !isTrump(c))
    .sort((a, b) => ecartCost(a, hand, weights) - ecartCost(b, hand, weights));

  // Swap each chosen non-trump out for each unchosen one, dearest first: the
  // marginal card is the one worth second-guessing.
  const chosenPlain = first.filter((c) => !isTrump(c));
  const rest = pool.filter((c) => !first.includes(c));

  for (const out of [...chosenPlain].reverse()) {
    for (const into of rest) {
      if (candidates.length >= limit) return candidates;
      const swapped = first.map((c) => (c === out ? into : c));
      if (swapped.filter(isTrump).length !== forced) continue;
      const id = key(swapped);
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push(swapped);
    }
  }
  return candidates;
}

function key(cards: readonly Card[]): string {
  return [...cards].sort((a, b) => a - b).join(',');
}

export interface EcartChoice {
  cards: Card[];
  /** Layouts actually sampled; 0 when the heuristic answered alone. */
  samples: number;
  expected: Map<string, number>;
}

/**
 * Choose the ecart by playing it out, rather than by rule of thumb.
 *
 * The ecart is the one decision a taker makes that is worth several tricks, and
 * it is made with the whole hand in view, so it looked like the natural place to
 * spend a search. Each candidate is scored on the same sampled layouts, which
 * pairs the comparison and keeps the deal's luck out of the difference.
 *
 * Measured against the heuristic alone it came out at +1.2 +/- 1.1 points a hand
 * over 564 paired deals: not significant. It is used by Confirme and nowhere
 * else, and the README says as much rather than selling it as an improvement.
 */
export function searchEcart(
  view: PlayerView,
  weights: EcartWeights,
  search: EcartSearch,
  rng: Rng,
): EcartChoice {
  const size = LAYOUT[view.playerCount].chienSize;
  const expected = new Map<string, number>();
  const candidates = ecartCandidates(view.hand, size, weights, search.candidates);
  if (candidates.length < 2 || view.taker === null) {
    return { cards: candidates[0] as Card[], samples: 0, expected };
  }

  const totals = candidates.map(() => 0);
  let samples = 0;

  for (let i = 0; i < search.determinisations; i++) {
    for (const [index, cards] of candidates.entries()) {
      // What the hand looks like once this ecart is buried.
      const buried = new Set(cards);
      const after: PlayerView = {
        ...view,
        phase: 'playing',
        hand: view.hand.filter((c) => !buried.has(c)),
        ecart: cards,
        chien: null,
        // The play starts with the seat to the dealer's right.
        currentPlayer: (view.dealer + 1) % view.playerCount,
        currentTrick: { leader: (view.dealer + 1) % view.playerCount, plays: [] },
      };
      const knowledge = buildKnowledge(after);
      const layout = sampleLayout(after, knowledge, rng, 20);
      const partner = partnerIn(after, layout);
      // Nothing is forced: the whole hand is played out by the policy.
      const outcome = rollout(after, layout, partner, null, 'informed');
      totals[index] = (totals[index] as number) + scoreRollout(after, partner, outcome);
    }
    samples++;
  }

  let best = 0;
  for (let i = 0; i < candidates.length; i++) {
    const mean = (totals[i] as number) / samples;
    expected.set(key(candidates[i] as Card[]), mean);
    if (mean > (totals[best] as number) / samples) best = i;
  }
  return { cards: candidates[best] as Card[], samples, expected };
}
