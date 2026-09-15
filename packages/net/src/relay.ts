import {
  HOST,
  type MessageHandler,
  type PeerHandler,
  type PeerId,
  type Transport,
  type TransportEvent,
  type Unsubscribe,
} from './transport.ts';

/**
 * A `Transport` over the WebSocket relay in `packages/relay`: a Cloudflare
 * Worker and Durable Object that does nothing but hand out peer ids and
 * forward JSON frames between the sockets in one table's room — the same job
 * `LocalNetwork` does in-process and `NearbyTransport` does over Bluetooth/Wi-Fi
 * Direct. See docs/adr-transport.md.
 *
 * This is how a browser plays with other browsers: Nearby needs a radio no
 * WebView has, so a page open on someone else's phone or laptop reaches the
 * table over the relay instead. Nothing above `Transport` can tell which one
 * it is talking through.
 *
 * The wire contract with the relay is deliberately small: connect to
 * `<url>/room/<code>?role=host|guest`, receive one `{t:'welcome',id}`, then any
 * number of `{t:'peer-joined'|'peer-left',id}` and `{t:'msg',from,body}`; send
 * `{t:'msg',to,body}`. The relay resolves the address `'host'` to whichever
 * connection currently holds that seat, so — unlike `NearbyTransport` — this
 * transport never has to track the host's identity itself.
 */

export interface RelaySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type RelaySocketFactory = (url: string) => RelaySocket;

/* c8 ignore next 2 -- exercised by a real browser, not the test suite */
const defaultFactory: RelaySocketFactory = (url) =>
  new WebSocket(url) as unknown as RelaySocket;

export interface RelayConnectOptions {
  /** The relay's base URL, e.g. `https://tarot-relay.example.workers.dev`. */
  url: string;
  /** The table code both sides agree on: chosen by the host, typed by a guest. */
  code: string;
  /** Injected in tests; defaults to the real `WebSocket`. */
  socketFactory?: RelaySocketFactory;
}

type ServerFrame =
  | { t: 'welcome'; id: PeerId }
  | { t: 'peer-joined'; id: PeerId }
  | { t: 'peer-left'; id: PeerId }
  | { t: 'msg'; from: PeerId; body: unknown };

type AnyHandler = MessageHandler | PeerHandler;

/** Table codes read out loud, so the alphabet drops the pairs people mix up. */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CODE_LENGTH = 6;

export function generateTableCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function socketUrl(options: RelayConnectOptions, role: 'host' | 'guest'): string {
  const base = options.url.replace(/\/$/, '').replace(/^http/, 'ws');
  return `${base}/room/${options.code}?role=${role}`;
}

export class RelayTransport implements Transport {
  readonly role: 'host' | 'client';
  readonly id: PeerId;
  private readonly socket: RelaySocket;
  private readonly handlers = new Map<TransportEvent, Set<AnyHandler>>();
  private open = true;

  private constructor(socket: RelaySocket, role: 'host' | 'client', id: PeerId) {
    this.socket = socket;
    this.role = role;
    this.id = id;
    this.socket.onmessage = (event) => this.onFrame(event.data);
    this.socket.onclose = () => {
      this.open = false;
    };
    this.socket.onerror = () => {
      this.open = false;
    };
  }

  /** The device running the table. */
  static host(options: RelayConnectOptions): Promise<RelayTransport> {
    return RelayTransport.connect(options, 'host');
  }

  /** A device joining a table it was given the code for. */
  static join(options: RelayConnectOptions): Promise<RelayTransport> {
    return RelayTransport.connect(options, 'client');
  }

  private static connect(
    options: RelayConnectOptions,
    role: 'host' | 'client',
  ): Promise<RelayTransport> {
    const factory = options.socketFactory ?? defaultFactory;
    const wireRole = role === 'host' ? 'host' : 'guest';
    const socket = factory(socketUrl(options, wireRole));

    return new Promise((resolve, reject) => {
      socket.onerror = () => reject(new Error('could not reach the relay'));
      socket.onclose = () => reject(new Error('the relay closed the connection'));
      socket.onmessage = (event) => {
        const frame = parse(event.data);
        if (!frame || frame.t !== 'welcome') return;
        resolve(new RelayTransport(socket, role, role === 'host' ? HOST : frame.id));
      };
    });
  }

  private onFrame(data: unknown): void {
    const frame = parse(data);
    if (!frame) return;
    switch (frame.t) {
      case 'msg': {
        // A client only ever addresses the host, whichever connection
        // physically holds that seat right now; the host itself needs the
        // real sender so `TableServer` knows which seat spoke.
        const from = this.role === 'client' ? HOST : frame.from;
        this.emitMessage(from, frame.body);
        return;
      }
      case 'peer-joined':
      case 'peer-left':
        this.emitPeer(frame.t, frame.id);
        return;
      /* c8 ignore next 2 -- 'welcome' only ever arrives once, before this handler is wired up */
      default:
        return;
    }
  }

  send(to: PeerId | 'all', message: unknown): void {
    if (!this.open) return;
    // The relay itself resolves the address 'host' to whichever socket holds
    // that seat, so nothing here needs to track it.
    this.socket.send(JSON.stringify({ t: 'msg', to, body: message }));
  }

  on(event: 'message', handler: MessageHandler): Unsubscribe;
  on(event: 'peer-joined' | 'peer-left', handler: PeerHandler): Unsubscribe;
  on(event: TransportEvent, handler: AnyHandler): Unsubscribe {
    const set = this.handlers.get(event) ?? new Set<AnyHandler>();
    set.add(handler);
    this.handlers.set(event, set);
    return () => set.delete(handler);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.socket.close();
  }

  private emitMessage(from: PeerId, message: unknown): void {
    if (!this.open) return;
    for (const handler of this.handlers.get('message') ?? []) {
      (handler as MessageHandler)(from, message);
    }
  }

  private emitPeer(event: 'peer-joined' | 'peer-left', peer: PeerId): void {
    if (!this.open) return;
    for (const handler of this.handlers.get(event) ?? []) (handler as PeerHandler)(peer);
  }
}

function parse(data: unknown): ServerFrame | null {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data) as ServerFrame;
  } catch {
    return null;
  }
}
