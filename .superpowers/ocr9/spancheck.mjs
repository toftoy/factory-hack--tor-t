// How big is the located label, before padding, as a fraction of the frame width?
// This is the quantity round 8's "fine at ~20%, falls apart around 12%" refers to.
import { readFileSync } from 'node:fs';
import { deriveRoi } from './roi.mjs';
import { pooledWords } from './roicheck.mjs';

const here = new URL('./', import.meta.url).pathname;
const rows = JSON.parse(readFileSync(here + 'roidump.json', 'utf8'));
for (const rec of rows) {
  const p = rec.passes.plain;
  const roi = deriveRoi(pooledWords(rec), p.imgW, p.imgH, { pad: 0.35, padLines: 2 });
  if (!roi) {
    console.log(`${rec.id} ${rec.dist.padEnd(4)} ${rec.shipped.padEnd(7)} no ROI`);
    continue;
  }
  console.log(
    `${rec.id} ${rec.dist.padEnd(4)} ${rec.shipped.padEnd(7)} content ${String(roi.contentSpan.toFixed(0)).padStart(5)}px = ` +
      `${(100 * roi.contentSpan / 3024).toFixed(1).padStart(5)}% of frame width   wordH@1280 ${(roi.medianWordHeight * 1280 / 4032).toFixed(1).padStart(5)}px`,
  );
}
