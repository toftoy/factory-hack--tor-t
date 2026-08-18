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
