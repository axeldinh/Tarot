import { describe, expect, it } from 'vitest';
import {
  Bid,
  DECK_SIZE,
  LAYOUT,
  TOTAL_POINTS_2,
  applyAction,
  createHand,
  isTerminal,
  legalActions,
  playerView,
  sumPoints2,
  type Card,
  type GameState,
  type PlayerCount,
  type PlayerView,
} from '@tarot/engine';
import { LEVELS, LEVEL_NAMES, makeBot, playDeal, playHandWithBots, type Bot, type Level } from '../src/index.ts';

const TABLES: PlayerCount[] = [3, 4, 5];

function table(level: Level, playerCount: PlayerCount, seed = 0): Bot[] {
  return Array.from({ length: playerCount }, (_, seat) => makeBot(level, { seed: seed + seat * 7 }));
}

/** The same bot with the search turned right down, so a test can run many hands. */
function quickTable(level: Level, playerCount: PlayerCount, seed = 0): Bot[] {
  return Array.from({ length: playerCount }, (_, seat) =>
    makeBot(level, {
      seed: seed + seat * 7,
      config: { play: { budgetMs: 50, maxDeterminisations: 2, samplingAttempts: 20 } },
    }),
  );
}

function assertSound(s: GameState, playerCount: PlayerCount): void {
  if (s.phase === 'passed') {
    expect(s.taker).toBeNull();
    return;
  }
  const all = [...s.piles.flat(), ...s.ecart, ...s.chien];
  expect(all).toHaveLength(DECK_SIZE);
  expect(new Set(all).size).toBe(DECK_SIZE);
  expect(sumPoints2(all)).toBe(TOTAL_POINTS_2);
  expect(s.tricks).toHaveLength(LAYOUT[playerCount].cardsPerPlayer);
  expect(s.hands.every((h) => h.length === 0)).toBe(true);
  expect(s.excuseDebts).toHaveLength(0);
  expect(s.result?.deltas.reduce((a, b) => a + b, 0)).toBe(0);
}

describe('a table of bots', () => {
  it.each(TABLES)('plays clean hands at %i players', (playerCount) => {
    const bots = table('debutant', playerCount, 3);
    let played = 0;
    for (let i = 0; i < 150; i++) {
      const s = playDeal({ playerCount, seed: i * 7919 + playerCount, dealer: i % playerCount }, bots);
      assertSound(s, playerCount);
      if (s.phase !== 'passed') played++;
    }
    expect(played).toBeGreaterThan(120);
  });

  it.each(LEVELS)('finishes hands at every level (%s)', (level) => {
    for (const playerCount of TABLES) {
      const s = playDeal(
        { playerCount, seed: 20_260_914, dealer: 1 },
        quickTable(level, playerCount, 11),
      );
      expect(isTerminal(s)).toBe(true);
      assertSound(s, playerCount);
    }
    expect(LEVEL_NAMES[level]).toBeTruthy();
  });

  it(
    'plays a whole hand at full Confirme strength, inside its move budget',
    { timeout: 120_000 },
    () => {
      const bots = table('confirme', 4, 11);
      const started = Date.now();
      const s = playDeal({ playerCount: 4, seed: 20_260_914, dealer: 1 }, bots);
      assertSound(s, 4);
      const moves = s.tricks.length * 4;
      // The published budget is 400ms a move; CI machines are slower than a
      // desk, so the bar here is only that it is in the right order of magnitude.
      expect((Date.now() - started) / Math.max(moves, 1)).toBeLessThan(2000);
    },
  );

  it('only ever offers the engine a legal action', () => {
    for (const playerCount of TABLES) {
      const bots = quickTable('normal', playerCount, 5);
      for (let i = 0; i < 3; i++) {
        let s = createHand({ playerCount, seed: i * 31 + 2, dealer: 0 });
        while (!isTerminal(s)) {
          const seat = s.currentPlayer;
          const action = (bots[seat] as Bot).decide(playerView(s, seat));
          expect(action.player).toBe(seat);
          // `legalActions` does not enumerate the ecart, which is validated by
          // the engine on the way in; everything else must be in the list.
          if (s.phase !== 'discard') {
            expect(legalActions(s)).toContainEqual(action);
          }
          s = applyAction(s, action);
        }
      }
    }
  }, 60_000);

  it('pauses for a believable moment before moving', () => {
    for (const level of LEVELS) {
      const bot = makeBot(level, { seed: 4 });
      for (let i = 0; i < 50; i++) {
        const delay = bot.thinkingDelay();
        expect(delay).toBeGreaterThanOrEqual(300);
        expect(delay).toBeLessThanOrEqual(800);
      }
    }
  });

  it('replays identically from the same seeds', { timeout: 60_000 }, () => {
    const a = playDeal({ playerCount: 4, seed: 777, dealer: 2 }, quickTable('normal', 4, 9));
    const b = playDeal({ playerCount: 4, seed: 777, dealer: 2 }, quickTable('normal', 4, 9));
    expect(a.tricks.map((t) => t.plays.map((p) => p.card))).toEqual(
      b.tricks.map((t) => t.plays.map((p) => p.card)),
    );
    expect(a.result).toEqual(b.result);
  });

  it('refuses to act in a phase where nobody is to move', () => {
    const bot = makeBot('normal', { seed: 1 });
    const done = playDeal({ playerCount: 4, seed: 5, dealer: 0 }, table('debutant', 4));
    expect(() => bot.decide(playerView(done, 0))).toThrow(/Nothing to decide/);
  });
});

