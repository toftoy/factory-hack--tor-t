# Automatic Grid-Corner Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically find the 4 corners of a photographed cube face's grid using classical computer-vision edge detection, replacing the hardcoded centered-square guess the scan wizard uses today, while upgrading the grid data model from an axis-aligned square to a general quadrilateral so it can represent a photo taken at an angle. Manual drag-to-correct stays available as a fallback/fine-tune layer.

**Architecture:** A new pure module (`cornerDetection.ts`) computes an image gradient (edge-strength) field and searches for the 4-corner quadrilateral whose internal grid lines land on the strongest edges — no trained model, no new dependency. `gridSampler.ts`'s sampling math is upgraded from axis-aligned arithmetic to bilinear interpolation across that quad. `ScanGridOverlay.tsx` is rewritten with 4 independently-draggable corner handles. `ScanWizard.tsx` runs detection automatically when a photo loads and seeds the overlay with the result.

**Tech Stack:** React + TypeScript + Vite + Vitest + Canvas 2D API (already in use; no new dependencies).

**Spec:** `rubiks-kube-solver/docs/superpowers/specs/2026-08-20-auto-grid-detection-design.md`

## Global Constraints

- No new npm dependencies.
- Classical computer vision (image gradient / edge energy), not a trained model — the spec explicitly rejects deep learning for this well-structured, high-contrast problem.
- Detection is color-independent (works on luminance/gradient only) — color classification itself (`colorClassifier.ts`) is unmodified and already tolerant of hue variation.
- Low-confidence detections fall back to today's centered-square guess (same `size = min(width,height) * 0.7` convention), never a wild/nonsensical quad — the user must always land on something reasonable to manually correct.
- `GridQuad = [Point, Point, Point, Point]` is `[TL, TR, BR, BL]` order everywhere — every function that consumes or produces a quad uses this exact order.
- Norwegian UI copy is unaffected by this plan (no new user-facing strings — the overlay is purely visual/interactive).
- No change to `colorClassifier.ts`, `scanAssembly.ts`, `scanValidation.ts`, `scanInference.ts`, or the 5-photo-plus-optional-D capture flow in `useCubeScan.ts` — only how the grid quad is determined and represented.

---

## Task 1: Corner detection algorithm (`cornerDetection.ts`)

**Files:**
- Create: `src/cube/cornerDetection.ts`
- Test: `src/cube/cornerDetection.test.ts`

**Interfaces:**
- Consumes: nothing new (pure math over a structural `{ width, height, data: Uint8ClampedArray }` shape compatible with DOM `ImageData` but not typed against it, so it works in plain Node/Vitest).
- Produces: `Point { x: number; y: number }`; `GridQuad = [Point, Point, Point, Point]`; `GradientField { width: number; height: number; data: Float32Array }`; `computeGradientField(image): GradientField`; `scoreQuad(field: GradientField, quad: GridQuad): number`; `searchGridQuad(field: GradientField, initial: GridQuad, options?): { quad: GridQuad; score: number }`; `DetectionResult { quad: GridQuad; confidence: number }`; `detectGridQuad(image): DetectionResult`. Consumed by Task 2's `gridSampler.ts` (types) and `ScanWizard.tsx` (`detectGridQuad`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/cornerDetection.test.ts
import { describe, expect, test } from 'vitest';
import {
  computeGradientField,
  detectGridQuad,
  scoreQuad,
  searchGridQuad,
  type GridQuad,
  type Point,
} from './cornerDetection';

/** Renders a white background with a black cube-grid outline plus its two
 * internal vertical/horizontal lines along the given quad, simulating the
 * high-contrast pattern a real cube face produces. Built by direct pixel
 * painting (no canvas), so it runs in plain Node. */
function buildSyntheticImage(
  width: number,
  height: number,
  quad: GridQuad
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const setPixel = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const i = (py * width + px) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  };
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const drawLine = (a: Point, b: Point) => {
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const p = lerp(a, b, i / steps);
      setPixel(p.x, p.y);
    }
  };
  const [tl, tr, br, bl] = quad;
  drawLine(tl, tr);
  drawLine(tr, br);
  drawLine(br, bl);
  drawLine(bl, tl);
  const quadPoint = (u: number, v: number): Point => {
    const top = lerp(tl, tr, u);
    const bottom = lerp(bl, br, u);
    return lerp(top, bottom, v);
  };
  drawLine(quadPoint(1 / 3, 0), quadPoint(1 / 3, 1));
  drawLine(quadPoint(2 / 3, 0), quadPoint(2 / 3, 1));
  drawLine(quadPoint(0, 1 / 3), quadPoint(1, 1 / 3));
  drawLine(quadPoint(0, 2 / 3), quadPoint(1, 2 / 3));
  return { width, height, data };
}

