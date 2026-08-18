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
import type { FaceGrid } from './scanTypes';

export interface KnownSides {
  F: FaceGrid;
  R: FaceGrid;
  B: FaceGrid;
  L: FaceGrid;
  /** Raw U photo grid, in the photo's own (unresolved) rotation. */
  U: FaceGrid;
}

/** Rotates a row-major 3x3 grid 90 degrees clockwise, `times` times. */
export function rotateGrid(grid: FaceGrid, times: number): FaceGrid {
  let result = grid;
  const normalized = ((times % 4) + 4) % 4;
  for (let t = 0; t < normalized; t++) {
    const next: FaceLetter[] = new Array(9);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        next[row * 3 + col] = result[(2 - col) * 3 + row];
      }
    }
    result = next;
  }
  return result;
}

interface SlotOption {
  pos: CubiePosition;
  knownColors: FaceLetter[];
  options: FaceLetter[][];
}

function* assignPiecesToSlots(
  slots: SlotOption[],
  usedKeys: Set<string>
): Generator<{ slot: SlotOption; piece: FaceLetter[] }[]> {
  if (slots.length === 0) {
    yield [];
    return;
  }
  const [slot, ...rest] = slots;
  for (const piece of slot.options) {
    const key = pieceKey(piece);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    for (const restAssignment of assignPiecesToSlots(rest, usedKeys)) {
      yield [{ slot, piece }, ...restAssignment];
    }
    usedKeys.delete(key);
  }
}

function placePieceAtSlot(facelets: FaceLetter[], slot: SlotOption, piece: FaceLetter[]): void {
  const dColor = piece.find((c) => !slot.knownColors.includes(c))!;
  facelets[getFaceletIndex(slot.pos, 'D')!] = dColor;
}

function readColors(pos: CubiePosition, facelets: FaceLetter[], excludeFace?: FaceLetter): FaceLetter[] {
  return facesTouchedBy(pos)
    .filter((f) => f !== excludeFace)
    .map((f) => facelets[getFaceletIndex(pos, f)!]);
}

/**
 * Every candidate 54-character facelet string consistent with the 4 known
 * side photos and one of the 4 possible U-photo rotations. Not validated —
 * see scanValidation.validateScan; callers try each until one validates.
 */
export function generateScanCandidates(sides: KnownSides): string[] {
  const candidates: string[] = [];

  for (let rotation = 0; rotation < 4; rotation++) {
    const known: Record<'U' | 'R' | 'F' | 'L' | 'B', FaceGrid> = {
      U: rotateGrid(sides.U, rotation),
      R: sides.R,
      F: sides.F,
      L: sides.L,
      B: sides.B,
    };

    const facelets: FaceLetter[] = new Array(54);
    for (const face of ['U', 'R', 'F', 'L', 'B'] as const) {
      const blockStart = FACE_ORDER.indexOf(face) * 9;
      for (let i = 0; i < 9; i++) facelets[blockStart + i] = known[face][i];
    }

    const usedCenters = new Set((['U', 'R', 'F', 'L', 'B'] as const).map((f) => known[f][4]));
    const dCenter = (['U', 'D', 'F', 'B', 'L', 'R'] as FaceLetter[]).find((l) => !usedCenters.has(l));
    if (!dCenter) continue; // U/F/R/L/B centers weren't all distinct - this rotation can't be valid
    facelets[FACE_ORDER.indexOf('D') * 9 + 4] = dCenter;

    const nonDCorners = CORNER_POSITIONS.filter((p) => p.y === 1);
    const dTouchingCorners = CORNER_POSITIONS.filter((p) => p.y === -1);
    const nonDEdges = EDGE_POSITIONS.filter((p) => p.y !== -1);
    const dTouchingEdges = EDGE_POSITIONS.filter((p) => p.y === -1);

    const usedCornerKeys = new Set(nonDCorners.map((p) => pieceKey(readColors(p, facelets))));
    const usedEdgeKeys = new Set(nonDEdges.map((p) => pieceKey(readColors(p, facelets))));

    const remainingCorners = allCornerPieces().filter((p) => !usedCornerKeys.has(pieceKey(p)));
    const remainingEdges = allEdgePieces().filter((p) => !usedEdgeKeys.has(pieceKey(p)));

    const cornerSlots: SlotOption[] = dTouchingCorners.map((pos) => {
      const knownColors = readColors(pos, facelets, 'D');
      const options = remainingCorners.filter((piece) => knownColors.every((c) => piece.includes(c)));
      return { pos, knownColors, options };
    });
    const edgeSlots: SlotOption[] = dTouchingEdges.map((pos) => {
      const knownColors = readColors(pos, facelets, 'D');
      const options = remainingEdges.filter((piece) => knownColors.every((c) => piece.includes(c)));
      return { pos, knownColors, options };
    });

    for (const cornerAssignment of assignPiecesToSlots(cornerSlots, new Set())) {
      for (const edgeAssignment of assignPiecesToSlots(edgeSlots, new Set())) {
        const candidate = [...facelets];
        for (const { slot, piece } of cornerAssignment) placePieceAtSlot(candidate, slot, piece);
        for (const { slot, piece } of edgeAssignment) placePieceAtSlot(candidate, slot, piece);
        candidates.push(candidate.join(''));
      }
    }
  }

  return candidates;
}
