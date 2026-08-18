import { describe, expect, test } from 'vitest';
import { allCornerPieces, allEdgePieces, pieceKey } from './cubePieces';

describe('allCornerPieces', () => {
  test('returns exactly the 8 valid corner color combinations', () => {
    const pieces = allCornerPieces();
    expect(pieces).toHaveLength(8);
    const keys = new Set(pieces.map(pieceKey));
    expect(keys.size).toBe(8);
  });

  test('every corner has one color from each opposite pair', () => {
    for (const piece of allCornerPieces()) {
      expect(piece).toHaveLength(3);
      expect(piece.some((c) => c === 'U') || piece.some((c) => c === 'D')).toBe(true);
      expect(piece.some((c) => c === 'F') || piece.some((c) => c === 'B')).toBe(true);
      expect(piece.some((c) => c === 'L') || piece.some((c) => c === 'R')).toBe(true);
    }
  });
});

describe('allEdgePieces', () => {
  test('returns exactly the 12 valid edge color combinations', () => {
    const pieces = allEdgePieces();
    expect(pieces).toHaveLength(12);
    const keys = new Set(pieces.map(pieceKey));
    expect(keys.size).toBe(12);
  });

  test('no edge pairs opposite colors', () => {
    const opposite: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
    for (const [a, b] of allEdgePieces()) {
      expect(opposite[a]).not.toBe(b);
    }
  });
});

describe('pieceKey', () => {
  test('is order-independent', () => {
    expect(pieceKey(['U', 'F', 'R'])).toBe(pieceKey(['R', 'U', 'F']));
  });
});
