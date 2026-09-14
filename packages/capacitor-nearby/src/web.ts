import { WebPlugin } from '@capacitor/core';
import type { NearbyConnectionsPlugin } from './definitions.ts';

const UNAVAILABLE =
  'Le jeu en tablee demande l’application Android : un navigateur ne peut pas ouvrir de liaison radio directe.';

/**
 * There is no web implementation, and there cannot be one: a browser has no way
 * to open a Bluetooth or Wi-Fi Direct link to another phone. The stub refuses
 * clearly so the UI can say so in a sentence rather than fail obscurely.
 */
export class NearbyConnectionsWeb extends WebPlugin implements NearbyConnectionsPlugin {
  async requestPermissions(): Promise<{ granted: boolean }> {
    return { granted: false };
  }

  async checkPermissions(): Promise<{ granted: boolean }> {
    return { granted: false };
  }

  async startAdvertising(): Promise<void> {
    throw this.unavailable(UNAVAILABLE);
  }

  async stopAdvertising(): Promise<void> {
    // Stopping something that never started is not an error.
  }

  async startDiscovery(): Promise<void> {
    throw this.unavailable(UNAVAILABLE);
  }

  async stopDiscovery(): Promise<void> {
    // As above.
  }

  async requestConnection(): Promise<void> {
    throw this.unavailable(UNAVAILABLE);
  }

  async disconnect(): Promise<void> {
    // As above.
  }

  async reset(): Promise<void> {
    // As above.
  }

  async send(): Promise<void> {
    throw this.unavailable(UNAVAILABLE);
  }
}
