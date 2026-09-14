import { DECK, DECK_SIZE, type Card } from './cards.ts';
import { shuffle, type Rng } from './rng.ts';
import type { PlayerCount } from './types.ts';

export interface DealLayout {
  cardsPerPlayer: number;
  chienSize: number;
}

export const LAYOUT: Record<PlayerCount, DealLayout> = {
  3: { cardsPerPlayer: 24, chienSize: 6 },
  4: { cardsPerPlayer: 18, chienSize: 6 },
  5: { cardsPerPlayer: 15, chienSize: 3 },
};

/** Packets of three, as at a real table. */
export const PACKET_SIZE = 3;

export interface Deal {
  hands: Card[][];
  chien: Card[];
}

/** Play (and dealing) runs anticlockwise, which is simply the next seat index. */
export function nextPlayer(p: number, playerCount: number): number {
  return (p + 1) % playerCount;
}

export function previousPlayer(p: number, playerCount: number): number {
  return (p + playerCount - 1) % playerCount;
}

/**
 * Pick the positions in the 78-card deal sequence that go to the chien.
 * The chien may not take the first or the last card of the deal, and — as at a
 * real table — never two cards in a row.
 */
export function chienPositions(chienSize: number, rng: Rng): number[] {
  const chosen: number[] = [];
  // Bounded retry: with 6 slots among 76 candidates a valid set is found at once
  // in practice, but the loop keeps the function total.
  for (let attempt = 0; attempt < 1000 && chosen.length < chienSize; attempt++) {
    chosen.length = 0;
    const taken = new Set<number>();
    for (let i = 0; i < chienSize; i++) {
      let pos = -1;
      for (let tries = 0; tries < 200; tries++) {
        const candidate = 1 + rng.nextInt(DECK_SIZE - 2);
        if (taken.has(candidate) || taken.has(candidate - 1) || taken.has(candidate + 1)) continue;
        pos = candidate;
        break;
      }
      if (pos < 0) break;
      taken.add(pos);
      chosen.push(pos);
    }
  }
  /* c8 ignore next 3 -- unreachable in practice; guards against a pathological RNG */
  if (chosen.length < chienSize) {
    throw new Error('Could not lay out the chien');
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * Shuffle and deal. Cards go out in packets of three, anticlockwise, starting
 * with the player to the dealer's right; the chien is built one card at a time
 * as the deal goes round.
 */
export function deal(playerCount: PlayerCount, dealer: number, rng: Rng): Deal {
  const { cardsPerPlayer, chienSize } = LAYOUT[playerCount];
  const deck = shuffle([...DECK], rng);

  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const chien: Card[] = [];
  const chienSlots = new Set(chienPositions(chienSize, rng));

  let player = nextPlayer(dealer, playerCount);
  let inPacket = 0;

  for (let pos = 0; pos < DECK_SIZE; pos++) {
    const card = deck[pos] as Card;
    const hand = hands[player] as Card[];
    // Once a player is full the rest of the deal necessarily belongs to the chien.
    if (chienSlots.has(pos) && chien.length < chienSize) {
      chien.push(card);
      continue;
    }
    /* c8 ignore next 5 -- unreachable: the chien slots account for exactly the
       78 - n*cardsPerPlayer cards the players do not get. Kept as a guard so a
       future layout change fails loudly rather than silently overfilling a hand. */
    if (hand.length >= cardsPerPlayer) {
      chien.push(card);
      continue;
    }
    hand.push(card);
    inPacket++;
    if (inPacket === PACKET_SIZE) {
      inPacket = 0;
      player = nextPlayer(player, playerCount);
    }
  }

  /* c8 ignore next 3 -- structural invariant */
  if (chien.length !== chienSize) {
    throw new Error(`Bad deal: chien has ${chien.length} cards, expected ${chienSize}`);
  }
  return { hands, chien };
}
