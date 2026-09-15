/**
 * Does the built app actually work with the network unplugged?
 *
 *   pnpm --filter @tarot/ui check:pwa
 *
 * Serves `dist`, lets the service worker install, then cuts the connection and
 * reloads. The app must come back and play a whole hand through to a score
 * without touching the network once. "Offline-capable" is easy to break by
 * accident and impossible to notice from a unit test, so it is checked here.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
  const file = join(DIST, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    const target = info.isDirectory() ? join(file, 'index.html') : file;
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404).end('not found');
  }
});

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}/`;

// CI installs its own matching browser; CHROMIUM_EXECUTABLE lets a machine that
// already has one (a container image, say) point at it instead of downloading.
const browser = await chromium.launch(
  process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {},
);
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  const registration = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return r.active?.state ?? null;
  });
  if (registration !== 'activated') fail(`service worker is ${registration}, not activated`);

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
    return href ? (await fetch(href)).json() : null;
  });
  if (!manifest) fail('no web app manifest');
  else {
    if (manifest.display !== 'standalone') fail(`display is ${manifest.display}`);
    if (manifest.orientation !== 'portrait') fail(`orientation is ${manifest.orientation}`);
    const sizes = new Set(manifest.icons.map((i) => i.sizes));
    for (const needed of ['192x192', '512x512']) {
      if (!sizes.has(needed)) fail(`no ${needed} icon in the manifest`);
    }
    if (!manifest.icons.some((i) => i.purpose === 'maskable')) fail('no maskable icon');
  }

  // Unplug and reload: everything from here on must come out of the cache.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Nouvelle partie', { timeout: 20_000 });

  await page.getByRole('button', { name: 'Débutant' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  const click = async (re) => {
    const button = page.getByRole('button', { name: re });
    if ((await button.count()) === 0) return false;
    await button.first().click();
    return true;
  };

  let scored = false;
  // Generous: the table now holds each trick for most of a second so it can
  // be gathered up, which adds the better part of twenty seconds to a hand.
  for (let i = 0; i < 800 && !scored; i++) {
    await page.waitForTimeout(150);
    if (await page.locator('[data-testid=score-breakdown]').count()) {
      scored = true;
      break;
    }
    const legal = page.locator('.hand-card.playable');
    if (await legal.count()) {
      await legal.first().click({ force: true });
      continue;
    }
    if (await click(/^Passe$/)) continue;
    if (await click(/^Non$/)) continue;
    if (await click(/^Non merci$/)) continue;
    if (await click(/^Écart automatique$/)) {
      await page.waitForTimeout(120);
      await click(/^Valider/);
      continue;
    }
    if (await click(/^Donne suivante$/)) continue;
  }
  if (!scored) fail('could not play a hand through to a score while offline');
  if (errors.length > 0) fail(`page errors: ${errors.join('; ')}`);

  if (process.exitCode) console.error('\nThe built app does not hold up offline.');
  else console.log('OK - installs, survives a reload with the network cut, and plays a whole hand.');
} finally {
  await browser.close();
  server.close();
}
