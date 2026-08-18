import type { FaceLetter } from './moveEngine';

const OPPOSITE: Record<FaceLetter, FaceLetter> = {
  U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L',
};

const ALL_LETTERS: FaceLetter[] = ['U', 'D', 'F', 'B', 'L', 'R'];

/** All 8 valid corner-piece color combinations (one color per opposite pair). */
export function allCornerPieces(): FaceLetter[][] {
  const pieces: FaceLetter[][] = [];
  for (const ud of ['U', 'D'] as const) {
    for (const fb of ['F', 'B'] as const) {
      for (const lr of ['L', 'R'] as const) {
        pieces.push([ud, fb, lr]);
      }
    }
  }
  return pieces;
}

/** All 12 valid edge-piece color combinations (two different, non-opposite colors). */
export function allEdgePieces(): FaceLetter[][] {
  const pieces: FaceLetter[][] = [];
  for (let i = 0; i < ALL_LETTERS.length; i++) {
    for (let j = i + 1; j < ALL_LETTERS.length; j++) {
      const a = ALL_LETTERS[i];
      const b = ALL_LETTERS[j];
      if (OPPOSITE[a] !== b) pieces.push([a, b]);
    }
  }
  return pieces;
}

/** Order-independent identity for a piece's color set. */
export function pieceKey(colors: FaceLetter[]): string {
  return [...colors].sort().join('');
}
