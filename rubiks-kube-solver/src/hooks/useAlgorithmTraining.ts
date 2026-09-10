import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlgorithmCase, TrainingTrack } from '../cube/algorithms';
import {
  currentCase,
  emptyProgress,
  isTrackComplete,
  loadProgress,
  recordAttempt,
  saveProgress,
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
  | { kind: 'solved'; algCase: AlgorithmCase }
  | { kind: 'demonstrating'; algCase: AlgorithmCase }
  | { kind: 'track-complete' };

// How long the cube sits solved (celebration showing) before the next case's
// setup animation starts - without this, the reset+setup for the next case
// fires the instant the cube is solved, so it visibly "un-solves" itself
// right in front of the user, reading as a bug rather than progress.
export const SOLVED_PAUSE_MS = 1200;

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

  // First-time users must complete the notation lesson before either real
  // training track - starting "beginner"/"oll-pll-2look" redirects to
  // "notation" until it's been mastered once. "notation" itself is never
  // gated, so it's always directly reachable (including to revisit later).
  const start = useCallback(
    (t: TrainingTrack) => {
      const target = t !== 'notation' && !isTrackComplete('notation', loadProgress('notation')) ? 'notation' : t;
      const p = loadProgress(target);
      setTrack(target);
      setProgress(p);
      setLastResult(null);
      setUpCase(target, p);
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

  // Solved while timing -> record the attempt, persist, and hold on the
  // solved cube for a beat (see SOLVED_PAUSE_MS) before advancing.
  useEffect(() => {
    if (phase.kind !== 'timing') return;
    if (controller.facelets !== SOLVED_STATE) return;
    if (!track || !progress) return;
    const timeMs = Date.now() - phase.startedAt;
    const nextProgress = recordAttempt(track, progress, phase.algCase.id, true, timeMs);
    saveProgress(track, nextProgress);
    setProgress(nextProgress);
    setLastResult({ timeMs });
    setPhase({ kind: 'solved', algCase: phase.algCase });
  }, [phase, controller.facelets, track, progress]);

  // After the pause, advance to the next attempt (same case again, or the
  // next one if the streak just hit mastery - setUpCase/currentCase already
  // resolve that from the persisted progress set above).
  useEffect(() => {
    if (phase.kind !== 'solved') return;
    if (!track || !progress) return;
    const timer = setTimeout(() => setUpCase(track, progress), SOLVED_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase, track, progress, setUpCase]);

  // "Vis løsning" must let the demo animation actually play before setting
  // up the next attempt — calling setUpCase right away would call
  // controller.reset() and wipe the just-enqueued demo moves before they
  // ever animate. So this only enqueues the demo and marks 'demonstrating';
  // the effect below advances to a fresh attempt once it's done playing.
  // Asking for help doesn't touch progress at all - it's not a failure, so
  // the streak (and every other stat) is left exactly as it was.
  const giveUp = useCallback(() => {
    if (phase.kind !== 'timing' && phase.kind !== 'ready') return;
    if (!track || !progress) return;
    const algCase = phase.algCase;
    controller.reset();
    controller.enqueue(`${algCase.setupMoves} ${algCase.solutionMoves}`);
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

  // Wipes this track's persisted progress and restarts it from the first
  // case - e.g. so a second kid sharing the same browser can start fresh.
  const resetTrack = useCallback(() => {
    if (!track) return;
    const fresh = emptyProgress();
    saveProgress(track, fresh);
    setProgress(fresh);
    setLastResult(null);
    setUpCase(track, fresh);
  }, [track, setUpCase]);

  return {
    track,
    phase,
    progress,
    lastResult,
    start,
    stop,
    giveUp,
    skip,
    resetTrack,
  };
}

export type AlgorithmTraining = ReturnType<typeof useAlgorithmTraining>;
