import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlgorithmCase } from '../cube/algorithms';
import { SOLVED_PAUSE_MS } from './useAlgorithmTraining';
import {
  advanceJourney,
  currentJourneyCase,
  emptyJourneyProgress,
  isJourneyComplete,
  loadJourneyProgress,
  saveJourneyProgress,
  skipJourneyCase,
  stageIndexForCase,
  type JourneyProgress,
} from '../cube/guidedJourney';
import { SOLVED_STATE } from '../cube/facelets';
import type { CubeController } from './useCubeController';

export type JourneyPhase =
  | { kind: 'idle' }
  | { kind: 'setting-up'; algCase: AlgorithmCase }
  | { kind: 'ready'; algCase: AlgorithmCase }
  | { kind: 'timing'; algCase: AlgorithmCase; startedAt: number }
  | { kind: 'solved'; algCase: AlgorithmCase }
  | { kind: 'demonstrating'; algCase: AlgorithmCase }
  | { kind: 'journey-complete' };

export function useGuidedJourney(controller: CubeController) {
  const [phase, setPhase] = useState<JourneyPhase>({ kind: 'idle' });
  const [progress, setProgress] = useState<JourneyProgress | null>(null);
  const [lastResult, setLastResult] = useState<{ timeMs: number } | null>(null);
  const baselineMoveCount = useRef(0);

  const setUpCase = useCallback(
    (p: JourneyProgress) => {
      if (isJourneyComplete(p)) {
        setPhase({ kind: 'journey-complete' });
        return;
      }
      const algCase = currentJourneyCase(p);
      controller.reset();
      controller.enqueue(algCase.setupMoves);
      setPhase({ kind: 'setting-up', algCase });
    },
    [controller]
  );

  const start = useCallback(() => {
    const p = loadJourneyProgress();
    setProgress(p);
    setLastResult(null);
    setUpCase(p);
  }, [setUpCase]);

  const exit = useCallback(() => {
    setProgress(null);
    setPhase({ kind: 'idle' });
    setLastResult(null);
  }, []);

  useEffect(() => {
    if (phase.kind !== 'setting-up') return;
    if (controller.isAnimating) return;
    baselineMoveCount.current = controller.moveCount;
    setPhase({ kind: 'ready', algCase: phase.algCase });
  }, [phase, controller.isAnimating, controller.moveCount]);

  useEffect(() => {
    if (phase.kind !== 'ready') return;
    if (controller.moveCount <= baselineMoveCount.current) return;
    setPhase({ kind: 'timing', algCase: phase.algCase, startedAt: Date.now() });
  }, [phase, controller.moveCount]);

  useEffect(() => {
    if (phase.kind !== 'timing') return;
    if (controller.facelets !== SOLVED_STATE) return;
    if (!progress) return;
    const timeMs = Date.now() - phase.startedAt;
    const nextProgress = advanceJourney(progress);
    saveJourneyProgress(nextProgress);
    setProgress(nextProgress);
    setLastResult({ timeMs });
    setPhase({ kind: 'solved', algCase: phase.algCase });
  }, [phase, controller.facelets, progress]);

  useEffect(() => {
    if (phase.kind !== 'solved') return;
    if (!progress) return;
    const timer = setTimeout(() => setUpCase(progress), SOLVED_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [phase, progress, setUpCase]);

  const giveUp = useCallback(() => {
    if (phase.kind !== 'timing' && phase.kind !== 'ready') return;
    if (!progress) return;
    const algCase = phase.algCase;
    controller.reset();
    controller.enqueue(`${algCase.setupMoves} ${algCase.solutionMoves}`);
    setLastResult(null);
    setPhase({ kind: 'demonstrating', algCase });
  }, [phase, progress, controller]);

  useEffect(() => {
    if (phase.kind !== 'demonstrating') return;
    if (controller.isAnimating) return;
    if (!progress) return;
    setUpCase(progress);
  }, [phase, controller.isAnimating, progress, setUpCase]);

  const skip = useCallback(() => {
    if (!progress) return;
    const nextProgress = skipJourneyCase(progress);
    saveJourneyProgress(nextProgress);
    setProgress(nextProgress);
    setLastResult(null);
    setUpCase(nextProgress);
  }, [progress, setUpCase]);

  const resetJourney = useCallback(() => {
    const fresh = emptyJourneyProgress();
    saveJourneyProgress(fresh);
    setProgress(fresh);
    setLastResult(null);
    setUpCase(fresh);
  }, [setUpCase]);

  const stageIndex = phase.kind === 'idle' ? 0 : stageIndexForCase(progress?.currentIndex ?? 0);

  return {
    active: phase.kind !== 'idle',
    phase,
    stageIndex,
    lastResult,
    start,
    exit,
    giveUp,
    skip,
    resetJourney,
  };
}

export type GuidedJourney = ReturnType<typeof useGuidedJourney>;
