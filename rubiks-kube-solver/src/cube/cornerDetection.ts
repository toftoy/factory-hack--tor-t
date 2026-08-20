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
  let total = 0;
  for (let i = 0; i < LINE_SAMPLES; i++) {
    const t = (i + 0.5) / LINE_SAMPLES;
    const p = lerpPoint(a, b, t);
    total += bilinearSample(field, p.x, p.y);
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

/** Coordinate-descent hill-climb: repeatedly nudges one corner at a time
 * in the direction that improves the score, with a shrinking step size.
 * Deterministic and cheap enough to run from several starting guesses. */
export function searchGridQuad(
  field: GradientField,
  initial: GridQuad,
  options: SearchOptions = {}
): { quad: GridQuad; score: number } {
  const iterations = options.iterations ?? 6;
  const minDim = Math.min(field.width, field.height);
  let step = (options.initialStepFraction ?? 0.08) * minDim;
  let quad: GridQuad = initial.map((p) => ({ ...p })) as GridQuad;
  let score = scoreQuad(field, quad);

  const deltas: [number, number][] = [
    [step, 0],
    [-step, 0],
    [0, step],
    [0, -step],
  ];

  for (let iter = 0; iter < iterations; iter++) {
    for (let cornerIdx = 0; cornerIdx < 4; cornerIdx++) {
      for (const [dx, dy] of deltas) {
        const candidate = quad.map((p) => ({ ...p })) as GridQuad;
        candidate[cornerIdx] = { x: candidate[cornerIdx].x + dx, y: candidate[cornerIdx].y + dy };
        const candidateScore = scoreQuad(field, candidate);
        if (candidateScore > score) {
          quad = candidate;
          score = candidateScore;
        }
      }
    }
    step *= 0.6;
    deltas[0][0] = step;
    deltas[1][0] = -step;
    deltas[2][1] = step;
    deltas[3][1] = -step;
  }

  return { quad, score };
}

export interface DetectionResult {
  quad: GridQuad;
  confidence: number;
}

// Starting value from this file's own idealized synthetic tests (a clean
// black-on-white grid scores in the low hundreds; a no-signal image scores
// ~0). Task 3 recalibrates this against realistic rendered synthetic
// photos (varied colors/lighting/angles), which have a very different,
// noisier gradient magnitude distribution than this file's idealized
// tests - update this constant there and replace this comment with the
// measured numbers.
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
