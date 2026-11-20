import { isSuitCard, isTrump, rankOf, VALET, type Card } from './cards.ts';
import type { MisereKind } from './types.ts';

/**
 * Misères: a hand with no trumps, or a hand with no face cards, is worth a flat
 * bonus paid by every other player, whatever the contract. The Excuse is
 * neither a trump nor a face card here, so holding it does not spoil either.
 */
export function misereKinds(hand: readonly Card[]): MisereKind[] {
  const kinds: MisereKind[] = [];
  if (!hand.some(isTrump)) kinds.push('atouts');
  if (!hand.some((c) => isSuitCard(c) && rankOf(c) >= VALET)) kinds.push('tetes');
  return kinds;
}
