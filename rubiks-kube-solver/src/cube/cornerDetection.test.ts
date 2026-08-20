import { describe, expect, test } from 'vitest';
import {
  computeGradientField,
  detectGridQuad,
  scoreQuad,
  searchGridQuad,
  type GridQuad,
  type Point,
} from './cornerDetection';

/** Renders a white background with a black cube-grid outline plus its two
 * internal vertical/horizontal lines along the given quad, simulating the
 * high-contrast pattern a real cube face produces. Built by direct pixel
 * painting (no canvas), so it runs in plain Node. */
function buildSyntheticImage(
  width: number,
  height: number,
  quad: GridQuad
): { width: number; height: number; data: Uint8ClampedArray } {
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
  return { width, height, data };
}

describe('computeGradientField', () => {
  test('produces near-zero gradient on a uniform image', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(128);
    const field = computeGradientField({ width, height, data });
    expect(Math.max(...field.data)).toBeLessThan(1);
  });

  test('detects a sharp edge', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 10; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
      }
    }
    const field = computeGradientField({ width, height, data });
    const atEdge = field.data[10 * width + 10];
    const farFromEdge = field.data[10 * width + 3];
    expect(atEdge).toBeGreaterThan(farFromEdge * 5);
  });
});

describe('scoreQuad', () => {
  test('scores the correct quad much higher than a badly misaligned one', () => {
    const axisAlignedQuad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 260 },
      { x: 40, y: 260 },
    ];
    const image = buildSyntheticImage(300, 300, axisAlignedQuad);
    const field = computeGradientField(image);
    const correctScore = scoreQuad(field, axisAlignedQuad);
    const wrongQuad: GridQuad = [
      { x: 5, y: 5 },
      { x: 35, y: 5 },
      { x: 35, y: 35 },
      { x: 5, y: 35 },
    ];
    const wrongScore = scoreQuad(field, wrongQuad);
    expect(correctScore).toBeGreaterThan(wrongScore * 5);
  });

  test('scores a skewed (non-rectangular) quad correctly, proving perspective handling', () => {
    const skewedQuad: GridQuad = [
      { x: 60, y: 30 },
      { x: 280, y: 60 },
      { x: 250, y: 270 },
      { x: 30, y: 240 },
    ];
    const image = buildSyntheticImage(320, 320, skewedQuad);
    const field = computeGradientField(image);
    const correctScore = scoreQuad(field, skewedQuad);
    const axisAlignedGuess: GridQuad = [
      { x: 50, y: 50 },
      { x: 260, y: 50 },
      { x: 260, y: 260 },
      { x: 50, y: 260 },
    ];
    const axisAlignedScore = scoreQuad(field, axisAlignedGuess);
    expect(correctScore).toBeGreaterThan(axisAlignedScore * 1.5);
  });
});

describe('searchGridQuad', () => {
  test('converges from a poor starting guess to the true skewed quad', () => {
    const trueQuad: GridQuad = [
      { x: 70, y: 40 },
      { x: 270, y: 60 },
      { x: 250, y: 260 },
      { x: 40, y: 230 },
    ];
    const image = buildSyntheticImage(320, 320, trueQuad);
    const field = computeGradientField(image);
    // A moderately poor start: axis-aligned (not skewed), roughly framing
    // the same area but not matching the true quad's actual shape - e.g.
    // a leftover overlay position from a previous photo. (Handling a
    // simultaneously wrong-scale-and-position start is detectGridQuad's
    // job via its multi-start, not this isolated search's - see that
    // test below.)
    const badStart: GridQuad = [
      { x: 50, y: 50 },
      { x: 260, y: 50 },
      { x: 260, y: 250 },
      { x: 50, y: 250 },
    ];
    const { quad: found, score: foundScore } = searchGridQuad(field, badStart);
    const trueScore = scoreQuad(field, trueQuad);
    expect(foundScore).toBeGreaterThan(trueScore * 0.85);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(found[i].x - trueQuad[i].x)).toBeLessThan(25);
      expect(Math.abs(found[i].y - trueQuad[i].y)).toBeLessThan(25);
    }
  });
});

describe('detectGridQuad', () => {
  test('finds the true quad end-to-end on a clean synthetic image', () => {
    const trueQuad: GridQuad = [
      { x: 80, y: 60 },
      { x: 300, y: 50 },
      { x: 290, y: 280 },
      { x: 60, y: 270 },
    ];
    const image = buildSyntheticImage(360, 340, trueQuad);
    const result = detectGridQuad(image);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(20);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(20);
    }
  });

  test('falls back to a centered square on a blank (no-signal) image', () => {
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);
    const result = detectGridQuad({ width, height, data });
    const size = Math.min(width, height) * 0.7;
    const expectedX = (width - size) / 2;
    expect(result.quad[0].x).toBeCloseTo(expectedX, 0);
    expect(result.confidence).toBeLessThan(1);
  });
});
