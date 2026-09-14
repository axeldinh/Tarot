# ADR 001 — Transport for offline table play

- **Status:** Accepted and implemented, pending on-device validation (see "Outstanding gate")
- **Date:** 2026-09-14
- **Context:** Phase 0 of the build plan

## Problem

Several people sit at the same table, each with a phone, and want to play one
hand of tarot together. There is no internet. There may not even be a Wi-Fi
network. Empty seats are filled by bots. We need a transport that carries small
JSON messages between 2 and 5 Android devices, with one of them acting as the
authoritative host.

Traffic is tiny: a hand is on the order of a hundred messages of a few hundred
bytes. Latency tolerance is generous (a human tapping a card). What matters is
that it works with no infrastructure, and that pairing is quick enough that
nobody loses interest before the first deal.

## Options considered

### A. Google Nearby Connections (`P2P_STAR`)

Google Play Services API that negotiates its own link over Bluetooth, BLE and
Wi-Fi Direct/Aware, picking the best one available. `P2P_STAR` is exactly our
shape: one host, up to four spokes. No router, no internet, no IP addresses for
the user to see or type. Discovery and connection are part of the API.

Costs:

- Requires Google Play Services. Fine for our Android target, a hard stop if we
  ever want a de-Googled or iOS build from the same transport.
- Permission surface on Android 12+ is heavy: `BLUETOOTH_ADVERTISE`,
  `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION` (or
  `NEARBY_WIFI_DEVICES` with `neverForLocation` on Android 13+). Several of
  these are runtime prompts, and the location prompt reads badly to users.
- **Plugin availability, as checked on 2026-09-14 against the npm registry:**

  | Package | Latest | Published | Peer dep |
  |---|---|---|---|
  | `@squareetlabs/capacitor-nearby-multipeer` | 1.1.30 | 2025-07-08 | `@capacitor/core ^7.0.0` |
  | `@capacitor-trancee/nearby-connections` | 0.2.6 | 2025-03-09 | `@capacitor/core >=7.0.0` |

  Current Capacitor is 8.5.2 (2026-09-11). Neither plugin has shipped in over a
  year and neither declares Capacitor 8 support. So the honest reading of "verify
  a maintained plugin exists" is: **it does not**. Choosing this option means
  budgeting for a thin custom Capacitor plugin wrapping
  `com.google.android.gms:play-services-nearby` — roughly one Kotlin file
  exposing `startAdvertising`, `startDiscovery`, `requestConnection`,
  `sendPayload` and the matching callbacks — or vendoring and updating one of
  the two above.

### B. Host-run WebSocket server over LAN or hotspot

The host device runs a small WebSocket server; the others connect to
`ws://<host-lan-ip>:<port>`, obtained by scanning a QR code the host displays.
Conceptually trivial and completely debuggable from a laptop.

Costs:

- Everyone must already be on the same Wi-Fi, or join the host's hotspot. In a
  living room that is usually true; in a café or on a train it is a setup chore,
  and on many Android builds the hotspot owner cannot be on Wi-Fi at the same
  time.
- A WebView cannot listen on a socket. This needs a native Capacitor plugin too
  (`NanoHTTPD`, `Ktor`, or a raw `ServerSocket`), so it is not actually cheaper
  in native code than option A.
- Android 9+ blocks cleartext traffic by default; needs a
  `network_security_config` exemption for the local subnet, or TLS with a
  self-signed cert, which the client WebView will then reject.

### C. WebRTC with QR-code manual signalling

No server at all: exchange SDP offers and answers by displaying and scanning QR
codes. Genuinely infrastructure-free.

Costs:

- The SDP blob is large enough to need a dense QR or several frames, and the
  exchange is bidirectional. At five players that is eight scans before a card
  is dealt. Unacceptable as the primary path.
- Still needs the devices to find a common network path; without a STUN server
  it only works on host-candidate pairs, i.e. the same LAN — which is option B's
  constraint without option B's simplicity.

## Decision

**Google Nearby Connections in `P2P_STAR`, behind our own `Transport` interface,
with a thin custom Capacitor plugin that we own.**

It is the only option where the user experience is "open the app, tap Join, pick
the table" with no network setup, and it is the only one that works when there
is no Wi-Fi network at all. The native work it requires is comparable to
option B's, and unlike option B it does not put a "everyone connect to my
hotspot first" step in front of the game.

We write the plugin ourselves rather than depending on either npm package. Both
are a year or more stale and pinned to Capacitor 7; the surface we need is small
enough (advertise, discover, connect, send bytes, four callbacks) that owning it
is cheaper than tracking someone else's abandonment.

