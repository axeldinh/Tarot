import type {
  NearbyEndpointFound,
  NearbyEvent,
  NearbyListener,
  NearbyPayload,
  NearbyPlugin,
} from '../src/index.ts';

/**
 * A fake radio.
 *
 * It models the parts of Nearby Connections the transport actually relies on:
 * devices advertise a name, discoverers see the ones in range, a connection has
 * two ends, and a payload arrives at exactly one endpoint. It is not a
 * simulation of Bluetooth — it cannot tell us whether the real plugin works —
 * but everything above the plugin interface is exercised for real against it,
 * including the framing, the reconnection and the drop handling.
 */
export class FakeRadio {
  private readonly devices = new Map<string, FakeDevice>();
  /** Endpoints that cannot hear each other, for testing a device going away. */
  private readonly unreachable = new Set<string>();

  device(id: string): FakeDevice {
    const device = new FakeDevice(id, this);
    this.devices.set(id, device);
    return device;
  }

  /** Take a device off the air, as walking out of range would. */
  unplug(id: string): void {
    this.unreachable.add(id);
    const gone = this.devices.get(id);
    if (!gone) return;
    for (const [otherId, other] of this.devices) {
      if (otherId === id) continue;
      if (other.connections.delete(id)) other.fire('disconnected', { endpointId: id });
      if (other.discovering) other.fire('endpointLost', { endpointId: id });
    }
    for (const peer of [...gone.connections]) {
      gone.connections.delete(peer);
      gone.fire('disconnected', { endpointId: peer });
    }
  }

  /** @internal */
  advertisers(): FakeDevice[] {
    return [...this.devices.values()].filter(
      (d) => d.advertisedName !== null && !this.unreachable.has(d.id),
    );
  }

  /** @internal */
  get(id: string): FakeDevice | undefined {
    if (this.unreachable.has(id)) return undefined;
    return this.devices.get(id);
  }

  /** @internal */
  discoverers(): FakeDevice[] {
    return [...this.devices.values()].filter((d) => d.discovering && !this.unreachable.has(d.id));
  }
}

export class FakeDevice implements NearbyPlugin {
  readonly id: string;
  advertisedName: string | null = null;
  discovering = false;
  granted = true;
  readonly connections = new Set<string>();
  readonly sent: { to: string; payload: string }[] = [];
  private readonly handlers = new Map<NearbyEvent, Set<(event: never) => void>>();
  private readonly radio: FakeRadio;

  constructor(id: string, radio: FakeRadio) {
    this.id = id;
    this.radio = radio;
  }

  async requestPermissions(): Promise<{ granted: boolean }> {
    return { granted: this.granted };
  }

  async startAdvertising(options: { serviceId: string; name: string }): Promise<void> {
    this.advertisedName = options.name;
    // Anybody already looking sees the table appear.
    for (const seeker of this.radio.discoverers()) {
      if (seeker.id === this.id) continue;
      seeker.fire<NearbyEndpointFound>('endpointFound', { endpointId: this.id, name: options.name });
    }
  }

  async stopAdvertising(): Promise<void> {
    const was = this.advertisedName !== null;
    this.advertisedName = null;
    if (!was) return;
    for (const seeker of this.radio.discoverers()) {
      if (seeker.id === this.id) continue;
      seeker.fire('endpointLost', { endpointId: this.id });
    }
  }

  async startDiscovery(): Promise<void> {
    this.discovering = true;
    for (const advertiser of this.radio.advertisers()) {
      if (advertiser.id === this.id) continue;
      this.fire<NearbyEndpointFound>('endpointFound', {
        endpointId: advertiser.id,
        name: advertiser.advertisedName as string,
      });
    }
  }

  async stopDiscovery(): Promise<void> {
    this.discovering = false;
  }

  async requestConnection(options: { endpointId: string; name: string }): Promise<void> {
    const other = this.radio.get(options.endpointId);
    if (!other) throw new Error(`no such endpoint: ${options.endpointId}`);
    // Nearby's handshake is two-sided; both ends learn about it.
    this.connections.add(other.id);
    other.connections.add(this.id);
    other.fire('connected', { endpointId: this.id });
    this.fire('connected', { endpointId: other.id });
  }

  async disconnect(options: { endpointId: string }): Promise<void> {
    const other = this.radio.get(options.endpointId);
    this.connections.delete(options.endpointId);
    if (!other) return;
    other.connections.delete(this.id);
    other.fire('disconnected', { endpointId: this.id });
  }

  async send(options: { endpointId: string; payload: string }): Promise<void> {
    this.sent.push({ to: options.endpointId, payload: options.payload });
    const other = this.radio.get(options.endpointId);
    if (!other || !other.connections.has(this.id)) {
      throw new Error(`not connected to ${options.endpointId}`);
    }
    other.fire<NearbyPayload>('payload', { endpointId: this.id, payload: options.payload });
  }

  async addListener(event: NearbyEvent, handler: (event: never) => void): Promise<NearbyListener> {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return {
      remove: async () => {
        set.delete(handler);
      },
    };
  }

  /** @internal */
  fire<E>(event: NearbyEvent, payload: E): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      (handler as unknown as (e: E) => void)(payload);
    }
  }
}
