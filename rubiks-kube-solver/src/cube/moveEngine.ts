export type FaceLetter = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Axis = 'x' | 'y' | 'z';

export interface MoveDef {
  axis: Axis;
  layer: 1 | -1;
  /** Radians for a single clockwise quarter turn, viewed from outside the face. */
  quarterAngle: number;
}

const QUARTER = Math.PI / 2;

export const MOVE_DEFS: Record<FaceLetter, MoveDef> = {
  U: { axis: 'y', layer: 1, quarterAngle: -QUARTER },
  D: { axis: 'y', layer: -1, quarterAngle: QUARTER },
  R: { axis: 'x', layer: 1, quarterAngle: -QUARTER },
  L: { axis: 'x', layer: -1, quarterAngle: QUARTER },
  F: { axis: 'z', layer: 1, quarterAngle: -QUARTER },
  B: { axis: 'z', layer: -1, quarterAngle: QUARTER },
};

export interface Move {
  notation: string;
  face: FaceLetter;
  axis: Axis;
  layer: 1 | -1;
  /** Total rotation in radians (sign/magnitude already resolved for this move). */
  angle: number;
}

const FACE_LETTERS = Object.keys(MOVE_DEFS) as FaceLetter[];

export function parseAlgorithm(alg: string): Move[] {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

function parseMove(notation: string): Move {
  const face = notation[0] as FaceLetter;
  const modifier = notation.slice(1);
  const def = MOVE_DEFS[face];
  if (!def) {
    throw new Error(`Unknown move: ${notation}`);
  }
  let angle = def.quarterAngle;
  if (modifier === "'") {
    angle = -def.quarterAngle;
  } else if (modifier === '2') {
    angle = def.quarterAngle * 2;
  } else if (modifier !== '') {
    throw new Error(`Unknown move: ${notation}`);
  }
  return { notation, face, axis: def.axis, layer: def.layer, angle };
}

const MODIFIERS = ['', "'", '2'];

export function generateScramble(length = 20): string {
  const moves: string[] = [];
  let prevAxis: Axis | null = null;
  let prevFace: FaceLetter | null = null;

  for (let i = 0; i < length; i++) {
    let face: FaceLetter;
    do {
      face = FACE_LETTERS[Math.floor(Math.random() * FACE_LETTERS.length)];
    } while (face === prevFace || MOVE_DEFS[face].axis === prevAxis);

    const modifier = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
    moves.push(face + modifier);
    prevFace = face;
    prevAxis = MOVE_DEFS[face].axis;
  }

  return moves.join(' ');
}
