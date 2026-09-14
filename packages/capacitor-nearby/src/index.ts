import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NearbyConnectionsPlugin } from './definitions.ts';

export type { NearbyConnectionsPlugin } from './definitions.ts';

export const NearbyConnections = registerPlugin<NearbyConnectionsPlugin>('NearbyConnections', {
  web: () => import('./web.ts').then((m) => new m.NearbyConnectionsWeb()),
});

/**
 * Whether this build can actually open a link to another phone. False in a
 * browser, which is why table play is offered only in the Android app.
 */
export function nearbyAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}
