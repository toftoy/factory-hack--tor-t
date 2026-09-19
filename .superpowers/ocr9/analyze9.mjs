// Round 9 scoring: this round's run against round 8's, image by image.
import { readFileSync } from 'node:fs';
const here = new URL('./', import.meta.url).pathname;
const load = (f) => readFileSync(here + f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const A = Object.fromEntries(load('results8.jsonl').map((r) => [r.id, r]));
const B = Object.fromEntries(load(process.argv[2] ?? 'results9.jsonl').map((r) => [r.id, r]));
const ids = Object.keys(B);

const pct = (n, d) => `${n}/${d} (${Math.round((100 * n) / d)}%)`;
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const bucket = (r) => (r.capPxAt1280 >= 30 ? '>=30' : r.capPxAt1280 >= 20 ? '20-30' : r.capPxAt1280 >= 12 ? '12-20' : '<12');
const groups = {};
for (const id of ids) {
  const b = B[id], a = A[id];
  const k = bucket(b);
  (groups[k] ??= []).push({ a, b });
}

console.log('=== headline ===');
for (const [label, rows] of [['round 8', ids.map((i) => A[i])], ['round 9', ids.map((i) => B[i])]]) {
  const ok = rows.filter((r) => r.phoneOk).length;
  const wrong = rows.filter((r) => r.phoneWrong).length;
  const missing = rows.filter((r) => !r.telefon).length;
  const name = rows.filter((r) => r.nameOk).length;
  const walls = rows.map((r) => r.wall);
  const over = rows.filter((r) => r.wall > 5000).length;
  const cut = rows.filter((r) => r.deadlineHit).length;
  console.log(
    `${label}: phone ${pct(ok, rows.length)}  WRONG ${wrong}  missing ${missing}  name ${pct(name, rows.length)}  ` +
    `wall median ${q(walls, 0.5)}ms p90 ${q(walls, 0.9)}ms max ${Math.max(...walls)}ms  over5s ${over}  truncated ${cut}`,
  );
}

console.log('\n=== by cap height at the 1280px primary pass ===');
for (const k of ['>=30', '20-30', '12-20', '<12']) {
  const rows = groups[k] ?? [];
  const a8 = rows.filter((r) => r.a.phoneOk).length, a9 = rows.filter((r) => r.b.phoneOk).length;
  const w8 = rows.filter((r) => r.a.phoneWrong).length, w9 = rows.filter((r) => r.b.phoneWrong).length;
  const n8 = rows.filter((r) => r.a.nameOk).length, n9 = rows.filter((r) => r.b.nameOk).length;
  console.log(`${k.padStart(5)}px n=${String(rows.length).padStart(3)}  phone r8 ${pct(a8, rows.length).padEnd(13)} -> r9 ${pct(a9, rows.length).padEnd(13)}  wrong ${w8}->${w9}  name r8 ${pct(n8, rows.length).padEnd(13)} -> r9 ${pct(n9, rows.length)}`);
}

console.log('\n=== by distance bucket ===');
for (const d of ['near', 'mid', 'far', 'vfar']) {
  const rows = ids.map((i) => ({ a: A[i], b: B[i] })).filter((r) => r.b.dist === d);
  const a8 = rows.filter((r) => r.a.phoneOk).length, a9 = rows.filter((r) => r.b.phoneOk).length;
  console.log(`${d.padEnd(5)} n=${String(rows.length).padStart(3)}  phone r8 ${pct(a8, rows.length).padEnd(13)} -> r9 ${pct(a9, rows.length)}`);
}

console.log('\n=== changes ===');
const fixed = [], broke = [], stillBad = [];
for (const id of ids) {
  const a = A[id], b = B[id];
  if (!a.phoneOk && b.phoneOk) fixed.push(id);
  else if (a.phoneOk && !b.phoneOk) broke.push(id);
  else if (!a.phoneOk && !b.phoneOk) stillBad.push(id);
}
console.log(`FIXED   ${fixed.length}: ${fixed.join(' ')}`);
console.log(`BROKE   ${broke.length}: ${broke.join(' ')}`);
console.log(`still   ${stillBad.length}: ${stillBad.join(' ')}`);
for (const id of [...fixed, ...broke, ...stillBad]) {
  const a = A[id], b = B[id];
  console.log(`  ${id} ${String(b.dist).padEnd(4)} cap=${String(b.capPxAt1280).padStart(4)} ${b.background.padEnd(6)} p=${String(b.persp).padEnd(8)} b=${String(b.bend).padEnd(6)} | r8 ${(a.telefon || '-').padEnd(9)} ${a.wall}ms | r9 ${(b.telefon || '-').padEnd(9)} ${b.wall}ms crop=${(b.stages || []).filter((s) => s === 'crop').length} dig=${(b.stages || []).filter((s) => s === 'digit').length} n=${b.passes}${b.deadlineHit ? ' CUT' : ''}`);
}

console.log('\n=== the crop stage ===');
const cropped = ids.map((i) => B[i]).filter((r) => (r.stages || []).includes('crop'));
console.log(`fired on ${cropped.length}/${ids.length} images: ${cropped.map((r) => r.id).join(' ')}`);
const byDist = {};
for (const r of cropped) byDist[r.dist] = (byDist[r.dist] ?? 0) + 1;
console.log('by distance', byDist);
console.log(`of those, phone correct ${pct(cropped.filter((r) => r.phoneOk).length, cropped.length)}, wrong ${cropped.filter((r) => r.phoneWrong).length}`);

console.log('\n=== latency, paired ===');
const deltas = ids.map((i) => B[i].wall - A[i].wall);
console.log(`wall delta median ${q(deltas, 0.5)}ms  p90 ${q(deltas, 0.9)}ms  max ${Math.max(...deltas)}ms  min ${Math.min(...deltas)}ms`);
const over9 = ids.filter((i) => B[i].wall > 5000), over8 = ids.filter((i) => A[i].wall > 5000);
console.log(`over 5s: round 8 ${over8.length} (${over8.join(' ')})`);
console.log(`         round 9 ${over9.length} (${over9.join(' ')})`);
const newOver = over9.filter((i) => !over8.includes(i));
console.log(`newly over 5s: ${newOver.length ? newOver.join(' ') : 'none'}`);
for (const i of cropped.map((r) => r.id)) console.log(`  ${i} wall ${A[i].wall} -> ${B[i].wall}ms (passes ${A[i].passes} -> ${B[i].passes})`);

console.log('\n=== groups round 8 found were NOT about distance ===');
for (const [label, pred] of [
  ['B-persp (perspective only)', (r) => r.group === 'B-persp'],
  ['C-bend (bend only)', (r) => r.group === 'C-bend'],
]) {
  const rows = ids.map((i) => ({ a: A[i], b: B[i] })).filter((r) => pred(r.b));
  const a8 = rows.filter((r) => r.a.phoneOk).length, a9 = rows.filter((r) => r.b.phoneOk).length;
  const n8 = rows.filter((r) => r.a.nameOk).length, n9 = rows.filter((r) => r.b.nameOk).length;
  const changed = rows.filter((r) => r.a.telefon !== r.b.telefon).map((r) => r.b.id);
  console.log(`${label}: phone r8 ${pct(a8, rows.length)} -> r9 ${pct(a9, rows.length)}  name ${n8}->${n9}  telefon changed on: ${changed.join(' ') || 'nothing'}`);
}
