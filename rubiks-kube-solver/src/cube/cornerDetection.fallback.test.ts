import { describe, expect, test, vi } from 'vitest';

vi.mock('scanic', () => ({
  scanDocument: vi.fn().mockRejectedValue(new Error('WASM module failed to initialize')),
}));

const { detectGridQuad } = await import('./cornerDetection');

describe('detectGridQuad - error fallback', () => {
  test('falls back to a centered square with zero confidence when scanDocument throws', async () => {
    const image = { width: 300, height: 200 } as unknown as HTMLCanvasElement;
    const result = await detectGridQuad(image);
    const size = Math.min(300, 200) * 0.7;
    const expectedX = (300 - size) / 2;
    const expectedY = (200 - size) / 2;
    expect(result.quad[0].x).toBeCloseTo(expectedX, 5);
    expect(result.quad[0].y).toBeCloseTo(expectedY, 5);
    expect(result.confidence).toBe(0);
  });
});
