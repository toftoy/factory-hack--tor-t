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
