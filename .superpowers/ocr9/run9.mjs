// Round 9: round 8's harness, pointed at this worktree's build and round 8's images.
// Round 8: the round-3/5/6/7 harness, pointed at THIS worktree's build and the
// round-8 image set. Drives the actual built gjenglemt app in real Chromium with
// real Tesseract.js WASM (vite preview + a page.route() shim for the blocked
// cdn.jsdelivr.net), one image per page load, reading results out of the
// ?debug=1 panel and the confirm screen's Navn/Telefon fields.
//
// Usage: node run8.mjs <from> <to>
import { chromium } from 'playwright-core';
import { readdirSync, statSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRATCH = '/tmp/claude-0/-home-user-factory-hack--tor-t/fda15333-f876-590b-8217-1a2737046316/scratchpad';
const HERE = SCRATCH + '/ocr9/';
const IMG = SCRATCH + '/ocr8/img/';
const APP = process.env.APP ?? '/home/user/factory-hack--tor-t/.claude/worktrees/agent-a6d5cbd2cad092d0a/gjenglemt';
const TARGET = process.env.TARGET_URL ?? 'http://localhost:4339/?debug=1';
const OUT = HERE + (process.env.OUT ?? 'results9.jsonl');

const LOCAL_ASSET_DIRS = [
  APP + '/node_modules/tesseract.js/dist',
  APP + '/node_modules/tesseract.js-core',
  SCRATCH + '/ocrlab/node_modules/@tesseract.js-data/nor/4.0.0',
];
const assetMap = new Map();
for (const dir of LOCAL_ASSET_DIRS) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { continue; }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isFile() && !assetMap.has(name)) assetMap.set(name, full);
  }
}

const plan = JSON.parse(readFileSync(HERE + 'plan.json', 'utf8'));
const meta = Object.fromEntries(JSON.parse(readFileSync(HERE + 'meta.json', 'utf8')).map((m) => [m.id, m]));
const cases = plan.slice(Number(process.argv[2] ?? 0), Number(process.argv[3] ?? plan.length));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext();
await context.route('https://cdn.jsdelivr.net/**', async (route) => {
  const name = new URL(route.request().url()).pathname.split('/').pop();
  const local = assetMap.get(name);
  if (local) await route.fulfill({ path: local });
  else { console.log('  [cdn-shim MISS]', name); await route.continue(); }
});

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

for (const c of cases) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const rec = { ...c, ...meta[c.id] };
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle' });
    const t0 = Date.now();
    await page.locator('input[type=file]').first().setInputFiles(IMG + c.file);
    await page.locator('.debug-panel summary').waitFor({ state: 'attached', timeout: 90000 });
    rec.wall = Date.now() - t0;

    const report = await page.locator('.debug-panel pre').textContent();
    rec.navn = await page.locator('label:has-text("Navn") input').inputValue();
    rec.telefon = await page.locator('label:has-text("Telefon") input').inputValue();
    rec.report = report;
    rec.waited = Number(/waited=(\d+)ms/.exec(report)?.[1] ?? -1);
    rec.passes = Number(/passes=(\d+)/.exec(report)?.[1] ?? -1);
    rec.ocrMs = Number(/ocrTime=(\d+)ms/.exec(report)?.[1] ?? -1);
    rec.deadlineHit = /deadlineHit=true/.test(report);
    rec.stages = (report.match(/^\s*\d+\.\s*(probe|pass|digit|crop)/gm) || []).map((s) => s.trim().split(/\s+/)[1]);
    rec.phoneOk = rec.telefon === c.phone;
    rec.phoneWrong = !!rec.telefon && !rec.phoneOk;
    rec.nameOk = norm(rec.navn) === norm(c.name);
    rec.errors = errors;
  } catch (err) {
    rec.harnessError = String(err).split('\n')[0];
  } finally {
    await page.close();
  }
  appendFileSync(OUT, JSON.stringify(rec) + '\n');
  console.log(
    `${rec.id} ${String(rec.group).padEnd(8)} d=${String(rec.dist).padEnd(4)} p=${String(rec.persp).padEnd(8)}${String(rec.perspAxis).padEnd(6)}${String(rec.perspDeg).padStart(4)} ` +
    `b=${String(rec.bend).padEnd(6)}${String(rec.bendSev).padEnd(9)} rot=${String(rec.rotation).padStart(2)} ` +
    `n=${String(rec.passes).padStart(2)} dig=${(rec.stages || []).filter((s) => s === 'digit').length} crop=${(rec.stages || []).filter((s) => s === 'crop').length} ocr=${String(rec.ocrMs).padStart(5)} wall=${String(rec.wall).padStart(5)}${rec.deadlineHit ? ' CUT' : '   '} ` +
    `phone=${String(rec.telefon || '-').padEnd(9)}${rec.phoneOk ? 'ok ' : rec.telefon ? 'BAD' : '-- '} ` +
    `name=${JSON.stringify(rec.navn || '').padEnd(26)}${rec.nameOk ? 'ok' : 'diff'}${rec.harnessError ? ' HARNESS:' + rec.harnessError : ''}`,
  );
}
await browser.close();
console.log('done', cases.length);
