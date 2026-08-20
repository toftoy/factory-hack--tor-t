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
 * internal horizontal grid lines align with strong edges in the field -
 * a real cube face has a high-contrast cross-hatch there. Higher is better. */
export function scoreQuad(field: GradientField, quad: GridQuad): number {
  const lines: [Point, Point][] = [
    [quadPoint(quad, 1 / 3, 0), quadPoint(quad, 1 / 3, 1)],
    [quadPoint(quad, 2 / 3, 0), quadPoint(quad, 2 / 3, 1)],
    [quadPoint(quad, 0, 1 / 3), quadPoint(quad, 1, 1 / 3)],
    [quadPoint(quad, 0, 2 / 3), quadPoint(quad, 1, 2 / 3)],
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

// Measured (Task 3) against 24 procedurally-generated synthetic cube-face
// photos - all 6 real sticker colors as the dominant face, each crossed
// with 4 camera-angle levels (straight-on, a 10% keystone tilt, and two
// 25% steep tilts in opposite directions), each cell independently
// color-jittered +-15 per channel to simulate real-world lighting/color
// variation: every case that found a real grid (as opposed to falling
// back on a blank/no-signal image) scored 88-181, regardless of whether
// the found quad ended up close to the true corners or not (see below).
// A blank/no-signal image scores <1 (asserted by this file's own
// fallback test). 20 stays comfortably below every real-grid score
// measured and well above the blank baseline, so the original starting
// value holds up and is kept unchanged.
//
// Caveat found during that same measurement, left as-is per Task 3's
// scope (verification/calibration only, not algorithm changes): under
// perspective (keystone) distortion, searchGridQuad's hill-climbing search
// sometimes converges to a plausible-but-inaccurate quad that still scores
// in the same 88-181 range as an accurate one - straight-on detections
// landed within ~14-22px of the true corners across all 6 colors, but
// accuracy degraded with tilt severity (10% tilt: ~21-49px error; 25%
// tilt: ~22-129px error), independent of confidence. So this threshold
// only gates "was any grid-like pattern found at all" - it cannot, by
// itself, distinguish an accurate detection from an inaccurate one at a
// steep angle. Manual drag-to-correct (ScanGridOverlay's draggable corner
// handles) is the mitigation for that case, not a higher threshold.
const CONFIDENCE_THRESHOLD = 20;

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
