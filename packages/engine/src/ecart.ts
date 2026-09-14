import { isBout, isKing, isTrump, type Card } from './cards.ts';

export type EcartError =
  | 'wrong-size'
  | 'not-in-hand'
  | 'duplicate'
  | 'no-king'
  | 'no-bout'
  | 'too-many-trumps';

/** Cards that may legally go face down in the ecart (kings and bouts may not). */
export function discardableCards(hand: readonly Card[]): Card[] {
  return hand.filter((c) => !isKing(c) && !isBout(c));
}

/**
 * How many trumps the taker is forced to bury. Trumps go in the ecart only when
 * there is nothing else left, and then they are shown to everyone.
 */
export function forcedTrumpCount(hand: readonly Card[], size: number): number {
  const nonTrump = discardableCards(hand).filter((c) => !isTrump(c)).length;
  return Math.max(0, size - nonTrump);
}

/** Validate a proposed ecart. Returns `null` when it is legal. */
export function validateEcart(
  hand: readonly Card[],
  cards: readonly Card[],
  size: number,
): EcartError | null {
  if (cards.length !== size) return 'wrong-size';
  if (new Set(cards).size !== cards.length) return 'duplicate';

  const available = [...hand];
  for (const c of cards) {
    const i = available.indexOf(c);
    if (i < 0) return 'not-in-hand';
    available.splice(i, 1);
  }

  for (const c of cards) {
    if (isKing(c)) return 'no-king';
    if (isBout(c)) return 'no-bout';
  }

  const trumpsDiscarded = cards.filter(isTrump).length;
  if (trumpsDiscarded > forcedTrumpCount(hand, size)) return 'too-many-trumps';

  return null;
}

export const ECART_ERROR_MESSAGES: Record<EcartError, string> = {
  'wrong-size': "L'ecart n'a pas le bon nombre de cartes",
  'not-in-hand': "Cette carte n'est pas dans votre main",
  duplicate: 'Carte en double dans l’ecart',
  'no-king': 'On ne peut pas ecarter un roi',
  'no-bout': 'On ne peut pas ecarter un bout',
  'too-many-trumps': "On n'ecarte un atout que si on ne peut pas faire autrement",
};
