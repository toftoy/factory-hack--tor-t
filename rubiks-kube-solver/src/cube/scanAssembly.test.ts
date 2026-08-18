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

describe('assembleScan orientation independence', () => {
  test('recovers the original state (or honestly reports ambiguous) regardless of which side the user started with', () => {
    const yRotations = ["y", "y'", 'y2'] as const;
    for (let i = 0; i < 20; i++) {
      const original = Cube.random().asString();
      // Simulate the user physically starting the scan with a different
      // side facing them: whole-cube-rotate around the vertical axis, then
      // capture F/R/B/L/U off the ROTATED cube, exactly as a real scan
      // would if the user hadn't started with the "canonical" side facing
      // them. assembleScan must still recover the ORIGINAL (pre-rotation)
      // facelets string, since a whole-cube rotation doesn't change which
      // physical cube state it is.
      const rotated = Cube.fromString(original);
      const yMove = yRotations[Math.floor(Math.random() * yRotations.length)];
      rotated.move(yMove);
      const rotatedFacelets = rotated.asString();

      const uRotation = Math.floor(Math.random() * 4);
      const sides = {
        F: blockOf(rotatedFacelets, 'F'),
        R: blockOf(rotatedFacelets, 'R'),
        B: blockOf(rotatedFacelets, 'B'),
        L: blockOf(rotatedFacelets, 'L'),
        U: rotateGrid(blockOf(rotatedFacelets, 'U'), uRotation),
      };

      const result = assembleScan(sides);
      if (result.ok) {
        expect(result.facelets).toBe(original);
      } else {
        // Never a wrong ok:true, and never the unrelated
        // 'no-valid-candidate' reason - the only acceptable non-exact
        // outcome is an honest 'ambiguous'.
        expect(result.reason).toBe('ambiguous');
      }
    }
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
