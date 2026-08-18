import { classifyColor } from './colorClassifier';
import type { FaceGrid, RGB } from './scanTypes';

export interface GridBounds {
  x: number;
  y: number;
  size: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function computeSamplePoints(bounds: GridBounds): ScreenPoint[] {
  const cell = bounds.size / 3;
  const points: ScreenPoint[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      points.push({
        x: bounds.x + cell * (col + 0.5),
        y: bounds.y + cell * (row + 0.5),
      });
    }
  }
  return points;
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
 * context, so it's covered by the Task 13 end-to-end test, not a unit test. */
export function sampleGridColors(ctx: CanvasRenderingContext2D, bounds: GridBounds): FaceGrid {
  const radius = Math.max(2, (bounds.size / 3) * 0.15);
  return computeSamplePoints(bounds).map((p) => classifyColor(averageColor(ctx, p, radius))) as FaceGrid;
}
