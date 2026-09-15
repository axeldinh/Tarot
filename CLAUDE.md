# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A **French Tarot** game — the 78-card trick-taking card game (*jeu de tarot*) at 3, 4 and 5
players, with bids, the chien, the écart, bouts and the Petit. **Not** tarot divination.

TypeScript monorepo (pnpm workspaces). React + Vite UI, shipped two ways from one codebase:
an offline-capable PWA on GitHub Pages, and an Android APK via Capacitor. French by default
with an fr/en toggle.

Work on `main`. The original `claude/french-tarot-game-kw0knn` branch was merged into it and
deleted, deliberately — do not recreate it.

```
packages/engine   pure TS rules + scoring, zero deps, zero I/O, seeded RNG
packages/bots     three levels, heuristics + Monte-Carlo determinisation
packages/net      authoritative host, protocol, table server/client, Nearby + relay transports
packages/ui       React screens, SVG card faces, i18n
packages/capacitor-nearby   hand-written Java Capacitor plugin (Google Nearby Connections)
packages/relay    WebSocket relay for browser table play: Cloudflare Worker + Durable Object
docs/adr-transport.md  transport decisions, and the open gates (two-device Nearby, relay deploy)
docs/spec.md           the rules as implemented
```

CI is `.github/workflows/ci.yml` (jobs: `build`, `offline`, `android`) plus `deploy.yml` and
`deploy-relay.yml`, which publish the PWA to GitHub Pages and the relay to Cloudflare Workers
on every push to `main`. The APK is produced by the `android` job as the `tarot-debug-apk`
workflow artefact.

## Invariants — do not break these

These come from the project's original specification and are load-bearing:

- **No account system, no telemetry, no ads, no external API calls at runtime.** The game
  must work fully in aeroplane mode. Online table play (`RelayTransport`, `packages/relay`) is
  the one deliberate exception: it is opt-in, off entirely unless `VITE_RELAY_URL` is
  configured, and the only network traffic it adds is JSON game messages to our own relay —
  no account, no telemetry, no third party. Solo play must stay fully offline regardless.
- **Bots must never see hidden information.** The entire bot API is
  `decide(view: PlayerView): Action`. `PlayerView` has no field carrying another player's
  hand, the unseen chien, or the taker's écart. This is enforced by the *type*, not by
  convention. Never add a field to `PlayerView` that leaks.
- **The host never broadcasts full state** — it hands each seat its own `PlayerView`.
- **No existing card artwork, no real tarot deck imagery.** All 78 faces are drawn from
  scratch as SVG geometry in `packages/ui/src/cards/`. This is a copyright constraint, and
  also why the APK is ~4 MB and the offline cache is small.
- **Undo exists in solo play only, never at a real table.** The host refuses it outright
  when the table did not allow it.
- `packages/engine` stays dependency-free and I/O-free; `packages/bots` depends only on the
  engine.

## Verifying a change

```bash
pnpm typecheck && pnpm test          # every package that has tests
pnpm test:coverage                   # engine is held above 90%
pnpm --filter @tarot/ui build
CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  pnpm --filter @tarot/ui check:pwa  # serves dist, cuts the network, plays a whole hand
pnpm --filter @tarot/ui check:android
pnpm --filter @tarot/engine exec node --experimental-strip-types scripts/simulate.ts --hands 2000 --players 4
pnpm --filter @tarot/bots  exec node --experimental-strip-types scripts/simulate.ts --hands 2000 --players 4
```

**Drive the actual app in a browser for any UI change.** Tests here have repeatedly passed
while the real app was broken. `pnpm --filter @tarot/ui dev`, then Playwright with
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`.

After pushing, check CI rather than assuming green — the `android` job was silently red for
several commits before anyone looked at its conclusion.

## Environment

- `gh` CLI is not available. Use the `mcp__github__*` MCP tools for anything GitHub.
- `api.github.com` is blocked for direct `curl` (403 on CONNECT), so CI artefacts —
  including the APK — cannot be downloaded into the container.
- `dl.google.com` is blocked, so the Android SDK and the Android Gradle Plugin are
  unreachable and **the APK cannot be built locally**. CI builds it. `check:android`
  verifies everything about the Android project that can be checked without an SDK.
- All image hosts (Wikimedia, Openclipart, …) are blocked.
- `wrangler dev` (the real `workerd` runtime, run locally) works here and was used to smoke-test
  online table play end-to-end with Playwright across two browser contexts — see Open Items
  below. An actual `wrangler deploy` needs a Cloudflare account and API token, neither of which
  exists in this environment — see `packages/relay/README.md`.
- Source files are `erasableSyntaxOnly` and imports use explicit `.ts` specifiers, so
  `node --experimental-strip-types` runs them directly. That is why `Bid` is a const object
  and not an `enum`. Keep it that way.

## Things already learned the hard way

- **Bot strength is a documented negative result.** Paired A/B (each deal played twice with
  the seats swapped) showed that *having* a one-ply search is worth +37.7 ± 4.0 points a
  hand, and that nothing about the search's size matters after that: 8→30 determinisations
  +1.6 ± 2.5, 30→200 +3.7 ± 6.3 — both noise. Confirmé's budget was therefore cut from 200
  to 24. Normal and Confirmé are **not** measurably different at cards, and
  `packages/bots/src/config.ts` and the README say so. Do not "improve" the bots without
  measuring using `packages/bots/scripts/experiment.ts`; a naive head-to-head is ±6 points
  and will fool you.
- **React StrictMode.** A resource built in `useMemo` and disposed in a `useEffect` is not a
  matched pair — that combination froze the whole app on the first bid in every browser
  while every test passed, because StrictMode is inert in production builds. Build and tear
  down in the same effect. Regression test in `packages/ui/test/app.test.tsx`.
- **Table pacing lives in `packages/ui/src/state/timing.ts`**, shared between the trick
  gather animation and the host's `trickPauseMs`. The pause *absorbs* a bot's thinking time
  (`Math.max`); it does not stack on top of it.
- Hands are sorted for display inside the `Hand` component, in alternating suit colours
  (♠ ♥ ♣ ♦), then the atouts, then the Excuse.

## Open items

1. **The two-device Nearby test has never been run**, and is the one real risk left. Table
   play is written and tested against a fake radio in `packages/net/test/fake-nearby.ts`,
   but has never touched hardware. The original spec made this a Phase 0 gate before any UI
   work; that gate is still formally open. `docs/adr-transport.md` has the exact walkthrough
   and the three most likely failure modes. Needs two Android phones and the APK.
2. The debug APK is signed with the debug key only; there is no release signing config.
3. **The relay is deployed**, at `https://tarot-relay.axeldvc.workers.dev`, with
   `VITE_RELAY_URL` set so the web build at `https://axeldinh.github.io/Tarot/` carries it —
   done from outside this environment, which has no Cloudflare account or API token of its own.
   What remains unverified: two browsers on two actual networks playing a table over the real
   deployed relay. This environment's network access is an allowlist that does not include
   `workers.dev` or `github.io`, so it could confirm the deploy succeeded (the GitHub Actions
   logs) but not click through the live app. What *was* run here first, against the real
   Workers runtime: `wrangler dev` locally with the UI dev server pointed at it and two
   Playwright browser contexts hosting/joining a table over it — a full hand dealt, each browser
   holding only its own cards. `docs/adr-transport.md`'s addendum has the detail.

## Conventions

Commit messages here are long and explain *why*, including what was tried and did not work.
Report outcomes honestly: if tests fail, say so with the output; if a step was skipped, say
that.
