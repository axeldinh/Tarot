# French Tarot (Jeu de Tarot) — project spec

> This is the project's source of truth. Refer back to it rather than
> re-deciding things. Deviations belong in an ADR under `docs/`, not in the code.

---

## 1. Goal

Build a fully playable **French Tarot** (*jeu de tarot à 3, 4 et 5 joueurs*).

This is the trick-taking card game with 78 cards, bids and the Petit — **not**
tarot divination/cartomancy. No fortune telling anywhere in this project.

Two ways to play, both required:

1. **Solo** — 1 human + AI bots, works with no network at all.
2. **Table play** — several people sitting in the same room, each on their own
   phone, connected to each other **without internet access**. Empty seats filled
   by bots.

## 2. Platform and stack

- **Language:** TypeScript everywhere.
- **UI:** React + Vite.
- **Mobile:** wrap with **Capacitor** → Android APK.
- **Web build:** the same codebase deployed as an offline-capable PWA (service
  worker, installable, full solo play offline). Free hosting: GitHub Pages,
  Netlify or Cloudflare Pages. No paid services, no backend required for solo
  play.
- **No account system, no telemetry, no ads, no external API calls at runtime.**
- Target: Android 9+, portrait phone screens first, tablet-friendly second.

### 2.1 Phase 0 — transport spike (do this FIRST, before any UI)

Local offline multiplayer is the highest-risk part. Before building anything
else, evaluate and pick a transport, then write a one-page ADR in
`docs/adr-transport.md`.

Candidates, in rough order of preference:

- **Google Nearby Connections** (`P2P_STAR`) via a Capacitor plugin or a small
  custom Capacitor plugin wrapping the native SDK. Works over Bluetooth +
  Wi-Fi Direct, genuinely no internet needed. Verify a maintained plugin exists;
  if not, budget for writing a thin native bridge.
- **Local Wi-Fi / hotspot + host-run WebSocket server** inside the Android app
  (one device is host; others join by scanning a QR code containing its LAN IP).
  Requires everyone on the same Wi-Fi or on the host's hotspot.
- **WebRTC with QR-code manual signalling** — no server at all, but SDP exchange
  is clunky at 5 players. Fallback only.

Do not start on the UI until the chosen transport has a working demo that passes
a string between two physical devices with aeroplane-mode Wi-Fi-only (no
internet).

### 2.2 Architecture

- `packages/engine` — **pure TypeScript, zero dependencies, zero I/O.** All
  rules, scoring, legal-move generation. Deterministic: takes a seeded RNG for
  dealing.
- `packages/bots` — AI, depends only on the engine.
- `packages/ui` — React app.
- `packages/net` — transport abstraction with two implementations:
  `LocalTransport` (everything in one process, for solo + tests) and the chosen
  p2p transport.

The engine must be usable and fully testable in Node with no browser. Game state
is a serialisable object; every action is a message (`Bid`, `CallKing`,
`Discard`, `PlayCard`, `AnnouncePoignee`, `AnnounceChelem`) applied by a reducer.

**Authoritative host model:** the host device owns the state and deals. Clients
send intents and receive only their own hand plus public state. Never broadcast
full state — that would leak hands.

## 3. Rules specification (implement exactly)

### 3.1 Deck

78 cards:

