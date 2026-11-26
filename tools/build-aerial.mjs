// Lädt das Luftbild SWISSIMAGE (swisstopo, Open Data) für den spielbaren Ausschnitt
// und speichert es als data/aerial.jpg. Das Spiel nimmt daraus nur Farben
// (Wiesen, Wege, Dächer), stark vereinfacht im Stil des Spiels.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data');
const meta = JSON.parse(await fs.readFile(path.join(OUT, 'meta.json'), 'utf8'));
const { minE, maxE, minN, maxN } = meta.lv95;
const PX = 1600;   // 2.5 m pro Pixel

const url = 'https://wms.geo.admin.ch/?' + new URLSearchParams({
  SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'ch.swisstopo.swissimage',
  STYLES: '', CRS: 'EPSG:2056', BBOX: `${minE},${minN},${maxE},${maxN}`,
  WIDTH: String(PX), HEIGHT: String(PX), FORMAT: 'image/jpeg',
});
console.log('Lade', url);
let buf;
for (let attempt = 1; attempt <= 4; attempt++) {
  const res = await fetch(url, { headers: { 'User-Agent': 'muotathal-game-geodata/1.0', Accept: 'image/jpeg' } });
  const type = res.headers.get('content-type') || '';
  buf = Buffer.from(await res.arrayBuffer());
  console.log(`Versuch ${attempt}: HTTP ${res.status}, ${type}, ${buf.length} Bytes`);
  if (res.ok && type.includes('jpeg') && buf.length > 50000) break;
  if (attempt === 4) throw new Error('Luftbild konnte nicht geladen werden: ' + buf.toString('utf8', 0, 300));
  await new Promise((r) => setTimeout(r, attempt * 5000));
}
await fs.writeFile(path.join(OUT, 'aerial.jpg'), buf);
meta.aerial = { file: 'aerial.jpg', px: PX, source: 'SWISSIMAGE © swisstopo' };
await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log('Gespeichert: data/aerial.jpg');
