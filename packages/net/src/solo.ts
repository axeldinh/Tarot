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
 * table; the only difference is which transport is underneath. That is what
 * makes the offline multiplayer in step 9 a swap rather than a rewrite.
 */
export function createSoloGame(options: SoloOptions): SoloGame {
  const seat = options.seat ?? 0;
  const seats: SeatSpec[] = Array.from({ length: options.playerCount }, (_, i) => ({
    name: options.names[i] ?? `Joueur ${i + 1}`,
    kind: i === seat ? 'human' : 'bot',
    ...(i === seat ? {} : { level: options.level }),
  }));

  const network = new LocalNetwork();
  const server = new TableServer(network.host, {
    playerCount: options.playerCount,
    seats,
    seed: options.seed,
    ...(options.dealer === undefined ? {} : { dealer: options.dealer }),
    ...(options.rules ? { rules: options.rules } : {}),
    allowUndo: true,
    ...(options.initialSession ? { initialSession: options.initialSession } : {}),
    botDelayMs: options.botDelayMs ?? 'natural',
    ...(options.schedule ? { schedule: options.schedule } : {}),
  });
  const client = new TableClient(network.connect(`seat-${seat}`), seat);

  return {
    client,
    server,
    close: () => {
      client.close();
      server.close();
    },
  };
}
