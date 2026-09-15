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
| 5 | React UI, solo vs bots | ✅ |
| 6 | PWA, offline service worker, deploy | ✅ |
| 7 | Capacitor Android build | ⚠️ project set up and configured; the APK itself is built in CI, not here — see [Android](#android) |
| 8 | Table play over the chosen transport | ⚠️ written and tested against a fake radio; **never run on two phones** — see [Table play](#table-play) |
| 9 | Stronger bots, polish, rules reference | ✅ — though "stronger" turned out to mean *cheaper*: see [What actually makes a bot stronger](#what-actually-makes-a-bot-stronger) |

## Layout

```
packages/engine            rules and scoring: no dependencies, no I/O
packages/bots              AI, depends only on the engine
packages/net               the host, the wire protocol, and the transports
packages/capacitor-nearby  the native bridge to Nearby Connections
packages/relay             the WebSocket relay browsers play through, on Cloudflare Workers
packages/ui                React app
docs/                      spec and architecture decisions
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

Per package:

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
| **Normal** | calibrated thresholds | 16 Monte-Carlo determinisations |
| **Confirmé** | calibrated thresholds | 24 determinisations, and searches its écart |

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
pnpm --filter @tarot/bots experiment -- --a informed-30 --b blind-30 --games 400
```

As configured, roughly 3–7% of deals are passed out and the hands that are
played split about 40/45/11/3 across Petite, Garde, Garde Sans and Garde Contre.

### What actually makes a bot stronger

Every change was measured before it was kept. `scripts/experiment.ts` plays each
deal **twice**, with the two variants swapping seats between the runs, and
measures the difference — the luck of the cards at a given seat lands on both
and cancels, which buys about an order of magnitude in precision over a naive
head-to-head.

| Change | Points per hand per seat | Paired deals |
|---|---|---|
| A one-ply search, versus none at all | **+37.7 ± 4.0** | 584 |
| 8 → 30 determinisations | +1.6 ± 2.5 | 351 |
| 30 → 200 determinisations | +3.7 ± 6.3 | 208 |
| Blind → informed rollout policy | +2.6 ± 2.5 | 375 |
| Heuristic → searched écart | +1.2 ± 1.1 | 564 |

The first row is worth about nine standard errors. **Every other row is noise.**
Having a search at all transforms the bot; nothing about the search then matters
— not its size, not how well it plays the samples out, not extending it to the
écart.

Two things follow, and both are in the code:

- **The budget came down, not up.** Confirmé used 200 determinisations; it now
  uses 24, which is the same strength for about a fifth of the work — 8 ms a
  move instead of 45. A phone's battery is a real cost and the evidence says it
  was buying nothing.
- **Normal and Confirmé are not measurably different at cards.** Confirmé
  searches its écart and Normal does not, and that difference is not significant
  either. The level exists because the spec asks for three, and it is the one
  that looks hardest — not because it has been shown to win more often. Saying
  otherwise would be selling noise.

What is still unexplained is *why* the search saturates at a handful of samples.
The next thing worth trying is not more of the same: it is a search that looks
past the current trick, or an evaluation that is something other than the score
of one crude playout.

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

## The app

<p>
  <img src="docs/screens/setup.png" alt="Setup screen" width="240" />
  <img src="docs/screens/table.png" alt="Table during play" width="240" />
  <img src="docs/screens/score.png" alt="Score breakdown" width="240" />
</p>

French by default, English available, portrait phone first. Card faces are drawn
from scratch as SVG — no deck artwork, nothing traced: suits use the standard
pips, trumps are numbered tiles in their own colour, and the three bouts carry a
small marker.

A few things worth knowing about the table screen:

- **Legal moves are obvious.** Illegal cards are dimmed and inert and say why
  when tapped ("vous devez monter à l'atout"). Legal cards are lifted, are given
  more of the fan's width than the rest, and are stacked above the dimmed ones —
  a card you are allowed to play is never buried under one you are not.
- **The chien is turned face up** in the middle of the table on a Petite or a
  Garde, for everyone, exactly as the rules say. The écart is built by tapping,
  and the cards the rules protect refuse the tap with a reason.
- **The score breakdown** after every hand lists points, bouts, target,
  difference, multiplier, every bonus, and who pays whom. It is the screen people
  argue over, so nothing is rolled up.
- **Undo** takes back your last card and everything the bots played after it. It
  appears in solo play only; the host refuses it outright at a real table.
- The rules reference and the scoring cheat sheet are built in, in both
  languages.

```sh
pnpm --filter @tarot/ui dev        # http://localhost:5173
pnpm --filter @tarot/ui build      # static site in packages/ui/dist
pnpm --filter @tarot/ui preview
```

## How a seat talks to the table

Solo play is not a special case. `packages/net` holds the authoritative host —
it owns the deal and the game state, and hands each seat a `PlayerView` and
nothing else, so no screen can render a card it is not entitled to see. The UI
only ever holds a `TableClient`.

```
TableScreen ─▶ TableClient ─▶ Transport ─▶ TableServer ─▶ GameHost ─▶ engine
                                  │
                 LocalTransport   NearbyTransport   RelayTransport
                 (solo, one       (the other         (the other
                 process)         phones)            browsers)
```

Playing solo runs the whole of it: sitting down in a seat, being issued a token,
the host starting the table. The only difference between a solo game and four
people in a room is which transport is underneath — so every hand anybody plays
alone exercises the table code.

The device running a table is both server and client. Its own player is not on
the radio, so they talk to the table over an in-process loopback and the server
listens to both at once. That keeps the host from being a privileged path
through the game loop — which would be a second code path, and the one least
likely to be tested.

## Table play

Two ways to sit down together, chosen by which build you're in. In the Android
app: everyone in the same room, each on their own phone, with no internet —
start a table or join one nearby, over `NearbyTransport`. In a browser: anyone
with the table's code, wherever they are, over `RelayTransport` and the relay
in `packages/relay` — see [Online play](#online-play). Either way, empty seats
can be filled with bots.

**Reconnecting.** A radio link drops for all sorts of dull reasons, so a seat
belongs to a *token*, not to an endpoint id — a phone that comes back gets a new
endpoint and the same seat. When a device goes away the table **waits** for it,
and only once the grace period runs out does a bot play the seat out. The seat
keeps its name and its score throughout, and the moment the player returns the
stand-in steps down, mid-hand if need be.

**Permissions.** The app asks for nothing at install time. Bluetooth and Wi-Fi
are requested the first time somebody opens the table screen, after a sentence
explaining why a card game wants them, and each permission is bounded to the
Android versions that actually use it. Somebody who only ever plays solo never
sees the prompt.

**What is proven, and what is not.** Everything above the radio is tested for
real: seating, tokens, reconnection, the bot standing in and standing down, four
clients playing a hand through and none of them ever receiving another seat's
cards. Those tests run against a *fake radio* that models what Nearby
Connections does — advertise, discover, connect, deliver a payload to one
endpoint — and the transport, framing and protocol above it are the real ones.

**It has never run on two phones.** That demo needs hardware this was built
without, and it is the one thing a fake cannot stand in for. Until somebody
closes the gate in [`docs/adr-transport.md`](docs/adr-transport.md), treat table
play as written and tested but unproven.

### The web build

```sh
pnpm --filter @tarot/ui build       # -> packages/ui/dist
pnpm --filter @tarot/ui check:pwa   # drives the built app with the network cut
```

It is an installable PWA: web app manifest, maskable icons, portrait, and a
service worker that precaches the whole app. There are no runtime fetches to
fall back on and nothing is ever requested from a third party, so once it has
been opened it never touches the network again.

`check:pwa` is the part worth knowing about. It serves the build, lets the
worker install, then **cuts the connection, reloads, and plays a whole hand
through to a score**. "Offline-capable" is easy to break by accident and
invisible to a unit test, so CI runs that check on every push.

Deployment is `.github/workflows/deploy.yml`: pushes to `main` publish to GitHub
Pages. Set Settings → Pages → Source to "GitHub Actions" before the first run.
Netlify or Cloudflare Pages work the same way — build `pnpm install && pnpm
--filter @tarot/ui build`, publish `packages/ui/dist`. Asset paths are relative,
so the same build serves from a domain root or a subdirectory; set `VITE_BASE=/`
if you want them absolute.

### Online play

A browser has no radio, so it cannot use Nearby — `TablePlayScreen` shows the
online flow instead, over `RelayTransport`. Hosting generates a short code
(also the session id, so nothing else needs to hand it out); joining is typing
that code in, rather than Nearby's list of what's nearby. Same host-owns-the-
state architecture either way: the relay is a dumb pipe that hands out peer
ids and forwards JSON frames within one table's room — it never sees a card, a
seat or a turn, only bytes — while `TableServer`/`GameHost` still run on
whichever browser tab hosted the table.

The relay is `packages/relay`: a Cloudflare Worker and Durable Object, one
instance per table, deployed by `.github/workflows/deploy-relay.yml` on the
free tier. It needs one manual, one-time setup nobody but the app's owner can
do — a Cloudflare account, an API token, two GitHub secrets/variables — see
[`packages/relay/README.md`](packages/relay/README.md). Until that is done,
`VITE_RELAY_URL` is unset and the web build behaves exactly as it did before
this existed: table play stays Android-only.

### Android

```sh
pnpm --filter @tarot/ui android:sync    # build + cap sync
pnpm --filter @tarot/ui check:android   # assert the native config is intact
pnpm --filter @tarot/ui android:apk     # ./gradlew assembleDebug
pnpm --filter @tarot/ui android:open    # Android Studio
```

Capacitor wraps the same web build, loaded out of the APK, so the game works in
aeroplane mode from the moment it is installed. Configured by hand on top of the
Capacitor template: `minSdkVersion` 28 (the spec's Android 9), the activity
locked to portrait, launcher and adaptive icons and the splash screens generated
from the app's own icon, and no permission beyond the template's `INTERNET`.

The native bundle is built with `--mode capacitor`, whose only difference is
that it ships **without** the service worker — Capacitor already serves every
asset from inside the package, so a worker there would only add a second thing
that can serve a stale build. The two builds write to different directories
(`dist` and `dist-native`) so that a native build followed by a deploy cannot
put a worker-less bundle on the web.

**The APK has not been built on this machine.** The container this was developed
in cannot reach `dl.google.com`, which is where both the Android SDK and the
Android Gradle Plugin come from; `./gradlew assembleDebug` fails at dependency
resolution with a 403 before it gets as far as compiling anything. So the CI
workflow builds it instead, on a runner that can, and uploads the APK as an
artefact — see the `android` job in `.github/workflows/ci.yml`. Until that job
has run green, treat the Android build as configured but unproven.

Two things follow from not having had a device:

- `INTERNET` is kept because the Capacitor template sets it and removing it has
  not been tried on real hardware. The game makes no network calls, so it is a
  candidate for removal once somebody can check that the local asset server
  still works without it.
- Signing is not set up. `android:apk` produces a debug APK; a release build
  needs a keystore, which is the user's to create.

## Tests

| Package | Tests | Statements | Branches |
|---|---|---|---|
| `engine` | 140 | 99.8% | 99.1% |
| `bots` | 90 | 99.1% | 95.6% |
| `net` | 78 | 92.3% | 87.9% |
| `ui` | 81 | 97.7% | 89.8% |
| `relay` | 10 | 97.0% | 96.8% |

The engine's threshold is the spec's 90%; the others are set a little lower on
branches, where a defensive `catch` is not worth contorting a test for.
`relay`'s numbers are for `src/room.ts` — the pure routing logic — only;
`src/index.ts`, the Cloudflare Worker/Durable Object shell, can't run outside
the Workers runtime, the same reason `capacitor-nearby` carries no coverage
number of its own.

Beyond the unit tests, CI runs four things that a unit test cannot tell you:

| | |
|---|---|
| `engine simulate` | 10 000 hands per table size of random legal play |
| `bots simulate` | 10 000 hands per table size, bot versus bot |
| `ui check:pwa` | the built app, in a browser, with the network cut |
| `ui check:android` + `assembleDebug` | the native config, and an actual APK |

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
