import { generateScanCandidates, rotateGrid, type KnownSides } from './scanInference';
import { validateScan } from './scanValidation';
import { FACE_ORDER } from './facelets';
import type { FaceLetter } from './moveEngine';
import type { FaceGrid } from './scanTypes';

export type AssembleResult =
  | { ok: true; facelets: string }
  | { ok: false; reason: 'no-valid-candidate' | 'ambiguous' };

/**
 * Assembles a full 54-char facelet string from 5 known side photos (F/R/B/L
 * fully known, U known up to an unresolved rotation). Multiple different
 * real cube states can share the same 5 photos (~1 in 4 scrambled cubes, by
 * measurement) — reported as 'ambiguous' rather than silently guessed, so
 * the caller can fall back to `resolveAmbiguousScan` with a 6th (D) photo.
 */
export function assembleScan(sides: KnownSides): AssembleResult {
  const candidates = generateScanCandidates(sides);
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
 * rotation) is supplied. All 54 stickers are then known modulo 2 unresolved
 * photo rotations (U and D); tries all 16 combinations directly — no
 * backtracking needed, since every sticker is already known — and
 * validates.
 */
export function resolveAmbiguousScan(sides: KnownSides, dPhoto: FaceGrid): AssembleResult {
  const valid = new Set<string>();
  for (let uRot = 0; uRot < 4; uRot++) {
    for (let dRot = 0; dRot < 4; dRot++) {
      const candidate = buildFacelets({
        U: rotateGrid(sides.U, uRot),
        R: sides.R,
        F: sides.F,
        L: sides.L,
        B: sides.B,
        D: rotateGrid(dPhoto, dRot),
      });
      if (validateScan(candidate).valid) valid.add(candidate);
    }
  }
  const result = [...valid];
  if (result.length === 1) return { ok: true, facelets: result[0] };
  if (result.length === 0) return { ok: false, reason: 'no-valid-candidate' };
  return { ok: false, reason: 'ambiguous' };
}
