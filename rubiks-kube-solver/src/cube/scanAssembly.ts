import { generateScanCandidates, rotateGrid, type KnownSides } from './scanInference';
import { validateScan } from './scanValidation';
import { FACE_ORDER } from './facelets';
import type { FaceLetter } from './moveEngine';
import type { FaceGrid } from './scanTypes';

export type AssembleResult =
  | { ok: true; facelets: string }
  | { ok: false; reason: 'no-valid-candidate' | 'ambiguous' };

/**
 * The 4 side photos are taken in a fixed cyclic sequence (each one 90
 * degrees further around the vertical axis than the last, per the table-top
 * turning protocol), but which physical side the user started with is
 * unconstrained - so all 4 cyclic relabelings of the same 4 photos are
 * equally valid hypotheses for which one is really F.
 */
function cyclicReassignments(sides: KnownSides): KnownSides[] {
  const captured = [sides.F, sides.R, sides.B, sides.L];
  const reassignments: KnownSides[] = [];
  for (let offset = 0; offset < 4; offset++) {
    reassignments.push({
      F: captured[offset % 4],
      R: captured[(offset + 1) % 4],
      B: captured[(offset + 2) % 4],
      L: captured[(offset + 3) % 4],
      U: sides.U,
    });
  }
  return reassignments;
}

/**
 * Assembles a full 54-char facelet string from 5 known side photos (F/R/B/L
 * fully known up to which one is really F, U known up to an unresolved
 * rotation). Multiple different real cube states can share the same 5
 * photos (~1 in 4 scrambled cubes, by measurement) — reported as
 * 'ambiguous' rather than silently guessed, so the caller can fall back to
 * `resolveAmbiguousScan` with a 6th (D) photo.
 */
export function assembleScan(sides: KnownSides): AssembleResult {
  const candidates = cyclicReassignments(sides).flatMap((reassigned) => generateScanCandidates(reassigned));
  const valid = [...new Set(candidates.filter((c) => validateScan(c).valid))];
  if (valid.length === 1) return { ok: true, facelets: valid[0] };
  if (valid.length === 0) return { ok: false, reason: 'no-valid-candidate' };
  return { ok: false, reason: 'ambiguous' };
}

function buildFacelets(blocks: Record<FaceLetter, FaceGrid>): string {
  const facelets: FaceLetter[] = new Array(54);
  for (const face of FACE_ORDER) {
    const start = FACE_ORDER.indexOf(face) * 9;
    for (let i = 0; i < 9; i++) facelets[start + i] = blocks[face][i];
  }
  return facelets.join('');
}

/**
 * Resolves an ambiguous scan once a 6th photo (the D/bottom face, any
 * rotation) is supplied. All 54 stickers are then known modulo 3 unresolved
 * degrees of freedom (which side is really F, U's rotation, D's rotation);
 * tries all 4 x 4 x 4 = 64 combinations directly — no backtracking needed,
 * since every sticker is already known — and validates.
 */
export function resolveAmbiguousScan(sides: KnownSides, dPhoto: FaceGrid): AssembleResult {
  const valid = new Set<string>();
  for (const reassigned of cyclicReassignments(sides)) {
    for (let uRot = 0; uRot < 4; uRot++) {
      for (let dRot = 0; dRot < 4; dRot++) {
        const candidate = buildFacelets({
          U: rotateGrid(reassigned.U, uRot),
          R: reassigned.R,
          F: reassigned.F,
          L: reassigned.L,
          B: reassigned.B,
          D: rotateGrid(dPhoto, dRot),
        });
        if (validateScan(candidate).valid) valid.add(candidate);
      }
    }
  }
  const result = [...valid];
  if (result.length === 1) return { ok: true, facelets: result[0] };
  if (result.length === 0) return { ok: false, reason: 'no-valid-candidate' };
  return { ok: false, reason: 'ambiguous' };
}
