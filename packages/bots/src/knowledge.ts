import {
  Bid,
  DECK,

  LAYOUT,
  TRUMP,
  followSuitOf,
  highestTrumpRank,
  isBout,
  isExcuse,
  isKing,
  isTrump,
  rankOf,
  shuffle,
  trickFollowSuit,
  type Card,
  type FollowSuit,
  type PlayerView,
  type Rng,
  type TrickPlay,
} from '@tarot/engine';

/** Where an unseen card might be. */
export type SlotId = number | 'ecart' | 'chien';

export interface Slot {
  id: SlotId;
  capacity: number;
  /** Cards already known to be here, which count against the capacity. */
  fixed: Card[];
}

export interface Knowledge {
  /** Cards whose location this seat does not know. */
  unseen: Card[];
  slots: Slot[];
  /** `voids[p]` holds the follow-suits player `p` has shown they are out of. */
  voids: Set<FollowSuit>[];
  /** Highest trump `p` can still hold, from failing to overtrump. 21 = no bound. */
  maxTrump: number[];
  /** Cards that were in the face-up chien and so are in the taker's hand or ecart. */
  fromChien: Set<Card>;
  /** All cards that have hit the table so far. */
  played: Set<Card>;
}

function allPlays(view: PlayerView): { plays: TrickPlay[]; followSuit: FollowSuit | null }[] {
  const rounds = view.tricks.map((t) => ({ plays: t.plays, followSuit: t.followSuit }));
  if (view.currentTrick && view.currentTrick.plays.length > 0) {
    rounds.push({
      plays: view.currentTrick.plays,
      followSuit: trickFollowSuit(view.currentTrick.plays),
    });
  }
  return rounds;
}

/**
 * What every player has shown they cannot hold.
 *
 * Failing to follow a suit says you are out of it; discarding instead of ruffing
 * says you are out of trumps too; and under-trumping when you were obliged to
 * overtrump caps the trumps you can still be holding.
 */
export function inferConstraints(view: PlayerView): {
  voids: Set<FollowSuit>[];
  maxTrump: number[];
} {
  const voids = Array.from({ length: view.playerCount }, () => new Set<FollowSuit>());
  const maxTrump = new Array<number>(view.playerCount).fill(21);

  for (const round of allPlays(view)) {
    const led = round.followSuit;
    if (led === null) continue;
    for (let i = 0; i < round.plays.length; i++) {
      const play = round.plays[i] as TrickPlay;
      // The Excuse is playable at any time and tells us nothing.
      if (isExcuse(play.card)) continue;
      const suit = followSuitOf(play.card);
      if (suit === led) {
        if (led === TRUMP) {
          const best = highestTrumpRank(round.plays.slice(0, i));
          // Obliged to overtrump and did not: they hold nothing above `best`.
          if (best > 0 && rankOf(play.card) < best) {
            maxTrump[play.player] = Math.min(maxTrump[play.player] as number, best - 1);
          }
        }
        continue;
      }
      (voids[play.player] as Set<FollowSuit>).add(led);
      if (isTrump(play.card)) {
        const best = highestTrumpRank(round.plays.slice(0, i));
        if (best > 0 && rankOf(play.card) < best) {
          maxTrump[play.player] = Math.min(maxTrump[play.player] as number, best - 1);
        }
      } else {
        // Void in the suit and did not ruff, so out of trumps as well.
        (voids[play.player] as Set<FollowSuit>).add(TRUMP);
      }
    }
  }
  return { voids, maxTrump };
}

/** Everything this seat can work out about where the unseen cards are. */
export function buildKnowledge(view: PlayerView): Knowledge {
  const played = new Set<Card>();
  for (const round of allPlays(view)) for (const p of round.plays) played.add(p.card);

  const located = new Set<Card>([...view.hand, ...played]);
  if (view.ecart) for (const c of view.ecart) located.add(c);

  const { voids, maxTrump } = inferConstraints(view);
  const { chienSize } = LAYOUT[view.playerCount];

  const slots: Slot[] = [];
  for (let p = 0; p < view.playerCount; p++) {
    if (p === view.self) continue;
    const shown = view.poignees.find((x) => x.player === p);
    const fixed = shown ? shown.cards.filter((c) => !played.has(c)) : [];
    slots.push({ id: p, capacity: view.cardsLeft[p] as number, fixed });
  }

  const takesChien = view.contract === Bid.Petite || view.contract === Bid.Garde;
  if (takesChien && view.ecart === null) {
    // The taker's ecart: six cards we never saw, but the rules say what cannot
    // be in them, and any trump he buried was shown to the table.
    slots.push({
      id: 'ecart',
      capacity: chienSize,
      fixed: view.ecartTrumpsShown.filter((c) => !played.has(c)),
    });
  } else if (view.contract === Bid.GardeSans || view.contract === Bid.GardeContre) {
    slots.push({ id: 'chien', capacity: chienSize, fixed: [] });
  }

  for (const slot of slots) for (const c of slot.fixed) located.add(c);

  return {
    unseen: DECK.filter((c) => !located.has(c)),
    slots,
    voids,
    maxTrump,
    fromChien: new Set(view.revealedChien.filter((c) => !located.has(c))),
    played,
  };
}

