# Tarot

A playable **French Tarot** (*jeu de tarot*) for 3, 4 and 5 players: the
trick-taking card game with 78 cards, bids and the Petit. Solo against bots with
no network at all, and table play where everyone at the table uses their own
phone with no internet connection.

Nothing here has anything to do with tarot cartomancy.

## Status

Build order is the one in `docs/spec.md`. Work stops and reports after steps 3,
6 and 9.

| Step | | |
|---|---|---|
| 0 | Transport spike + ADR | ⚠️ decided on desk research; on-device demo still outstanding, see [`docs/adr-transport.md`](docs/adr-transport.md) |
| 1 | Engine: deck, deal, legal moves, tricks | ✅ |
| 2 | Scoring + tests | ✅ |
| 3 | 3 and 5 players, called king | ✅ (pulled forward — the scoring tests need all three table sizes) |
| 4 | Bots + headless simulation | ✅ |
| 5 | React UI, solo vs bots | — |
| 6 | PWA, offline service worker, deploy | — |
| 7 | Capacitor Android build | — |
| 8 | Table play over the chosen transport | — |

## Layout

```
packages/engine    pure TypeScript rules and scoring: no dependencies, no I/O
packages/bots      AI, depends only on the engine
packages/ui        React app                                        (not yet)
packages/net       transport abstraction + implementations          (not yet)
docs/              spec and architecture decisions
```

The engine is deliberately boring: a serialisable `GameState`, one `Action`
union, one `applyAction` reducer. It runs in Node with no browser, takes a seeded
RNG so any hand can be reproduced from its seed, and every source file is
erasable-syntax-only so `node --experimental-strip-types` runs it directly.

## Working on it

```sh
pnpm install
pnpm test            # every package
pnpm typecheck
pnpm build
```

Engine alone:

```sh
pnpm --filter @tarot/engine test
pnpm --filter @tarot/engine test:coverage     # thresholds are enforced at 90%
pnpm --filter @tarot/engine simulate -- --games 10000
```

The engine's own harness is a rules fuzzer: it plays whole hands with random
legal choices at all three table sizes and asserts the invariants that must hold
every time — no crash, no illegal move, all 78 cards accounted for, 91 points on
the table, and a settlement that sums to exactly zero. Random play reaches
positions no sensible bot would, which is exactly what makes it useful.

The property test (`test/property.test.ts`) does the same over 10 000 deals per
table size. Shorten it while iterating with
`TAROT_PROPERTY_DEALS=500 pnpm --filter @tarot/engine test`.

## The bots

Three levels, in `packages/bots`:

| Level | Bidding | Play |
|---|---|---|
| **Débutant** | overbids by about a point and a half | heuristic only, no search |
| **Normal** | calibrated thresholds | 30 Monte-Carlo determinisations, 150 ms budget |
| **Confirmé** | calibrated thresholds | 200 determinisations, 400 ms budget |

A bot's whole API is `decide(view: PlayerView): Action`. A `PlayerView` has no
field holding another player's hand, the unseen chien or the taker's écart, so a
bot *cannot* read hidden information — the boundary is the type, not a promise
about how `decide` is written. `test/bot.test.ts` walks whole hands at every
table size asserting that nothing private ever reaches a view.

**Bidding** scores a hand in "bid points" — bouts, trump length, high trumps,
honours, and a shape that lets you ruff, minus a charge for a long dead side
suit. Every weight and threshold is in `src/config.ts`.

**Écart** costs each candidate by what it gives up: cheap cards from short suits
with no king in them are ideal, since they buy a void to ruff into; stripping a
dame bare is charged for. Trumps go in only when the rules force them, lowest
first.

**Play** at Normal and Confirmé deals the unseen cards into a layout consistent
with everything the seat has worked out — who failed to follow which suit, who
under-trumped when obliged to overtrump, what the écart is forbidden to contain,
which cards the table watched go into the taker's hand from the face-up chien —
plays each candidate out to the end, scores the hand properly, and keeps the
running average. At five players the sample also decides who holds the called
king, which is to say who the partnership is.

### Calibration

Thresholds are set from measurement, not taste:

```sh
pnpm --filter @tarot/bots calibrate                  # percentiles + bid distribution
pnpm --filter @tarot/bots calibrate -- --fast        # same, with the search off
pnpm --filter @tarot/bots calibrate -- --matchup     # levels head to head
```

As configured, roughly 3–7% of deals are passed out and the hands that are
played split about 40/45/11/3 across Petite, Garde, Garde Sans and Garde Contre.

Head-to-head at four players, seats alternating:

| Matchup | Points per hand per seat | Hands |
|---|---|---|
| Normal vs Débutant | **+37.7 ± 4.0** | 584 |
| Confirmé vs Normal | +3.7 ± 6.3 | 208 |

Having a search at all is worth a great deal, and is far outside the noise.
Going from Normal's 30 determinisations to Confirmé's 200 is **not** measurably
better at that sample size — the difference is well inside one standard error,
for six times the thinking time. The likely reason is that every rollout is
driven by the same crude greedy policy, so more samples estimate the same biased
number more precisely rather than playing better. Sharpening the rollout policy
is step 10's job; until that is done, do not read Confirmé as the stronger bot
just because it thinks for longer.

### Simulation

```sh
pnpm --filter @tarot/bots simulate -- --games 10000 --level debutant
pnpm --filter @tarot/bots simulate -- --games 100 --players 4 --level normal
```

Runs whole hands with a bot in every seat and asserts no crash, no illegal move,
all 78 cards accounted for, 91 points on the table, and a settlement of exactly
zero. Because each bot is driven through `playerView`, this exercises the same
path a networked table will take. CI runs 10 000 hands per table size at
Débutant plus smaller runs of the two searching levels, which are far slower per
move.

### Building the app

Not yet — there is no UI. When there is:

- **Web / PWA:** `pnpm --filter @tarot/ui build`, then deploy `packages/ui/dist`
  to GitHub Pages, Netlify or Cloudflare Pages. Static hosting, no backend.
- **Android APK:** `pnpm --filter @tarot/ui build && npx cap sync android && npx
  cap open android`, then Build → Generate Signed Bundle/APK. Target is
  Android 9+.

## Rules notes

The engine implements the rules in `docs/spec.md`. Two places where real tables
differ, and what we do:

**Half points.** Card values are held as integers in half-points (`points2`:
Roi 9, Dame 7, Cavalier 5, Valet 3, bout 9, everything else 1, totalling 182 =
91 points) so nothing ever touches a float. The difference from the contract
target is *not* rounded, so a score can end in `.5`. Tables that round exist;
we follow the spec and keep the arithmetic exact.

**Petit au bout when the contract fails.** The spec puts the ±10 inside the
multiplied base, which means a contract that fails while the defence holds the
petit au bout costs the taker *less*. The FFT rule instead credits 10 ×
multiplier to whichever side won it, independently of the contract. Both are
implemented; the spec's reading is the default:

```ts
createHand({ playerCount: 4, seed: 1, rules: { petitAuBoutIndependentOfContract: true } });
```

## Licence

MIT.
