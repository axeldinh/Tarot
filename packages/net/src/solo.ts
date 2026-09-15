import type { PlayerCount, Rules } from '@tarot/engine';
import type { Level } from '@tarot/bots';
import { TableClient } from './client.ts';
import { TableServer } from './server.ts';
import { LocalNetwork } from './transport.ts';
import type { SeatSpec } from './host.ts';
import type { SessionSnapshot } from './protocol.ts';

export interface SoloOptions {
  playerCount: PlayerCount;
  /** Where the human sits. Everyone else is a bot. */
  seat?: number;
  level: Level;
  names: string[];
  seed: number;
  dealer?: number;
  rules?: Partial<Rules>;
  botDelayMs?: number | 'natural';
  /** Time the last trick is left on the table before the next one starts. */
  trickPauseMs?: number;
  schedule?: (fn: () => void, ms: number) => void;
  /** Resume a session that was interrupted: the scoreboard carries over. */
  initialSession?: SessionSnapshot;
}

export interface SoloGame {
  client: TableClient;
  server: TableServer;
  close(): void;
}

/**
 * One human, the rest bots, all in one process over `LocalTransport`.
 *
 * Solo play goes through exactly the same host, protocol and client as a real
 * table, down to sitting down in a seat and starting the table; the only
 * difference is which transport is underneath. That is what makes the offline
 * multiplayer a swap rather than a rewrite — and it means solo play exercises
 * the table code every time somebody plays a hand.
 */
export function createSoloGame(options: SoloOptions): SoloGame {
  const seat = options.seat ?? 0;
  const seats: SeatSpec[] = Array.from({ length: options.playerCount }, (_, i) => ({
    name: options.names[i] ?? `Joueur ${i + 1}`,
    kind: i === seat ? 'human' : 'bot',
    ...(i === seat ? { open: true } : { level: options.level }),
  }));

  const network = new LocalNetwork();
  const peer = `seat-${seat}`;
  const server = new TableServer(network.host, {
    // This device is the table, wherever its player happens to be sitting.
    hostPeer: peer,
    playerCount: options.playerCount,
    seats,
    seed: options.seed,
    ...(options.dealer === undefined ? {} : { dealer: options.dealer }),
    ...(options.rules ? { rules: options.rules } : {}),
    allowUndo: true,
    ...(options.initialSession ? { initialSession: options.initialSession } : {}),
    botDelayMs: options.botDelayMs ?? 'natural',
    ...(options.trickPauseMs === undefined ? {} : { trickPauseMs: options.trickPauseMs }),
    ...(options.schedule ? { schedule: options.schedule } : {}),
    start: 'manual',
  });

  const client = new TableClient(network.connect(peer), {
    name: options.names[seat] ?? 'Vous',
    seat,
  });
  // Nobody else is coming, so deal at once.
  client.start();

  return {
    client,
    server,
    close: () => {
      client.close();
      server.close();
    },
  };
}
