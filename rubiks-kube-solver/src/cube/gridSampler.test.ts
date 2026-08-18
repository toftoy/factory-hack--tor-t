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
