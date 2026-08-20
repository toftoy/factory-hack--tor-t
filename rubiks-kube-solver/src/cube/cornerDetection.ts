export interface Point {
  x: number;
  y: number;
}

/** [TL, TR, BR, BL] - this order is used everywhere a quad is consumed or produced. */
export type GridQuad = [Point, Point, Point, Point];

export interface GradientField {
  width: number;
  height: number;
  data: Float32Array;
}

interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

export function computeGradientField(image: ImageLike): GradientField {
  const { width, height, data } = image;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  const grad = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + width] - lum[i - width];
      grad[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return { width, height, data: grad };
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadPoint(quad: GridQuad, u: number, v: number): Point {
  const [tl, tr, br, bl] = quad;
  const top = lerpPoint(tl, tr, u);
  const bottom = lerpPoint(bl, br, u);
  return lerpPoint(top, bottom, v);
}

function bilinearSample(field: GradientField, x: number, y: number): number {
  const { width, height, data } = field;
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * width + x0;
  const i10 = i00 + 1;
  const i01 = i00 + width;
  const i11 = i01 + 1;
  const top = data[i00] * (1 - fx) + data[i10] * fx;
  const bottom = data[i01] * (1 - fx) + data[i11] * fx;
  return top * (1 - fy) + bottom * fy;
}

const LINE_SAMPLES = 20;

function sampleLineEnergy(field: GradientField, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offsets = [-2, -1, 0, 1, 2];
  let total = 0;
  for (let i = 0; i < LINE_SAMPLES; i++) {
    const t = (i + 0.5) / LINE_SAMPLES;
    const p = lerpPoint(a, b, t);
    let maxAtPoint = 0;
    for (const o of offsets) {
      const sample = bilinearSample(field, p.x + nx * o, p.y + ny * o);
      if (sample > maxAtPoint) maxAtPoint = sample;
    }
    total += maxAtPoint;
  }
  return total / LINE_SAMPLES;
}

/** Scores how well a candidate quad's two internal vertical and two
 * internal horizontal grid lines - plus its four outer boundary edges -
 * align with strong edges in the field: a real cube face has a
 * high-contrast cross-hatch inside and a hard outline around it. Higher
 * is better. The outer edges matter a lot: without them the internal
 * cross-hatch alone leaves the quad's overall position/scale
 * under-constrained, and the search happily settles on a shifted or
 * shrunken quad whose internal lines still land on *some* edges. */
export function scoreQuad(field: GradientField, quad: GridQuad): number {
  const [tl, tr, br, bl] = quad;
  const lines: [Point, Point][] = [
    [quadPoint(quad, 1 / 3, 0), quadPoint(quad, 1 / 3, 1)],
    [quadPoint(quad, 2 / 3, 0), quadPoint(quad, 2 / 3, 1)],
    [quadPoint(quad, 0, 1 / 3), quadPoint(quad, 1, 1 / 3)],
    [quadPoint(quad, 0, 2 / 3), quadPoint(quad, 1, 2 / 3)],
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ];
  let total = 0;
  for (const [a, b] of lines) total += sampleLineEnergy(field, a, b);
  return total / lines.length;
}

export interface SearchOptions {
  iterations?: number;
  initialStepFraction?: number;
}

export function searchGridQuad(
  field: GradientField,
  initial: GridQuad,
  options: SearchOptions = {}
): { quad: GridQuad; score: number } {
  const maxIterations = options.iterations ?? 20;
  const minDim = Math.min(field.width, field.height);
  let step = (options.initialStepFraction ?? 0.08) * minDim;
  let quad: GridQuad = initial.map((p) => ({ ...p })) as GridQuad;
  let score = scoreQuad(field, quad);

  const directions: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  const tryMove = (candidate: GridQuad): boolean => {
    const candidateScore = scoreQuad(field, candidate);
    if (candidateScore > score) {
      quad = candidate;
      score = candidateScore;
      return true;
    }
    return false;
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    // Whole-quad translate first: catches an overall position offset even
    // when no single corner's move alone would yet show an improvement
    // (moving one corner while the other three remain far off often
    // doesn't complete any grid line well enough to score better).
    for (const [ux, uy] of directions) {
      const dx = ux * step;
      const dy = uy * step;
      if (tryMove(quad.map((p) => ({ x: p.x + dx, y: p.y + dy })) as GridQuad)) improved = true;
    }

    // Per-corner refine.
    for (let cornerIdx = 0; cornerIdx < 4; cornerIdx++) {
      for (const [ux, uy] of directions) {
        const dx = ux * step;
        const dy = uy * step;
        const candidate = quad.map((p, i) =>
          i === cornerIdx ? { x: p.x + dx, y: p.y + dy } : p
        ) as GridQuad;
        if (tryMove(candidate)) improved = true;
      }
    }

    if (!improved) {
      step *= 0.5;
      if (step < 0.5) break;
    }
  }

  return { quad, score };
}

export interface DetectionResult {
  quad: GridQuad;
  confidence: number;
}

// Re-measured after scoreQuad started averaging over 8 lines (4 internal
// + the 4 outer boundary edges) instead of 4, which changes the score's
// numeric scale, and after ScanWizard started running detection on a
// 600px-long-side downscaled copy of the photo.
//
// Measurement: 12 procedurally-generated 3024x4032 (real phone-photo
// resolution) synthetic cube-face photos - 3 sticker colors as the
// dominant face crossed with 4 camera-angle levels (straight-on, a 10%
// keystone tilt, and two 25% steep tilts in opposite directions), every
// pixel color-jittered +-15 per channel - fed end-to-end through the real
// scan wizard. Every case found a real grid and scored 63.3-166.8.
// Blank/no-signal baselines measured in the same run: a uniform image
// scores exactly 0 at both 600x800 and 3024x4032, and a smooth two-stop
// gradient with no grid at all scores 1.08. So 20 still sits comfortably
// below every real-grid score and well above the no-signal baseline, and
// is kept unchanged despite the rescaling.
//
// Caveat (unchanged, and re-confirmed by the same run): under perspective
// (keystone) distortion, searchGridQuad's hill-climbing search sometimes
// converges to a plausible-but-inaccurate quad that scores in the same
// range as an accurate one - straight-on detections landed within
// 63-71px of the true corners (1.6-1.8% of the long side), while tilted
// ones ranged 69-449px (1.7-11.1%), with no useful correlation to
// confidence (the single worst case, 449px, scored 122.7 - higher than
// several near-perfect ones). So this threshold only gates "was any
// grid-like pattern found at all" - it cannot, by itself, distinguish an
// accurate detection from an inaccurate one at a steep angle. Manual
// drag-to-correct (ScanGridOverlay's draggable corner handles) is the
// mitigation for that case, not a higher threshold.
export const CONFIDENCE_THRESHOLD = 20;

/** True when detectGridQuad's reported confidence is high enough that a
 * real grid was found (as opposed to the centered-square fallback). The
 * UI uses this to decide whether to nudge the user to drag the corners
 * into place manually. */
export function isConfidentDetection(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLD;
}

function defaultQuad(width: number, height: number, sizeFraction: number): GridQuad {
  const size = Math.min(width, height) * sizeFraction;
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

/** Runs the search from a few differently-sized centered starting guesses
 * (cheap multi-start, guards against one bad initial guess getting stuck
 * in a local optimum) and keeps the best-scoring result. Falls back to
 * today's default centered square when confidence is too low to trust. */
export function detectGridQuad(image: ImageLike): DetectionResult {
  const field = computeGradientField(image);
  const starts = [0.6, 0.7, 0.8].map((f) => defaultQuad(image.width, image.height, f));
  let best: { quad: GridQuad; score: number } | null = null;
  for (const start of starts) {
    const result = searchGridQuad(field, start);
    if (!best || result.score > best.score) best = result;
  }
  if (!best || best.score < CONFIDENCE_THRESHOLD) {
    return { quad: defaultQuad(image.width, image.height, 0.7), confidence: best ? best.score : 0 };
  }
  return { quad: best.quad, confidence: best.score };
}
