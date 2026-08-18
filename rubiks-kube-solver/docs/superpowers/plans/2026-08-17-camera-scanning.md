# Camera Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user photograph a real, scrambled Rubik's cube (5 photos, cube never leaves the table) and load the resulting state into the app, reusing the existing Bland/Løs/drag machinery unchanged.

**Architecture:** A pure inference pipeline (`src/cube/scan*.ts`) turns 5 photographed 3×3 color grids into a validated 54-character facelet string — no camera or DOM code involved, fully unit-tested. A thin imperative layer (`useCubeScan` + `gridSampler`) does the actual photo capture and pixel sampling. Three new UI components run the wizard. `useCubeController` gets one new method, `loadState`, so a scanned cube is just another way to set the same state Bland/Løs/drag already operate on.

**Tech Stack:** React, Three.js/react-three-fiber, `cubejs` (already a dependency), native `<input type="file" capture>` for photos, `<canvas>` 2D context for sampling. No new dependencies.

**Spec:** `rubiks-kube-solver/docs/superpowers/specs/2026-08-17-camera-scanning-design.md`

## Global Constraints

- No new npm dependencies (matches the project's existing zero-extra-dependency philosophy for its own code — `cubejs` is the one pre-existing exception).
- No `getUserMedia` / live camera preview — every photo comes through `<input type="file" accept="image/*" capture="environment">`.
- The cube is never lifted during the scan (5 photos: F, R, B, L via table-top quarter turns, then U from directly above).
- All new pure logic lives under `src/cube/` and is unit-tested with Vitest before any UI touches it (TDD, per `test-driven-development` skill — write the failing test, watch it fail for the right reason, then implement).
- A scanned state must integrate through `useCubeController` exactly like `reset()` does today — Bland, Løs, drag-to-turn, move counter, and the "Løst" badge must all keep working unmodified.
- Norwegian UI copy (matches the rest of the app).

---

## Task 1: Cube piece inventory (`cubePieces.ts`)

**Files:**
- Create: `src/cube/cubePieces.ts`
- Test: `src/cube/cubePieces.test.ts`

**Interfaces:**
- Produces: `allCornerPieces(): FaceLetter[]​[]` (8 entries, each 3 distinct `FaceLetter`s), `allEdgePieces(): FaceLetter[]​[]` (12 entries, each 2 distinct `FaceLetter`s), `pieceKey(colors: FaceLetter[]): string` (order-independent identity for a piece's color set).

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/cubePieces.test.ts
import { describe, expect, test } from 'vitest';
import { allCornerPieces, allEdgePieces, pieceKey } from './cubePieces';

describe('allCornerPieces', () => {
  test('returns exactly the 8 valid corner color combinations', () => {
    const pieces = allCornerPieces();
    expect(pieces).toHaveLength(8);
    const keys = new Set(pieces.map(pieceKey));
    expect(keys.size).toBe(8);
  });

  test('every corner has one color from each opposite pair', () => {
    for (const piece of allCornerPieces()) {
      expect(piece).toHaveLength(3);
      expect(piece.some((c) => c === 'U') || piece.some((c) => c === 'D')).toBe(true);
      expect(piece.some((c) => c === 'F') || piece.some((c) => c === 'B')).toBe(true);
      expect(piece.some((c) => c === 'L') || piece.some((c) => c === 'R')).toBe(true);
    }
  });
});

describe('allEdgePieces', () => {
  test('returns exactly the 12 valid edge color combinations', () => {
    const pieces = allEdgePieces();
    expect(pieces).toHaveLength(12);
    const keys = new Set(pieces.map(pieceKey));
    expect(keys.size).toBe(12);
  });

  test('no edge pairs opposite colors', () => {
    const opposite: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
    for (const [a, b] of allEdgePieces()) {
      expect(opposite[a]).not.toBe(b);
    }
  });
});

describe('pieceKey', () => {
  test('is order-independent', () => {
    expect(pieceKey(['U', 'F', 'R'])).toBe(pieceKey(['R', 'U', 'F']));
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- cubePieces` (from `rubiks-kube-solver/`)
Expected: FAIL — `Cannot find module './cubePieces'`

- [ ] **Step 3: Implement**

```ts
// src/cube/cubePieces.ts
import type { FaceLetter } from './moveEngine';

const OPPOSITE: Record<FaceLetter, FaceLetter> = {
  U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L',
};

const ALL_LETTERS: FaceLetter[] = ['U', 'D', 'F', 'B', 'L', 'R'];

/** All 8 valid corner-piece color combinations (one color per opposite pair). */
export function allCornerPieces(): FaceLetter[][] {
  const pieces: FaceLetter[][] = [];
  for (const ud of ['U', 'D'] as const) {
    for (const fb of ['F', 'B'] as const) {
      for (const lr of ['L', 'R'] as const) {
        pieces.push([ud, fb, lr]);
      }
    }
  }
  return pieces;
}

/** All 12 valid edge-piece color combinations (two different, non-opposite colors). */
export function allEdgePieces(): FaceLetter[][] {
  const pieces: FaceLetter[][] = [];
  for (let i = 0; i < ALL_LETTERS.length; i++) {
    for (let j = i + 1; j < ALL_LETTERS.length; j++) {
      const a = ALL_LETTERS[i];
      const b = ALL_LETTERS[j];
      if (OPPOSITE[a] !== b) pieces.push([a, b]);
    }
  }
  return pieces;
}

/** Order-independent identity for a piece's color set. */
export function pieceKey(colors: FaceLetter[]): string {
  return [...colors].sort().join('');
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- cubePieces`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/cube/cubePieces.ts src/cube/cubePieces.test.ts
git commit -m "Add fixed corner/edge piece inventory for scan inference"
```

---

## Task 2: Color classifier (`colorClassifier.ts`)

**Files:**
- Create: `src/cube/scanTypes.ts`
- Create: `src/cube/colorClassifier.ts`
- Test: `src/cube/colorClassifier.test.ts`

**Interfaces:**
- Produces: `RGB` type, `FaceGrid` type (`FaceLetter[]`, length 9), `classifyColor(rgb: RGB): FaceLetter`.

- [ ] **Step 1: Create the shared types file**

```ts
// src/cube/scanTypes.ts
import type { FaceLetter } from './moveEngine';

/** A 3x3 grid of detected sticker colors for one photographed face,
 * row-major (index = row*3+col). A sticker's "color" and a facelet-string
 * position's "letter" are the same alphabet in this codebase — see
 * STICKER_COLORS in facelets.ts — so a detected color classifies directly
 * into a FaceLetter. */
export type FaceGrid = FaceLetter[];

/** Color sampled from a photo, 0-255 per channel. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/cube/colorClassifier.test.ts
import { describe, expect, test } from 'vitest';
import { classifyColor } from './colorClassifier';

describe('classifyColor', () => {
  test.each([
    ['white', { r: 235, g: 235, b: 230 }, 'U'],
    ['red', { r: 210, g: 20, b: 30 }, 'R'],
    ['orange', { r: 235, g: 130, b: 20 }, 'L'],
    ['yellow', { r: 235, g: 210, b: 20 }, 'D'],
    ['green', { r: 20, g: 150, b: 70 }, 'F'],
    ['blue', { r: 20, g: 70, b: 180 }, 'B'],
  ] as const)('classifies %s as %s', (_name, rgb, expected) => {
    expect(classifyColor(rgb)).toBe(expected);
  });

  test('a slightly shadowed red still classifies as red', () => {
    expect(classifyColor({ r: 120, g: 10, b: 15 })).toBe('R');
  });

  test('a grayish, low-saturation color classifies as white, not a hue', () => {
    expect(classifyColor({ r: 180, g: 175, b: 185 })).toBe('U');
  });
});
```

- [ ] **Step 3: Run and confirm it fails**

Run: `npm test -- colorClassifier`
Expected: FAIL — `Cannot find module './colorClassifier'`

- [ ] **Step 4: Implement**

```ts
// src/cube/colorClassifier.ts
import type { FaceLetter } from './moveEngine';
import type { RGB } from './scanTypes';

interface HueAnchor {
  letter: FaceLetter;
  hue: number;
}

// Real-world color -> facelet letter, matching STICKER_COLORS' existing
// letter -> hex mapping (U=white, R=red, F=green, D=yellow, L=orange, B=blue).
const HUE_ANCHORS: HueAnchor[] = [
  { letter: 'R', hue: 0 },
  { letter: 'L', hue: 30 },
  { letter: 'D', hue: 55 },
  { letter: 'F', hue: 130 },
  { letter: 'B', hue: 220 },
];

const WHITE_SATURATION_THRESHOLD = 0.25;

function rgbToHsv(rgb: RGB): { h: number; s: number; v: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function classifyColor(rgb: RGB): FaceLetter {
  const { h, s } = rgbToHsv(rgb);
  if (s < WHITE_SATURATION_THRESHOLD) return 'U';

  let best = HUE_ANCHORS[0];
  let bestDist = Infinity;
  for (const anchor of HUE_ANCHORS) {
    const dist = hueDistance(h, anchor.hue);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best.letter;
}
```

- [ ] **Step 5: Run and confirm it passes**

Run: `npm test -- colorClassifier`
Expected: PASS, 8 tests

- [ ] **Step 6: Commit**

```bash
git add src/cube/scanTypes.ts src/cube/colorClassifier.ts src/cube/colorClassifier.test.ts
git commit -m "Add hue-based color classifier for scanned stickers"
```

---

## Task 3: Position/geometry helpers on `facelets.ts`

**Files:**
- Modify: `src/cube/facelets.ts`
- Test: `src/cube/facelets.test.ts` (new — `facelets.ts` had no tests before this)

**Interfaces:**
- Produces: `getFaceletIndex(pos: CubiePosition, face: FaceLetter): number | undefined`, `facesTouchedBy(pos: CubiePosition): FaceLetter[]`, `CORNER_POSITIONS: CubiePosition[]` (8), `EDGE_POSITIONS: CubiePosition[]` (12).
- Consumes: existing `CUBIE_POSITIONS`, `STICKER_INDEX` (private — stays private, accessed only via the new `getFaceletIndex`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/facelets.test.ts
import { describe, expect, test } from 'vitest';
import {
  CORNER_POSITIONS,
  EDGE_POSITIONS,
  SOLVED_STATE,
  facesTouchedBy,
  getFaceletIndex,
} from './facelets';

describe('CORNER_POSITIONS / EDGE_POSITIONS', () => {
  test('there are exactly 8 corners and 12 edges', () => {
    expect(CORNER_POSITIONS).toHaveLength(8);
    expect(EDGE_POSITIONS).toHaveLength(12);
  });

  test('every corner position has all three coordinates non-zero', () => {
    for (const pos of CORNER_POSITIONS) {
      expect(pos.x).not.toBe(0);
      expect(pos.y).not.toBe(0);
      expect(pos.z).not.toBe(0);
    }
  });

  test('every edge position has exactly one zero coordinate', () => {
    for (const pos of EDGE_POSITIONS) {
      const zeros = [pos.x, pos.y, pos.z].filter((c) => c === 0).length;
      expect(zeros).toBe(1);
    }
  });
});

describe('facesTouchedBy', () => {
  test('a corner touches 3 faces', () => {
    expect(facesTouchedBy({ x: 1, y: 1, z: 1 }).sort()).toEqual(['F', 'R', 'U']);
  });

  test('an edge touches 2 faces', () => {
    expect(facesTouchedBy({ x: 1, y: 1, z: 0 }).sort()).toEqual(['R', 'U']);
  });
});

describe('getFaceletIndex', () => {
  test('the URF corner on the U face reads as U in the solved state', () => {
    const index = getFaceletIndex({ x: 1, y: 1, z: 1 }, 'U')!;
    expect(SOLVED_STATE[index]).toBe('U');
  });

  test('a face not touched by the position is undefined', () => {
    expect(getFaceletIndex({ x: 1, y: 1, z: 1 }, 'D')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- facelets`
Expected: FAIL — `getFaceletIndex`/`facesTouchedBy`/`CORNER_POSITIONS`/`EDGE_POSITIONS` are not exported

- [ ] **Step 3: Implement — append to `facelets.ts`**

Add after the existing `CUBIE_POSITIONS` block (after line 60 in the current file):

```ts
export function getFaceletIndex(pos: CubiePosition, face: FaceLetter): number | undefined {
  return STICKER_INDEX.get(`${pos.x},${pos.y},${pos.z},${face}`);
}

/** Which face letters a cubie at `pos` touches (2 for an edge, 3 for a corner). */
export function facesTouchedBy(pos: CubiePosition): FaceLetter[] {
  const faces: FaceLetter[] = [];
  if (pos.x !== 0) faces.push(pos.x > 0 ? 'R' : 'L');
  if (pos.y !== 0) faces.push(pos.y > 0 ? 'U' : 'D');
  if (pos.z !== 0) faces.push(pos.z > 0 ? 'F' : 'B');
  return faces;
}

export const CORNER_POSITIONS: CubiePosition[] = CUBIE_POSITIONS.filter(
  (p) => p.x !== 0 && p.y !== 0 && p.z !== 0
);

export const EDGE_POSITIONS: CubiePosition[] = CUBIE_POSITIONS.filter(
  (p) => [p.x, p.y, p.z].filter((c) => c !== 0).length === 2
);
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- facelets`
Expected: PASS, 6 tests. Also run `npm test` (full suite) to confirm the existing `dragResolver` tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/cube/facelets.ts src/cube/facelets.test.ts
git commit -m "Expose facelet-index and corner/edge position lookups"
```

---

## Task 4: Candidate generation (`scanInference.ts`)

**Files:**
- Create: `src/cube/scanInference.ts`
- Test: `src/cube/scanInference.test.ts`

**Interfaces:**
- Consumes: `CORNER_POSITIONS`, `EDGE_POSITIONS`, `FACE_ORDER`, `facesTouchedBy`, `getFaceletIndex`, `CubiePosition` (facelets.ts, Task 3); `allCornerPieces`, `allEdgePieces`, `pieceKey` (cubePieces.ts, Task 1); `FaceGrid` (scanTypes.ts, Task 2).
- Produces: `KnownSides` interface (`F,R,B,L,U: FaceGrid`), `rotateGrid(grid: FaceGrid, times: number): FaceGrid`, `generateScanCandidates(sides: KnownSides): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/scanInference.test.ts
import { describe, expect, test } from 'vitest';
import Cube from 'cubejs';
import { generateScanCandidates, rotateGrid } from './scanInference';
import { FACE_ORDER } from './facelets';
import type { FaceLetter } from './moveEngine';
import type { FaceGrid } from './scanTypes';

function blockOf(facelets: string, face: FaceLetter): FaceGrid {
  const start = FACE_ORDER.indexOf(face) * 9;
  return facelets.slice(start, start + 9).split('') as FaceGrid;
}

describe('rotateGrid', () => {
  test('rotates a 3x3 grid 90 degrees clockwise', () => {
    const grid = '012345678'.split('') as unknown as FaceGrid;
    expect(rotateGrid(grid, 1).join('')).toBe('630741852');
  });

  test('four rotations return to the original', () => {
    const grid = 'URFDLBURF'.split('') as FaceGrid;
    expect(rotateGrid(grid, 4)).toEqual(grid);
  });

  test('negative and large rotation counts wrap correctly', () => {
    const grid = '012345678'.split('') as unknown as FaceGrid;
    expect(rotateGrid(grid, -1)).toEqual(rotateGrid(grid, 3));
    expect(rotateGrid(grid, 5)).toEqual(rotateGrid(grid, 1));
  });
});

describe('generateScanCandidates', () => {
  test('includes the true state, U photo unrotated', () => {
    const cube = new Cube();
    cube.move("R U F' D2 L");
    const facelets = cube.asString();

    const candidates = generateScanCandidates({
      F: blockOf(facelets, 'F'),
      R: blockOf(facelets, 'R'),
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: blockOf(facelets, 'U'),
    });

    expect(candidates).toContain(facelets);
  });

  test.each([1, 2, 3])('includes the true state, U photo rotated %i x 90deg', (rotation) => {
    const cube = new Cube();
    cube.move("R2 F L' U B2 D");
    const facelets = cube.asString();

    const candidates = generateScanCandidates({
      F: blockOf(facelets, 'F'),
      R: blockOf(facelets, 'R'),
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: rotateGrid(blockOf(facelets, 'U'), rotation),
    });

    expect(candidates).toContain(facelets);
  });

  test('every candidate has all 6 centers distinct', () => {
    const cube = Cube.random();
    const facelets = cube.asString();
    const candidates = generateScanCandidates({
      F: blockOf(facelets, 'F'),
      R: blockOf(facelets, 'R'),
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: blockOf(facelets, 'U'),
    });
    for (const candidate of candidates) {
      const centers = FACE_ORDER.map((_, i) => candidate[i * 9 + 4]);
      expect(new Set(centers).size).toBe(6);
    }
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- scanInference`
Expected: FAIL — `Cannot find module './scanInference'`

- [ ] **Step 3: Implement**

```ts
// src/cube/scanInference.ts
import {
  CORNER_POSITIONS,
  EDGE_POSITIONS,
  FACE_ORDER,
  facesTouchedBy,
  getFaceletIndex,
  type CubiePosition,
} from './facelets';
import { allCornerPieces, allEdgePieces, pieceKey } from './cubePieces';
import type { FaceLetter } from './moveEngine';
import type { FaceGrid } from './scanTypes';

export interface KnownSides {
  F: FaceGrid;
  R: FaceGrid;
  B: FaceGrid;
  L: FaceGrid;
  /** Raw U photo grid, in the photo's own (unresolved) rotation. */
  U: FaceGrid;
}

/** Rotates a row-major 3x3 grid 90 degrees clockwise, `times` times. */
export function rotateGrid(grid: FaceGrid, times: number): FaceGrid {
  let result = grid;
  const normalized = ((times % 4) + 4) % 4;
  for (let t = 0; t < normalized; t++) {
    const next: FaceLetter[] = new Array(9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        next[row * 3 + col] = result[(2 - col) * 3 + row];
      }
    }
    result = next;
  }
  return result;
}

interface SlotOption {
  pos: CubiePosition;
  knownColors: FaceLetter[];
  options: FaceLetter[][];
}

function* assignPiecesToSlots(
  slots: SlotOption[],
  usedKeys: Set<string>
): Generator<{ slot: SlotOption; piece: FaceLetter[] }[]> {
  if (slots.length === 0) {
    yield [];
    return;
  }
  const [slot, ...rest] = slots;
  for (const piece of slot.options) {
    const key = pieceKey(piece);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    for (const restAssignment of assignPiecesToSlots(rest, usedKeys)) {
      yield [{ slot, piece }, ...restAssignment];
    }
    usedKeys.delete(key);
  }
}

function placePieceAtSlot(facelets: FaceLetter[], slot: SlotOption, piece: FaceLetter[]): void {
  const dColor = piece.find((c) => !slot.knownColors.includes(c))!;
  facelets[getFaceletIndex(slot.pos, 'D')!] = dColor;
}

function readColors(pos: CubiePosition, facelets: FaceLetter[], excludeFace?: FaceLetter): FaceLetter[] {
  return facesTouchedBy(pos)
    .filter((f) => f !== excludeFace)
    .map((f) => facelets[getFaceletIndex(pos, f)!]);
}

/**
 * Every candidate 54-character facelet string consistent with the 4 known
 * side photos and one of the 4 possible U-photo rotations. Not validated —
 * see scanValidation.validateScan; callers try each until one validates.
 */
export function generateScanCandidates(sides: KnownSides): string[] {
  const candidates: string[] = [];

  for (let rotation = 0; rotation < 4; rotation++) {
    const known: Record<'U' | 'R' | 'F' | 'L' | 'B', FaceGrid> = {
      U: rotateGrid(sides.U, rotation),
      R: sides.R,
      F: sides.F,
      L: sides.L,
      B: sides.B,
    };

    const facelets: FaceLetter[] = new Array(54);
    for (const face of ['U', 'R', 'F', 'L', 'B'] as const) {
      const blockStart = FACE_ORDER.indexOf(face) * 9;
      for (let i = 0; i < 9; i++) facelets[blockStart + i] = known[face][i];
    }

    const usedCenters = new Set((['U', 'R', 'F', 'L', 'B'] as const).map((f) => known[f][4]));
    const dCenter = (['U', 'D', 'F', 'B', 'L', 'R'] as FaceLetter[]).find((l) => !usedCenters.has(l));
    if (!dCenter) continue; // U/F/R/L/B centers weren't all distinct - this rotation can't be valid
    facelets[FACE_ORDER.indexOf('D') * 9 + 4] = dCenter;

    const nonDCorners = CORNER_POSITIONS.filter((p) => p.y === 1);
    const dTouchingCorners = CORNER_POSITIONS.filter((p) => p.y === -1);
    const nonDEdges = EDGE_POSITIONS.filter((p) => p.y !== -1);
    const dTouchingEdges = EDGE_POSITIONS.filter((p) => p.y === -1);

    const usedCornerKeys = new Set(nonDCorners.map((p) => pieceKey(readColors(p, facelets))));
    const usedEdgeKeys = new Set(nonDEdges.map((p) => pieceKey(readColors(p, facelets))));

    const remainingCorners = allCornerPieces().filter((p) => !usedCornerKeys.has(pieceKey(p)));
    const remainingEdges = allEdgePieces().filter((p) => !usedEdgeKeys.has(pieceKey(p)));

    const cornerSlots: SlotOption[] = dTouchingCorners.map((pos) => {
      const knownColors = readColors(pos, facelets, 'D');
      const options = remainingCorners.filter((piece) => knownColors.every((c) => piece.includes(c)));
      return { pos, knownColors, options };
    });
    const edgeSlots: SlotOption[] = dTouchingEdges.map((pos) => {
      const knownColors = readColors(pos, facelets, 'D');
      const options = remainingEdges.filter((piece) => knownColors.every((c) => piece.includes(c)));
      return { pos, knownColors, options };
    });

    for (const cornerAssignment of assignPiecesToSlots(cornerSlots, new Set())) {
      for (const edgeAssignment of assignPiecesToSlots(edgeSlots, new Set())) {
        const candidate = [...facelets];
        for (const { slot, piece } of cornerAssignment) placePieceAtSlot(candidate, slot, piece);
        for (const { slot, piece } of edgeAssignment) placePieceAtSlot(candidate, slot, piece);
        candidates.push(candidate.join(''));
      }
    }
  }

  return candidates;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- scanInference`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/cube/scanInference.ts src/cube/scanInference.test.ts
git commit -m "Add scan candidate generation (D-face + U-rotation inference)"
```

---

## Task 5: Validation (`scanValidation.ts`)

**Files:**
- Create: `src/cube/scanValidation.ts`
- Test: `src/cube/scanValidation.test.ts`

**Interfaces:**
- Consumes: `CORNER_POSITIONS`, `EDGE_POSITIONS`, `FACE_ORDER`, `facesTouchedBy`, `getFaceletIndex`, `CubiePosition`, `SOLVED_STATE` (facelets.ts); `allCornerPieces`, `allEdgePieces`, `pieceKey` (cubePieces.ts).
- Produces: `ValidationResult { valid: boolean; reason?: string }`, `validateScan(facelets: string): ValidationResult`.

This implements its own parity check (permutation + orientation) rather than
depending on `cubejs` internals, so it needs no `Cube.initSolver()` call and
stays fast. The corner/edge orientation convention below is the standard
one used throughout Rubik's cube group theory (orientation 0 when a piece's
U/D-family sticker sits on its slot's U/D-family face, etc.) — correctness
is proven empirically in Step 4 against many `cubejs`-generated random
cubes, not just asserted.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/scanValidation.test.ts
import { describe, expect, test } from 'vitest';
import Cube from 'cubejs';
import { validateScan } from './scanValidation';
import { SOLVED_STATE, getFaceletIndex } from './facelets';

describe('validateScan', () => {
  test('accepts the solved state', () => {
    expect(validateScan(SOLVED_STATE)).toEqual({ valid: true });
  });

  test('accepts 25 random valid cube states', () => {
    for (let i = 0; i < 25; i++) {
      const facelets = Cube.random().asString();
      expect(validateScan(facelets).valid).toBe(true);
    }
  });

  test('accepts states reached by an arbitrary algorithm', () => {
    const cube = new Cube();
    cube.move("R U R' U' F2 D L' B2");
    expect(validateScan(cube.asString())).toEqual({ valid: true });
  });

  test('rejects the wrong sticker count', () => {
    const broken = SOLVED_STATE.slice(0, 53) + 'R';
    expect(validateScan(broken)).toEqual({ valid: false, reason: 'wrong-color-count' });
  });

  test('rejects duplicate center colors', () => {
    const chars = SOLVED_STATE.split('');
    chars[4] = 'R'; // U-center becomes R, duplicating R's own center
    // keep sticker counts at 9 each by also fixing one R sticker to U
    const rCenterIndex = 9 * 1 + 4;
    chars[rCenterIndex] = 'R';
    const firstUIndex = chars.findIndex((c, i) => c === 'U' && i !== 4);
    chars[firstUIndex] = 'X' as never;
    expect(validateScan(chars.join('')).valid).toBe(false);
  });

  test('rejects a single flipped edge (classic invalid state)', () => {
    const chars = SOLVED_STATE.split('');
    const pos = { x: 1 as const, y: 1 as const, z: 0 as const }; // UR edge
    const uIdx = getFaceletIndex(pos, 'U')!;
    const rIdx = getFaceletIndex(pos, 'R')!;
    [chars[uIdx], chars[rIdx]] = [chars[rIdx], chars[uIdx]];
    expect(validateScan(chars.join(''))).toEqual({ valid: false, reason: 'invalid-parity' });
  });
});
```

Note: the "duplicate center colors" test above deliberately keeps the
overall sticker count at 9-per-letter by also corrupting one sticker to an
invalid letter `'X'` — this exercises the "not a real piece" rejection
path inside the parity check too, which is fine (any `false` `valid` is
acceptable there, so the test only asserts `.valid === false`, not the
exact reason).

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- scanValidation`
Expected: FAIL — `Cannot find module './scanValidation'`

- [ ] **Step 3: Implement**

```ts
// src/cube/scanValidation.ts
import {
  CORNER_POSITIONS,
  EDGE_POSITIONS,
  FACE_ORDER,
  facesTouchedBy,
  getFaceletIndex,
  type CubiePosition,
} from './facelets';
import { allCornerPieces, allEdgePieces, pieceKey } from './cubePieces';
import type { FaceLetter } from './moveEngine';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateScan(facelets: string): ValidationResult {
  if (facelets.length !== 54) return { valid: false, reason: 'wrong-length' };

  const counts = new Map<string, number>();
  for (const c of facelets) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const letter of ['U', 'R', 'F', 'D', 'L', 'B']) {
    if (counts.get(letter) !== 9) return { valid: false, reason: 'wrong-color-count' };
  }

  const centers = FACE_ORDER.map((_, i) => facelets[i * 9 + 4]);
  if (new Set(centers).size !== 6) return { valid: false, reason: 'duplicate-centers' };

  if (!hasValidParity(facelets)) return { valid: false, reason: 'invalid-parity' };

  return { valid: true };
}

function colorsAt(pos: CubiePosition, facelets: string): FaceLetter[] {
  return facesTouchedBy(pos).map((f) => facelets[getFaceletIndex(pos, f)!] as FaceLetter);
}

function cornerOrientation(pos: CubiePosition, facelets: string): 0 | 1 | 2 {
  const faces = facesTouchedBy(pos);
  const ud = faces.find((f) => f === 'U' || f === 'D')!;
  const fb = faces.find((f) => f === 'F' || f === 'B')!;
  const colorAt = (f: FaceLetter) => facelets[getFaceletIndex(pos, f)!];
  if (colorAt(ud) === 'U' || colorAt(ud) === 'D') return 0;
  if (colorAt(fb) === 'U' || colorAt(fb) === 'D') return 1;
  return 2;
}

function edgeOrientation(pos: CubiePosition, facelets: string): 0 | 1 {
  const faces = facesTouchedBy(pos);
  const refFace = faces.find((f) => f === 'U' || f === 'D') ?? faces.find((f) => f === 'F' || f === 'B')!;
  const refColors = refFace === 'U' || refFace === 'D' ? ['U', 'D'] : ['F', 'B'];
  const colorAtRef = facelets[getFaceletIndex(pos, refFace)!];
  return refColors.includes(colorAtRef) ? 0 : 1;
}

function permutationParity(perm: number[]): 0 | 1 {
  const visited = new Array(perm.length).fill(false);
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    if (visited[i]) continue;
    let cycleLength = 0;
    let j = i;
    while (!visited[j]) {
      visited[j] = true;
      j = perm[j];
      cycleLength++;
    }
    parity ^= (cycleLength - 1) % 2;
  }
  return parity as 0 | 1;
}

function hasValidParity(facelets: string): boolean {
  const cornerKeys = allCornerPieces().map(pieceKey);
  const edgeKeys = allEdgePieces().map(pieceKey);

  const cornerPerm: number[] = [];
  let cornerOrientationSum = 0;
  for (const pos of CORNER_POSITIONS) {
    const pieceIndex = cornerKeys.indexOf(pieceKey(colorsAt(pos, facelets)));
    if (pieceIndex === -1) return false;
    cornerPerm.push(pieceIndex);
    cornerOrientationSum += cornerOrientation(pos, facelets);
  }
  if (new Set(cornerPerm).size !== 8) return false;
  if (cornerOrientationSum % 3 !== 0) return false;

  const edgePerm: number[] = [];
  let edgeOrientationSum = 0;
  for (const pos of EDGE_POSITIONS) {
    const pieceIndex = edgeKeys.indexOf(pieceKey(colorsAt(pos, facelets)));
    if (pieceIndex === -1) return false;
    edgePerm.push(pieceIndex);
    edgeOrientationSum += edgeOrientation(pos, facelets);
  }
  if (new Set(edgePerm).size !== 12) return false;
  if (edgeOrientationSum % 2 !== 0) return false;

  return permutationParity(cornerPerm) === permutationParity(edgePerm);
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- scanValidation`
Expected: PASS, 6 tests. **If any test fails** (most likely the random-cube
or flipped-edge cases — this is the one place in the whole feature where a
sign/convention error is plausible): re-read `cornerOrientation` and
`edgeOrientation` against the failure output, adjust, and re-run. Do not
move on until all 6 pass — every later task depends on this being right.

- [ ] **Step 5: Commit**

```bash
git add src/cube/scanValidation.ts src/cube/scanValidation.test.ts
git commit -m "Add self-contained cube-validity (parity) check for scans"
```

---

## Task 6: Orchestrator (`scanAssembly.ts`)

**Revised 2026-08-18** — the original version of this task assumed picking
the first `validateScan`-passing candidate always recovers the true cube.
That assumption was wrong: measured directly against the real Task 4/5
implementations, **~27% of random scrambled cubes have 2+ different, both
fully valid, real cube states consistent with the same 5 photos** (F/R/B/L
fully known, U known up to rotation) — an information-theoretic fact, not a
bug in Task 4 or 5 (both were independently re-verified correct in their own
task reviews). Confirmed with the user: on ambiguity, fall back to a 6th
photo (the D/bottom face, any rotation — the one case where the cube *is*
lifted) rather than silently guessing. This task now produces two functions
instead of one.

**Files:**
- Create: `src/cube/scanAssembly.ts`
- Test: `src/cube/scanAssembly.test.ts`

**Interfaces:**
- Consumes: `generateScanCandidates`, `rotateGrid`, `KnownSides` (scanInference.ts); `validateScan` (scanValidation.ts); `FACE_ORDER` (facelets.ts).
- Produces:
  - `AssembleResult = { ok: true; facelets: string } | { ok: false; reason: 'no-valid-candidate' | 'ambiguous' }`
  - `assembleScan(sides: KnownSides): AssembleResult` — tries the 5-photo pipeline; returns `ambiguous` (not a guess) when 2+ valid candidates exist.
  - `resolveAmbiguousScan(sides: KnownSides, dPhoto: FaceGrid): AssembleResult` — called after the caller collects a 6th photo; all 54 stickers are then known modulo 2 unresolved photo rotations (U and D), so no backtracking is needed — tries all 16 rotation combinations directly and validates.

This is the full pipeline end to end — the strongest correctness proof for
the whole feature's math, since it runs actual `cubejs`-generated scrambles
through candidate generation *and* validation together.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/scanAssembly.test.ts
import { describe, expect, test } from 'vitest';
import Cube from 'cubejs';
import { assembleScan, resolveAmbiguousScan } from './scanAssembly';
import { rotateGrid } from './scanInference';
import { FACE_ORDER } from './facelets';
import type { FaceLetter } from './moveEngine';
import type { FaceGrid } from './scanTypes';

function blockOf(facelets: string, face: FaceLetter): FaceGrid {
  const start = FACE_ORDER.indexOf(face) * 9;
  return facelets.slice(start, start + 9).split('') as FaceGrid;
}

describe('assembleScan', () => {
  test('recovers the exact original state, or correctly reports ambiguous, for 20 random scrambles', () => {
    for (let i = 0; i < 20; i++) {
      const facelets = Cube.random().asString();
      const rotation = Math.floor(Math.random() * 4);
      const sides = {
        F: blockOf(facelets, 'F'),
        R: blockOf(facelets, 'R'),
        B: blockOf(facelets, 'B'),
        L: blockOf(facelets, 'L'),
        U: rotateGrid(blockOf(facelets, 'U'), rotation),
      };
      const result = assembleScan(sides);
      if (result.ok) {
        expect(result.facelets).toBe(facelets);
      } else {
        // Ambiguity is an expected, correct outcome for some scrambles (not
        // a failure) — assert it's reported as such, never a silent wrong
        // guess or the unrelated 'no-valid-candidate' reason.
        expect(result.reason).toBe('ambiguous');
      }
    }
  });

  test('a known-ambiguous fixed state is reported as ambiguous, not silently resolved', () => {
    // Captured from a real Cube.random() draw during investigation: this
    // exact state has 2 different valid completions for the same 5 photos.
    const facelets = 'UDUFUBLUURLBFRDFLFDBFFFDDLLRUDRDFUUDBRBBLULDBLBRLBRRRF';
    const result = assembleScan({
      F: blockOf(facelets, 'F'),
      R: blockOf(facelets, 'R'),
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: blockOf(facelets, 'U'),
    });
    expect(result).toEqual({ ok: false, reason: 'ambiguous' });
  });

  test('reports failure when a color was misread badly enough to be unrecoverable', () => {
    const facelets = new Cube().asString(); // solved
    const brokenU = blockOf(facelets, 'U');
    brokenU[0] = 'R'; // corrupt one sticker so no candidate can validate
    const result = assembleScan({
      F: blockOf(facelets, 'F'),
      R: blockOf(facelets, 'R'),
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: brokenU,
    });
    expect(result).toEqual({ ok: false, reason: 'no-valid-candidate' });
  });
});

describe('resolveAmbiguousScan', () => {
  test.each([0, 1, 2, 3])('recovers the exact original from the known-ambiguous fixture with D-photo rotation %i', (dRotation) => {
    const facelets = 'UDUFUBLUURLBFRDFLFDBFFFDDLLRUDRDFUUDBRBBLULDBLBRLBRRRF';
    const sides = {
      F: blockOf(facelets, 'F'),
      R: blockOf(facelets, 'R'),
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: blockOf(facelets, 'U'),
    };
    const dPhoto = rotateGrid(blockOf(facelets, 'D'), dRotation);
    expect(resolveAmbiguousScan(sides, dPhoto)).toEqual({ ok: true, facelets });
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- scanAssembly`
Expected: FAIL — `Cannot find module './scanAssembly'`

- [ ] **Step 3: Implement**

```ts
// src/cube/scanAssembly.ts
import { generateScanCandidates, rotateGrid, type KnownSides } from './scanInference';
import { validateScan } from './scanValidation';
import { FACE_ORDER } from './facelets';
import type { FaceLetter } from './moveEngine';
import type { FaceGrid } from './scanTypes';

export type AssembleResult =
  | { ok: true; facelets: string }
  | { ok: false; reason: 'no-valid-candidate' | 'ambiguous' };

/**
 * Assembles a full 54-char facelet string from 5 known side photos (F/R/B/L
 * fully known, U known up to an unresolved rotation). Multiple different
 * real cube states can share the same 5 photos (~1 in 4 scrambled cubes, by
 * measurement) — reported as 'ambiguous' rather than silently guessed, so
 * the caller can fall back to `resolveAmbiguousScan` with a 6th (D) photo.
 */
export function assembleScan(sides: KnownSides): AssembleResult {
  const candidates = generateScanCandidates(sides);
  const valid = [...new Set(candidates.filter((c) => validateScan(c).valid))];
  if (valid.length === 1) return { ok: true, facelets: valid[0] };
  if (valid.length === 0) return { ok: false, reason: 'no-valid-candidate' };
  return { ok: false, reason: 'ambiguous' };
}

function buildFacelets(blocks: Record<FaceLetter, FaceGrid>): string {
  const facelets: FaceLetter[] = new Array(54);
  for (const face of FACE_ORDER) {
    const start = FACE_ORDER.indexOf(face) * 9;
    for (let i = 0; i < 9; i++) facelets[start + i] = blocks[face][i];
  }
  return facelets.join('');
}

/**
 * Resolves an ambiguous scan once a 6th photo (the D/bottom face, any
 * rotation) is supplied. All 54 stickers are then known modulo 2 unresolved
 * photo rotations (U and D); tries all 16 combinations directly — no
 * backtracking needed, since every sticker is already known — and
 * validates.
 */
export function resolveAmbiguousScan(sides: KnownSides, dPhoto: FaceGrid): AssembleResult {
  const valid = new Set<string>();
  for (let uRot = 0; uRot < 4; uRot++) {
    for (let dRot = 0; dRot < 4; dRot++) {
      const candidate = buildFacelets({
        U: rotateGrid(sides.U, uRot),
        R: sides.R,
        F: sides.F,
        L: sides.L,
        B: sides.B,
        D: rotateGrid(dPhoto, dRot),
      });
      if (validateScan(candidate).valid) valid.add(candidate);
    }
  }
  const result = [...valid];
  if (result.length === 1) return { ok: true, facelets: result[0] };
  if (result.length === 0) return { ok: false, reason: 'no-valid-candidate' };
  return { ok: false, reason: 'ambiguous' };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- scanAssembly`
Expected: PASS, 7 tests (1 `test.each`-expanded ×4 + 3 others). Then run
the full suite: `npm test` — every test in the project should be green.

- [ ] **Step 5: Commit**

```bash
git add src/cube/scanAssembly.ts src/cube/scanAssembly.test.ts
git commit -m "Add scan assembly: generate candidates, validate, detect ambiguity, resolve with a 6th photo"
```

**Downstream note (for Tasks 9, 11, 13):** the scan wizard's state machine
must now handle a third outcome after the 5-photo flow, not just
success/failure: `ambiguous` triggers a request for one more photo (the D
face), which then goes through `resolveAmbiguousScan`. This wasn't in the
original design and will need its own UI step — flag it explicitly when
those tasks are dispatched rather than assuming the original two-outcome
design still holds.

---

## Task 7: Grid sampling (`gridSampler.ts`)

**Files:**
- Create: `src/cube/gridSampler.ts`
- Test: `src/cube/gridSampler.test.ts`

**Interfaces:**
- Consumes: `classifyColor` (colorClassifier.ts), `RGB`, `FaceGrid` (scanTypes.ts).
- Produces: `GridBounds { x: number; y: number; size: number }`, `computeSamplePoints(bounds: GridBounds): { x: number; y: number }[]` (9, pure — unit tested), `sampleGridColors(ctx: CanvasRenderingContext2D, bounds: GridBounds): FaceGrid` (thin canvas wrapper — exercised by the Task 13 E2E test, not unit tested here, since it needs a real `<canvas>`).

- [ ] **Step 1: Write the failing test**

```ts
// src/cube/gridSampler.test.ts
import { describe, expect, test } from 'vitest';
import { computeSamplePoints } from './gridSampler';

describe('computeSamplePoints', () => {
  test('returns 9 points centered in each cell, row-major', () => {
    const points = computeSamplePoints({ x: 0, y: 0, size: 90 });
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual({ x: 15, y: 15 }); // top-left cell center
    expect(points[4]).toEqual({ x: 45, y: 45 }); // center cell center
    expect(points[8]).toEqual({ x: 75, y: 75 }); // bottom-right cell center
  });

  test('respects the bounds offset', () => {
    const points = computeSamplePoints({ x: 100, y: 200, size: 90 });
    expect(points[4]).toEqual({ x: 145, y: 245 });
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- gridSampler`
Expected: FAIL — `Cannot find module './gridSampler'`

- [ ] **Step 3: Implement**

```ts
// src/cube/gridSampler.ts
import { classifyColor } from './colorClassifier';
import type { FaceGrid, RGB } from './scanTypes';

export interface GridBounds {
  x: number;
  y: number;
  size: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function computeSamplePoints(bounds: GridBounds): ScreenPoint[] {
  const cell = bounds.size / 3;
  const points: ScreenPoint[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      points.push({
        x: bounds.x + cell * (col + 0.5),
        y: bounds.y + cell * (row + 0.5),
      });
    }
  }
  return points;
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
 * context, so it's covered by the Task 13 end-to-end test, not a unit test. */
export function sampleGridColors(ctx: CanvasRenderingContext2D, bounds: GridBounds): FaceGrid {
  const radius = Math.max(2, (bounds.size / 3) * 0.15);
  return computeSamplePoints(bounds).map((p) => classifyColor(averageColor(ctx, p, radius))) as FaceGrid;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- gridSampler`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/cube/gridSampler.ts src/cube/gridSampler.test.ts
git commit -m "Add grid sample-point math and canvas color sampling"
```

---

## Task 8: `useCubeController.loadState`

**Files:**
- Modify: `src/hooks/useCubeController.ts`

**Interfaces:**
- Consumes: `Cube.fromString` (cubejs, already imported in this file).
- Produces: adds `loadState(facelets: string): void` to the object `useCubeController()` returns, alongside the existing `enqueue`/`reset`/`tick`/`commitMove`.

No test file — this hook has no unit tests today (it's exercised via the
existing Playwright end-to-end tests, per the project's established
pattern; Task 13 extends that coverage to scanning).

- [ ] **Step 1: Add `loadState`, mirroring `reset()` but with an arbitrary starting state**

In `src/hooks/useCubeController.ts`, add this new `useCallback` right after
the existing `reset` (after line 44):

```ts
  const loadState = useCallback((initial: string) => {
    queueRef.current = [];
    progressRef.current = 0;
    activeMoveRef.current = null;
    cubeRef.current = Cube.fromString(initial);
    setActiveMove(null);
    setFacelets(initial);
    setMoveCount(0);
    setQueuedCount(0);
  }, []);
```

Then add `loadState` to the returned object (after `commitMove`):

```ts
  return {
    facelets,
    moveCount,
    activeMove,
    isAnimating: activeMove !== null || queuedCount > 0,
    enqueue,
    reset,
    tick,
    commitMove,
    loadState,
  };
```

- [ ] **Step 2: Verify it typechecks and the existing suite still passes**

Run: `npx tsc -b && npm test`
Expected: no type errors, all existing tests pass (this task adds no new
tests of its own — it's covered by Task 13's end-to-end test).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCubeController.ts
git commit -m "Add loadState to useCubeController for loading a scanned cube"
```

---

## Task 9: Scan wizard state machine (`useCubeScan.ts`)

**Revised 2026-08-18** — Task 6 was corrected to detect (not silently
resolve) the ~27% of scans where 5 photos are genuinely ambiguous, adding
`resolveAmbiguousScan(sides, dPhoto)` as a fallback. This task's state
machine now has a third outcome after the 5-photo capture flow: a new
`'capturingD'` phase requests the 6th (D) photo when `assembleScan` returns
`{ ok: false, reason: 'ambiguous' }`, then resolves via
`resolveAmbiguousScan` and proceeds to `'review'` exactly as the ok/
no-valid-candidate paths already did. Verified (this correction) to
typecheck cleanly against the real `scanAssembly.ts`/`gridSampler.ts`
exports before being written here.

**Files:**
- Create: `src/hooks/useCubeScan.ts`

**Interfaces:**
- Consumes: `sampleGridColors`, `GridBounds` (gridSampler.ts); `assembleScan`, `resolveAmbiguousScan`, `AssembleResult` (scanAssembly.ts); `FaceGrid` (scanTypes.ts).
- Produces: `useCubeScan()` hook returning scan wizard state and actions (below).

No dedicated unit test (it's a thin React state machine over already-tested
pure functions); exercised by Task 13's end-to-end test via the UI.

- [ ] **Step 1: Implement**

```ts
// src/hooks/useCubeScan.ts
import { useCallback, useState } from 'react';
import { sampleGridColors, type GridBounds } from '../cube/gridSampler';
import { assembleScan, resolveAmbiguousScan, type AssembleResult } from '../cube/scanAssembly';
import type { FaceGrid } from '../cube/scanTypes';

const CAPTURE_ORDER = ['F', 'R', 'B', 'L', 'U'] as const;
type CaptureFace = (typeof CAPTURE_ORDER)[number];

export type ScanPhase =
  | { kind: 'idle' }
  | { kind: 'capturing'; stepIndex: number; image: HTMLImageElement | null }
  | { kind: 'capturingD'; image: HTMLImageElement | null }
  | { kind: 'review'; result: AssembleResult }
  | { kind: 'done' };

export function useCubeScan() {
  const [phase, setPhase] = useState<ScanPhase>({ kind: 'idle' });
  const [captured, setCaptured] = useState<Partial<Record<CaptureFace, FaceGrid>>>({});

  const start = useCallback(() => {
    setCaptured({});
    setPhase({ kind: 'capturing', stepIndex: 0, image: null });
  }, []);

  const cancel = useCallback(() => {
    setPhase({ kind: 'idle' });
  }, []);

  const setStepImage = useCallback((image: HTMLImageElement) => {
    setPhase((prev) => (prev.kind === 'capturing' ? { ...prev, image } : prev));
  }, []);

  const setDImage = useCallback((image: HTMLImageElement) => {
    setPhase((prev) => (prev.kind === 'capturingD' ? { ...prev, image } : prev));
  }, []);

  const confirmStep = useCallback(
    (ctx: CanvasRenderingContext2D, bounds: GridBounds) => {
      setPhase((prev) => {
        if (prev.kind !== 'capturing') return prev;
        const face = CAPTURE_ORDER[prev.stepIndex];
        const grid = sampleGridColors(ctx, bounds);
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
        // Ambiguous means the 5 photos genuinely aren't enough for this
        // cube (~1 in 4, by measurement) — ask for a 6th (D) photo rather
        // than showing a failure or silently guessing wrong. Any other
        // outcome (ok, or the unrelated no-valid-candidate reason) goes
        // straight to review.
        if (!result.ok && result.reason === 'ambiguous') {
          return { kind: 'capturingD', image: null };
        }
        return { kind: 'review', result };
      });
    },
    [captured]
  );

  const confirmD = useCallback(
    (ctx: CanvasRenderingContext2D, bounds: GridBounds) => {
      setPhase((prev) => {
        if (prev.kind !== 'capturingD') return prev;
        const dGrid = sampleGridColors(ctx, bounds);
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

  const finish = useCallback(() => {
    setPhase({ kind: 'done' });
  }, []);

  return {
    phase,
    currentFace:
      phase.kind === 'capturing' ? CAPTURE_ORDER[phase.stepIndex] : phase.kind === 'capturingD' ? 'D' : null,
    stepNumber: phase.kind === 'capturing' ? phase.stepIndex + 1 : null,
    totalSteps: CAPTURE_ORDER.length,
    start,
    cancel,
    setStepImage,
    setDImage,
    confirmStep,
    confirmD,
    finish,
  };
}

export type CubeScan = ReturnType<typeof useCubeScan>;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no type errors (this hook has no runtime behavior to test in
isolation yet — it's wired up and exercised in Tasks 10-13).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCubeScan.ts
git commit -m "Add scan wizard state machine, with D-photo fallback for ambiguous scans"
```

**Downstream note (for Tasks 11, 13):** the wizard UI (`ScanWizard.tsx`,
Task 11) must render a `'capturingD'` step — reuse the same capture-UI
pattern as the 5 numbered steps, just for a 6th, conditional one, with
copy explaining why (e.g. "Vi klarte ikke å bestemme bunnen entydig — snu
kuben og ta ett bilde til av undersiden") — and call `confirmD` instead of
`confirmStep` while in that phase. `App.tsx`/`ControlPanel.tsx` (Task 13)
don't need changes beyond what was already planned, since `phase.kind` is
already the single source of truth the wizard renders from.

---

## Task 10: Draggable grid overlay (`ScanGridOverlay.tsx`)

**Files:**
- Create: `src/components/ScanGridOverlay.tsx`

**Interfaces:**
- Consumes: `GridBounds` (gridSampler.ts).
- Produces: `<ScanGridOverlay bounds={GridBounds} onChange={(b: GridBounds) => void} />` — renders a draggable/resizable 3×3 grid as an absolutely-positioned overlay `<div>` (SVG lines), with a single drag handle at the bottom-right corner to resize (keeps it square) and a drag on the body to move it.

- [ ] **Step 1: Implement**

```tsx
// src/components/ScanGridOverlay.tsx
import { useCallback, useRef } from 'react';
import type { GridBounds } from '../cube/gridSampler';

interface Props {
  bounds: GridBounds;
  onChange: (bounds: GridBounds) => void;
}

export function ScanGridOverlay({ bounds, onChange }: Props) {
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: GridBounds } | null>(
    null
  );

  const onPointerDown = useCallback(
    (mode: 'move' | 'resize') => (event: React.PointerEvent) => {
      event.stopPropagation();
      dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: bounds };
      (event.target as Element).setPointerCapture(event.pointerId);
    },
    [bounds]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.mode === 'move') {
        onChange({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
      } else {
        const size = Math.max(30, drag.start.size + (dx + dy) / 2);
        onChange({ ...drag.start, size });
      }
    },
    [onChange]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const cell = bounds.size / 3;
  const lines = [1, 2].flatMap((i) => [
    <line key={`v${i}`} x1={bounds.x + cell * i} y1={bounds.y} x2={bounds.x + cell * i} y2={bounds.y + bounds.size} />,
    <line key={`h${i}`} x1={bounds.x} y1={bounds.y + cell * i} x2={bounds.x + bounds.size} y2={bounds.y + cell * i} />,
  ]);

  return (
    <svg className="scan-grid-overlay" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.size}
        height={bounds.size}
        fill="transparent"
        stroke="#4f7cff"
        strokeWidth={2}
        onPointerDown={onPointerDown('move')}
        style={{ cursor: 'move' }}
      />
      <g stroke="#4f7cff" strokeWidth={1} opacity={0.7}>
        {lines}
      </g>
      <rect
        x={bounds.x + bounds.size - 14}
        y={bounds.y + bounds.size - 14}
        width={14}
        height={14}
        fill="#4f7cff"
        onPointerDown={onPointerDown('resize')}
        style={{ cursor: 'nwse-resize' }}
      />
    </svg>
  );
}
```

Add to `src/index.css`:

```css
.scan-grid-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no type errors. Visual/interaction correctness is verified in
Task 13's end-to-end test (drag handles are exercised there via synthetic
pointer events, same pattern as the existing cube-drag tests).

- [ ] **Step 3: Commit**

```bash
git add src/components/ScanGridOverlay.tsx src/index.css
git commit -m "Add draggable grid overlay for scan photo alignment"
```

---

## Task 11: Wizard screen (`ScanWizard.tsx`)

**Files:**
- Create: `src/components/ScanWizard.tsx`

**Interfaces:**
- Consumes: `CubeScan` (useCubeScan.ts), `ScanGridOverlay` (Task 10), `GridBounds` (gridSampler.ts).
- Produces: `<ScanWizard scan={CubeScan} onCancel={() => void} />` — full-screen overlay: step instructions, a hidden `<input type="file">` triggered by a visible "Ta bilde" button, the captured photo drawn to canvas with `ScanGridOverlay` on top, and a "Bekreft" button that samples and advances.

- [ ] **Step 1: Implement**

```tsx
// src/components/ScanWizard.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CubeScan } from '../hooks/useCubeScan';
import type { GridBounds } from '../cube/gridSampler';
import { ScanGridOverlay } from './ScanGridOverlay';

const STEP_TEXT = [
  'Ta bilde av siden som ser på deg.',
  'Snu en gang til høyre. Ta bilde.',
  'Snu en gang til høyre. Ta bilde.',
  'Snu en gang til høyre. Ta bilde.',
  'Se rett ned ovenfra. Ta bilde av toppen.',
];

interface Props {
  scan: CubeScan;
  onCancel: () => void;
}

export function ScanWizard({ scan, onCancel }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState<GridBounds | null>(null);

  const phase = scan.phase;
  const image = phase.kind === 'capturing' ? phase.image : null;

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const size = Math.min(image.naturalWidth, image.naturalHeight) * 0.7;
    setBounds({
      x: (image.naturalWidth - size) / 2,
      y: (image.naturalHeight - size) / 2,
      size,
    });
  }, [image]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        scan.setStepImage(img);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    [scan]
  );

  const handleConfirm = useCallback(() => {
    if (!canvasRef.current || !bounds) return;
    const ctx = canvasRef.current.getContext('2d')!;
    scan.confirmStep(ctx, bounds);
    setBounds(null);
  }, [scan, bounds]);

  if (phase.kind !== 'capturing') return null;

  return (
    <div className="scan-overlay">
      <div className="scan-header">
        <span>
          Steg {scan.stepNumber}/{scan.totalSteps}
        </span>
        <button onClick={onCancel} className="scan-close">
          Avbryt
        </button>
      </div>

      <p className="scan-instruction">{STEP_TEXT[phase.stepIndex]}</p>

      <div className="scan-photo-area">
        {image ? (
          <>
            <canvas ref={canvasRef} className="scan-canvas" />
            {bounds && <ScanGridOverlay bounds={bounds} onChange={setBounds} />}
          </>
        ) : (
          <div className="scan-placeholder">Ingen bilde ennå</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="scan-file-input"
      />

      <div className="scan-actions">
        <button onClick={() => fileInputRef.current?.click()}>
          {image ? 'Ta nytt bilde' : 'Ta bilde'}
        </button>
        {image && <button onClick={handleConfirm}>Bekreft</button>}
      </div>
    </div>
  );
}
```

Add to `src/index.css`:

```css
.scan-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 16px;
}

.scan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.scan-close {
  background: var(--danger);
  flex: none;
  padding: 6px 12px;
}

.scan-instruction {
  font-size: 1.1rem;
  margin: 0;
  text-align: center;
}

.scan-photo-area {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
  border-radius: 12px;
}

.scan-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.scan-placeholder {
  color: var(--text-muted);
}

.scan-file-input {
  display: none;
}

.scan-actions {
  display: flex;
  gap: 8px;
}
```

Note: `ScanGridOverlay`'s SVG coordinates are drawn in the *canvas's own
pixel space* (`bounds` comes from `image.naturalWidth`/`naturalHeight`),
while the canvas is displayed scaled down via `max-width/max-height:
100%`. For the overlay to align visually, `.scan-photo-area` must
position the SVG with the same CSS transform/scale as the canvas element
it sits on top of — the straightforward way is to wrap both in a
same-sized positioned container and let the SVG's `viewBox` equal the
canvas's pixel dimensions so it scales identically. Add this in Step 1
directly: give the canvas `viewBox`-equivalent scaling by wrapping it and
the overlay in a `<div style={{ position: 'relative', width: canvas.width,
height: canvas.height, maxWidth: '100%', maxHeight: '100%' }}>` — implement
and verify visually in Task 13's manual check before relying on the
automated test alone.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScanWizard.tsx src/index.css
git commit -m "Add scan wizard screen: instructions, capture, grid alignment"
```

---

## Task 12: Review/correction screen (`ScanReview.tsx`)

**Files:**
- Create: `src/components/ScanReview.tsx`

**Interfaces:**
- Consumes: `STICKER_COLORS`, `FACE_ORDER` (facelets.ts); `AssembleResult` (scanAssembly.ts); `validateScan` (scanValidation.ts).
- Produces: `<ScanReview result={AssembleResult} onUse={(facelets: string) => void} onCancel={() => void} />` — shows all 6 faces as 3×3 swatches (from a working, possibly-corrected 54-char string seeded from `result.facelets` when `ok`, or a blank/best-effort string when not), lets the user click a cell to cycle its color, re-validates live, and enables "Bruk denne kuben" only when valid.

- [ ] **Step 1: Implement**

```tsx
// src/components/ScanReview.tsx
import { useState } from 'react';
import { FACE_ORDER, STICKER_COLORS } from '../cube/facelets';
import { validateScan } from '../cube/scanValidation';
import type { AssembleResult } from '../cube/scanAssembly';
import type { FaceLetter } from '../cube/moveEngine';

const COLOR_CYCLE: FaceLetter[] = ['U', 'R', 'F', 'D', 'L', 'B'];

interface Props {
  result: AssembleResult;
  onUse: (facelets: string) => void;
  onCancel: () => void;
}

export function ScanReview({ result, onUse, onCancel }: Props) {
  const [facelets, setFacelets] = useState(() =>
    result.ok ? result.facelets : 'U'.repeat(54)
  );

  const validation = validateScan(facelets);

  const cycleCell = (index: number) => {
    const current = facelets[index] as FaceLetter;
    const next = COLOR_CYCLE[(COLOR_CYCLE.indexOf(current) + 1) % COLOR_CYCLE.length];
    setFacelets(facelets.slice(0, index) + next + facelets.slice(index + 1));
  };

  return (
    <div className="scan-overlay">
      <div className="scan-header">
        <span>Kontroller skanningen</span>
        <button onClick={onCancel} className="scan-close">
          Avbryt
        </button>
      </div>

      {!result.ok && (
        <p className="scan-instruction">
          Fargene stemmer ikke med en ekte kube — sjekk rutene under og rett opp.
        </p>
      )}
      {result.ok && !validation.valid && (
        <p className="scan-instruction">En rettelse gjorde kuben ugyldig — juster igjen.</p>
      )}

      <div className="scan-review-grid">
        {FACE_ORDER.map((face, faceIndex) => (
          <div className="scan-review-face" key={face}>
            {Array.from({ length: 9 }, (_, cell) => {
              const index = faceIndex * 9 + cell;
              const color = facelets[index] as FaceLetter;
              return (
                <button
                  key={cell}
                  className="scan-review-cell"
                  style={{ background: STICKER_COLORS[color] }}
                  onClick={() => cycleCell(index)}
                  aria-label={`${face} rute ${cell + 1}: ${color}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="scan-actions">
        <button onClick={() => onUse(facelets)} disabled={!validation.valid}>
          Bruk denne kuben
        </button>
      </div>
    </div>
  );
}
```

Add to `src/index.css`:

```css
.scan-review-grid {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 12px;
  justify-content: center;
  align-content: center;
  flex: 1;
}

.scan-review-face {
  display: grid;
  grid-template-columns: repeat(3, 22px);
  grid-template-rows: repeat(3, 22px);
  gap: 2px;
  padding: 4px;
  background: var(--panel-border);
  border-radius: 4px;
}

.scan-review-cell {
  border: none;
  border-radius: 2px;
  padding: 0;
  cursor: pointer;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScanReview.tsx src/index.css
git commit -m "Add scan review/correction screen"
```

---

## Task 13: Wire into `ControlPanel` and `App`

**Files:**
- Modify: `src/components/ControlPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useCubeScan` (Task 9), `ScanWizard` (Task 11), `ScanReview` (Task 12), `controller.loadState` (Task 8).

- [ ] **Step 1: Add the "Skann" button to `ControlPanel`**

In `src/components/ControlPanel.tsx`, add an `onScan: () => void` prop and
a fourth button in `.button-row`, disabled under the same condition as
Bland/Nullstill (`isAnimating`):

```tsx
interface Props {
  onScramble: () => void;
  onSolve: () => void;
  onReset: () => void;
  onScan: () => void;
  isAnimating: boolean;
  // ...unchanged props below
}
```

```tsx
      <div className="button-row">
        <button onClick={onScramble} disabled={isAnimating}>
          Bland
        </button>
        <button onClick={onSolve} disabled={solveDisabled}>
          {solveLabel}
        </button>
        <button onClick={onReset} disabled={isAnimating}>
          Nullstill
        </button>
        <button onClick={onScan} disabled={isAnimating}>
          Skann
        </button>
      </div>
```

- [ ] **Step 2: Wire the wizard/review flow into `App.tsx`**

```tsx
// src/App.tsx
import { useCallback, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Scene } from './components/Scene';
import { ScanReview } from './components/ScanReview';
import { ScanWizard } from './components/ScanWizard';
import { SOLVED_STATE } from './cube/facelets';
import { generateScramble } from './cube/moveEngine';
import { useSolver } from './cube/useSolver';
import { useCubeController } from './hooks/useCubeController';
import { useCubeScan } from './hooks/useCubeScan';

export default function App() {
  const controller = useCubeController();
  const { status: solverStatus, solve } = useSolver();
  const scan = useCubeScan();
  const [speed, setSpeed] = useState(2.2);
  const [lastScramble, setLastScramble] = useState('');
  const [lastSolution, setLastSolution] = useState('');

  const handleScramble = useCallback(() => {
    const algorithm = generateScramble(20);
    setLastScramble(algorithm);
    setLastSolution('');
    controller.enqueue(algorithm);
  }, [controller]);

  const handleSolve = useCallback(async () => {
    if (controller.isAnimating) return;
    const solution = await solve(controller.facelets);
    setLastSolution(solution);
    controller.enqueue(solution);
  }, [controller, solve]);

  const handleReset = useCallback(() => {
    controller.reset();
    setLastScramble('');
    setLastSolution('');
  }, [controller]);

  const handleUseScan = useCallback(
    (facelets: string) => {
      controller.loadState(facelets);
      setLastScramble('');
      setLastSolution('');
      scan.finish();
    },
    [controller, scan]
  );

  const isSolved = controller.facelets === SOLVED_STATE;

  return (
    <div className="app">
      <div className="viewport">
        <Scene controller={controller} turnsPerSecond={speed} />
      </div>
      <ControlPanel
        onScramble={handleScramble}
        onSolve={handleSolve}
        onReset={handleReset}
        onScan={scan.start}
        isAnimating={controller.isAnimating}
        isSolved={isSolved}
        solverStatus={solverStatus}
        moveCount={controller.moveCount}
        speed={speed}
        onSpeedChange={setSpeed}
        lastScramble={lastScramble}
        lastSolution={lastSolution}
      />
      {scan.phase.kind === 'capturing' && <ScanWizard scan={scan} onCancel={scan.cancel} />}
      {scan.phase.kind === 'review' && (
        <ScanReview result={scan.phase.result} onUse={handleUseScan} onCancel={scan.cancel} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks and builds**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ControlPanel.tsx src/App.tsx
git commit -m "Wire the scan wizard and review screen into the app"
```

---

## Task 14: End-to-end verification and cleanup

**Files:**
- Create: a temporary Playwright script (not committed — same pattern used
  for every manual verification pass so far in this project; lives under
  the session's scratchpad, not the repo).
- Modify: `rubiks-kube-solver/README.md`

**Interfaces:** none new — this task only verifies what Tasks 1-13 built.

- [ ] **Step 1: Run the full automated suite**

```bash
cd rubiks-kube-solver
npx tsc -b
npm test
npx oxlint src
npm run build
```

Expected: all green (per `verification-before-completion` — do not report
this task done without pasting/checking this output).

- [ ] **Step 2: Manual/Playwright pass for the parts automated tests can't reach**

The pure inference math is already proven by Task 6's round-trip test
against real `cubejs`-generated scrambles. What's *not* yet proven
end-to-end is the actual UI: file selection → canvas draw → grid overlay
→ sampling → review → "Bruk denne kuben" → the 3D cube updates and Bland/Løs
still work. Write a throwaway Playwright script that:

1. Starts the dev server (`npm run dev`).
2. Generates 5 synthetic "photos" as PNG data URLs *inside the page* via
   `page.evaluate` — draw a 3×3 grid of solid-color swatches (using the
   exact hex values from `STICKER_COLORS`) onto an offscreen canvas for
   each of F, R, B, L, U, using colors read from a known-valid facelet
   string (e.g. `Cube.random().asString()` computed via a quick Node
   script, or simply `SOLVED_STATE` for the first pass since it's the
   easiest to eyeball).
3. For each wizard step, sets `<input type="file">`'s files via
   `page.locator('input[type=file]').setInputFiles(...)` with the
   generated PNG (Playwright supports passing a `{ name, mimeType,
   buffer }` object directly — write the canvas PNG bytes to a temp file
   first, same pattern as the drag-feature scratchpad scripts used
   earlier in this project).
4. Clicks "Bekreft" each step.
5. On the review screen, asserts the "Bruk denne kuben" button is enabled
   (proves validation passed) and clicks it.
6. Asserts the 3D view now shows the expected colors and that `Bland`
   then `Løs` still work afterward (reuse the exact polling pattern from
   the earlier drag-feature Playwright scripts in this conversation).

Fix anything this surfaces (most likely candidate: the `ScanGridOverlay`
coordinate-scaling note flagged in Task 11) before moving on.

- [ ] **Step 3: Update the README**

Add a bullet to the Funksjoner list and an Arkitektur entry, following the
existing style (see the "dra i en rute" bullet added for the drag
feature):

```markdown
- **Skann en ekte kube**: fotografer en fysisk, blandet kube (5 bilder,
  kuben løftes aldri) og få tilstanden lastet inn direkte — se
  `docs/superpowers/specs/2026-08-17-camera-scanning-design.md` for
  hvordan bunnen og toppens retning regnes ut fra bare 5 bilder.
```

- [ ] **Step 4: Final commit**

```bash
git add rubiks-kube-solver/README.md
git commit -m "Update README for camera scanning"
git push -u origin claude/rubiks-kube-solver-mmt9s3
```

---

## Self-Review Notes

- **Spec coverage:** physical protocol (Task 11 copy) ✓, color detection
  (Task 2) ✓, D-face + U-rotation inference (Tasks 4/6, corrected
  candidate-generation approach) ✓, validation (Task 5) ✓, manual
  correction (Task 12) ✓, integration via `loadState` (Task 8) ✓, error
  handling — cancelled file picker (Task 11's `if (!file) return`) and
  native capture fallback (inherent to `<input capture>`, no code needed)
  ✓, testing strategy (unit tests per pure module + Task 14 E2E) ✓.
- **Type consistency checked:** `FaceGrid` (scanTypes.ts) used identically
  in colorClassifier, scanInference, scanAssembly, gridSampler,
  useCubeScan. `KnownSides` (scanInference.ts) matches exactly what
  `useCubeScan.confirmStep` builds and what `scanAssembly.assembleScan`
  consumes. `AssembleResult` shape is identical everywhere it's produced
  (scanAssembly) and consumed (useCubeScan, ScanReview).
- **Known risk flagged explicitly rather than hidden:** Task 5's parity
  math is the one place a subtle error is plausible; its test step tells
  the implementer explicitly not to proceed until all cases pass, and
  Task 6's round-trip test provides a second, independent check (many
  random scrambles must survive the *entire* pipeline, not just
  validation in isolation).
