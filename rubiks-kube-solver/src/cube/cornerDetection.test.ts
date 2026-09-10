// @vitest-environment jsdom
import { beforeAll, describe, expect, test } from 'vitest';
import { createCanvas, ImageData as NodeCanvasImageData } from 'canvas';
import {
  CONFIDENCE_THRESHOLD,
  detectGridQuad,
  isConfidentDetection,
  type GridQuad,
  type Point,
} from './cornerDetection';

// scanic uses document.createElement('canvas') internally for its own
// downscaling/grayscale step. jsdom's built-in <canvas> has no working 2D
// context, so document.createElement is patched to hand out a real
// (Cairo-backed) canvas from the `canvas` package instead - verified
// directly to make scanic work end-to-end under Vitest. Test-only: the
// real app runs in an actual browser, where this all works natively and
// none of this file's setup exists.
beforeAll(() => {
  (globalThis as unknown as { ImageData: unknown }).ImageData = NodeCanvasImageData;
  const realCreateElement = document.createElement.bind(document);
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag === 'canvas') return createCanvas(1, 1) as unknown as HTMLCanvasElement;
    return realCreateElement(tag, options);
  }) as typeof document.createElement;
});

/** Renders a white background with a black cube-grid outline plus its two
 * internal vertical/horizontal lines along the given quad, simulating the
 * high-contrast pattern a real cube face produces, as a real ImageData. */
function buildSyntheticGridImage(width: number, height: number, quad: GridQuad): ImageData {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const setPixel = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const i = (py * width + px) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  };
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const drawLine = (a: Point, b: Point) => {
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const p = lerp(a, b, i / steps);
      setPixel(p.x, p.y);
    }
  };
  const [tl, tr, br, bl] = quad;
  drawLine(tl, tr);
  drawLine(tr, br);
  drawLine(br, bl);
  drawLine(bl, tl);
  const quadPoint = (u: number, v: number): Point => {
    const top = lerp(tl, tr, u);
    const bottom = lerp(bl, br, u);
    return lerp(top, bottom, v);
  };
  drawLine(quadPoint(1 / 3, 0), quadPoint(1 / 3, 1));
  drawLine(quadPoint(2 / 3, 0), quadPoint(2 / 3, 1));
  drawLine(quadPoint(0, 1 / 3), quadPoint(1, 1 / 3));
  drawLine(quadPoint(0, 2 / 3), quadPoint(1, 2 / 3));
  return new ImageData(data, width, height);
}

describe('detectGridQuad - basic adapter behavior', () => {
  test('finds a clean, centered grid with confidence above the threshold', async () => {
    const trueQuad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 260 },
      { x: 40, y: 260 },
    ];
    const image = buildSyntheticGridImage(300, 300, trueQuad);
    const result = await detectGridQuad(image);
    // Measured directly against this exact scenario during planning:
    // confidence 0.938, corners within 1-3px of true. 10px leaves headroom.
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(10);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(10);
    }
    expect(isConfidentDetection(result.confidence)).toBe(true);
  });

  test('falls back to a centered square with zero confidence on a blank (no-signal) image', async () => {
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const image = new ImageData(data, width, height);
    const result = await detectGridQuad(image);
    const size = Math.min(width, height) * 0.7;
    const expectedX = (width - size) / 2;
    expect(result.quad[0].x).toBeCloseTo(expectedX, 0);
    expect(result.confidence).toBe(0);
    expect(isConfidentDetection(result.confidence)).toBe(false);
  });
});

describe('CONFIDENCE_THRESHOLD', () => {
  test('sits above the mathematically-guaranteed ceiling for an invalid detection (0.33)', () => {
    // scanic's own scoring caps an invalid-geometry candidate's confidence
    // at score*0.33 where score <= 1 - see cornerDetection.ts for the full
    // explanation. This is a structural property of the library, not a
    // number to re-guess: as long as this test passes, isConfidentDetection
    // can never call an invalid detection confident.
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0.33);
  });
});
