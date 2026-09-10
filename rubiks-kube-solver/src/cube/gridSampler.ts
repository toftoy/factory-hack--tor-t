import { classifyColor } from './colorClassifier';
import type { GridQuad, Point } from './cornerDetection';
import type { FaceGrid, RGB } from './scanTypes';

export type { GridQuad, Point } from './cornerDetection';

export interface ScreenPoint {
  x: number;
  y: number;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function quadPoint(quad: GridQuad, u: number, v: number): Point {
  const [tl, tr, br, bl] = quad;
  const top = lerpPoint(tl, tr, u);
  const bottom = lerpPoint(bl, br, u);
  return lerpPoint(top, bottom, v);
}

export function computeSamplePoints(quad: GridQuad): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      points.push(quadPoint(quad, (col + 0.5) / 3, (row + 0.5) / 3));
    }
  }
  return points;
}

function approximateCellRadius(quad: GridQuad): number {
  const [tl, tr, , bl] = quad;
  const topEdge = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const leftEdge = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  return ((topEdge + leftEdge) / 2 / 3) * 0.15;
}

function averageColor(ctx: CanvasRenderingContext2D, center: ScreenPoint, radius: number): RGB {
  const size = Math.max(1, Math.round(radius * 2));
  const data = ctx.getImageData(
    Math.round(center.x - radius),
    Math.round(center.y - radius),
    size,
    size
  ).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  return { r: r / n, g: g / n, b: b / n };
}

/** Samples the 9 grid-cell colors from a canvas. Needs a real canvas
 * context, so it's covered by end-to-end tests, not a unit test. */
export function sampleGridColors(ctx: CanvasRenderingContext2D, quad: GridQuad): FaceGrid {
  const radius = Math.max(2, approximateCellRadius(quad));
  return computeSamplePoints(quad).map((p) => classifyColor(averageColor(ctx, p, radius))) as FaceGrid;
}
