# ADR 001 — Transport for offline table play

- **Status:** Accepted, pending on-device validation (see "Outstanding gate")
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
live. Concretely, before step 9 (table play) starts, someone with two Android
phones must:

1. Build the spike app from `spikes/nearby/` (to be written with the plugin).
   The Capacitor Android project it would extend now exists at
   `packages/ui/android`, configured for Android 9+ and portrait, so the spike
   is a plugin and a screen rather than a project from scratch.
2. Put both phones in aeroplane mode, then re-enable Wi-Fi and Bluetooth only.
3. Confirm advertise → discover → connect → `sendPayload` round-trips a string,
   and record the time from "tap Host" to "connected".
4. Repeat with five devices to confirm `P2P_STAR` holds four spokes.

If that fails, the fallback is option B and this ADR gets superseded, not
amended. Nothing in steps 2–8 depends on the answer: the engine, the bots, the
UI, the PWA and the Android wrapper all sit on `LocalTransport`, which is why
the build order puts them first and why work continued past this gate rather
than stopping at it. Those steps are now done, so this gate is the next thing
standing between the project and table play — and it is the one part of the
build that cannot be done from a container at all.
