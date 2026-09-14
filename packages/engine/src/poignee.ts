import { EXCUSE, isTrump, type Card } from './cards.ts';
import { POIGNEE_SIZE, type PlayerCount, type PoigneeKind } from './types.ts';

export const POIGNEE_KINDS: readonly PoigneeKind[] = ['simple', 'double', 'triple'];

/**
 * Trumps available for a poignee. The Excuse counts as a trump only when the
 * player would otherwise be short — showing it also tells the table those are
 * all the trumps they hold.
 */
export function poigneeCards(hand: readonly Card[], required: number): Card[] | null {
  const trumps = hand.filter(isTrump).sort((a, b) => b - a);
  if (trumps.length >= required) return trumps.slice(0, required);
  if (trumps.length === required - 1 && hand.includes(EXCUSE)) return [...trumps, EXCUSE];
  return null;
}

/** The best poignee this hand can show, or `null`. */
export function bestPoignee(hand: readonly Card[], playerCount: PlayerCount): PoigneeKind | null {
  const sizes = POIGNEE_SIZE[playerCount];
  for (const kind of ['triple', 'double', 'simple'] as const) {
    if (poigneeCards(hand, sizes[kind]) !== null) return kind;
  }
  return null;
}

export function canAnnouncePoignee(
  hand: readonly Card[],
  playerCount: PlayerCount,
  kind: PoigneeKind,
): boolean {
  return poigneeCards(hand, POIGNEE_SIZE[playerCount][kind]) !== null;
}
