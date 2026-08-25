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
  /** Per-pixel "looks like cube plastic" score in [0, 1] - see
   * pixelColorfulness. Used to keep the search from preferring a quad
   * whose interior bleeds onto desaturated background (table, shadow). */
  colorfulness: Float32Array;
}

interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

// Real cube stickers are always either vividly saturated plastic or
// bright white plastic - never a desaturated, medium-brightness tone
// like wood or shadow. These thresholds mirror colorClassifier's own
// white-saturation cutoff (0.25) but are a bit more permissive (0.2/0.6)
// since this only needs to rule out backgrounds, not classify colors.
const VIVID_SATURATION_THRESHOLD = 0.2;
const BRIGHT_VALUE_THRESHOLD = 0.6;
// HSV saturation is (max-min)/max, which is unstable for dark pixels: a
// dim brownish shadow like (40,30,20) computes s=0.5 - well past the
// vivid threshold - purely from a small denominator, not real color.
// Requiring a minimum brightness alongside saturation rules that out
// without needing a second, separate dark-pixel case.
const MIN_VIVID_VALUE = 0.25;

/** 1 if this pixel looks like cube plastic (vividly saturated, or bright
 * and not obviously tinted), 0 otherwise. */
function pixelColorfulness(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation >= VIVID_SATURATION_THRESHOLD && max >= MIN_VIVID_VALUE) return 1;
  if (max >= BRIGHT_VALUE_THRESHOLD) return 1;
  return 0;
}

export function computeGradientField(image: ImageLike): GradientField {
  const { width, height, data } = image;
  const lum = new Float32Array(width * height);
  const colorfulness = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    colorfulness[i] = pixelColorfulness(data[o], data[o + 1], data[o + 2]);
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
  return { width, height, data: grad, colorfulness };
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

function bilinearSampleArray(width: number, height: number, data: Float32Array, x: number, y: number): number {
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

function bilinearSample(field: GradientField, x: number, y: number): number {
  return bilinearSampleArray(field.width, field.height, field.data, x, y);
}

/** Average "looks like cube plastic" reading across the quad's interior
 * (the 9 cell centers), in [0, 1]. Low when part of the quad has bled
 * onto desaturated background (table, shadow) rather than sticker
 * plastic. */
function interiorColorfulness(field: GradientField, quad: GridQuad): number {
  let total = 0;
  let count = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const p = quadPoint(quad, (col + 0.5) / 3, (row + 0.5) / 3);
      total += bilinearSampleArray(field.width, field.height, field.colorfulness, p.x, p.y);
      count++;
    }
  }
  return total / count;
}

const LINE_SAMPLES = 20;

function quadArea(quad: GridQuad): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

// A real cube face photographed from any realistic angle projects to a
// quadrilateral whose 4 sides are all roughly comparable in length - even
// a steep tilt stretches one pair of opposite sides relative to the
// other, but never makes one side this many times shorter than another.
// Measured on a real failure: a convex, 29%-of-frame "kite" the search
// settled into (after the colorfulness signal shifted which local
// optimum won) had a 27px side next to a 358px one - ratio 13.3. 5 sits
// comfortably above the ~1.05-2.85 ratios the legitimate skewed-quad
// tests in this file exercise, and well below that failure's 13.3.
const MAX_SIDE_LENGTH_RATIO = 5;

function sideLengths(quad: GridQuad): number[] {
  return quad.map((p, i) => {
    const next = quad[(i + 1) % 4];
    return Math.hypot(next.x - p.x, next.y - p.y);
  });
}

function hasReasonableSideRatio(quad: GridQuad): boolean {
  const sides = sideLengths(quad);
  return Math.max(...sides) <= MAX_SIDE_LENGTH_RATIO * Math.min(...sides);
}

/** A photograph of a real (planar, rigid) square from any camera angle
 * projects to a convex quadrilateral - never a bowtie/self-intersecting
 * one. Checks that every corner turns the same way (all cross products of
 * consecutive edges share a sign); a degenerate search result can twist
 * into a self-intersecting shape whose shoelace area alone doesn't catch
 * it, since crossing edges partially cancel out instead of adding up. */
