/**
 * The one place the table's pacing is written down.
 *
 * The gather animation and the host's between-trick pause have to agree: if
 * the host is quicker than the animation, the next card lands on top of cards
 * that are still sliding away.
 */

/** How long a completed trick is left face up before it is gathered. */
export const TRICK_HOLD_MS = 650;

/** How long the cards take to travel to the winner. */
export const TRICK_GATHER_MS = 450;

/**
 * The least the host will wait before anyone leads again. A bot's thinking time
 * counts towards it rather than being added to it.
 */
export const TRICK_PAUSE_MS = TRICK_HOLD_MS + TRICK_GATHER_MS;

/**
 * The least the host will wait, when the taker is a bot, before the chien is
 * buried and the table moves on. Six cards face up is a lot to read; a bot can
 * decide its ecart in well under a second, which left everyone else at the
 * table almost nothing to look at. The first pass at this (1800ms) was still
 * too quick to actually read six cards, so it is tripled.
 */
export const CHIEN_REVEAL_MS = 5400;
