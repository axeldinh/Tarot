import {
  bestPoignee,
  isTrump,
  type Card,
  type PlayerCount,
  type PoigneeKind,
} from '@tarot/engine';
import type { BotConfig } from './config.ts';
import { shapeOf } from './evaluate.ts';

/**
 * Whether to show a poignee.
 *
 * The bonus always goes to the side that wins the hand, never to whoever showed
 * it, so showing one is close to free: a handful big enough to declare is a
 * handful big enough that your side usually wins. The cost is the information,
 * which these bots are not yet good enough to exploit in either direction.
 */
export function choosePoignee(
  hand: readonly Card[],
  playerCount: PlayerCount,
  config: BotConfig,
): PoigneeKind | null {
  if (!config.announcePoignee) return null;
  return bestPoignee(hand, playerCount);
}

/** Whether this hand is lopsided enough to announce a chelem. */
export function shouldAnnounceChelem(
  hand: readonly Card[],
  isTaker: boolean,
  config: BotConfig,
): boolean {
  const rule = config.chelem;
  if (rule === null || !isTaker) return false;
  const shape = shapeOf(hand);
  const trumpRatio = hand.filter(isTrump).length / hand.length;
  if (trumpRatio < rule.minTrumpRatio) return false;
  if (rule.requires21 && !shape.has21) return false;
  return shape.bouts >= rule.minBouts;
}
