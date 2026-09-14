import {
  Bid,
  LAYOUT,
  legalCalls,
  makeRng,
  type Action,
  type Card,
  type PlayerView,
  type Rng,
} from '@tarot/engine';
import { choosePoignee, shouldAnnounceChelem } from './announce.ts';
import { chooseBid } from './bidding.ts';
import { configFor, type BotConfig } from './config.ts';
import { chooseCall, chooseEcart } from './ecart.ts';
import { chooseCard, type Clock } from './play.ts';
import type { Bot, Level } from './types.ts';

export interface BotOptions {
  /** Seed for this bot's own RNG, so a table of bots replays identically. */
  seed?: number;
  /** Override any part of the level's published config. */
  config?: Partial<BotConfig>;
  /** Injectable clock, so the move budget is testable without waiting. */
  now?: Clock;
}

function highestBid(bids: readonly (Bid | null)[]): Bid {
  let best: Bid = Bid.Pass;
  for (const b of bids) if (b !== null && b > best) best = b;
  return best;
}

/** Has this seat played a card yet? Gates the poignee, and is public knowledge. */
function hasPlayed(view: PlayerView): boolean {
  if (view.currentTrick?.plays.some((p) => p.player === view.self)) return true;
  return view.tricks.some((t) => t.plays.some((p) => p.player === view.self));
}

export function makeBot(level: Level, options: BotOptions = {}): Bot {
  const config = configFor(level, options.config);
  const rng: Rng = makeRng(options.seed ?? 0x5eed);
  const now: Clock = options.now ?? (() => Date.now());

  const decide = (view: PlayerView): Action => {
    const self = view.self;
    switch (view.phase) {
      case 'bidding':
        return {
          type: 'Bid',
          player: self,
          bid: chooseBid(view.hand, view.playerCount, highestBid(view.bids), config),
        };

      case 'calling':
        return {
          type: 'CallKing',
          player: self,
          card: chooseCall(view.hand, legalCalls(view.hand), config.ecart),
        };

      case 'discard':
        return {
          type: 'Discard',
          player: self,
          cards: chooseEcart(view.hand, LAYOUT[view.playerCount].chienSize, config.ecart),
        };

      case 'chelem':
        return {
          type: 'AnnounceChelem',
          player: self,
          announce: shouldAnnounceChelem(view.hand, view.taker === self, config),
        };

      case 'playing': {
        if (!hasPlayed(view) && !view.poignees.some((p) => p.player === self)) {
          const kind = choosePoignee(view.hand, view.playerCount, config);
          if (kind !== null) return { type: 'AnnouncePoignee', player: self, kind };
        }
        return {
          type: 'PlayCard',
          player: self,
          card: chooseCard(view, config, rng, now).card as Card,
        };
      }

      /* c8 ignore next 2 -- the engine never asks a player to act in these phases */
      default:
        throw new Error(`Nothing to decide during phase "${view.phase}"`);
    }
  };

  const [minDelay, maxDelay] = config.delayMs;
  return {
    level,
    decide,
    thinkingDelay: () => minDelay + rng.nextInt(maxDelay - minDelay + 1),
  };
}