function allows(slot: Slot, card: Card, k: Knowledge, taker: number | null): boolean {
  if (k.fromChien.has(card) && slot.id !== taker && slot.id !== 'ecart') return false;
  if (slot.id === 'ecart') return !isKing(card) && !isBout(card);
  if (slot.id === 'chien') return true;
  const seat = slot.id as number;
  const suit = followSuitOf(card);
  if (suit !== null && (k.voids[seat] as Set<FollowSuit>).has(suit)) return false;
  if (isTrump(card) && rankOf(card) > (k.maxTrump[seat] as number)) return false;
  return true;
}

export interface Layout {
  /** A full hand for every seat: the real one for `self`, a sample for the rest. */
  hands: Card[][];
  ecart: Card[];
  chien: Card[];
}

/**
 * Deal the unseen cards into a layout consistent with everything we have
 * inferred. Cards with the fewest possible homes are placed first, which is what
 * makes a plain greedy pass succeed almost every time; if a sample paints itself
 * into a corner we simply try again, and after `attempts` failures we fall back
 * to an unconstrained deal rather than return nothing.
 */
export function sampleLayout(view: PlayerView, k: Knowledge, rng: Rng, attempts: number): Layout {
  for (let attempt = 0; attempt <= attempts; attempt++) {
    const relaxed = attempt === attempts;
    const result = trySample(view, k, rng, relaxed);
    if (result) return result;
  }
  /* c8 ignore next 2 -- the relaxed pass always succeeds */
  throw new Error('Could not sample a layout');
}

function trySample(view: PlayerView, k: Knowledge, rng: Rng, relaxed: boolean): Layout | null {
  const room = new Map<SlotId, number>();
  const contents = new Map<SlotId, Card[]>();
  for (const slot of k.slots) {
    room.set(slot.id, slot.capacity - slot.fixed.length);
    contents.set(slot.id, [...slot.fixed]);
  }

  const pool = shuffle([...k.unseen], rng);
  const eligible = new Map<Card, SlotId[]>();
  for (const card of pool) {
    const homes = k.slots
      .filter((s) => relaxed || allows(s, card, k, view.taker))
      .map((s) => s.id);
    eligible.set(card, homes);
  }
  // Most constrained first: a card with one possible home must claim it before a
  // card that would fit anywhere fills the space up.
  pool.sort((a, b) => (eligible.get(a) as SlotId[]).length - (eligible.get(b) as SlotId[]).length);

  for (const card of pool) {
    const homes = (eligible.get(card) as SlotId[]).filter((id) => (room.get(id) as number) > 0);
    if (homes.length === 0) return null;
    const id = homes[rng.nextInt(homes.length)] as SlotId;
    (contents.get(id) as Card[]).push(card);
    room.set(id, (room.get(id) as number) - 1);
  }

  const hands: Card[][] = [];
  for (let p = 0; p < view.playerCount; p++) {
    hands.push(p === view.self ? [...view.hand] : (contents.get(p) as Card[]));
  }
  return {
    hands,
    ecart: view.ecart ? [...view.ecart] : ((contents.get('ecart') as Card[]) ?? []),
    chien: (contents.get('chien') as Card[]) ?? [],
  };
}

/** Who holds the called card in this sampled layout — that is the partnership. */
export function partnerIn(view: PlayerView, layout: Layout): number | null {
  if (view.partner !== null) return view.partner;
  if (view.calledCard === null) return null;
  if (view.playerCount !== 5) return null;
  const holder = layout.hands.findIndex((h) => h.includes(view.calledCard as Card));
  if (holder >= 0) return holder;
  // Already played: whoever put it on the table is the partner.
  for (const t of view.tricks) {
    const play = t.plays.find((p) => p.card === view.calledCard);
    if (play) return play.player;
  }
  return null;
}

