/**
 * Check the Android project still says what we configured it to say.
 *
 *   pnpm --filter @tarot/ui check:android
 *
 * `npx cap sync` regenerates parts of the native project, and a stray
 * regeneration quietly undoing the portrait lock or the Android 9 floor would
 * not show up anywhere else. This asserts the handful of things we changed by
 * hand, and that the web build actually reached the APK's assets.
 *
 * It does not build an APK: that needs the Android SDK and the Android Gradle
 * Plugin from Google's Maven, which CI has and this check does not.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const android = `${root}android/`;
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

check(existsSync(android), 'no android project — run `npx cap add android`');
if (existsSync(android)) {
  const gradleVars = readFileSync(`${android}variables.gradle`, 'utf8');
  const minSdk = /minSdkVersion\s*=\s*(\d+)/.exec(gradleVars)?.[1];
  check(Number(minSdk) >= 28, `minSdkVersion is ${minSdk}; the spec targets Android 9 (28)`);

  const manifest = readFileSync(`${android}app/src/main/AndroidManifest.xml`, 'utf8');
  check(
    manifest.includes('android:screenOrientation="portrait"'),
    'the activity is not locked to portrait',
  );
  const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  // The app itself asks for nothing but the template's INTERNET. The Bluetooth
  // and Wi-Fi permissions table play needs are declared by the Nearby plugin's
  // own manifest and merged in at build time, each bounded to the Android
  // versions that actually use it.
  check(
    permissions.every((p) => p === 'android.permission.INTERNET'),
    `unexpected permissions in the app manifest: ${permissions.join(', ')}`,
  );

  // The native side of table play has to actually be in the build.
  const settings = readFileSync(`${android}capacitor.settings.gradle`, 'utf8');
  check(
    settings.includes('tarot-capacitor-nearby'),
    'the Nearby plugin is not part of the Android build; run `cap sync android`',
  );
  const variables = readFileSync(`${android}variables.gradle`, 'utf8');
  check(
    /playServicesNearbyVersion/.test(variables),
    'variables.gradle does not pin the Nearby library version',
  );

  const config = JSON.parse(readFileSync(`${root}android/app/src/main/assets/capacitor.config.json`, 'utf8'));
  check(config.appId === 'net.tarot.jeu', `appId is ${config.appId}`);
  check(config.webDir === 'dist-native', `webDir is ${config.webDir}`);
  check(!config.server?.url, 'the app must not point at a remote URL');

  const assets = `${android}app/src/main/assets/public/`;
  check(existsSync(`${assets}index.html`), 'the web build has not been synced into the app');
  // The native build deliberately ships without a service worker: Capacitor
  // already serves these files from inside the package.
  check(!existsSync(`${assets}sw.js`), 'a service worker was bundled into the APK');

  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const icon of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) {
      check(
        existsSync(`${android}app/src/main/res/mipmap-${density}/${icon}.png`),
        `missing ${icon} for ${density}`,
      );
    }
    check(
      existsSync(`${android}app/src/main/res/drawable-port-${density}/splash.png`),
      `missing portrait splash for ${density}`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exit(1);
}
console.log('OK - Android project is configured as intended and carries the current web build.');
