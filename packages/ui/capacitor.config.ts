import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android wrapper around the same web build the browser gets.
 *
 * There is no server and no remote URL: `webDir` is the built app, loaded from
 * the APK itself, so the game works with the device in aeroplane mode from the
 * moment it is installed.
 */
const config: CapacitorConfig = {
  appId: 'net.tarot.jeu',
  appName: 'Tarot',
  webDir: 'dist-native',
  android: {
    // No http of any kind: everything is loaded from inside the package.
    allowMixedContent: false,
    backgroundColor: '#0d3a20',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
