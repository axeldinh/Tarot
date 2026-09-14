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
| 4 | Bots + headless simulation | harness ✅ with random legal play, bots not yet written |
| 5 | React UI, solo vs bots | — |
| 6 | PWA, offline service worker, deploy | — |
| 7 | Capacitor Android build | — |
| 8 | Table play over the chosen transport | — |

## Layout

```
packages/engine    pure TypeScript rules and scoring: no dependencies, no I/O
packages/bots      AI, depends only on the engine                   (not yet)
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

The simulation harness plays whole hands with random legal choices at all three
table sizes and asserts the invariants that must hold every time: no crash, no
illegal move, all 78 cards accounted for, 91 points on the table, and a
settlement that sums to exactly zero. It is what stands in for bot-vs-bot play
until the bots exist.

The property test (`test/property.test.ts`) does the same over 10 000 deals per
table size. Shorten it while iterating with
`TAROT_PROPERTY_DEALS=500 pnpm --filter @tarot/engine test`.

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
