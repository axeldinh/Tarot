import { PETIT, TOTAL_POINTS_2, countBouts, sumPoints2, type Card } from './cards.ts';
import {
  BID_MULTIPLIER,
  Bid,
  POIGNEE_BONUS,
  type CompletedTrick,
  type GameState,
  type HandResult,
  type PlayerCount,
  type PoigneeKind,
  type Rules,
  type Side,
} from './types.ts';

/** Card points the taker needs, by number of bouts he ends up with. */
export const TARGET_BY_BOUTS: readonly number[] = [56, 51, 41, 36];

export function targetForBouts(bouts: number): number {
  const t = TARGET_BY_BOUTS[bouts];
  /* c8 ignore next */
  if (t === undefined) throw new Error(`Impossible bout count: ${bouts}`);
  return t;
}

export function sideSign(side: Side): number {
  return side === 'taker' ? 1 : -1;
}

export interface ChelemInfo {
  /** Side that actually took every trick, if any. */
  achievedBy: Side | null;
  /** Side that announced a chelem, if any. */
  announcedBy: Side | null;
}

export interface ScoringInput {
  playerCount: PlayerCount;
  taker: number;
  /** 5 players: the partner's seat, `taker` when he called himself, else null. */
  partner: number | null;
  contract: Bid;
  /** Card points of the taker's side, in half-points. */
  takerPoints2: number;
  bouts: number;
  petitAuBoutSide: Side | null;
  poignees: readonly { side: Side; kind: PoigneeKind }[];
  chelem: ChelemInfo;
  rules: Rules;
}

/**
 * The whole settlement for one hand. Everything is computed in half-points
 * internally (`*2` suffixes) and only divided by two on the way out.
 */
export function scoreHand(input: ScoringInput): HandResult {
  const { playerCount, taker, partner, contract, takerPoints2, bouts, rules } = input;

  const target = targetForBouts(bouts);
  const diff2 = takerPoints2 - target * 2;
  const made = diff2 >= 0;
  const contractSign = made ? 1 : -1;
  const multiplier = BID_MULTIPLIER[contract];

  const petitAuBout = input.petitAuBoutSide === null ? 0 : 10 * sideSign(input.petitAuBoutSide);
  const petitAuBout2 = petitAuBout * 2;

  // The spec keeps petit au bout inside the multiplied base, so it flips with the
  // contract; the FFT variant credits it to whoever won it either way.
  const base2 = 50 + Math.abs(diff2) + (rules.petitAuBoutIndependentOfContract ? 0 : petitAuBout2);
  let score2 = contractSign * base2 * multiplier;
  if (rules.petitAuBoutIndependentOfContract) score2 += petitAuBout2 * multiplier;

  // Both bonuses are flat: they are never multiplied by the contract.
  let poigneeBonus = 0;
  for (const p of input.poignees) poigneeBonus += POIGNEE_BONUS[p.kind];
  score2 += contractSign * poigneeBonus * 2;

  const chelemBonus = chelemPoints(input.chelem);
  score2 += chelemBonus * 2;

  const score = score2 / 2;
  const deltas = settle(score, playerCount, taker, partner);

  return {
    taker,
    contract,
    partner,
    takerPoints2,
    takerPoints: takerPoints2 / 2,
    defencePoints: (TOTAL_POINTS_2 - takerPoints2) / 2,
    bouts,
    target,
    diff: diff2 / 2,
    made,
    multiplier,
    petitAuBout,
    petitAuBoutSide: input.petitAuBoutSide,
    base: base2 / 2,
    poigneeBonus: contractSign * poigneeBonus,
    chelemBonus,
    score,
    deltas,
  };
}

/** Chelem bonus, signed from the taker's point of view. */
export function chelemPoints(chelem: ChelemInfo): number {
  const { announcedBy, achievedBy } = chelem;
  let bonus = 0;
  if (announcedBy !== null) {
    bonus += (achievedBy === announcedBy ? 400 : -200) * sideSign(announcedBy);
  }
  if (achievedBy !== null && achievedBy !== announcedBy) {
    bonus += 200 * sideSign(achievedBy);
  }
  return bonus;
}