describe('computeGradientField', () => {
  test('produces near-zero gradient on a uniform image', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const field = computeGradientField({ width, height, data });
    expect(Math.max(...field.data)).toBeLessThan(1);
  });

  test('detects a sharp edge', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 10; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
      }
    }
    const field = computeGradientField({ width, height, data });
    const atEdge = field.data[10 * width + 10];
    const farFromEdge = field.data[10 * width + 3];
    expect(atEdge).toBeGreaterThan(farFromEdge * 5);
  });
});

describe('scoreQuad', () => {
  test('scores the correct quad much higher than a badly misaligned one', () => {
    const axisAlignedQuad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 260 },
      { x: 40, y: 260 },
    ];
    const image = buildSyntheticImage(300, 300, axisAlignedQuad);
    const field = computeGradientField(image);
    const correctScore = scoreQuad(field, axisAlignedQuad);
    const wrongQuad: GridQuad = [
      { x: 5, y: 5 },
      { x: 35, y: 5 },
      { x: 35, y: 35 },
      { x: 5, y: 35 },
    ];
    const wrongScore = scoreQuad(field, wrongQuad);
    expect(correctScore).toBeGreaterThan(wrongScore * 5);
  });

  test('scores a skewed (non-rectangular) quad correctly, proving perspective handling', () => {
    const skewedQuad: GridQuad = [
      { x: 60, y: 30 },
      { x: 280, y: 60 },
      { x: 250, y: 270 },
      { x: 30, y: 240 },
    ];
    const image = buildSyntheticImage(320, 320, skewedQuad);
    const field = computeGradientField(image);
    const correctScore = scoreQuad(field, skewedQuad);
    const axisAlignedGuess: GridQuad = [
      { x: 50, y: 50 },
      { x: 260, y: 50 },
      { x: 260, y: 260 },
      { x: 50, y: 260 },
    ];
    const axisAlignedScore = scoreQuad(field, axisAlignedGuess);
    expect(correctScore).toBeGreaterThan(axisAlignedScore * 1.5);
  });
});

describe('searchGridQuad', () => {
  test('converges from a poor starting guess to the true skewed quad', () => {
    const trueQuad: GridQuad = [
      { x: 70, y: 40 },
      { x: 270, y: 60 },
      { x: 250, y: 260 },
      { x: 40, y: 230 },
    ];
    const image = buildSyntheticImage(320, 320, trueQuad);
    const field = computeGradientField(image);
    const badStart: GridQuad = [
      { x: 40, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 200 },
      { x: 40, y: 200 },
    ];
    const { quad: found, score: foundScore } = searchGridQuad(field, badStart);
    const trueScore = scoreQuad(field, trueQuad);
    expect(foundScore).toBeGreaterThan(trueScore * 0.85);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(found[i].x - trueQuad[i].x)).toBeLessThan(15);
      expect(Math.abs(found[i].y - trueQuad[i].y)).toBeLessThan(15);
    }
  });
});

