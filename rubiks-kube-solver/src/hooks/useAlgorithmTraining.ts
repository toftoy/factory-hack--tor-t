import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlgorithmCase, TrainingTrack } from '../cube/algorithms';
import {
  currentCase,
  isTrackComplete,
  loadProgress,
  recordAttempt,
  saveProgress,
  showSolution,
  skipCase,
  type TrackProgress,
} from '../cube/trainingProgress';
import { SOLVED_STATE } from '../cube/facelets';
import type { CubeController } from './useCubeController';

export type TrainingPhase =
  | { kind: 'idle' }
  | { kind: 'setting-up'; algCase: AlgorithmCase }
  | { kind: 'ready'; algCase: AlgorithmCase }
  | { kind: 'timing'; algCase: AlgorithmCase; startedAt: number }
  | { kind: 'demonstrating'; algCase: AlgorithmCase }
  | { kind: 'track-complete' };

export function useAlgorithmTraining(controller: CubeController) {
  const [track, setTrack] = useState<TrainingTrack | null>(null);
  const [phase, setPhase] = useState<TrainingPhase>({ kind: 'idle' });
  const [progress, setProgress] = useState<TrackProgress | null>(null);
  const [lastResult, setLastResult] = useState<{ timeMs: number } | null>(null);
  const baselineMoveCount = useRef(0);

  const setUpCase = useCallback(
    (t: TrainingTrack, p: TrackProgress) => {
      if (isTrackComplete(t, p)) {
        setPhase({ kind: 'track-complete' });
        return;
      }
      const algCase = currentCase(t, p);
      controller.reset();
      controller.enqueue(algCase.setupMoves);
      setPhase({ kind: 'setting-up', algCase });
    },
    [controller]
  );

  const start = useCallback(
    (t: TrainingTrack) => {
      const p = loadProgress(t);
      setTrack(t);
      setProgress(p);
      setLastResult(null);
      setUpCase(t, p);
    },
    [setUpCase]
  );

  const stop = useCallback(() => {
    setTrack(null);
    setProgress(null);
    setPhase({ kind: 'idle' });
    setLastResult(null);
  }, []);

  // The setup animation finished -> arm for the user's own moves. The
  // baseline is captured here (not at enqueue time) because enqueue's
  // moves haven't been counted into controller.moveCount yet at that point.
  useEffect(() => {
    if (phase.kind !== 'setting-up') return;
    if (controller.isAnimating) return;
    baselineMoveCount.current = controller.moveCount;
    setPhase({ kind: 'ready', algCase: phase.algCase });
  }, [phase, controller.isAnimating, controller.moveCount]);

  // The user's first move after the case is ready -> start the timer.
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    if (controller.moveCount <= baselineMoveCount.current) return;
    setPhase({ kind: 'timing', algCase: phase.algCase, startedAt: Date.now() });
  }, [phase, controller.moveCount]);

  // Solved while timing -> record the attempt, persist, advance.
  useEffect(() => {
    if (phase.kind !== 'timing') return;
    if (controller.facelets !== SOLVED_STATE) return;
    if (!track || !progress) return;
    const timeMs = Date.now() - phase.startedAt;
    const nextProgress = recordAttempt(track, progress, phase.algCase.id, true, timeMs);
    saveProgress(track, nextProgress);
    setProgress(nextProgress);
    setLastResult({ timeMs });
    setUpCase(track, nextProgress);
  }, [phase, controller.facelets, track, progress, setUpCase]);

  // "Vis løsning" must let the demo animation actually play before setting
  // up the next attempt — calling setUpCase right away would call
  // controller.reset() and wipe the just-enqueued demo moves before they
  // ever animate. So this only enqueues the demo and marks 'demonstrating';
  // the effect below advances to a fresh attempt once it's done playing.
  const giveUp = useCallback(() => {
    if (phase.kind !== 'timing' && phase.kind !== 'ready') return;
    if (!track || !progress) return;
    const algCase = phase.algCase;
    controller.reset();
    controller.enqueue(`${algCase.setupMoves} ${algCase.solutionMoves}`);
    const nextProgress = showSolution(progress, algCase.id);
    saveProgress(track, nextProgress);
    setProgress(nextProgress);
    setLastResult(null);
    setPhase({ kind: 'demonstrating', algCase });
  }, [phase, track, progress, controller]);

  // The demo animation finished -> set up a fresh attempt on the same case
  // (showSolution above only reset the streak, not the pointer, so
  // currentCase still resolves to the same case).
  useEffect(() => {
    if (phase.kind !== 'demonstrating') return;
    if (controller.isAnimating) return;
    if (!track || !progress) return;
    setUpCase(track, progress);
  }, [phase, controller.isAnimating, track, progress, setUpCase]);

  const skip = useCallback(() => {
    if (!track || !progress) return;
    const nextProgress = skipCase(track, progress);
    saveProgress(track, nextProgress);
    setProgress(nextProgress);
    setLastResult(null);
    setUpCase(track, nextProgress);
  }, [track, progress, setUpCase]);

  return {
    track,
    phase,
    progress,
    lastResult,
    start,
    stop,
    giveUp,
    skip,
  };
}

export type AlgorithmTraining = ReturnType<typeof useAlgorithmTraining>;
