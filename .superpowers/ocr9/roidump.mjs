// Round 9, step 1: does a FAILED primary pass still tell us WHERE the label is?
//
// The shipped primary passes (1280px, plain + contrast-boosted, PSM 11, nor) run
// before anything this round adds. This dumps their word-level bounding boxes for
// round 8's 17 failures plus controls, so the ROI question can be answered from
// real Tesseract output rather than assumed.
//
// Usage: node roidump.mjs [outfile]
import { chromium } from 'playwright-core';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const here = new URL('./', import.meta.url).pathname;
const SCRATCH = '/tmp/claude-0/-home-user-factory-hack--tor-t/fda15333-f876-590b-8217-1a2737046316/scratchpad';
const APP = '/home/user/factory-hack--tor-t/.claude/worktrees/agent-a6d5cbd2cad092d0a/gjenglemt';
const LANG = SCRATCH + '/ocrlab/node_modules/@tesseract.js-data/nor/4.0.0';
const IMG = SCRATCH + '/ocr8/img/';
const OUT = here + (process.argv[2] ?? 'roidump.json');

const assetMap = new Map();
for (const dir of [`${APP}/node_modules/tesseract.js/dist`, `${APP}/node_modules/tesseract.js-core`, LANG]) {
  let e = [];
  try { e = readdirSync(dir); } catch { continue; }
  for (const n of e) { const f = join(dir, n); if (statSync(f).isFile() && !assetMap.has(n)) assetMap.set(n, f); }
}

const rows = readFileSync(here + 'results8.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const failures = rows.filter((r) => !r.phoneOk);
const controls = [];
for (const d of ['near', 'mid', 'far', 'vfar']) controls.push(...rows.filter((r) => r.phoneOk && r.dist === d).slice(0, 5));
const cases = [...failures, ...controls];
console.log(`cases: ${failures.length} failures + ${controls.length} controls`);

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
  // Mirror of the shipped preprocess() in src/ocr.ts.
  const prep = (image, { maxDim, rotation = 0, boost = false }) => {
    const sw = image.naturalWidth, sh = image.naturalHeight;
    const scale = Math.min(4, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    let src = image, cw = sw, ch = sh;
    while (cw > w * 2 && ch > h * 2) {
      cw = Math.max(w, Math.round(cw / 2)); ch = Math.max(h, Math.round(ch / 2));
      const [c, x] = newCanvas(cw, ch); x.drawImage(src, 0, 0, cw, ch); src = c;
    }
    const rad = rotation * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const [c, x] = newCanvas(Math.max(1, Math.round(w * cos + h * sin)), Math.max(1, Math.round(w * sin + h * cos)));
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.translate(c.width / 2, c.height / 2);
    if (rotation) x.rotate(rad);
    x.drawImage(src, -w / 2, -h / 2, w, h);
    x.setTransform(1, 0, 0, 1, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      const v = boost ? Math.max(0, Math.min(255, l * 1.8 - 60)) : l;
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
    }
    x.putImageData(px, 0, 0);
    return c;
  };
  window.__lab = {
    prep,
    load: (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load')); i.src = src; }),
    init: async () => {
      const w = await Tesseract.createWorker('nor');
      await w.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300' });
      window.__lab.worker = w;
    },
    // One primary pass, returning every word box Tesseract produced.
    words: async (src, boost) => {
      const img = await window.__lab.load(src);
      const canvas = prep(img, { maxDim: 1280, boost });
      const t0 = performance.now();
      const { data } = await window.__lab.worker.recognize(canvas, {}, { text: true, blocks: true });
      const ms = Math.round(performance.now() - t0);
      const words = [];
      for (const b of data.blocks ?? [])
        for (const p of b.paragraphs ?? [])
          for (const l of p.lines ?? [])
            for (const w of l.words ?? [])
              words.push({ t: w.text, c: Math.round(w.confidence), b: [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1] });
      return { ms, text: data.text, words, canvasW: canvas.width, canvasH: canvas.height, imgW: img.naturalWidth, imgH: img.naturalHeight };
    },
  };
});
await page.evaluate(() => window.__lab.init());

const out = [];
for (const c of cases) {
  const rec = { id: c.id, truth: c.phone, name: c.name, dist: c.dist, persp: c.persp, bend: c.bend,
    background: c.background, capPxAt1280: c.capPxAt1280, shipped: c.phoneOk ? 'correct' : c.telefon ? 'WRONG' : 'empty', passes: {} };
  for (const boost of [false, true]) {
    const r = await page.evaluate(([src, b]) => window.__lab.words(src, b), ['http://lab.test/img/' + c.file, boost]);
    rec.passes[boost ? 'boost' : 'plain'] = r;
  }
  out.push(rec);
  const p = rec.passes.plain, b = rec.passes.boost;
  console.log(`${rec.id} ${String(rec.dist).padEnd(4)} cap=${String(rec.capPxAt1280).padStart(4)} ${rec.background.padEnd(6)} ${rec.shipped.padEnd(7)} words plain=${String(p.words.length).padStart(3)} boost=${String(b.words.length).padStart(3)}`);
}
await browser.close();
writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT);