describe('detectGridQuad', () => {
  test('finds the true quad end-to-end on a clean synthetic image', () => {
    const trueQuad: GridQuad = [
      { x: 80, y: 60 },
      { x: 300, y: 50 },
      { x: 290, y: 280 },
      { x: 60, y: 270 },
    ];
    const image = buildSyntheticImage(360, 340, trueQuad);
    const result = detectGridQuad(image);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(20);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(20);
    }
  });

  test('falls back to a centered square on a blank (no-signal) image', () => {
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);
    const result = detectGridQuad({ width, height, data });
    const size = Math.min(width, height) * 0.7;
    const expectedX = (width - size) / 2;
    expect(result.quad[0].x).toBeCloseTo(expectedX, 0);
    expect(result.confidence).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run (from `rubiks-kube-solver/`): `npm test -- cornerDetection`
Expected: FAIL — `Cannot find module './cornerDetection'`

- [ ] **Step 3: Implement**

```ts
// src/cube/cornerDetection.ts

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
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- cornerDetection`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cube/cornerDetection.ts src/cube/cornerDetection.test.ts
git commit -m "Add classical CV corner-detection algorithm for cube face grids"
```

---

## Task 2: Quad-based sampling, overlay redesign, and wizard wiring

**Files:**
- Modify: `src/cube/gridSampler.ts`
- Modify: `src/cube/gridSampler.test.ts`
- Modify: `src/components/ScanGridOverlay.tsx`
- Modify: `src/components/ScanWizard.tsx`
- Modify: `src/hooks/useCubeScan.ts`

**Interfaces:**
- Consumes: `Point`, `GridQuad`, `detectGridQuad` from Task 1's `./cornerDetection`.
- Produces: `gridSampler.ts` re-exports `Point`/`GridQuad` (so existing importers of `GridBounds` from `gridSampler` migrate to `GridQuad` from the same module path); `computeSamplePoints(quad: GridQuad): ScreenPoint[]`; `sampleGridColors(ctx, quad: GridQuad): FaceGrid`. `ScanGridOverlay` takes `{ quad: GridQuad; onChange: (quad: GridQuad) => void; canvasWidth: number; canvasHeight: number }`. Consumed by Task 3's verification.

- [ ] **Step 1: Update `gridSampler.ts`'s failing test first**

Replace `src/cube/gridSampler.test.ts` entirely:

```ts
// src/cube/gridSampler.test.ts
import { describe, expect, test } from 'vitest';
import { computeSamplePoints } from './gridSampler';
import type { GridQuad } from './cornerDetection';

function squareQuad(x: number, y: number, size: number): GridQuad {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

describe('computeSamplePoints', () => {
  test('returns 9 points centered in each cell, row-major, for an axis-aligned quad', () => {
    const points = computeSamplePoints(squareQuad(0, 0, 90));
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual({ x: 15, y: 15 });
    expect(points[4]).toEqual({ x: 45, y: 45 });
    expect(points[8]).toEqual({ x: 75, y: 75 });
  });

  test('respects the quad offset', () => {
    const points = computeSamplePoints(squareQuad(100, 200, 90));
    expect(points[4]).toEqual({ x: 145, y: 245 });
  });

  test('handles a skewed (non-rectangular) quad via bilinear interpolation', () => {
    const skewed: GridQuad = [
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 120, y: 90 },
      { x: 30, y: 90 },
    ];
    const points = computeSamplePoints(skewed);
    expect(points[4].x).toBeCloseTo(60, 1);
    expect(points[4].y).toBeCloseTo(45, 1);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- gridSampler`
Expected: FAIL (`computeSamplePoints` still expects the old `{x,y,size}` shape, or a type error under `tsc` — either way, not passing yet).

- [ ] **Step 3: Rewrite `gridSampler.ts`**

```ts
// src/cube/gridSampler.ts
import { classifyColor } from './colorClassifier';
import type { GridQuad, Point } from './cornerDetection';
import type { FaceGrid, RGB } from './scanTypes';

export type { GridQuad, Point } from './cornerDetection';

export interface ScreenPoint {
  x: number;
  y: number;
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

export function computeSamplePoints(quad: GridQuad): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      points.push(quadPoint(quad, (col + 0.5) / 3, (row + 0.5) / 3));
    }
  }
  return points;
}

function approximateCellRadius(quad: GridQuad): number {
  const [tl, tr, , bl] = quad;
  const topEdge = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const leftEdge = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  return ((topEdge + leftEdge) / 2 / 3) * 0.15;
}

function averageColor(ctx: CanvasRenderingContext2D, center: ScreenPoint, radius: number): RGB {
  const size = Math.max(1, Math.round(radius * 2));
  const data = ctx.getImageData(
    Math.round(center.x - radius),
    Math.round(center.y - radius),
    size,
    size
  ).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  return { r: r / n, g: g / n, b: b / n };
}

/** Samples the 9 grid-cell colors from a canvas. Needs a real canvas
 * context, so it's covered by end-to-end tests, not a unit test. */
export function sampleGridColors(ctx: CanvasRenderingContext2D, quad: GridQuad): FaceGrid {
  const radius = Math.max(2, approximateCellRadius(quad));
  return computeSamplePoints(quad).map((p) => classifyColor(averageColor(ctx, p, radius))) as FaceGrid;
}
```

- [ ] **Step 4: Run and confirm the gridSampler tests pass**

Run: `npm test -- gridSampler`
Expected: PASS.

- [ ] **Step 5: Rewrite `ScanGridOverlay.tsx`**

```tsx
// src/components/ScanGridOverlay.tsx
import { useCallback, useRef } from 'react';
import type { GridQuad, Point } from '../cube/cornerDetection';

interface Props {
  quad: GridQuad;
  onChange: (quad: GridQuad) => void;
  canvasWidth: number;
  canvasHeight: number;
}

type DragMode = 'move' | 0 | 1 | 2 | 3;

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function ScanGridOverlay({ quad, onChange, canvasWidth, canvasHeight }: Props) {
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; start: GridQuad } | null>(null);

  const onPointerDown = useCallback(
    (mode: DragMode) => (event: React.PointerEvent) => {
      event.stopPropagation();
      dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: quad };
      (event.target as Element).setPointerCapture(event.pointerId);
    },
    [quad]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.mode === 'move') {
        onChange(drag.start.map((p) => ({ x: p.x + dx, y: p.y + dy })) as GridQuad);
      } else {
        const cornerIdx = drag.mode;
        onChange(
          drag.start.map((p, i) => (i === cornerIdx ? { x: p.x + dx, y: p.y + dy } : p)) as GridQuad
        );
      }
    },
    [onChange]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const [tl, tr, br, bl] = quad;
  const quadPoint = (u: number, v: number) => lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
  const outline = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  const internalLines = [1 / 3, 2 / 3].flatMap((t) => {
    const vTop = quadPoint(t, 0);
    const vBottom = quadPoint(t, 1);
    const hLeft = quadPoint(0, t);
    const hRight = quadPoint(1, t);
    return [
      <line key={`v${t}`} x1={vTop.x} y1={vTop.y} x2={vBottom.x} y2={vBottom.y} />,
      <line key={`h${t}`} x1={hLeft.x} y1={hLeft.y} x2={hRight.x} y2={hRight.y} />,
    ];
  });

  return (
    <svg
      className="scan-grid-overlay"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <polygon
        points={outline}
        fill="transparent"
        stroke="#4f7cff"
        strokeWidth={3}
        onPointerDown={onPointerDown('move')}
        style={{ cursor: 'move' }}
      />
      <g stroke="#4f7cff" strokeWidth={1.5} opacity={0.8}>
        {internalLines}
      </g>
      <g>
        {quad.map((corner, i) => (
          <circle
            key={i}
            cx={corner.x}
            cy={corner.y}
            r={16}
            fill="#4f7cff"
            stroke="white"
            strokeWidth={3}
            onPointerDown={onPointerDown(i as 0 | 1 | 2 | 3)}
            style={{ cursor: 'grab' }}
          />
        ))}
      </g>
    </svg>
  );
}
```

(Corner handles are now 16px-radius white-outlined circles, up from a single 14px square resize handle — directly addresses the "hard to see and adjust" feedback, in addition to now being individually draggable for perspective correction.)

- [ ] **Step 6: Wire detection into `ScanWizard.tsx`**

In `src/components/ScanWizard.tsx`, change the import line:

```ts
import type { GridQuad } from '../cube/gridSampler';
import { detectGridQuad } from '../cube/cornerDetection';
```

Rename the `bounds`/`setBounds` state and its effect:

```ts
const [quad, setQuad] = useState<GridQuad | null>(null);
```

```ts
useEffect(() => {
  if (!image || !canvasRef.current) return;
  const canvas = canvasRef.current;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { quad: detected } = detectGridQuad(imageData);
  setQuad(detected);
}, [image]);
```

Update `handleConfirm`:

```ts
const handleConfirm = useCallback(() => {
  if (!canvasRef.current || !quad) return;
  const ctx = canvasRef.current.getContext('2d')!;
  if (isCapturingD) {
    scan.confirmD(ctx, quad);
  } else {
    scan.confirmStep(ctx, quad);
  }
  setQuad(null);
}, [scan, quad, isCapturingD]);
```

And the JSX render, replace the `bounds`-gated block:

```tsx
{quad && canvasRef.current && (
  <ScanGridOverlay
    quad={quad}
    onChange={setQuad}
    canvasWidth={canvasRef.current.width}
    canvasHeight={canvasRef.current.height}
  />
)}
```

- [ ] **Step 7: Update `useCubeScan.ts`'s quad parameter type**

In `src/hooks/useCubeScan.ts`, change the import:

```ts
import { sampleGridColors, type GridQuad } from '../cube/gridSampler';
```

Update `confirmStep`'s signature and body (rename the `bounds` parameter to `quad` and update its one internal use):

```ts
const confirmStep = useCallback(
  (ctx: CanvasRenderingContext2D, quad: GridQuad) => {
    setPhase((prev) => {
      if (prev.kind !== 'capturing') return prev;
      const face = CAPTURE_ORDER[prev.stepIndex];
      const grid = sampleGridColors(ctx, quad);
      const nextCaptured = { ...captured, [face]: grid };
      setCaptured(nextCaptured);

      const nextIndex = prev.stepIndex + 1;
      if (nextIndex < CAPTURE_ORDER.length) {
        return { kind: 'capturing', stepIndex: nextIndex, image: null };
      }

      const result = assembleScan({
        F: nextCaptured.F!,
        R: nextCaptured.R!,
        B: nextCaptured.B!,
        L: nextCaptured.L!,
        U: nextCaptured.U!,
      });
      if (!result.ok && result.reason === 'ambiguous') {
        return { kind: 'capturingD', image: null };
      }
      return { kind: 'review', result };
    });
  },
  [captured]
);
```

Update `confirmD`'s signature and body the same way (parameter rename only):

```ts
const confirmD = useCallback(
  (ctx: CanvasRenderingContext2D, quad: GridQuad) => {
    setPhase((prev) => {
      if (prev.kind !== 'capturingD') return prev;
      const dGrid = sampleGridColors(ctx, quad);
      const result = resolveAmbiguousScan(
        {
          F: captured.F!,
          R: captured.R!,
          B: captured.B!,
          L: captured.L!,
          U: captured.U!,
        },
        dGrid
      );
      return { kind: 'review', result };
    });
  },
  [captured]
);
```

- [ ] **Step 8: Typecheck, lint, full test suite, build**

Run: `npx tsc -b && npx oxlint src && npm test && npm run build`
Expected: all pass with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/cube/gridSampler.ts src/cube/gridSampler.test.ts src/components/ScanGridOverlay.tsx src/components/ScanWizard.tsx src/hooks/useCubeScan.ts
git commit -m "Wire automatic corner detection into the scan wizard, upgrade overlay to a 4-corner quad"
```

---

## Task 3: Synthetic-image verification, threshold calibration, README, artifact republish

**Files:**
- Create: `scratch/verify-corner-detection.cjs` (throwaway Playwright script, in the session scratchpad, not committed)
- Modify: `src/cube/cornerDetection.ts:CONFIDENCE_THRESHOLD` (calibration only, if measurement shows the Task 1 starting value needs adjustment)
- Modify: `README.md`

**Interfaces:**
- Consumes: the fully wired app from Tasks 1-2.
- Produces: nothing new — verification, calibration, and documentation only.

- [ ] **Step 1: Full verification suite**

Run (from `rubiks-kube-solver/`): `npx tsc -b && npx oxlint src && npm test && npm run build`
Expected: all green.

- [ ] **Step 2: Generate synthetic cube-face photos across colors and angles**

Write a scratch Playwright script (in the scratchpad directory, not committed) that, for a matrix of test cases, uses a blank browser page's own `<canvas>` (via `page.evaluate`) to draw a synthetic cube face image and export it to a PNG file on disk (`canvas.toDataURL('image/png')`, decoded and written with Node's `fs`):

