import { describe, expect, test } from 'vitest';
import Cube from 'cubejs';
import { validateScan } from './scanValidation';
import { SOLVED_STATE, facesTouchedBy, getFaceletIndex } from './facelets';

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
    [chars[4], chars[13]] = [chars[13], chars[4]]; // swap U and R centers
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

  // Regression coverage for the two orientation-convention bugs fixed in
  // cornerOrientation (check-order depends on chirality, i.e. the sign of
  // pos.x * pos.y * pos.z) and edgeOrientation (must compare against the
  // occupying piece's own priority color, not a fixed per-slot color set).
  // Cube.random() can stumble onto states that exercise these, but that's
  // nondeterministic and gives no reproducible signal on failure, so this
  // uses a fixed algorithm instead. Verified programmatically (scratch
  // script, since removed) that "R U R' U' F2 D L' B2" applied to a solved
  // cube produces both:
  //   - the FR edge piece (an F/B-L/R-family edge) sitting in the UR slot
  //     (a U/D-touching slot) -- regression for the edgeOrientation bug.
  //   - the DLF corner slot (x*y*z === 1, i.e. one of the four corners
  //     whose "second face to check after U/D" is L/R rather than F/B) left
  //     in a non-solved orientation -- regression for the cornerOrientation
  //     chirality bug.
  // One algorithm happens to satisfy both conditions, so this is a single
  // combined test rather than two separate ones.
  test('accepts a state with an F/B-L/R edge in a U/D slot and a chirality-critical corner reoriented (orientation-bug regression)', () => {
    const cube = new Cube();
    cube.move("R U R' U' F2 D L' B2");
    expect(validateScan(cube.asString())).toEqual({ valid: true });
  });

  test('rejects a single twisted corner (invalid corner-orientation sum)', () => {
    const chars = SOLVED_STATE.split('');
    const pos = { x: 1 as const, y: 1 as const, z: 1 as const }; // URF corner
    const rIdx = getFaceletIndex(pos, 'R')!;
    const uIdx = getFaceletIndex(pos, 'U')!;
    const fIdx = getFaceletIndex(pos, 'F')!;
    // Cyclically rotate the corner's own 3 sticker values among its own 3
    // positions: the same 3 colors stay at this corner, just permuted, so
    // only this corner's orientation changes (no piece moves slots).
    const [r, u, f] = [chars[rIdx], chars[uIdx], chars[fIdx]];
    [chars[rIdx], chars[uIdx], chars[fIdx]] = [u, f, r];
    expect(validateScan(chars.join(''))).toEqual({ valid: false, reason: 'invalid-parity' });
  });

  test('rejects a two-corner swap (invalid permutation parity)', () => {
    const chars = SOLVED_STATE.split('');
    const posA = { x: 1 as const, y: 1 as const, z: 1 as const }; // URF corner
    const posB = { x: -1 as const, y: -1 as const, z: 1 as const }; // DLF corner
    // Swap the two corners' entire 3-sticker sets with each other,
    // preserving each corner's own internal (relative) sticker order --
    // a single transposition, so orientation sums are unaffected and only
    // the corner permutation's parity changes.
    const facesA = facesTouchedBy(posA);
    const facesB = facesTouchedBy(posB);
    const idxA = facesA.map((f) => getFaceletIndex(posA, f)!);
    const idxB = facesB.map((f) => getFaceletIndex(posB, f)!);
    const valsA = idxA.map((i) => chars[i]);
    const valsB = idxB.map((i) => chars[i]);
    idxA.forEach((idx, k) => {
      chars[idx] = valsB[k];
    });
    idxB.forEach((idx, k) => {
      chars[idx] = valsA[k];
    });
    expect(validateScan(chars.join(''))).toEqual({ valid: false, reason: 'invalid-parity' });
  });
});
