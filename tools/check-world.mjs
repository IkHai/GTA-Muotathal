// Weltprüfung vor jedem Release:
//   node tools/check-world.mjs [ordner-für-bilder]
// 1. startet das Spiel in einem Browser ohne Fenster,
// 2. ruft __game.selfCheck() auf (Gebäude eben, keine Kanten/Inseln, Zäune, Parkplatz, Story-Sperre),
// 3. macht Bilder aus Spielerhöhe von jedem Ort im Stalden.
// Exit-Code 1, wenn die Prüfung Fehler findet.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] || join(ROOT, 'check-output');
mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try {
    const data = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

// Ansichten: [Name, Ort, Abstand vor der Tür, seitlich, Augenhöhe, Blick seitlich, Blickhöhe, Blicktiefe]
const VIEWS = [
  ['imbiss_vorne', 'imbiss', 7, -4, 1.7, 0, 1.2, 0],
  ['imbiss_seite', 'imbiss', 5, 6, 1.7, -1, 1.0, 1],
  ['haus_tuer', 'haus', 5, -3, 1.7, 0, 1.6, 1],
  ['haus_front', 'haus', 12, 3, 1.7, 0, 4, 1],
  ['club_eingang', 'club', 6, -2, 1.7, 0, 1.5, 0.5],
  ['club_front', 'club', 14, 3, 1.7, 0, 4, 1],
  ['club_links', 'club', 5, -11, 1.7, -4, 1.5, 3],
  ['club_rechts', 'club', 5, 12, 1.7, 7, 1.0, 4],
  ['block_front', 'home', 10, 4, 1.7, 0, 2.5, 1],
  ['block_tuer', 'home', 4, -2, 1.7, 0, 1.2, 0.5],
  ['block_seite', 'home', 6, -14, 1.7, -6, 1.5, 3],
  ['laden_front', 'shop', 9, 3, 1.7, 0, 2, 1],
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
try {
  const page = await (await browser.newContext({ ...devices['Pixel 7 landscape'] })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForFunction(() => window.__game, null, { timeout: 180000 });
  await page.evaluate(() => { localStorage.clear(); __game.startGame('Test'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('skip')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => __game.exitCar());
  const res = await page.evaluate(() => __game.selfCheck());
  console.log(`Weltprüfung: ${res.problems.length} Probleme`, JSON.stringify(res.stats));
  for (const p of res.problems) console.log(`  [${p.kind}] ${p.msg}${p.x !== undefined ? ` bei (${p.x}, ${p.z})` : ''}`);
  if (!res.ok) failed = true;
  if (errors.length) { console.log('Fehler im Spiel:\n  ' + errors.join('\n  ')); failed = true; }
  await page.addStyleTag({ content: '#hud,#buttons,#stick-base,#toast,#minimap{display:none!important}' });
  for (const v of VIEWS) {
    await page.evaluate(([, id, d, lat, eh, ll, lh, ld]) => {
      const W = __game.world, t = W.terrain, l = W.landmarks[id], h = l.heading;
      const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      const cx = l.door.x - fx * d + rx * lat, cz = l.door.z - fz * d + rz * lat;
      const lx = l.door.x + rx * ll + fx * ld, lz = l.door.z + rz * ll + fz * ld;
      __game.player.teleport(cx - fx * 4, cz - fz * 4, h);
      __game.follow.fixed = { x: cx, y: t.heightAt(cx, cz) + eh, z: cz, lx, ly: t.heightAt(lx, lz) + lh, lz };
    }, v);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, v[0] + '.png') });
  }
  console.log(`Bilder: ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
