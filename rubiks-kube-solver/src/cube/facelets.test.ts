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