/**
 * Turn one taker-signed score into per-player deltas. Always sums to zero.
 * At 5 players the taker is paid twice and his partner once; a taker who called
 * himself collects from all four defenders.
 */
export function settle(
  score: number,
  playerCount: PlayerCount,
  taker: number,
  partner: number | null,
): number[] {
  const deltas = new Array<number>(playerCount).fill(0);
  const hasPartner = playerCount === 5 && partner !== null && partner !== taker;

  if (playerCount !== 5) {
    deltas[taker] = score * (playerCount - 1);
    for (let p = 0; p < playerCount; p++) if (p !== taker) deltas[p] = -score;
    return deltas;
  }

  if (hasPartner) {
    deltas[taker] = 2 * score;
    deltas[partner as number] = score;
    for (let p = 0; p < playerCount; p++) {
      if (p !== taker && p !== partner) deltas[p] = -score;
    }
    return deltas;
  }

  deltas[taker] = 4 * score;
  for (let p = 0; p < playerCount; p++) if (p !== taker) deltas[p] = -score;
  return deltas;
}

/** True when `player` is on the taker's side. */
export function sideOf(player: number, taker: number, partner: number | null): Side {
  return player === taker || (partner !== null && player === partner) ? 'taker' : 'defence';
}

/**
 * Gather the taker's cards for a finished hand: the tricks his side won, his
 * ecart, and the chien when the contract was a Garde Sans.
 */
export function takerCards(state: GameState): Card[] {
  const { taker, partner, contract } = state;
  /* c8 ignore next */
  if (taker === null || contract === null) throw new Error('Hand has no taker');

  const cards: Card[] = [];
  for (let p = 0; p < state.playerCount; p++) {
    if (sideOf(p, taker, partner) === 'taker') cards.push(...(state.piles[p] as Card[]));
  }
  cards.push(...state.ecart);
  // Garde Sans: the chien is never seen but counts for the taker.
  if (contract === Bid.GardeSans) cards.push(...state.chien);
  return cards;
}

/** Which side, if any, won the Petit on the very last trick. */
export function petitAuBoutSide(state: GameState): Side | null {
  const last = state.tricks[state.tricks.length - 1];
  if (!last) return null;
  if (!last.plays.some((p) => p.card === PETIT)) return null;
  /* c8 ignore next */
  if (state.taker === null) return null;
  return sideOf(last.winner, state.taker, state.partner);
}

export function chelemInfo(state: GameState): ChelemInfo {
  /* c8 ignore next */
  if (state.taker === null) return { achievedBy: null, announcedBy: null };
  const { taker, partner } = state;

  const announcedBy =
    state.chelemAnnouncedBy === null ? null : sideOf(state.chelemAnnouncedBy, taker, partner);

  let achievedBy: Side | null = null;
  if (state.tricks.length > 0) {
    const first = sideOf((state.tricks[0] as CompletedTrick).winner, taker, partner);
    achievedBy = state.tricks.every((t) => sideOf(t.winner, taker, partner) === first)
      ? first
      : null;
  }
  return { achievedBy, announcedBy };
}

/** Build the scoring input from a finished hand and score it. */
export function scoreState(state: GameState): HandResult {
  /* c8 ignore next */
  if (state.taker === null || state.contract === null) throw new Error('Hand has no taker');
  const cards = takerCards(state);
  return scoreHand({
    playerCount: state.playerCount,
    taker: state.taker,
    partner: state.partner,
    contract: state.contract,
    takerPoints2: sumPoints2(cards),
    bouts: countBouts(cards),
    petitAuBoutSide: petitAuBoutSide(state),
    poignees: state.poignees.map((p) => ({
      side: sideOf(p.player, state.taker as number, state.partner),
      kind: p.kind,
    })),
    chelem: chelemInfo(state),
    rules: state.rules,
  });
}
