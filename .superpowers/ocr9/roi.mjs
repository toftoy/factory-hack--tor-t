// Prototype of the ROI derivation, written so it ports straight to src/ocr.ts.
// Words arrive in the coordinate space of the pass's preprocessed canvas; they are
// mapped back to ORIGINAL image pixels first, so passes at different sizes and
// rotations can be pooled.

export function mapWordToImage(bbox, geom) {
  // geom: { canvasW, canvasH, scaledW, scaledH, scale, rotation }
  const rad = (geom.rotation * Math.PI) / 180;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);
  const cx = geom.canvasW / 2, cy = geom.canvasH / 2;
  const corners = [
    [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]],
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of corners) {
    const dx = px - cx, dy = py - cy;
    const rx = dx * cos - dy * sin + geom.scaledW / 2;
    const ry = dx * sin + dy * cos + geom.scaledH / 2;
    const ix = rx / geom.scale, iy = ry / geom.scale;
    if (ix < x0) x0 = ix; if (iy < y0) y0 = iy;
    if (ix > x1) x1 = ix; if (iy > y1) y1 = iy;
  }
  return [x0, y0, x1, y1];
}

export const DEFAULTS = {
  minConf: 60,
  minLen: 3,
  gapFactor: 2.0,
  pad: 0.35,
  minWords: 2,
};

/**
 * words: [{ t, c, r: [x0,y0,x1,y1] in IMAGE coords }]
 * Returns { rect, words } or null.
 */
export function deriveRoi(words, imageW, imageH, opt = {}) {
  const o = { ...DEFAULTS, ...opt };
  const keep = words.filter(
    (w) => w.c >= o.minConf && w.t.trim().length >= o.minLen && /[\p{L}\d]/u.test(w.t),
  );
  if (keep.length < o.minWords) return null;

  // Heights drive the linkage distance: label lines sit within a couple of line
  // heights of each other, background speckle does not.
  const heights = keep.map((w) => w.r[3] - w.r[1]).sort((a, b) => a - b);
  const medianH = heights[heights.length >> 1];
  const gap = o.gapFactor * medianH;

  // Weight = how much confident text the word is worth (same currency as
  // scoreRecognition), so the seed is the strongest evidence in the frame.
  const weight = (w) => w.t.trim().length;
  const order = [...keep].sort((a, b) => weight(b) - weight(a));

  let best = null;
  for (const seed of order.slice(0, 5)) {
    let rect = [...seed.r];
    const members = [seed];
    let grew = true;
    while (grew) {
      grew = false;
      for (const w of keep) {
        if (members.includes(w)) continue;
        const dx = Math.max(0, Math.max(rect[0] - w.r[2], w.r[0] - rect[2]));
        const dy = Math.max(0, Math.max(rect[1] - w.r[3], w.r[1] - rect[3]));
        if (dx <= gap && dy <= gap) {
          rect = [Math.min(rect[0], w.r[0]), Math.min(rect[1], w.r[1]), Math.max(rect[2], w.r[2]), Math.max(rect[3], w.r[3])];
          members.push(w);
          grew = true;
        }
      }
    }
    const score = members.reduce((t, w) => t + weight(w), 0);
    if (!best || score > best.score) best = { rect, members, score };
  }
  if (!best || best.members.length < o.minWords) return null;

  const w = best.rect[2] - best.rect[0], h = best.rect[3] - best.rect[1];
  const memberH = best.members.map((m) => m.r[3] - m.r[1]).sort((a, b) => a - b);
  const lineH = memberH[best.members.length >> 1];
  // Padding is at least a couple of line heights: when only one of the label's
  // three lines cleared the filter, a percentage of that one line's box is far
  // too little to bring the other two in.
  const padX = Math.max(w * o.pad, (o.padLines ?? 0) * lineH);
  const padY = Math.max(h * o.pad, (o.padLines ?? 0) * lineH);
  const rect = [
    Math.max(0, Math.round(best.rect[0] - padX)),
    Math.max(0, Math.round(best.rect[1] - padY)),
    Math.min(imageW, Math.round(best.rect[2] + padX)),
    Math.min(imageH, Math.round(best.rect[3] + padY)),
  ];
  const medianHeight = best.members.map((m) => m.r[3] - m.r[1]).sort((a, b) => a - b)[best.members.length >> 1];
  return { rect, count: best.members.length, score: best.score, medianWordHeight: medianHeight,
    contentSpan: Math.max(best.rect[2] - best.rect[0], best.rect[3] - best.rect[1]),
    texts: best.members.map((m) => m.t) };
}
