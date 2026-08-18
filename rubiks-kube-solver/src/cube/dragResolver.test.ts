import { describe, expect, test } from 'vitest';
import { moveFromQuarterTurns, resolveGrabMove } from './dragResolver';
import { parseAlgorithm } from './moveEngine';

describe('resolveGrabMove', () => {
  test('dragging the top-front edge along u (positive) turns U-prime', () => {
    const move = resolveGrabMove({ x: 0, y: 1, z: 1 }, 'F', 'u', 1);
    expect(move?.notation).toBe("U'");
  });

  test('dragging the same point along u (negative) turns U instead', () => {
    const move = resolveGrabMove({ x: 0, y: 1, z: 1 }, 'F', 'u', -1);
    expect(move?.notation).toBe('U');
  });

  test('dragging along v at a middle-column point has no move (E-slice unsupported)', () => {
    const move = resolveGrabMove({ x: 0, y: 1, z: 1 }, 'F', 'v', 1);
    expect(move).toBeNull();
  });

  test('dragging a corner (not just an edge) along u gives the same U-prime', () => {
    const move = resolveGrabMove({ x: 1, y: 1, z: 1 }, 'F', 'u', 1);
    expect(move?.notation).toBe("U'");
  });

  test('the same physical U turn is reached whether grabbed from F or R', () => {
    const move = resolveGrabMove({ x: 1, y: 1, z: 1 }, 'R', 'u', 1);
    expect(move?.notation).toBe("U'");
  });

  test('dragging a middle-row point on U has no move (S-slice unsupported)', () => {
    const move = resolveGrabMove({ x: 1, y: 1, z: 0 }, 'U', 'u', 1);
    expect(move).toBeNull();
  });

  test('dragging the right-middle edge on F along v gives R-prime', () => {
    const move = resolveGrabMove({ x: 1, y: 0, z: 1 }, 'F', 'v', 1);
    expect(move?.notation).toBe("R'");
  });
});

describe('moveFromQuarterTurns', () => {
  const uPrime = parseAlgorithm("U'")[0];

  test('one quarter turn in the reference direction returns the reference move unchanged', () => {
    const move = moveFromQuarterTurns(uPrime, 1);
    expect(move?.notation).toBe("U'");
  });

  test('one quarter turn in the opposite direction returns the inverse', () => {
    const move = moveFromQuarterTurns(uPrime, -1);
    expect(move?.notation).toBe('U');
  });

  test('two quarter turns either direction return the double turn', () => {
    expect(moveFromQuarterTurns(uPrime, 2)?.notation).toBe('U2');
    expect(moveFromQuarterTurns(uPrime, -2)?.notation).toBe('U2');
  });

  test('a released drag that barely moved commits no move', () => {
    expect(moveFromQuarterTurns(uPrime, 0.2)).toBeNull();
  });

  test('rounds to the nearest legal turn count', () => {
    expect(moveFromQuarterTurns(uPrime, 0.6)?.notation).toBe("U'");
    expect(moveFromQuarterTurns(uPrime, 1.6)?.notation).toBe('U2');
  });
});