Option B is kept as the documented fallback: the `Transport` interface is
deliberately narrow enough that a LAN WebSocket implementation is a drop-in, and
it is the escape hatch for a device where Play Services is missing or the
Bluetooth permissions are refused.

Option C is rejected outright.

## What was built

The decision is implemented, as of step 9:

- `packages/capacitor-nearby` — the thin bridge, written ourselves as decided.
  It is ~360 lines of plain Java: five calls, five callbacks, no game state. It
  is Java rather than Kotlin deliberately — the Capacitor template already
  compiles Java, so the plugin adds no toolchain of its own, which matters for
  code that cannot be compiled on the machine it was written on.
- `NearbyTransport` in `packages/net` — the `Transport` implementation, plus the
  advert encoding that squeezes a table's name, size and free seats into the one
  short string Nearby lets an advertiser broadcast.
- A fake radio in the tests, modelling what Nearby does: advertise, discover,
  connect, deliver a payload to exactly one endpoint, and go out of range. The
  transport, framing, seating, reconnection and protocol above it are the real
  ones; only the radio is substituted.

## The interface everything hides behind

`packages/net` exposes one interface with three implementations over time:

```ts
interface Transport {
  readonly role: 'host' | 'client';
  send(to: PeerId | 'all', message: NetMessage): void;
  on(event: 'message' | 'peer-joined' | 'peer-left', handler: Handler): Unsubscribe;
  close(): void;
}
```

- `LocalTransport` — everything in one process. Solo play and every test use it,
  and it is what makes the engine testable in Node with no device.
- `NearbyTransport` — the decision above.
- `LanTransport` — the fallback, if and when we need it.

The authoritative-host model in the build spec means the transport only ever
carries intents upstream and per-player views downstream, so the message
payloads are small and the same shape regardless of which implementation is
underneath. Nothing above `packages/net` knows which one is in use.

## Consequences

- One Kotlin Capacitor plugin to write, test and maintain. It is the only native
  code in the project.
- Android-only for table play until someone writes the iOS half (Multipeer
  Connectivity has the same shape, which is why `@squareetlabs`' plugin bridges
  both — worth revisiting if iOS ever matters).
- The permission flow needs real design work, not a bare `requestPermissions()`:
  an explanation screen before the system prompts, and a graceful fall back to
  "play solo against bots" when they are refused. The manifest currently asks
  for nothing but the Capacitor template's `INTERNET`; the Bluetooth and Wi-Fi
  permissions arrive with the transport and with that screen, not before.
- Reconnect and bot-takeover (build spec §5) live above the transport, driven by
  `peer-left` plus a timer, so they are implementation-independent and testable
  against `LocalTransport`.

## Outstanding gate

The build spec requires a working demo passing a string between two physical
devices in aeroplane mode with Wi-Fi/Bluetooth on, before UI work starts.

**That demo has not been run, and cannot be run from this environment** — the
build runs in a headless Linux container with no Android hardware, no paired
handsets and no Play Services. The desk research above (plugin availability,
version currency, permission surface, API shape) is everything that was
verifiable here; the physical hand-off is not.

The gate therefore stands open, and the risk it was meant to retire is still
live. The rest of the project was built anyway, because none of it depends on
the answer — but table play does, and it is now the only thing standing between
the project and a game at a real table.

There is no longer a spike to write: the app itself is the spike. Someone with
two Android phones needs to:

1. Build the APK (`pnpm --filter @tarot/ui android:apk`, or take the artefact
   from the `android` CI job) and install it on both.
2. Put both in aeroplane mode, then re-enable Wi-Fi and Bluetooth only.
3. On one: *Jouer en tablée* → *Créer une tablée*, three seats. On the other:
   *Jouer en tablée* → *Rejoindre une tablée*. Confirm the table appears in the
   list with its name and free seats, and record the time from "tap Host" to
   "seated".
4. Deal, and play a hand. Then walk one phone out of range mid-hand and back in:
   the table should wait, then a bot should take over, then the returning phone
   should get its seat back.
5. Repeat with five devices to confirm `P2P_STAR` holds four spokes.

What would most likely go wrong, in rough order of probability: the permission
flow on a specific Android version; `P2P_STAR` failing to hold four spokes on
cheap hardware; and the advert string being truncated below the limit assumed
here. The first two would be fixed in the plugin; the third would mean moving
the free-seat count out of the advert and into the first message after
connecting.

If Nearby fails outright, the fallback is option B and this ADR gets superseded,
not amended. That would mean writing a second `Transport`, and nothing above
`packages/net` would change.


