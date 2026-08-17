import { FACE_LAYOUT, type CubiePosition, type Vec3 } from './facelets';
import { MOVE_DEFS, parseAlgorithm, type Axis, type FaceLetter, type Move } from './moveEngine';

const FACE_LETTERS = Object.keys(MOVE_DEFS) as FaceLetter[];

function axisOf(vec: Vec3): Axis {
  if (vec[0] !== 0) return 'x';
  if (vec[1] !== 0) return 'y';
  return 'z';
}

function cross(a: Vec3, b: CubiePosition): Vec3 {
  return [a[1] * b.z - a[2] * b.y, a[2] * b.x - a[0] * b.z, a[0] * b.y - a[1] * b.x];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function axisUnitVector(axis: Axis): Vec3 {
  return axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
}

function scale(vec: Vec3, s: number): Vec3 {
  return [vec[0] * s, vec[1] * s, vec[2] * s];
}

/**
 * Given a cubie grabbed on `hitFace`, dragged along that face's `axis` ('u' or
 * 'v', see FACE_LAYOUT) in the given `sign` direction, returns the single
 * outer-layer move that motion corresponds to — or null if it targets a
 * middle slice (E/M/S), which this app's move set doesn't support.
 *
 * Derived from the same rotation convention as moveEngine's MOVE_DEFS: the
 * grabbed point's initial velocity under a candidate turn is `axis × cubiePos`
 * (cross product); the turn whose velocity points the same way as the drag is
 * the one the user is asking for.
 */
export function resolveGrabMove(
  cubiePos: CubiePosition,
  hitFace: FaceLetter,
  axis: 'u' | 'v',
  sign: 1 | -1
): Move | null {
  const layout = FACE_LAYOUT[hitFace];
  const dragAxisVec = scale(axis === 'u' ? layout.u : layout.v, sign);
  const otherAxisVec = axis === 'u' ? layout.v : layout.u;
  const rotationAxis = axisOf(otherAxisVec);

  const layer = cubiePos[rotationAxis];
  if (layer === 0) return null;

  const face = FACE_LETTERS.find(
    (f) => MOVE_DEFS[f].axis === rotationAxis && MOVE_DEFS[f].layer === layer
  );
  if (!face) return null;

  const velocity = cross(axisUnitVector(rotationAxis), cubiePos);
  const matchesPositiveRotation = dot(velocity, dragAxisVec) > 0;
  const faceSign = Math.sign(MOVE_DEFS[face].quarterAngle);
  const desiredSign = matchesPositiveRotation ? 1 : -1;
  const modifier = desiredSign * faceSign === 1 ? '' : "'";

  return parseAlgorithm(face + modifier)[0];
}

function invertNotation(notation: string): string {
  return notation.endsWith("'") ? notation.slice(0, -1) : notation + "'";
}

/**
 * Converts a released drag gesture — expressed as a signed number of quarter
 * turns relative to `referenceMove` (the move a small positive drag along the
 * locked axis resolves to) — into the final move to commit. Rounds to the
 * nearest legal turn amount and clamps to a half turn; a barely-there drag
 * (rounds to 0) commits nothing.
 */
export function moveFromQuarterTurns(referenceMove: Move, rawQuarterTurns: number): Move | null {
  const quarterTurns = Math.max(-2, Math.min(2, Math.round(rawQuarterTurns)));
  if (quarterTurns === 0) return null;
  if (Math.abs(quarterTurns) === 2) {
    return parseAlgorithm(referenceMove.face + '2')[0];
  }
  const notation = quarterTurns === 1 ? referenceMove.notation : invertNotation(referenceMove.notation);
  return parseAlgorithm(notation)[0];
}
