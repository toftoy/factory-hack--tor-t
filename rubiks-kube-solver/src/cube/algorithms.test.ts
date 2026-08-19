import { describe, expect, test } from 'vitest';
import Cube from 'cubejs';
import { parseAlgorithm } from './moveEngine';
import { SOLVED_STATE } from './facelets';
import {
  BEGINNER_ALGORITHMS,
  CORNER_ALGORITHMS,
  CROSS_ALGORITHMS,
  NOTATION_ALGORITHMS,
  OLL_PLL_2LOOK_ALGORITHMS,
  TRACKS,
} from './algorithms';

function applyAlgorithm(cube: InstanceType<typeof Cube>, notation: string): void {
  for (const move of parseAlgorithm(notation)) {
    cube.move(move.notation);
  }
}

describe('algorithm data', () => {
  const allCases = [
    ...NOTATION_ALGORITHMS,
    ...BEGINNER_ALGORITHMS,
    ...OLL_PLL_2LOOK_ALGORITHMS,
    ...CROSS_ALGORITHMS,
    ...CORNER_ALGORITHMS,
  ];

  test('every case has a unique id', () => {
    const ids = allCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(allCases.map((c) => [c.name, c] as const))(
    '%s: setupMoves genuinely disturbs the solved state',
    (_name, algCase) => {
      const cube = new Cube();
      applyAlgorithm(cube, algCase.setupMoves);
      expect(cube.asString()).not.toBe(SOLVED_STATE);
    }
  );

  test.each(allCases.map((c) => [c.name, c] as const))(
    '%s: setupMoves followed by solutionMoves returns to solved',
    (_name, algCase) => {
      const cube = new Cube();
      applyAlgorithm(cube, algCase.setupMoves);
      applyAlgorithm(cube, algCase.solutionMoves);
      expect(cube.asString()).toBe(SOLVED_STATE);
    }
  );

  test('TRACKS exposes all three tracks with matching contents', () => {
    expect(TRACKS.notation).toBe(NOTATION_ALGORITHMS);
    expect(TRACKS.beginner).toBe(BEGINNER_ALGORITHMS);
    expect(TRACKS['oll-pll-2look']).toBe(OLL_PLL_2LOOK_ALGORITHMS);
  });

  test('TRACKS exposes guided-basics with cross + corner cases', () => {
    expect(TRACKS['guided-basics']).toEqual([...CROSS_ALGORITHMS, ...CORNER_ALGORITHMS]);
  });
});