function isConvex(quad: GridQuad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const thisSign = cross > 0 ? 1 : -1;
    if (sign === 0) sign = thisSign;
    else if (thisSign !== sign) return false;
  }
  return true;
}

// A quad this small can't be a real cube face filling most of the frame
// (the app's capture instructions have the user photograph the face
// close-up). Line-energy scoring alone can't rule these out: a thin
// degenerate sliver collapsed onto one strong unrelated edge has all 8 of
// its sample lines pass within the +-2px perpendicular search of that
// same edge, and a small patch of wood-grain texture can coincidentally
// have enough directional energy of its own to out-score a real, larger
// grid it was competing against in the same multi-start search. Measured
// on real photos: both failure modes (a collapsed sliver, and a
// wood-grain patch that won out over the real grid) topped out at 3.2% of
// the frame, while every real detection - including perspective-skewed
// ones - covered 28-33%. 10% sits well below every real case and well
// above both failure modes.
const MIN_AREA_FRACTION = 0.1;

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
  if (!isConvex(quad)) return 0;
  if (!hasReasonableSideRatio(quad)) return 0;
  if (quadArea(quad) < MIN_AREA_FRACTION * field.width * field.height) return 0;

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
  const lineEnergy = total / lines.length;

  // A quad whose interior has bled onto desaturated background (table,
  // shadow) is penalized even when its edges sit on strong lines - a real
  // cube face's interior is always either vividly colored or bright white
  // plastic. COLORFULNESS_FLOOR keeps this from ever fully zeroing a
  // score: real photos have anti-aliased/blurry sticker edges, so a few
  // of the 9 interior samples landing on a transitional pixel shouldn't
  // tank an otherwise-correct detection.
  const COLORFULNESS_FLOOR = 0.4;
  const colorfulnessFactor = COLORFULNESS_FLOOR + (1 - COLORFULNESS_FLOOR) * interiorColorfulness(field, quad);
  return lineEnergy * colorfulnessFactor;
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

function offsetQuad(
  width: number,
  height: number,
  centerXFraction: number,
  centerYFraction: number,
  sizeFraction: number
): GridQuad {
  const size = Math.min(width, height) * sizeFraction;
  const x = width * centerXFraction - size / 2;
  const y = height * centerYFraction - size / 2;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

function defaultQuad(width: number, height: number, sizeFraction: number): GridQuad {
  return offsetQuad(width, height, 0.5, 0.5, sizeFraction);
}

// Real photos are rarely framed with the cube dead-center (it's held in a
// hand, not placed under a fixed rig), so a centered-only starting guess
// can leave the true grid too far away for the hill-climbing search in
// searchGridQuad to ever reach. Covering 9 positions across the frame at
// 2 sizes (18 starts total, still cheap since each is a small downscaled
// field) gives the search a start within reach of the grid wherever it
// actually sits. Verified against 5 real off-center phone photos that a
// centered-only search (the previous 3 starts) missed entirely.
const START_CENTER_FRACTIONS = [0.3, 0.5, 0.7];
const START_SIZE_FRACTIONS = [0.6, 0.75];

/** Runs the search from starting guesses spread across the frame (cheap
 * multi-start, guards against one bad initial guess getting stuck in a
 * local optimum, and against the true grid sitting far from center) and
 * keeps the best-scoring result. Falls back to today's default centered
 * square when confidence is too low to trust. */
export function detectGridQuad(image: ImageLike): DetectionResult {
  const field = computeGradientField(image);
  const starts: GridQuad[] = [];
  for (const cx of START_CENTER_FRACTIONS) {
    for (const cy of START_CENTER_FRACTIONS) {
      for (const size of START_SIZE_FRACTIONS) {
        starts.push(offsetQuad(image.width, image.height, cx, cy, size));
      }
    }
  }
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
