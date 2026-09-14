import {
  EXCUSE,
  TRUMP,
  followSuitOf,
  isExcuse,
  isTrump,
  rankOf,
  type Card,
  type FollowSuit,
} from './cards.ts';
import type { TrickPlay } from './types.ts';

/**
 * The suit that must be followed in this trick. The Excuse sets nothing, so if
 * it is led the next card played fixes the suit.
 */
export function trickFollowSuit(plays: readonly TrickPlay[]): FollowSuit | null {
  for (const p of plays) {
    const s = followSuitOf(p.card);
    if (s !== null) return s;
  }
  return null;
}

/** Highest trump currently on the table, or 0 if none. */
export function highestTrumpRank(plays: readonly TrickPlay[]): number {
  let best = 0;
  for (const p of plays) {
    if (isTrump(p.card)) {
      const r = rankOf(p.card);
      if (r > best) best = r;
    }
  }
  return best;
}

/**
 * Cards that are legal for `hand` given the cards already on the table.
 *
 * - Follow suit if you can.
 * - Void in the led suit: you must trump.
 * - If a trump is already down you must overtrump if you can; if you cannot beat
 *   it you must still play a trump.
 * - Void in the suit and out of trumps: anything goes.
 * - The Excuse is always legal and ignores all of the above.
 */
export function legalCards(hand: readonly Card[], plays: readonly TrickPlay[]): Card[] {
  if (plays.length === 0) return [...hand];

  const followSuit = trickFollowSuit(plays);
  // Only the Excuse has been played so far: nothing to follow yet.
  if (followSuit === null) return [...hand];

  const hasExcuse = hand.includes(EXCUSE);
  const inSuit = hand.filter((c) => followSuitOf(c) === followSuit);
  const trumps = hand.filter(isTrump);
  const best = highestTrumpRank(plays);

  const withExcuse = (cards: Card[]): Card[] => (hasExcuse ? [...cards, EXCUSE] : cards);

  if (followSuit === TRUMP) {
    if (trumps.length > 0) {
      const higher = trumps.filter((c) => rankOf(c) > best);
      return withExcuse(higher.length > 0 ? higher : trumps);
    }
    return withExcuse(hand.filter((c) => !isExcuse(c)));
  }

  if (inSuit.length > 0) return withExcuse(inSuit);

  if (trumps.length > 0) {
    const higher = trumps.filter((c) => rankOf(c) > best);
    return withExcuse(higher.length > 0 ? higher : trumps);
  }

  return withExcuse(hand.filter((c) => !isExcuse(c)));
}

export type IllegalReason =
  | 'not-in-hand'
  | 'must-follow-suit'
  | 'must-play-trump'
  | 'must-overtrump'
  | 'must-follow-trump';

/** Why a card cannot be played — used for the one-line hint in the UI. */
export function illegalReason(
  hand: readonly Card[],
  plays: readonly TrickPlay[],
  card: Card,
): IllegalReason | null {
  if (!hand.includes(card)) return 'not-in-hand';
  if (legalCards(hand, plays).includes(card)) return null;

  const followSuit = trickFollowSuit(plays);
  const trumps = hand.filter(isTrump);
  const best = highestTrumpRank(plays);

  if (followSuit === TRUMP) {
    if (!isTrump(card)) return 'must-follow-trump';
    return 'must-overtrump';
  }
  const inSuit = hand.filter((c) => followSuitOf(c) === followSuit);
  if (inSuit.length > 0) return 'must-follow-suit';
  if (trumps.length > 0) {
    if (!isTrump(card)) return 'must-play-trump';
    if (best > 0) return 'must-overtrump';
  }
  /* c8 ignore next -- every illegal card is covered by a case above */
  return 'must-follow-suit';
}

/**
 * Who takes the trick. The Excuse never wins on its own; `excuseWins` is the
 * chelem exception, where the announcer leads it to the last trick and keeps it.
 */
export function trickWinner(
  plays: readonly TrickPlay[],
  options: { excuseWins?: boolean } = {},
): number {
  if (options.excuseWins) {
    const excusePlay = plays.find((p) => isExcuse(p.card));
    if (excusePlay) return excusePlay.player;
  }

  const followSuit = trickFollowSuit(plays);
  let winner = -1;
  let bestRank = -1;
  let bestIsTrump = false;

  for (const p of plays) {
    if (isExcuse(p.card)) continue;
    const t = isTrump(p.card);
    const r = rankOf(p.card);
    if (t) {
      if (!bestIsTrump || r > bestRank) {
        bestIsTrump = true;
        bestRank = r;
        winner = p.player;
      }
    } else if (!bestIsTrump && followSuitOf(p.card) === followSuit && r > bestRank) {
      bestRank = r;
      winner = p.player;
    }
  }

  // Only possible if the whole trick were Excuses, which cannot happen with one deck.
  /* c8 ignore next */
  return winner === -1 ? (plays[0] as TrickPlay).player : winner;
}