- **Colors:** at least 4 cases, each using a different one of the app's 6 sticker colors (`#f7f7f7` white, `#ffd60a` yellow, `#c1121f` red, `#ff6d00` orange (or the app's actual orange/green/blue hexes — read them from `src/cube/facelets.ts`'s `STICKER_COLORS` rather than guessing) as the dominant face color, with the other 8 cells randomized across the other 5 colors, each cell separated by ~6px black grid lines (outer border + 2 internal verticals + 2 internal horizontals), each sticker cell additionally jittered per-pixel by a small random luminance/hue offset (e.g. ±15) to simulate the color variation the user explicitly asked to be tolerant of.
- **Angles:** at least 4 cases with the grid's 4 corners perturbed by different perspective-like offsets (e.g. one corner pulled in/out to simulate a camera tilt), covering a straight-on shot, a mild tilt (~10% corner offset), and a steeper tilt (~25% corner offset) in two different rotation directions.
- **Combine** color and angle variation across the matrix rather than testing them only in isolation (e.g. 3 angle levels x the 6 sticker colors as the dominant face = 18+ generated images), since the real failure mode to catch is the combination.

For each generated image, record the exact synthetic ground-truth quad corners used to draw it (in the coordinate space of the generated PNG).

- [ ] **Step 3: Run each image through the real app and measure detection accuracy**