- 4 suits (♠ ♥ ♦ ♣), 14 cards each: 1–10, Valet, Cavalier, Dame, Roi.
- 21 trumps (*atouts*), numbered 1–21.
- The **Excuse** (*l'Excuse*), a 22nd trump-like card.

**Bouts** (*oudlers*): Petit (trump 1), trump 21, Excuse.

### 3.2 Card values (counted in pairs, one point card + one low card)

| Card | Value |
|---|---|
| Roi | 4.5 |
| Dame | 3.5 |
| Cavalier | 2.5 |
| Valet | 1.5 |
| Each bout | 4.5 |
| Any other card | 0.5 |

Total in the deck = **91 points**. Display half-points as the traditional
"pairs" count, but compute in halves (use integers ×2 internally to avoid
floating point).

### 3.3 Deal

| Players | Cards each | Chien |
|---|---|---|
| 3 | 24 | 6 |
| 4 | 18 | 6 |
| 5 | 15 | 3 |

Deal anticlockwise in packets of 3. The *chien* is built one card at a time
during the deal; it may not receive the first or the last card of the deal. Cut
before dealing; no shuffling between hands in real play, but this is digital —
just shuffle.

### 3.4 Bidding (*les enchères*)

In order, each player once: **Passe**, **Petite** (aka *Prise*), **Garde**,
**Garde Sans** (le chien), **Garde Contre** (le chien). Each bid must be higher
than the previous. Highest bidder is the **preneur** (taker); all others are the
**défense**. All pass → redeal by the next dealer.

### 3.5 Called king (5 players only)

The taker announces a **Roi appelé** before seeing the chien. The holder of that
king is his secret partner and must not reveal himself; the partnership becomes
public only when that card is played. The taker may call a king he holds himself,
in which case he plays alone. If he holds all four kings, he calls a Dame (and so
on down).

At 3 and 4 players, the taker always plays alone.

### 3.6 The chien

- **Petite / Garde:** the taker turns the chien face up for all to see, adds it
  to his hand, and discards (*écart*) the same number of cards face down. The
  écart counts as part of the taker's tricks at scoring time.
  - May not discard: kings, bouts.
  - May discard trumps **only** if he has no other option, and they must be shown
    to all players when discarded.
- **Garde Sans:** the chien is not seen; it counts for the **taker** at scoring.
- **Garde Contre:** the chien is not seen; it counts for the **defence**.

### 3.7 Play

Trick play, first trick led by the player to the dealer's right (anticlockwise).

- Must follow suit.
- If void in the led suit, must play a trump.
- If a trump was played, must **overtrump** (*monter à l'atout*) if able; if
  unable to beat the highest trump on the table, must still play a trump if
  holding one.
- If void in suit **and** in trumps, play anything.
- Highest trump wins; otherwise highest card of the led suit.

**The Excuse:**

- May be played at any time, ignoring all the rules above.
- Never wins the trick.
- It goes back to the pile of the player who played it; in exchange that player
  gives the trick winner one low card (0.5) from his own tricks. If he has none
  yet, he owes it and pays at the end.
- Exception: if played on the **last trick**, the Excuse is lost to the trick
  winner — unless the player is completing a **chelem**, in which case it wins
  the last trick and should be led on the trick before last by convention
  (implement the standard rule: chelem-announcing player leading the Excuse on
  the final trick keeps it).

### 3.8 Contract target

At the end, count the taker's card points (tricks + écart, plus chien if Garde
Sans). The target depends on how many **bouts** the taker ends with:

| Bouts | Points needed |
|---|---|
| 0 | 56 |
| 1 | 51 |
| 2 | 41 |
| 3 | 36 |

`diff = takerPoints − target`. Contract is made if `diff >= 0`.

### 3.9 Scoring

```
base   = 25 + |diff| + petitAuBout
score  = base × multiplier
score += poignée                 (flat, NOT multiplied)
score += chelem                  (flat, NOT multiplied)
```

- **multiplier:** Petite ×1, Garde ×2, Garde Sans ×4, Garde Contre ×6.
- **Petit au bout:** 10 points if the Petit is won on the very last trick. It is
  inside the multiplied base, and it is awarded to whichever side won it (added
  to the taker's base if the taker's side won it, subtracted if the defence did).
- **Poignée** (a handful of trumps, shown before playing your first card; the
  Excuse counts as a trump only if you would otherwise be short). Always awarded
  to the winning side regardless of who showed it:

  | Poignée | 3 players | 4 players | 5 players | Bonus |
  |---|---|---|---|---|
  | Simple | 13 trumps | 10 | 8 | 20 |
  | Double | 15 | 13 | 10 | 30 |
  | Triple | 18 | 15 | 13 | 40 |

- **Chelem** (all tricks): announced and made **+400**; announced and failed
  **−200**; made without announcing **+200**. A player announcing a chelem leads
  the first trick.

### 3.10 Settlement (zero-sum, always)

- **3 and 4 players:** each defender pays `score` to the taker (or receives it);
  the taker's delta is `score × (playerCount − 1)`.
- **5 players with a partner:** taker `+2×score`, partner `+1×score`, each of the
  three defenders `−1×score`.
- **5 players, taker called himself:** taker `+4×score`, each defender
  `−1×score`.

Assert in tests that the sum of all deltas is exactly 0 for every hand.

## 4. AI bots

Three difficulty levels: **Débutant / Normal / Confirmé**.

- **Bidding:** heuristic hand evaluation — count bouts, trump length, kings, cut
  suits, singleton/void distribution. Publish the heuristic's thresholds in a
  config file so they can be tuned.
- **Écart:** shed short suits to create voids, keep kings guarded, never discard
  a bout or a king, keep trump length.
- **Play:** rules-legal move generation, then at Normal/Confirmé a limited-depth
  search or Monte-Carlo determinisation (sample opponent hands consistent with
  the cards seen so far and the void inferences from players failing to follow
  suit). Budget ≤ 400 ms per move on a mid-range phone; make the budget
  configurable.
- **Bots must never look at hidden information.** The bot API receives only the
  same public state + own hand a human player would. Enforce this with a type
  boundary, not a convention.
- Add a small artificial delay (300–800 ms) so play feels natural.

## 5. Table play (the offline multiplayer)

- Host creates a table, picks 3/4/5 seats, chooses which seats are bots.
- Other phones discover the table nearby, or scan a QR code, and claim a seat.
- Reconnect handling: if a phone drops, the host keeps its hand and lets it
  rejoin; if it doesn't return within a timeout, a bot takes over that seat for
  the hand.
- A running scoreboard persists across hands for the session, with hand-by-hand
  history and the ability to resume an interrupted session (store locally).
- Everything above must work with **all devices in aeroplane mode except
  Wi-Fi/BT**, and with no internet connection on the Wi-Fi network.

## 6. UI / UX

- **French by default**, with i18n (fr/en) and correct French terminology
  throughout: *preneur, chien, écart, atout, Petit, bout, poignée, chelem, petit
  au bout, Garde Sans, Garde Contre*.
- Card faces: generate simple, clean SVG cards **from scratch**. Do not use any
  existing card artwork or any real tarot deck imagery — copyright. Trumps are
  numbered tiles with a distinct colour; suits use standard pips.
- One-handed portrait layout: own hand fanned along the bottom, trick in the
  centre, other players around the edge with their name, bid and trick count.
- Legal moves highlighted; illegal cards dimmed and non-tappable, with a one-line
  reason on tap ("vous devez monter à l'atout").
- After each hand, a **score breakdown screen**: points, bouts, target, diff,
  multiplier, bonuses, per-player deltas. This is the screen people argue over —
  make it explicit and readable.
- Built-in rules reference and a scoring cheat sheet, available offline.
- Undo of the last card only in solo mode, never in table play.

## 7. Quality bar

- Engine unit tests with **>90% coverage**, including:
  - every scoring table row, at all three player counts;
  - the Excuse in every position, including last trick and the chelem case;
  - forced overtrump and the "must trump but can't beat" case;
  - the écart restrictions;
  - the 5-player called-king reveal and the called-himself case;
  - zero-sum settlement assertion on randomised hands (property test, 10k deals).
- A headless simulation harness: run N full games bot-vs-bot, assert no crash, no
  illegal move, zero-sum every hand. Run 10 000 games in CI.
- `README.md` with build instructions for both the web build and the APK.

## 8. Build order

1. Phase 0 transport spike + ADR.
2. Engine: deck, deal, legal moves, trick resolution, 4-player only.
3. Scoring + tests. Get this exactly right before touching the UI.
4. Extend engine to 3 and 5 players (called king).
5. Basic bots + headless simulation harness.
6. React UI, solo vs bots.
7. PWA build, offline service worker, deploy to free hosting.
8. Capacitor Android build.
9. Table play over the chosen transport.
10. Stronger bots, polish, rules reference.

Stop and report after steps 3, 6 and 9 rather than running to the end.
