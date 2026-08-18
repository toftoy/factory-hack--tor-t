import type { FaceLetter } from './moveEngine';

/** A 3x3 grid of detected sticker colors for one photographed face,
 * row-major (index = row*3+col). A sticker's "color" and a facelet-string
 * position's "letter" are the same alphabet in this codebase — see
 * STICKER_COLORS in facelets.ts — so a detected color classifies directly
 * into a FaceLetter. */
export type FaceGrid = FaceLetter[];

/** Color sampled from a photo, 0-255 per channel. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}