For each generated PNG: load the app (`npm run dev` on a free port), start a scan (`Skann`), reach the capturing phase, use `page.locator('input[type=file]').setInputFiles(pngPath)` to feed the synthetic image in exactly the way a real photo would arrive, wait for the auto-detected overlay to render, and read the resulting `GridQuad` back out (either by exposing it for the test via a `data-testid`/`window` debug hook you add temporarily and remove afterward, or by reading the rendered `<circle>` handle positions from the SVG overlay directly via Playwright's DOM query — prefer the latter, since it doesn't require touching app code just for testability).

For each case, compute the max per-corner pixel distance between the detected quad and the known synthetic ground truth. Log every case's color, angle level, and error distance to the console.

- [ ] **Step 4: Calibrate `CONFIDENCE_THRESHOLD` against the measured data**

Also log each case's raw confidence score (temporarily add a `console.log` in a local copy of `detectGridQuad`, or re-derive it by calling `computeGradientField`/`scoreQuad` directly on the same image data from the test script, whichever is simpler). Compare the score distribution for cases where detection landed close to ground truth (should be common, since the images are clean synthetic renders) against Task 1's original idealized-test-derived starting value of `20`. If the measured "good detection" scores from these more realistic images cluster meaningfully above or below that value, update `CONFIDENCE_THRESHOLD` in `src/cube/cornerDetection.ts` to a value that comfortably separates real detections from the near-zero blank-image case (already covered by Task 1's fallback test), and replace the code comment above the constant with the actual measured numbers from this run (e.g. "measured: clean synthetic detections scored 140-310 across the color/angle matrix; blank images score ~0 — threshold set well below the former, well above the latter"). If the original value already holds up, leave it and update the comment to say so with the measured numbers as evidence.

Re-run `npm test -- cornerDetection` after any threshold change to confirm Task 1's own tests still pass (they don't depend on the exact threshold value except the blank-image fallback test, which only requires the threshold be positive).

