import type { PluginListenerHandle } from '@capacitor/core';

/**
 * The Nearby Connections surface this game uses, and nothing more.
 *
 * `P2P_STAR` is the strategy: one advertiser (the table) and up to four
 * discoverers (the other phones). It negotiates its own link over Bluetooth and
 * Wi-Fi Direct, so it needs no router, no hotspot and no internet.
 */
export interface NearbyConnectionsPlugin {
  /**
   * Ask for the Bluetooth and Wi-Fi permissions the radio needs. Which ones
   * those are depends on the Android version, which is the plugin's problem
   * rather than the caller's.
   */
  requestPermissions(): Promise<{ granted: boolean }>;
  /** Whether they have already been granted. */
  checkPermissions(): Promise<{ granted: boolean }>;

  /** Tell nearby devices this table exists. `name` is what they will see. */
  startAdvertising(options: { serviceId: string; name: string }): Promise<void>;
  stopAdvertising(): Promise<void>;

  /** Listen for tables. Each one found arrives as an `endpointFound` event. */
  startDiscovery(options: { serviceId: string }): Promise<void>;
  stopDiscovery(): Promise<void>;

  /** Ask an endpoint for a connection. Both ends accept automatically. */
  requestConnection(options: { endpointId: string; name: string }): Promise<void>;
  disconnect(options: { endpointId: string }): Promise<void>;
  /** Drop every connection and stop both advertising and discovery. */
  reset(): Promise<void>;

  /** Send one message to one endpoint. The payload is a UTF-8 string. */
  send(options: { endpointId: string; payload: string }): Promise<void>;

  addListener(
    event: 'endpointFound',
    handler: (event: { endpointId: string; name: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'endpointLost',
    handler: (event: { endpointId: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'connected',
    handler: (event: { endpointId: string; name: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'disconnected',
    handler: (event: { endpointId: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    event: 'payload',
    handler: (event: { endpointId: string; payload: string }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
