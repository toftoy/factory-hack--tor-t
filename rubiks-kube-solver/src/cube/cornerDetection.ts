import { scanDocument, type CornerPoints, type DetectionOptions } from 'scanic';

export interface Point {
  x: number;
  y: number;
}

/** [TL, TR, BR, BL] - this order is used everywhere a quad is consumed or produced. */
export type GridQuad = [Point, Point, Point, Point];

export interface DetectionResult {
  quad: GridQuad;
  confidence: number;
}

// A cube face is nearly square (unlike a general document, which can be
// elongated) and background clutter (table, shadow) should be actively
// rejected, not just tolerated. Starting values verified during planning
// against a synthetic off-center + wood-grain-texture + shadow-edge scene
// (the exact failure class the previous hand-rolled algorithm could never
// solve): confidence 0.767-0.779, corner error 1.4-3.6px. Re-verify against
// the regression corpus in this file if these ever need adjusting.
const CUBE_DETECTION_OPTIONS: DetectionOptions = {
  detector: 'classical',
  maxDocumentAspectRatio: 1.7,
  minRightAngleScore: 0.6,
  minOppositeSideConsistency: 0.6,
  minDocumentCoverageRatio: 0.06,
  minContourFitRatio: 0.8,
  maxContourFitRatio: 1.15,
};

// scanic's `success` flag means only "found a 4-cornered contour somewhere"
// - it does NOT mean the geometry passed the validity gates above (verified
// by reading scanic's source: `success: true` is returned whenever any
// candidate has corners at all, regardless of whether it's geometrically
// valid). The gates instead cap an invalid candidate's confidence at
// `score * 0.33` (score is a weighted sum of sub-scores that never exceeds
// 1), so 0.33 is a hard mathematical ceiling for anything that failed
// validation. This threshold must always stay above that ceiling - see the
// "sits above the mathematically-guaranteed ceiling" test in
// cornerDetection.test.ts, which fails loudly if it doesn't.
export const CONFIDENCE_THRESHOLD = 0.5;

/** True when detectGridQuad's reported confidence is high enough that a
 * real grid was found (as opposed to the centered-square fallback, or a
 * candidate that failed scanic's own geometry validity gates). The UI uses
 * this to decide whether to nudge the user to drag the corners into place
 * manually. */
export function isConfidentDetection(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLD;
}

function defaultQuad(width: number, height: number, sizeFraction: number): GridQuad {
  const size = Math.min(width, height) * sizeFraction;
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

function cornersToQuad(corners: CornerPoints): GridQuad {
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

/** Detects the cube face's grid quad in a photo using scanic's classical
 * (contour-based) document detector, tuned for a near-square, high-contrast
 * subject. Falls back to a centered square with confidence 0 - the same
 * shape the manual drag-to-correct UI already expects - whenever scanic
 * doesn't return usable corners, or throws (e.g. its WASM module fails to
 * initialize on an unsupported engine). */
export async function detectGridQuad(
  image: HTMLCanvasElement | HTMLImageElement | ImageData
): Promise<DetectionResult> {
  const fallback: DetectionResult = { quad: defaultQuad(image.width, image.height, 0.7), confidence: 0 };
  try {
    const result = await scanDocument(image, { mode: 'detect', ...CUBE_DETECTION_OPTIONS });
    if (!result.corners) return fallback;
    return { quad: cornersToQuad(result.corners), confidence: result.confidence ?? 0 };
  } catch {
    return fallback;
  }
}
