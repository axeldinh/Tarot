import { ROOM_CODE_PATTERN, TableRoom, type RoomSocket } from './room.ts';

/**
 * The Cloudflare Worker and Durable Object wrapping `TableRoom`.
 *
 * Like `packages/capacitor-nearby`, this file is the thin, unavoidably
 * platform-specific shell around logic that is otherwise ordinary, tested
 * TypeScript: everything it does is open a WebSocket, hand it to a
 * `TableRoom`, and pump bytes between the two. It cannot be exercised outside
 * the Workers runtime, so `src/room.ts` carries the test coverage instead.
 *
 * One table is one Durable Object, named after the short code the host is
 * given when they create the table (see `ROOM_CODE_PATTERN`). Cloudflare routes
 * every request for that code to the same object instance, wherever it is
 * running, which is what lets a `TableRoom`'s in-memory `Map` stand in as the
 * table's rendezvous point with no database of its own.
 */

export interface Env {
  ROOMS: DurableObjectNamespace;
  /**
   * Comma-separated list of origins allowed to connect. Unset (the default)
   * allows any origin — fine for a private app nobody else has the URL to,
   * and one less thing to configure before the relay is useful. Set it once
   * this is public knowledge and abuse of the free tier becomes a concern.
   */
  ALLOWED_ORIGINS?: string;
}

const ROOM_PATH_PATTERN = new RegExp(`^/room/(${ROOM_CODE_PATTERN.source.slice(1, -1)})$`);

class WebSocketRoomSocket implements RoomSocket {
  private readonly ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  send(data: string): void {
    try {
      this.ws.send(data);
    } catch {
      // The socket closed between the room deciding to speak and this call
      // landing; the matching 'close' event will clean the peer up.
    }
  }

  close(code?: number, reason?: string): void {
    try {
      this.ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }
}

/** One table. Cloudflare keeps this instance alive for as long as anyone is connected. */
export class TableRoomObject implements DurableObject {
  private readonly room = new TableRoom();

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }
    const role = new URL(request.url).searchParams.get('role') === 'host' ? 'host' : 'guest';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const id = this.room.join(new WebSocketRoomSocket(server), role);
    server.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') this.room.receive(id, event.data);
    });
    const onGone = (): void => this.room.leave(id);
    server.addEventListener('close', onGone);
    server.addEventListener('error', onGone);

    return new Response(null, { status: 101, webSocket: client });
  }
}

function originAllowed(request: Request, env: Env): boolean {
  if (!env.ALLOWED_ORIGINS) return true;
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .includes(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = ROOM_PATH_PATTERN.exec(url.pathname);
    if (!match) return new Response('not found', { status: 404 });
    if (!originAllowed(request, env)) return new Response('origin not allowed', { status: 403 });

    const code = match[1] as string;
    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    return stub.fetch(request);
  },
};
