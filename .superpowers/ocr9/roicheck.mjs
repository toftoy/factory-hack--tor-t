// What ROI does the rule derive from the real primary-pass output?
import { readFileSync } from 'node:fs';
import { deriveRoi, mapWordToImage } from './roi.mjs';

const here = new URL('./', import.meta.url).pathname;
const rows = JSON.parse(readFileSync(here + 'roidump.json', 'utf8'));

export function pooledWords(rec) {
  const pooled = [];
  for (const k of ['plain', 'boost']) {
    const p = rec.passes[k];
    const scale = Math.min(4, 1280 / Math.max(p.imgW, p.imgH));
    const geom = { canvasW: p.canvasW, canvasH: p.canvasH, scaledW: Math.round(p.imgW * scale), scaledH: Math.round(p.imgH * scale), scale, rotation: 0 };
    for (const w of p.words) pooled.push({ t: w.t, c: w.c, r: mapWordToImage(w.b, geom) });
  }
  return pooled;
}

if (process.argv[1].endsWith('roicheck.mjs')) {
  const opt = {};
  for (const a of process.argv.slice(2)) { const [k, v] = a.split('='); opt[k] = Number(v); }
  let hit = 0, none = 0;
  for (const rec of rows) {
    const p = rec.passes.plain;
    const roi = deriveRoi(pooledWords(rec), p.imgW, p.imgH, opt);
    const frac = roi ? ((roi.rect[2] - roi.rect[0]) * (roi.rect[3] - roi.rect[1])) / (p.imgW * p.imgH) : null;
    if (roi) hit++; else none++;
    console.log(
      `${rec.id} ${String(rec.dist).padEnd(4)} ${rec.background.padEnd(6)} ${rec.shipped.padEnd(7)} ` +
      (roi
        ? `roi=[${roi.rect.join(',')}] ${String(roi.rect[2] - roi.rect[0]).padStart(4)}x${String(roi.rect[3] - roi.rect[1]).padStart(4)} ` +
          `area=${(frac * 100).toFixed(2).padStart(6)}%  n=${String(roi.count).padStart(2)} wh=${roi.medianWordHeight.toFixed(0).padStart(3)} ${JSON.stringify(roi.texts.slice(0, 6))}`
        : 'roi=NONE'),
    );
  }
  console.log(`\nROI derived for ${hit}/${rows.length}, none for ${none}`);
}
