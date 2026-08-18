import Cube from 'cubejs';
import { useCallback, useRef, useState } from 'react';
import { SOLVED_STATE } from '../cube/facelets';
import { parseAlgorithm, type Axis, type Move } from '../cube/moveEngine';

export interface FrameResult {
  axis: Axis;
  angle: number;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function useCubeController() {
  const cubeRef = useRef(new Cube());
  const queueRef = useRef<Move[]>([]);
  const progressRef = useRef(0);
  // Single source of truth for the frame loop: `activeMove` state below is only a
  // mirror for rendering (it lags a frame behind React's commit), so the loop must
  // never branch on it directly or it can re-commit an already-finished move.
  const activeMoveRef = useRef<Move | null>(null);

  const [facelets, setFacelets] = useState(SOLVED_STATE);
  const [moveCount, setMoveCount] = useState(0);
  const [activeMove, setActiveMove] = useState<Move | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const enqueue = useCallback((algorithm: string) => {
    const moves = parseAlgorithm(algorithm);
    queueRef.current.push(...moves);
    setQueuedCount(queueRef.current.length);
  }, []);

  const reset = useCallback(() => {
    queueRef.current = [];
    progressRef.current = 0;
    activeMoveRef.current = null;
    cubeRef.current = new Cube();
    setActiveMove(null);
    setFacelets(SOLVED_STATE);
    setMoveCount(0);
    setQueuedCount(0);
  }, []);

  const loadState = useCallback((initial: string) => {
    queueRef.current = [];
    progressRef.current = 0;
    activeMoveRef.current = null;
    cubeRef.current = Cube.fromString(initial);
    setActiveMove(null);
    setFacelets(initial);
    setMoveCount(0);
    setQueuedCount(0);
  }, []);

  // Applies one already-decided move to the logical cube and publishes the
  // resulting state. Shared by the animation-queue tick loop below and by a
  // manual drag gesture committing the move it resolved on release.
  const commitMove = useCallback((move: Move) => {
    cubeRef.current.move(move.notation);
    setFacelets(cubeRef.current.asString());
    setMoveCount((count) => count + 1);
  }, []);

  const tick = useCallback(
    (delta: number, turnsPerSecond: number): FrameResult | null => {
      if (!activeMoveRef.current) {
        const next = queueRef.current.shift();
        if (next) {
          activeMoveRef.current = next;
          progressRef.current = 0;
          setActiveMove(next);
          setQueuedCount(queueRef.current.length);
        }
        return null;
      }

      const move = activeMoveRef.current;
      progressRef.current = Math.min(1, progressRef.current + delta * turnsPerSecond);
      const eased = easeInOutQuad(progressRef.current);

      if (progressRef.current >= 1) {
        activeMoveRef.current = null;
        commitMove(move);
        setActiveMove(null);
        return { axis: move.axis, angle: move.angle };
      }

      return { axis: move.axis, angle: move.angle * eased };
    },
    [commitMove]
  );

  return {
    facelets,
    moveCount,
    activeMove,
    isAnimating: activeMove !== null || queuedCount > 0,
    enqueue,
    reset,
    tick,
    commitMove,
    loadState,
  };
}

export type CubeController = ReturnType<typeof useCubeController>;
