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
