import { useCallback, useState } from 'react';
import { sampleGridColors, type GridQuad } from '../cube/gridSampler';
import { assembleScan, resolveAmbiguousScan, type AssembleResult } from '../cube/scanAssembly';
import { FACE_ORDER } from '../cube/facelets';
import type { FaceLetter } from '../cube/moveEngine';
import type { FaceGrid } from '../cube/scanTypes';

const CAPTURE_ORDER = ['F', 'R', 'B', 'L', 'U'] as const;
type CaptureFace = (typeof CAPTURE_ORDER)[number];

/** A best-effort 54-char facelets string from whatever was actually
 * photographed, for seeding the review/correction screen when assembly
 * failed - the captured colors themselves, in raw capture order, plus D
 * filled with the one leftover color (or 'U' if even that can't be
 * determined) rather than an uninformative all-white cube. */
function buildBestEffort(captured: Partial<Record<CaptureFace, FaceGrid>>): string | null {
  if (!captured.F || !captured.R || !captured.B || !captured.L || !captured.U) return null;
  const knownCenters = [captured.U[4], captured.R[4], captured.F[4], captured.L[4], captured.B[4]];
  const distinct = new Set(knownCenters);
  const dLetter =
    distinct.size === 5 ? (['U', 'D', 'F', 'B', 'L', 'R'] as FaceLetter[]).find((l) => !distinct.has(l)) : undefined;
  const blocks: Record<FaceLetter, FaceGrid> = {
    U: captured.U,
    R: captured.R,
    F: captured.F,
    D: new Array(9).fill(dLetter ?? 'U') as FaceGrid,
    L: captured.L,
    B: captured.B,
  };
  const facelets: FaceLetter[] = new Array(54);
  for (const face of FACE_ORDER) {
    const start = FACE_ORDER.indexOf(face) * 9;
    for (let i = 0; i < 9; i++) facelets[start + i] = blocks[face][i];
  }
  return facelets.join('');
}

export type ScanPhase =
  | { kind: 'idle' }
  | { kind: 'capturing'; stepIndex: number; image: HTMLImageElement | null }
  | { kind: 'capturingD'; image: HTMLImageElement | null }
  | { kind: 'review'; result: AssembleResult };

export function useCubeScan() {
  const [phase, setPhase] = useState<ScanPhase>({ kind: 'idle' });
  const [captured, setCaptured] = useState<Partial<Record<CaptureFace, FaceGrid>>>({});

  const start = useCallback(() => {
    setCaptured({});
    setPhase({ kind: 'capturing', stepIndex: 0, image: null });
  }, []);

  const cancel = useCallback(() => {
    setPhase({ kind: 'idle' });
  }, []);

  const setStepImage = useCallback((image: HTMLImageElement) => {
    setPhase((prev) => (prev.kind === 'capturing' ? { ...prev, image } : prev));
  }, []);

  const setDImage = useCallback((image: HTMLImageElement) => {
    setPhase((prev) => (prev.kind === 'capturingD' ? { ...prev, image } : prev));
  }, []);

  const confirmStep = useCallback(
    (ctx: CanvasRenderingContext2D, quad: GridQuad) => {
      setPhase((prev) => {
        if (prev.kind !== 'capturing') return prev;
        const face = CAPTURE_ORDER[prev.stepIndex];
        const grid = sampleGridColors(ctx, quad);
        const nextCaptured = { ...captured, [face]: grid };
        setCaptured(nextCaptured);

        const nextIndex = prev.stepIndex + 1;
        if (nextIndex < CAPTURE_ORDER.length) {
          return { kind: 'capturing', stepIndex: nextIndex, image: null };
        }

        const result = assembleScan({
          F: nextCaptured.F!,
          R: nextCaptured.R!,
          B: nextCaptured.B!,
          L: nextCaptured.L!,
          U: nextCaptured.U!,
        });
        // Ambiguous means the 5 photos genuinely aren't enough for this
        // cube (~1 in 4, by measurement) — ask for a 6th (D) photo rather
        // than showing a failure or silently guessing wrong. Any other
        // outcome (ok, or the unrelated no-valid-candidate reason) goes
        // straight to review.
        if (!result.ok && result.reason === 'ambiguous') {
          return { kind: 'capturingD', image: null };
        }
        return { kind: 'review', result };
      });
    },
    [captured]
  );

  const confirmD = useCallback(
    (ctx: CanvasRenderingContext2D, quad: GridQuad) => {
      setPhase((prev) => {
        if (prev.kind !== 'capturingD') return prev;
        const dGrid = sampleGridColors(ctx, quad);
        const result = resolveAmbiguousScan(
          {
            F: captured.F!,
            R: captured.R!,
            B: captured.B!,
            L: captured.L!,
            U: captured.U!,
          },
          dGrid
        );
        return { kind: 'review', result };
      });
    },
    [captured]
  );

  const finish = useCallback(() => {
    setPhase({ kind: 'idle' });
  }, []);

  return {
    phase,
    currentFace:
      phase.kind === 'capturing' ? CAPTURE_ORDER[phase.stepIndex] : phase.kind === 'capturingD' ? 'D' : null,
    stepNumber: phase.kind === 'capturing' ? phase.stepIndex + 1 : null,
    totalSteps: CAPTURE_ORDER.length,
    capturedFacelets: buildBestEffort(captured),
    start,
    cancel,
    setStepImage,
    setDImage,
    confirmStep,
    confirmD,
    finish,
  };
}

export type CubeScan = ReturnType<typeof useCubeScan>;
