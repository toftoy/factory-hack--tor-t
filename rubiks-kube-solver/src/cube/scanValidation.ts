import {
  CORNER_POSITIONS,
  EDGE_POSITIONS,
  FACE_ORDER,
  facesTouchedBy,
  getFaceletIndex,
  type CubiePosition,
} from './facelets';
import { allCornerPieces, allEdgePieces, pieceKey } from './cubePieces';
import type { FaceLetter } from './moveEngine';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateScan(facelets: string): ValidationResult {
  if (facelets.length !== 54) return { valid: false, reason: 'wrong-length' };

  const counts = new Map<string, number>();
  for (const c of facelets) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const letter of ['U', 'R', 'F', 'D', 'L', 'B']) {
    if (counts.get(letter) !== 9) return { valid: false, reason: 'wrong-color-count' };
  }

  const centers = FACE_ORDER.map((_, i) => facelets[i * 9 + 4]);
  if (centers.some((c, i) => c !== FACE_ORDER[i])) return { valid: false, reason: 'duplicate-centers' };

  if (!hasValidParity(facelets)) return { valid: false, reason: 'invalid-parity' };

  return { valid: true };
}

function colorsAt(pos: CubiePosition, facelets: string): FaceLetter[] {
  return facesTouchedBy(pos).map((f) => facelets[getFaceletIndex(pos, f)!] as FaceLetter);
}

function cornerOrientation(pos: CubiePosition, facelets: string): 0 | 1 | 2 {
  const faces = facesTouchedBy(pos);
  const ud = faces.find((f) => f === 'U' || f === 'D')!;
  const fb = faces.find((f) => f === 'F' || f === 'B')!;
  const lr = faces.find((f) => f === 'L' || f === 'R')!;
  const colorAt = (f: FaceLetter) => facelets[getFaceletIndex(pos, f)!];
  // The fixed "second face to check" alternates with corner chirality: for
  // half the 8 corner slots the natural clockwise cycle after U/D is F/B,
  // for the other half it's L/R. x*y*z (always +-1 for a corner) captures
  // that chirality; empirically verified against cubejs's own per-slot
  // cornerFacelet cyclic order (see task-5 report for the derivation).
  const secondFace = pos.x * pos.y * pos.z === 1 ? lr : fb;
  if (colorAt(ud) === 'U' || colorAt(ud) === 'D') return 0;
  if (colorAt(secondFace) === 'U' || colorAt(secondFace) === 'D') return 1;
  return 2;
}

function edgeOrientation(pos: CubiePosition, facelets: string): 0 | 1 {
  const faces = facesTouchedBy(pos);
  const colorAt = (f: FaceLetter) => facelets[getFaceletIndex(pos, f)!];
  // Orientation must be judged against the *occupying piece's own* primary
  // color, not a fixed per-slot color set: a piece from the F/B-L/R family
  // can sit in a U/D-touching slot, and checking "is it U or D" there is
  // never true regardless of true orientation. Rank the piece's own two
  // colors by family priority (U/D > F/B > L/R) to find its primary color,
  // then compare against whichever of the two facelets is the slot's
  // reference face (U/D if present, else F/B).
  const rank = (c: string) => (c === 'U' || c === 'D' ? 0 : c === 'F' || c === 'B' ? 1 : 2);
  const colorsHere = faces.map(colorAt);
  const primaryColor = rank(colorsHere[0]) <= rank(colorsHere[1]) ? colorsHere[0] : colorsHere[1];
  const refFace = faces.find((f) => f === 'U' || f === 'D') ?? faces.find((f) => f === 'F' || f === 'B')!;
  return colorAt(refFace) === primaryColor ? 0 : 1;
}

function permutationParity(perm: number[]): 0 | 1 {
  const visited = new Array(perm.length).fill(false);
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    if (visited[i]) continue;
    let cycleLength = 0;
    let j = i;
    while (!visited[j]) {
      visited[j] = true;
      j = perm[j];
      cycleLength++;
    }
    parity ^= (cycleLength - 1) % 2;
  }
  return parity as 0 | 1;
}

function hasValidParity(facelets: string): boolean {
  const cornerKeys = allCornerPieces().map(pieceKey);
  const edgeKeys = allEdgePieces().map(pieceKey);

  const cornerPerm: number[] = [];
  let cornerOrientationSum = 0;
  for (const pos of CORNER_POSITIONS) {
    const pieceIndex = cornerKeys.indexOf(pieceKey(colorsAt(pos, facelets)));
    if (pieceIndex === -1) return false;
    cornerPerm.push(pieceIndex);
    cornerOrientationSum += cornerOrientation(pos, facelets);
  }
  if (new Set(cornerPerm).size !== 8) return false;
  if (cornerOrientationSum % 3 !== 0) return false;

  const edgePerm: number[] = [];
  let edgeOrientationSum = 0;
  for (const pos of EDGE_POSITIONS) {
    const pieceIndex = edgeKeys.indexOf(pieceKey(colorsAt(pos, facelets)));
    if (pieceIndex === -1) return false;
    edgePerm.push(pieceIndex);
    edgeOrientationSum += edgeOrientation(pos, facelets);
  }
  if (new Set(edgePerm).size !== 12) return false;
  if (edgeOrientationSum % 2 !== 0) return false;

  return permutationParity(cornerPerm) === permutationParity(edgePerm);
}
