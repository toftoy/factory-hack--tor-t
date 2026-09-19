// Round 9, step 2: crop to the derived ROI and recognise the crop, upscaled.
// Sweeps the target text height so the "how much upscale" question is measured
// rather than guessed. Reuses the word boxes roidump.mjs already collected, so no
// primary pass is re-run here.
//
// Usage: node croplab.mjs [outfile]
import { chromium } from 'playwright-core';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveRoi } from './roi.mjs';
import { pooledWords } from './roicheck.mjs';

const here = new URL('./', import.meta.url).pathname;
const SCRATCH = '/tmp/claude-0/-home-user-factory-hack--tor-t/fda15333-f876-590b-8217-1a2737046316/scratchpad';
const APP = '/home/user/factory-hack--tor-t/.claude/worktrees/agent-a6d5cbd2cad092d0a/gjenglemt';
const LANG = SCRATCH + '/ocrlab/node_modules/@tesseract.js-data/nor/4.0.0';
const IMG = SCRATCH + '/ocr8/img/';
const OUT = here + (process.argv[2] ?? 'croplab.json');

const PAD = { pad: 0.35, padLines: 2 };
const TARGET_HEIGHTS = (process.env.TARGETS ?? '20,30,45,60').split(',').map((t) => t.trim());
const parseT = (t) => ({ target: Number(t.split(':')[0]), boost: t.split(':')[1] !== 'plain' });
const MAX_EDGE = 2200;

const assetMap = new Map();
for (const dir of [`${APP}/node_modules/tesseract.js/dist`, `${APP}/node_modules/tesseract.js-core`, LANG]) {
  let e = [];
  try { e = readdirSync(dir); } catch { continue; }
  for (const n of e) { const f = join(dir, n); if (statSync(f).isFile() && !assetMap.has(n)) assetMap.set(n, f); }
}

const dump = JSON.parse(readFileSync(here + 'roidump.json', 'utf8'));
const results8 = Object.fromEntries(
  readFileSync(here + 'results8.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r]),
);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext();
await ctx.route('https://cdn.jsdelivr.net/**', async (r) => {
  const n = new URL(r.request().url()).pathname.split('/').pop();
  const local = assetMap.get(n);
  if (local) await r.fulfill({ path: local }); else await r.continue();
});
await ctx.route('http://lab.test/**', async (r) => {
  const p = new URL(r.request().url()).pathname;
  if (p === '/') await r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><title>lab</title><body>' });
  else if (p.startsWith('/img/')) await r.fulfill({ path: IMG + decodeURIComponent(p.slice(5)) });
  else await r.continue();
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto('http://lab.test/');
await page.addScriptTag({ path: `${APP}/node_modules/tesseract.js/dist/tesseract.min.js` });

await page.evaluate(() => {
  const newCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    return [c, x];
  };
  window.__lab = {
    load: (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load')); i.src = src; }),
    init: async () => {
      const w = await Tesseract.createWorker('nor');
      await w.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300' });
      window.__lab.worker = w;
    },
    crop: async (src, rect, scale, boost) => {
      const img = await window.__lab.load(src);
      const sw = rect[2] - rect[0], sh = rect[3] - rect[1];
      const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
      const [c, x] = newCanvas(w, h);
      x.drawImage(img, rect[0], rect[1], sw, sh, 0, 0, w, h);
      const px = x.getImageData(0, 0, w, h), d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        const v = boost ? Math.max(0, Math.min(255, l * 1.8 - 60)) : l;
        d[i] = v; d[i + 1] = v; d[i + 2] = v;
      }
      x.putImageData(px, 0, 0);
      const t0 = performance.now();
      const { data } = await window.__lab.worker.recognize(c, {}, { text: true });
      return { text: data.text, ms: Math.round(performance.now() - t0), w, h };
    },
  };
});
await page.evaluate(() => window.__lab.init());

const digitsOf = (text) => (text.replace(/\s+/g, '').match(/[2-9]\d{7}/g) || []);
const out = [];
for (const rec of dump) {
  const p = rec.passes.plain;
  const roi = deriveRoi(pooledWords(rec), p.imgW, p.imgH, PAD);
  const row = { id: rec.id, dist: rec.dist, background: rec.background, truth: rec.truth, name: rec.name,
    shipped: rec.shipped, capPxAt1280: rec.capPxAt1280, roi: roi?.rect ?? null,
    wordH: roi?.medianWordHeight ?? null, by: {} };
  if (roi) {
    const file = results8[rec.id].file;
    for (const spec of TARGET_HEIGHTS) {
      const { target, boost } = parseT(spec);
      let scale = target / roi.medianWordHeight;
      const rw = roi.rect[2] - roi.rect[0], rh = roi.rect[3] - roi.rect[1];
      scale = Math.min(scale, MAX_EDGE / Math.max(rw, rh));
      scale = Math.max(scale, 0.2);
      const r = await page.evaluate(([src, rect, s, b]) => window.__lab.crop(src, rect, s, b), ['http://lab.test/img/' + file, roi.rect, scale, boost]);
      const cands = digitsOf(r.text);
      row.by[spec] = { hit: cands.includes(rec.truth), cands, ms: r.ms, w: r.w, h: r.h,
        scale: Number(scale.toFixed(2)), text: r.text.replace(/\s+/g, ' ').trim() };
    }
  }
  out.push(row);
  console.log(
    `${row.id} ${String(row.dist).padEnd(4)} ${row.background.padEnd(6)} ${row.shipped.padEnd(7)} ` +
    (roi
      ? TARGET_HEIGHTS.map((t) => `${t}:${row.by[t].hit ? 'HIT' : '-- '}${String(row.by[t].ms).padStart(4)}ms`).join(' ')
      : 'no ROI'),
  );
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out, null, 1));

const withRoi = out.filter((r) => r.roi);
const fail = withRoi.filter((r) => r.shipped !== 'correct');
const ctrl = withRoi.filter((r) => r.shipped === 'correct');
for (const [label, rs] of [['FAILURES with an ROI', fail], ['CONTROLS with an ROI', ctrl]]) {
  console.log(`\n${label} (n=${rs.length})`);
  for (const t of TARGET_HEIGHTS) {
    const hits = rs.filter((r) => r.by[t].hit).length;
    const wrong = rs.filter((r) => !r.by[t].hit && r.by[t].cands.length).length;
    const ms = rs.map((r) => r.by[t].ms).sort((a, b) => a - b);
    console.log(`  target ${String(t).padStart(2)}px: true number ${String(hits).padStart(2)}/${rs.length}  wrong-candidate ${wrong}  median ${String(ms[ms.length >> 1]).padStart(4)}ms  max ${String(ms[ms.length - 1]).padStart(4)}ms`);
  }
}