- [ ] **Step 5: Report results honestly**

Summarize in your task report: how many of the generated color/angle combinations landed within a reasonable pixel tolerance (state the tolerance and the pass count/total explicitly), which combinations (if any) failed and by how much, and whether any failures point to a real algorithm weakness worth a follow-up (e.g., "steep-angle cases with the darkest sticker color as the dominant face consistently underperform" would be a real, actionable finding — note it in the report rather than silently the discarding it, even though this task's scope doesn't require fixing it). This is **synthetic, procedurally-generated test coverage**, not real camera photos — state that plainly in the report, matching the spec's Testing section.

- [ ] **Step 6: Update `README.md`**

In the "Skann en ekte kube" bullet (or as a new bullet immediately after it) in the "Funksjoner" section, describe the automatic corner detection (classical edge-detection search, not ML; falls back to manual drag-to-correct on low confidence) and mention the corner handles are now individually draggable for perspective correction. In the "Arkitektur" section, add a line for `src/cube/cornerDetection.ts`, cross-referencing `docs/superpowers/specs/2026-08-20-auto-grid-detection-design.md`, and update the existing `gridSampler.ts`/`ScanGridOverlay.tsx` bullet to reflect the quad-based (not axis-aligned) data model.

- [ ] **Step 7: Commit**

```bash
git add README.md src/cube/cornerDetection.ts
git commit -m "Calibrate detection confidence threshold against synthetic test images, document in README"
```

(Only include `src/cube/cornerDetection.ts` in this commit if Step 4 actually changed the threshold value/comment; otherwise commit `README.md` alone.)

- [ ] **Step 8: Push, rebuild artifact, republish**

```bash
git push -u origin claude/rubiks-kube-solver-mmt9s3
npm run build:artifact
```

Strip the `<!doctype>/<html>/<head>/<body>` wrapper and the favicon `<link>` from `dist-artifact/index.html` (same `sed` recipe used earlier this session) into a scratch file, then publish it via the `Artifact` tool to the existing URL (`https://claude.ai/code/artifact/ea451482-3b34-49b0-981d-bd0c61ccce55`) so the user can try the improved scanner on their own device.
