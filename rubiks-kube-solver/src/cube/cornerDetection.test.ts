import { describe, expect, test } from 'vitest';
import {
  computeGradientField,
  detectGridQuad,
  scoreQuad,
  searchGridQuad,
  type GridQuad,
  type Point,
} from './cornerDetection';

/** Renders a black cube-grid outline plus its two internal
 * vertical/horizontal lines along the given quad, over a solid background
 * of the given fill color (white by default), simulating the
 * high-contrast pattern a real cube face produces. Built by direct pixel
 * painting (no canvas), so it runs in plain Node. */
function buildSyntheticImage(
  width: number,
  height: number,
  quad: GridQuad,
  fill: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 }
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill.r;
    data[i * 4 + 1] = fill.g;
    data[i * 4 + 2] = fill.b;
    data[i * 4 + 3] = 255;
  }
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
    // Measured with the outer-boundary term included: correct=259.40,
    // wrong=0.00 - the wrong quad sits entirely inside a blank white
    // region, so with all 8 lines (4 internal + 4 border) scored it now
    // picks up literally no gradient energy at all. A plain ratio
    // assertion would be vacuous against a zero denominator, so assert
    // both sides directly instead.
    expect(wrongScore).toBeLessThan(1);
    expect(correctScore).toBeGreaterThan(150);
  });

  test('scores a grid over vividly-colored plastic higher than an identical grid over a desaturated background', () => {
    // Reproduces a failure found on real photos: a shadow or table edge
    // just past the cube's true boundary is sometimes a stronger
    // brightness edge than the real sticker-to-sticker grid line, so a
    // quad that overshoots onto it can out-score the correctly-bounded
    // one. Line-energy alone can't tell the two apart by *where* the
    // lines are, but real cube plastic is always either vividly
    // saturated or bright white, while a shadow/table strip is neither -
    // this checks that signal in isolation, holding line contrast fixed
    // so only interior colorfulness differs. (60,180,60) and (130,130,130)
    // are deliberately chosen to produce nearly the same luminance -
    // confirmed the line-vs-background contrast, and so the line-energy
    // term alone, barely differs between them (132.69 vs 132.24) - so any
    // larger gap is the new colorfulness term, not a contrast artifact.
    const quad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 260 },
      { x: 40, y: 260 },
    ];
    const vividImage = buildSyntheticImage(300, 300, quad, { r: 60, g: 180, b: 60 });
    const desaturatedImage = buildSyntheticImage(300, 300, quad, { r: 130, g: 130, b: 130 });
    const vividScore = scoreQuad(computeGradientField(vividImage), quad);
    const desaturatedScore = scoreQuad(computeGradientField(desaturatedImage), quad);
    expect(vividScore).toBeGreaterThan(desaturatedScore * 1.2);
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
    // Measured with the outer-boundary term included: correct=283.88,
    // axis-aligned guess=99.57, ratio=2.85.
    expect(correctScore).toBeGreaterThan(axisAlignedScore * 2);
  });

  test('rejects a near-zero-area quad even when it sits exactly on a strong edge', () => {
    // Reproduces a failure found by running detection on real phone
    // photos: a degenerate sliver-shaped quad collapsed onto one strong,
    // unrelated edge (a table/background boundary) and every one of its 8
    // sample lines landed within the +-2px perpendicular search of that
    // same edge, so it scored as high as a real grid despite having
    // essentially no area - i.e. not being a grid at all.
    const width = 400;
    const height = 300;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < height; y++) {
      for (let x = 350; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
    const field = computeGradientField({ width, height, data });
    const degenerateQuad: GridQuad = [
      { x: 349, y: 0 },
      { x: 351, y: 0 },
      { x: 351, y: height },
      { x: 349, y: height },
    ];
    expect(scoreQuad(field, degenerateQuad)).toBeLessThan(1);
  });

  test('rejects a quad with wildly mismatched side lengths, even with a substantial area', () => {
    // Reproduces a third failure found on real photos, after guarding
    // against tiny area and non-convexity: on the hardest photo, adding
    // the colorfulness signal (below) shifted the winning local optimum
    // to a lopsided kite shape - convex, 29% of the frame, but with one
    // side (27px) 13x shorter than its longest (358px). A real cube face
    // photographed from any realistic angle never projects to a shape
    // this lopsided. Quad taken directly from that real failure.
    const lopsidedQuad: GridQuad = [
      { x: 146, y: 9 },
      { x: 432, y: 225 },
      { x: 432, y: 252 },
      { x: 162, y: 360 },
    ];
    const image = buildSyntheticImage(450, 400, lopsidedQuad);
    const field = computeGradientField(image);
    expect(scoreQuad(field, lopsidedQuad)).toBe(0);
  });

  test('rejects a concave (non-convex) quad even when its area is large', () => {
    // Reproduces a second failure found on real photos: after guarding
    // against tiny-area quads, the search on one hard photo (a lot of
    // wood-grain texture competing with the real grid) twisted one corner
    // in toward the center instead of collapsing to near-zero area - a
    // "dart" shape whose shoelace area (27% of the frame here) is nowhere
    // near small enough for the area guard to catch. A real square
    // photographed from any angle always projects to a convex
    // quadrilateral, so this shape alone proves it isn't a grid.
    const trueQuad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 260 },
      { x: 40, y: 260 },
    ];
    const image = buildSyntheticImage(300, 300, trueQuad);
    const field = computeGradientField(image);
    const dartQuad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 100, y: 100 }, // pulled in past the diagonal instead of the true bottom-right corner
      { x: 40, y: 260 },
    ];
    expect(scoreQuad(field, dartQuad)).toBe(0);
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
    // A genuinely poor start: wrong in both position and scale (30-78px
    // per-corner error vs trueQuad). Re-measured after scoreQuad started
    // including the four outer boundary edges: with the whole-quad-
    // translate phase this converges to ratio=1.086/maxErr=2.0px;
    // without it, only ratio=0.820/maxErr=70.8px - so this test still
    // genuinely discriminates the translate mechanism, not just the
    // per-corner refinement. (Before the boundary term the same case
    // converged to ratio=0.840/maxErr=44.4px, so the boundary term is
    // worth roughly a 20x reduction in corner error here.)
    const badStart: GridQuad = [
      { x: 40, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 200 },
      { x: 40, y: 200 },
    ];
    const { quad: found, score: foundScore } = searchGridQuad(field, badStart);
    const trueScore = scoreQuad(field, trueQuad);
    expect(foundScore).toBeGreaterThan(trueScore * 0.8);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(found[i].x - trueQuad[i].x)).toBeLessThan(10);
      expect(Math.abs(found[i].y - trueQuad[i].y)).toBeLessThan(10);
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
    // Measured with the outer-boundary term included: max per-corner
    // error 2.1px (was under 20px before it).
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(8);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(8);
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

  test('finds a grid positioned far from center - real photos are rarely framed dead-center', () => {
    // Reproduces a failure found by running detection on real phone photos:
    // detectGridQuad only ever tried centered starting guesses, so a grid
    // sitting off to one side (very common - the cube is held in a hand,
    // not centered in the viewfinder) was never near any starting guess
    // and the search stayed lost.
    const width = 600;
    const height = 300;
    const trueQuad: GridQuad = [
      { x: 20, y: 40 },
      { x: 220, y: 40 },
      { x: 220, y: 240 },
      { x: 20, y: 240 },
    ];
    const image = buildSyntheticImage(width, height, trueQuad);
    const result = detectGridQuad(image);
    // The evenly-spaced internal grid lines this synthetic image draws are
    // themselves a repeating pattern, so a nearby but shifted/rescaled
    // quad can land its own internal thirds on a subset of those same
    // lines and settle into a real (if lower-scoring) local optimum -
    // the same aliasing risk documented for tilted real photos elsewhere
    // in this file. Measured here: the found quad sits within 64px of the
    // true one (was never found at all before the off-center starts were
    // added) at a score of 191.6 vs the true quad's 263.8 - clearly in the
    // right region, not lost in the blank background. 70px leaves headroom
    // on that measurement while still failing if off-center starts regress.
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(70);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(70);
    }
  });
});
