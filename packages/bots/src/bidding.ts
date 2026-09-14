import { Bid, type Card, type PlayerCount } from '@tarot/engine';
import type { BotConfig } from './config.ts';
import { evaluateHand } from './evaluate.ts';

/** The strongest contract this hand justifies, ignoring what anyone else said. */
export function bidForHand(
  hand: readonly Card[],
  playerCount: PlayerCount,
  config: BotConfig,
): Bid {
  const score = evaluateHand(hand, config.bidding);
  const t = config.thresholds[playerCount];
  if (score >= t.gardeContre) return Bid.GardeContre;
  if (score >= t.gardeSans) return Bid.GardeSans;
  if (score >= t.garde) return Bid.Garde;
  if (score >= t.petite) return Bid.Petite;
  return Bid.Pass;
}

/**
 * What to say when it is your turn. A bid has to beat the highest so far, so a
 * hand worth a Petite behind a Garde simply passes — bidding up to hold the
 * contract is a losing habit we do not teach the bots.
 */
export function chooseBid(
  hand: readonly Card[],
  playerCount: PlayerCount,
  highest: Bid,
  config: BotConfig,
): Bid {
  const wanted = bidForHand(hand, playerCount, config);
  return wanted > highest ? wanted : Bid.Pass;
}