/** Every card the view puts in front of the bot, wherever it appears. */
function cardsVisibleIn(view: PlayerView): Set<Card> {
  const seen = new Set<Card>([
    ...view.hand,
    ...(view.chien ?? []),
    ...view.revealedChien,
    ...(view.ecart ?? []),
    ...view.ecartTrumpsShown,
    ...view.poignees.flatMap((p) => p.cards),
    ...view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(view.currentTrick?.plays.map((p) => p.card) ?? []),
  ]);
  if (view.calledCard !== null) seen.add(view.calledCard);
  return seen;
}

describe('the hidden-information boundary', () => {
  it('never shows a bot a card from another seat s hand', () => {
    for (const playerCount of TABLES) {
      const bots = table('debutant', playerCount, 2);
      for (let deal = 0; deal < 8; deal++) {
        let s = createHand({ playerCount, seed: deal * 101 + 13, dealer: 0 });
        while (!isTerminal(s)) {
          for (let seat = 0; seat < playerCount; seat++) {
            const view = playerView(s, seat);
            const visible = cardsVisibleIn(view);
            // These three are public: the table saw the chien, the poignee and
            // the called card, so they are allowed to appear in anyone's view.
            const publicCards = new Set<Card>([
              ...view.revealedChien,
              ...view.poignees.flatMap((p) => p.cards),
              ...(view.calledCard === null ? [] : [view.calledCard]),
            ]);
            for (let other = 0; other < playerCount; other++) {
              if (other === seat) continue;
              for (const card of s.hands[other] as Card[]) {
                if (publicCards.has(card)) continue;
                expect(visible.has(card)).toBe(false);
              }
            }
            if (seat !== s.taker) {
              // The ecart itself is never handed over. Cards that came out of the
              // face-up chien stay public: the table saw them, it just does not
              // know which of them the taker buried.
              expect(view.ecart).toBeNull();
              for (const card of s.ecart) {
                if (publicCards.has(card)) continue;
                expect(visible.has(card)).toBe(false);
              }
            }
            if (!s.chienRevealed) {
              for (const card of s.chien) expect(visible.has(card)).toBe(false);
            }
          }
          s = applyAction(s, (bots[s.currentPlayer] as Bot).decide(playerView(s, s.currentPlayer)));
        }
      }
    }
  });

  it('is the whole of what a bot is given', () => {
    // The Bot interface takes a PlayerView and returns an Action. There is no
    // field on a PlayerView holding another hand, so the boundary is the type,
    // not a promise about how `decide` is written.
    const s = playHandWithBots(createHand({ playerCount: 4, seed: 3, dealer: 0 }), table('debutant', 4));
    const view = playerView(s, 0);
    expect(Object.keys(view)).not.toContain('hands');
    expect(Object.keys(view)).not.toContain('piles');
    expect(view.contract === null || Object.values(Bid).includes(view.contract)).toBe(true);
  });
});
