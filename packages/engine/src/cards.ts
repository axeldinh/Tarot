/**
 * Card model for the 78-card French Tarot deck.
 *
 * A card is a plain integer in [0, 78) so that game state stays cheap to clone
 * and trivially serialisable. Layout:
 *
 *   0..13   ♠ (Pique)    rank 1..14
 *   14..27  ♥ (Coeur)    rank 1..14
 *   28..41  ♦ (Carreau)  rank 1..14
 *   42..55  ♣ (Trefle)   rank 1..14
 *   56..76  atouts       trump 1..21
 *   77      l'Excuse
 *
 * Suit ranks 11..14 are Valet, Cavalier, Dame, Roi.
 */

export type Card = number;

/** Suit index. `TRUMP` is not a real suit but is what a trump "follows". */
export const SPADES = 0;
export const HEARTS = 1;
export const DIAMONDS = 2;
export const CLUBS = 3;
export const TRUMP = 4;

export type Suit = 0 | 1 | 2 | 3;
/** What a card obliges you to follow: a suit, or trumps. */
export type FollowSuit = 0 | 1 | 2 | 3 | 4;

export const SUITS: readonly Suit[] = [SPADES, HEARTS, DIAMONDS, CLUBS];

export const CARDS_PER_SUIT = 14;
export const TRUMP_BASE = 56;
export const TRUMP_COUNT = 21;
export const EXCUSE: Card = 77;
export const DECK_SIZE = 78;

/** Suit ranks with a name. */
export const VALET = 11;
export const CAVALIER = 12;
export const DAME = 13;
export const ROI = 14;

/** The three bouts (oudlers): Petit, trump 21, Excuse. */
export const PETIT: Card = TRUMP_BASE; // atout 1
export const TRUMP_21: Card = TRUMP_BASE + 20;

/** Total card points in the deck, in half-points (91 x 2). */
export const TOTAL_POINTS_2 = 182;

/** The full deck in canonical order. */
export const DECK: readonly Card[] = Array.from({ length: DECK_SIZE }, (_, i) => i);

export function isSuitCard(c: Card): boolean {
  return c < TRUMP_BASE;
}

export function isTrump(c: Card): boolean {
  return c >= TRUMP_BASE && c < EXCUSE;
}

export function isExcuse(c: Card): boolean {
  return c === EXCUSE;
}

/** Suit of a suit card, or `null` for trumps and the Excuse. */
export function suitOf(c: Card): Suit | null {
  return c < TRUMP_BASE ? ((c / CARDS_PER_SUIT) | 0) as Suit : null;
}

/** Rank 1..14 for suit cards, 1..21 for trumps, 0 for the Excuse. */
export function rankOf(c: Card): number {
  if (c < TRUMP_BASE) return (c % CARDS_PER_SUIT) + 1;
  if (c === EXCUSE) return 0;
  return c - TRUMP_BASE + 1;
}

/** The suit a card belongs to for the purpose of following suit. */
export function followSuitOf(c: Card): FollowSuit | null {
  if (c === EXCUSE) return null;
  return c < TRUMP_BASE ? (((c / CARDS_PER_SUIT) | 0) as Suit) : TRUMP;
}

export function suitCard(suit: Suit, rank: number): Card {
  return suit * CARDS_PER_SUIT + (rank - 1);
}

export function trumpCard(rank: number): Card {
  return TRUMP_BASE + rank - 1;
}

export function king(suit: Suit): Card {
  return suitCard(suit, ROI);
}

export function isKing(c: Card): boolean {
  return isSuitCard(c) && rankOf(c) === ROI;
}

export function isBout(c: Card): boolean {
  return c === PETIT || c === TRUMP_21 || c === EXCUSE;
}

/**
 * Card value in HALF-points, so everything stays in integers.
 * Roi 9, Dame 7, Cavalier 5, Valet 3, bout 9, anything else 1.
 * Divide by 2 for the traditional value (4.5, 3.5, 2.5, 1.5, 0.5).
 */
export function points2(c: Card): number {
  if (isBout(c)) return 9;
  if (c < TRUMP_BASE) {
    const r = (c % CARDS_PER_SUIT) + 1;
    if (r === ROI) return 9;
    if (r === DAME) return 7;
    if (r === CAVALIER) return 5;
    if (r === VALET) return 3;
  }
  return 1;
}

/** A "low card" (basse carte / carte blanche): worth half a point. */
export function isLowCard(c: Card): boolean {
  return points2(c) === 1;
}

export function sumPoints2(cards: readonly Card[]): number {
  let total = 0;
  for (const c of cards) total += points2(c);
  return total;
}

export function countBouts(cards: readonly Card[]): number {
  let n = 0;
  for (const c of cards) if (isBout(c)) n++;
  return n;
}

const SUIT_LETTERS = ['S', 'H', 'D', 'C'] as const;
const RANK_LETTERS: Record<number, string> = { 11: 'V', 12: 'C', 13: 'D', 14: 'R' };

/** Short stable id, e.g. `S1`, `SR`, `T21`, `EX`. Used in tests and on the wire. */
export function cardId(c: Card): string {
  if (c === EXCUSE) return 'EX';
  if (isTrump(c)) return `T${rankOf(c)}`;
  const s = SUIT_LETTERS[suitOf(c) as Suit];
  const r = rankOf(c);
  return `${s}${RANK_LETTERS[r] ?? r}`;
}

const BY_ID = new Map<string, Card>();
for (const c of DECK) BY_ID.set(cardId(c), c);
// Numeric aliases for the honours, so `S14` and `SR` both parse.
for (const s of SUITS) {
  for (const r of [VALET, CAVALIER, DAME, ROI]) {
    BY_ID.set(`${SUIT_LETTERS[s]}${r}`, suitCard(s, r));
  }
}

/** Parse a short id back to a card. Throws on anything unknown. */
export function parseCard(id: string): Card {
  const c = BY_ID.get(id.toUpperCase());
  if (c === undefined) throw new Error(`Unknown card id: ${id}`);
  return c;
}

/** Convenience for tests and fixtures: `hand('S1 SR T21 EX')`. */
export function parseHand(ids: string): Card[] {
  return ids
    .split(/[\s,]+/)
    .filter((s) => s.length > 0)
    .map(parseCard);
}

export function formatHand(cards: readonly Card[]): string {
  return cards.map(cardId).join(' ');
}

/** Display order: suits ascending, then trumps ascending, Excuse last. */
export function compareForDisplay(a: Card, b: Card): number {
  return a - b;
}

export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort(compareForDisplay);
}
