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

  test('four single rotations compose back to the original', () => {
    const grid = 'URFDLBURF'.split('') as FaceGrid;
    let result = grid;
    for (let i = 0; i < 4; i++) {
      result = rotateGrid(result, 1);
    }
    expect(result).toEqual(grid);
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

  test('returns no candidates when known face centers are not all distinct', () => {
    const cube = new Cube();
    const facelets = cube.asString();
    const F = blockOf(facelets, 'F');
    const R = blockOf(facelets, 'R');
    R[4] = F[4]; // duplicate center: R and F now report the same color, for every U rotation

    const candidates = generateScanCandidates({
      F,
      R,
      B: blockOf(facelets, 'B'),
      L: blockOf(facelets, 'L'),
      U: blockOf(facelets, 'U'),
    });

    expect(candidates).toEqual([]);
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
