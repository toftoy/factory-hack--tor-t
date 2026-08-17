import type { FaceLetter } from './moveEngine';

export const SOLVED_STATE =
  'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

export const FACE_ORDER: FaceLetter[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export const STICKER_COLORS: Record<FaceLetter, string> = {
  U: '#f7f7f7',
  R: '#c1121f',
  F: '#2e933c',
  D: '#ffd60a',
  L: '#ff7900',
  B: '#1d4ed8',
};

export const INTERIOR_COLOR = '#141414';

export type Vec3 = readonly [number, number, number];

export const FACE_LAYOUT: Record<FaceLetter, { normal: Vec3; u: Vec3; v: Vec3 }> = {
  U: { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  D: { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  F: { normal: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  B: { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
  R: { normal: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  L: { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
};

/** Maps "x,y,z,FACE" (cubie position + which side) to an index (0-53) into the facelet string. */
const STICKER_INDEX = new Map<string, number>();

FACE_ORDER.forEach((face, faceOrd) => {
  const { normal, u, v } = FACE_LAYOUT[face];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = normal[0] + (col - 1) * u[0] + (row - 1) * v[0];
      const y = normal[1] + (col - 1) * u[1] + (row - 1) * v[1];
      const z = normal[2] + (col - 1) * u[2] + (row - 1) * v[2];
      const charIndex = faceOrd * 9 + row * 3 + col;
      STICKER_INDEX.set(`${x},${y},${z},${face}`, charIndex);
    }
  }
});

export interface CubiePosition {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  z: -1 | 0 | 1;
}

export const CUBIE_POSITIONS: CubiePosition[] = [];
for (const x of [-1, 0, 1] as const) {
  for (const y of [-1, 0, 1] as const) {
    for (const z of [-1, 0, 1] as const) {
      if (x === 0 && y === 0 && z === 0) continue;
      CUBIE_POSITIONS.push({ x, y, z });
    }
  }
}

/** For a cubie at (x,y,z), returns the sticker color for each of the 6 box faces (or the interior color). */
export function getCubieFaceColors(
  pos: CubiePosition,
  facelets: string
): { px: string; nx: string; py: string; ny: string; pz: string; nz: string } {
  const lookup = (face: FaceLetter) => {
    const idx = STICKER_INDEX.get(`${pos.x},${pos.y},${pos.z},${face}`);
    return idx === undefined ? INTERIOR_COLOR : STICKER_COLORS[facelets[idx] as FaceLetter];
  };
  return {
    px: lookup('R'),
    nx: lookup('L'),
    py: lookup('U'),
    ny: lookup('D'),
    pz: lookup('F'),
    nz: lookup('B'),
  };
}
