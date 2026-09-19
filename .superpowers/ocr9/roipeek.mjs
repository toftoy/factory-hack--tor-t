// Look at the raw word boxes roidump.mjs collected.
import { readFileSync } from 'node:fs';
const here = new URL('./', import.meta.url).pathname;
const rows = JSON.parse(readFileSync(here + 'roidump.json', 'utf8'));
const ids = process.argv.slice(2);
for (const r of rows) {
  if (ids.length && !ids.includes(r.id)) continue;
  console.log(`\n=== ${r.id} ${r.dist} cap=${r.capPxAt1280} ${r.background} shipped=${r.shipped} truth=${r.truth} name=${JSON.stringify(r.name)}`);
  for (const k of ['plain', 'boost']) {
    const p = r.passes[k];
    console.log(` ${k}: canvas ${p.canvasW}x${p.canvasH} ms=${p.ms} words=${p.words.length}`);
    const shown = p.words.slice(0, 14);
    for (const w of shown) console.log(`   ${JSON.stringify(w.t).padEnd(16)} c=${String(w.c).padStart(3)} [${w.b.join(',')}] ${w.b[2] - w.b[0]}x${w.b[3] - w.b[1]}`);
    if (p.words.length > shown.length) console.log(`   ... ${p.words.length - shown.length} more`);
  }
}
