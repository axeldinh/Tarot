# @tarot/relay

The WebSocket relay that lets browsers play a table together over the
internet, the way `NearbyTransport` lets Android phones play over Bluetooth/
Wi-Fi Direct in the same room. See the root README's
[Online play](../../README.md#online-play) and
[`docs/adr-transport.md`](../../docs/adr-transport.md) for how it fits in.

It is deliberately dumb: `src/room.ts` is a small, fully-tested, framework-free
`TableRoom` class that hands out peer ids and forwards JSON frames within one
table's room. `src/index.ts` is the thin Cloudflare Worker and Durable Object
shell around it — one Durable Object instance per table, keeping the room's
`Map` in memory for as long as somebody is connected. Neither file has ever
seen a card, a seat or a turn; that logic stays in `packages/net` and
`packages/ui`, running on whichever browser tab is hosting the table.

## One-time setup

Nobody but the app's owner can do this — it needs a Cloudflare account. Until
it's done, `VITE_RELAY_URL` stays unset and the web build behaves exactly as
it did before this package existed: table play is Android-only.

1. **A Cloudflare account.** Free is enough — Durable Objects (with the SQLite
   storage backend this uses) are on the free plan. Sign up at
   <https://dash.cloudflare.com/sign-up> if you don't have one.
2. **An API token.** Cloudflare dashboard → your profile icon → *My Profile* →
   *API Tokens* → *Create Token* → the **Edit Cloudflare Workers** template is
   enough. Copy the token; Cloudflare only shows it once.
3. **Add it as a GitHub secret.** In this repo: *Settings* → *Secrets and
   variables* → *Actions* → *Secrets* tab → *New repository secret* → name it
   `CLOUDFLARE_API_TOKEN`, paste the token.
4. **Deploy it.** Push a change under `packages/relay/**` to `main`, or run
   the *Deploy relay* workflow by hand from the Actions tab
   (`workflow_dispatch`). The job's `wrangler deploy` step prints the Worker's
   URL — `https://tarot-relay.<your-subdomain>.workers.dev` — and it's also
   visible afterwards under *Workers & Pages* in the Cloudflare dashboard.
5. **Tell the web build about it.** Same *Secrets and variables* → *Actions*
   page, but the **Variables** tab this time (the URL isn't a secret) → *New
   repository variable* → name it `VITE_RELAY_URL`, value the URL from step 4.
6. **Re-deploy the web build** (push to `main`, or re-run *Deploy web*) so it
   picks the variable up. `TablePlayScreen` now offers online play in a
   browser instead of saying table play isn't available.

## Local development

```sh
pnpm --filter @tarot/relay typecheck
pnpm --filter @tarot/relay test          # src/room.ts — see below
pnpm --filter @tarot/relay dev           # wrangler dev, a local relay on :8787
pnpm --filter @tarot/relay deploy        # manual deploy; needs `wrangler login`
                                          # or CLOUDFLARE_API_TOKEN in the shell
```

`src/index.ts` — the Worker/Durable Object glue — is not unit tested, the same
way `packages/capacitor-nearby`'s native bridge isn't: it cannot run outside
the Workers runtime. `src/room.ts` carries the coverage instead, and
`packages/net/test/fake-relay.ts` is an independent second implementation of
the same wire contract, used to test `RelayTransport` without either package
importing the other.

**This environment could not run any of this against a real Cloudflare
account** — no account, no API token. `wrangler deploy --dry-run` (bundling
only, no network call) succeeds and the bundle is a few KB. More than that
was actually run, though: `wrangler dev` — the real `workerd` runtime, just
local — serving this package, with `@tarot/ui`'s dev server pointed at it
(`VITE_RELAY_URL=http://localhost:8787`) and driven by Playwright with two
separate browser contexts, one hosting and one joining by the code the first
got back. It worked: a live lobby, a deal, each browser holding its own
24-card hand. What's unproven is narrower than that — an actual deploy, and
two browsers reaching it over the real internet rather than one machine's
loopback — and that's the one-time setup above, for someone with Cloudflare
access to close.

## Privacy and cost

No account system, no database, no logging beyond whatever Cloudflare's
platform does by default. A room's state — who is connected, which peer id is
the host — lives only in the Durable Object's memory for as long as somebody
is connected to that table, and is gone once everybody leaves. The free plan
comfortably covers a private app with a handful of concurrent tables; set
`ALLOWED_ORIGINS` in `wrangler.toml` once the app's URL is public knowledge, to
stop unrelated traffic from spending the free quota.
