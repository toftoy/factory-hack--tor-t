# Algoritmetrening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a training mode where the user practices named cube algorithms on the live 3D cube — the app sets up a known case, the user solves it by dragging layers, and the app times it, checks correctness, and progresses through a fixed sequence with a 3-in-a-row unlock rule.

**Architecture:** Two new pure/testable modules under `src/cube/` (algorithm data + progression logic, both self-verifying against real move application), one new hook wiring them to the existing `useCubeController`, and one new HUD-style UI component that overlays the *existing, unmodified* 3D `<Scene>` rather than replacing it — training needs the user to keep dragging the live cube underneath the HUD, unlike the scan wizard's static-photo overlay.

**Tech Stack:** React + TypeScript + Vite + Vitest + `cubejs` (already in use throughout the project; no new dependencies).

**Spec:** `rubiks-kube-solver/docs/superpowers/specs/2026-08-18-algorithm-training-design.md`

## Global Constraints

- No new npm dependencies.
- All new pure logic lives under `src/cube/` and is unit-tested with Vitest before any UI touches it (TDD, per `test-driven-development` skill).
- Algorithm notation uses only this app's supported move set (`U D L R F B`, optionally suffixed `'` or `2`) — no slice moves (`M E S`) or whole-cube rotations (`x y z`), since `parseAlgorithm`/`MOVE_DEFS` in `src/cube/moveEngine.ts` only define the six face turns.
- Every `AlgorithmCase`'s `setupMoves` and `solutionMoves` must be verified inverses (round-trip to `SOLVED_STATE` through the app's own move application path) — enforced by an automated test, not just asserted.
- Training progress persists to `localStorage`, degrading silently (in-memory only, no error shown) if unavailable — per the spec's Feilhåndtering section.
- "Gjeldende case" per track is a stored pointer (index), never recomputed as "first unmastered case" — recomputing it would make "Hopp over" a no-op (caught during the spec's self-review).
- Norwegian UI copy (matches the rest of the app).
- Reuses the existing `<Scene>` 3D view and drag-to-turn interaction unmodified — no new 3D or pointer-handling code.

---

## Task 1: Algorithm data (`algorithms.ts`)

**Files:**
- Create: `src/cube/algorithms.ts`
- Test: `src/cube/algorithms.test.ts`

**Interfaces:**
- Consumes: `parseAlgorithm` (moveEngine.ts), `SOLVED_STATE` (facelets.ts).
- Produces: `TrainingTrack = 'beginner' | 'oll-pll-2look'`, `AlgorithmCase { id: string; track: TrainingTrack; name: string; setupMoves: string; solutionMoves: string; description: string }`, `BEGINNER_ALGORITHMS: AlgorithmCase[]`, `OLL_PLL_2LOOK_ALGORITHMS: AlgorithmCase[]`, `TRACKS: Record<TrainingTrack, AlgorithmCase[]>`.

The exact algorithms below were verified directly (not from memory alone) with a scratch script applying `setupMoves`/`solutionMoves` through `cubejs` before being written here: every one round-trips to solved, and every `setupMoves` genuinely disturbs the solved state (no accidental no-ops). Both tracks intentionally reuse Sune — real cubers do too, it's the same algorithm at both skill levels.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/algorithms.test.ts
import { describe, expect, test } from 'vitest';
import Cube from 'cubejs';
import { parseAlgorithm } from './moveEngine';
import { SOLVED_STATE } from './facelets';
import { BEGINNER_ALGORITHMS, OLL_PLL_2LOOK_ALGORITHMS, TRACKS } from './algorithms';

function applyAlgorithm(cube: InstanceType<typeof Cube>, notation: string): void {
  for (const move of parseAlgorithm(notation)) {
    cube.move(move.notation);
  }
}

describe('algorithm data', () => {
  const allCases = [...BEGINNER_ALGORITHMS, ...OLL_PLL_2LOOK_ALGORITHMS];

  test('every case has a unique id', () => {
    const ids = allCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(allCases.map((c) => [c.name, c] as const))(
    '%s: setupMoves genuinely disturbs the solved state',
    (_name, algCase) => {
      const cube = new Cube();
      applyAlgorithm(cube, algCase.setupMoves);
      expect(cube.asString()).not.toBe(SOLVED_STATE);
    }
  );

  test.each(allCases.map((c) => [c.name, c] as const))(
    '%s: setupMoves followed by solutionMoves returns to solved',
    (_name, algCase) => {
      const cube = new Cube();
      applyAlgorithm(cube, algCase.setupMoves);
      applyAlgorithm(cube, algCase.solutionMoves);
      expect(cube.asString()).toBe(SOLVED_STATE);
    }
  );

  test('TRACKS exposes both tracks with matching contents', () => {
    expect(TRACKS.beginner).toBe(BEGINNER_ALGORITHMS);
    expect(TRACKS['oll-pll-2look']).toBe(OLL_PLL_2LOOK_ALGORITHMS);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run (from `rubiks-kube-solver/`): `npm test -- algorithms`
Expected: FAIL — `Cannot find module './algorithms'`

- [ ] **Step 3: Implement**

```ts
// src/cube/algorithms.ts
export type TrainingTrack = 'beginner' | 'oll-pll-2look';

export interface AlgorithmCase {
  id: string;
  track: TrainingTrack;
  name: string;
  setupMoves: string;
  solutionMoves: string;
  description: string;
}

export const BEGINNER_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'beginner-f2l-left',
    track: 'beginner',
    name: 'F2L-kant venstre',
    setupMoves: "F U F' U' L' U' L U",
    solutionMoves: "U' L' U L U F U' F'",
    description: 'Sett inn en kant-brikke fra toppen ned i mellomlaget, til venstre.',
  },
  {
    id: 'beginner-f2l-right',
    track: 'beginner',
    name: 'F2L-kant høyre',
    setupMoves: "F' U' F U R U R' U'",
    solutionMoves: "U R U' R' U' F' U F",
    description: 'Sett inn en kant-brikke fra toppen ned i mellomlaget, til høyre.',
  },
  {
    id: 'beginner-yellow-cross',
    track: 'beginner',
    name: 'Gult kors',
    setupMoves: "F U R U' R' F'",
    solutionMoves: "F R U R' U' F'",
    description: 'Orienter kantene i toppsjiktet slik at gult kors dannes.',
  },
  {
    id: 'beginner-sune',
    track: 'beginner',
    name: 'Sune',
    setupMoves: "R U2 R' U' R U' R'",
    solutionMoves: "R U R' U R U2 R'",
    description: 'Orienter de tre siste hjørnene i toppsjiktet (ett er allerede riktig).',
  },
];

export const OLL_PLL_2LOOK_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'oll-sune',
    track: 'oll-pll-2look',
    name: 'Sune (OLL)',
    setupMoves: "R U2 R' U' R U' R'",
    solutionMoves: "R U R' U R U2 R'",
    description: 'Orienter de tre siste hjørnene i toppsjiktet.',
  },
  {
    id: 'oll-antisune',
    track: 'oll-pll-2look',
    name: 'Anti-Sune (OLL)',
    setupMoves: "R U R' U R U2 R'",
    solutionMoves: "R U2 R' U' R U' R'",
    description: 'Speilvendt Sune - orienter de tre siste hjørnene motsatt vei.',
  },
  {
    id: 'pll-t-perm',
    track: 'oll-pll-2look',
    name: 'T-perm (PLL)',
    setupMoves: "F R U' R' U R U R2 F' R U R U' R'",
    solutionMoves: "R U R' U' R' F R2 U' R' U' R U R' F'",
    description: 'Bytt om to hjørner og to kanter i toppsjiktet.',
  },
  {
    id: 'pll-ua-perm',
    track: 'oll-pll-2look',
    name: 'Ua-perm (PLL)',
    setupMoves: "R2 U R U R' U' R' U' R' U R'",
    solutionMoves: "R U' R U R U R U' R' U' R2",
    description: 'Sykle tre kanter i toppsjiktet mot klokken.',
  },
  {
    id: 'pll-ub-perm',
    track: 'oll-pll-2look',
    name: 'Ub-perm (PLL)',
    setupMoves: "R U' R U R U R U' R' U' R2",
    solutionMoves: "R2 U R U R' U' R' U' R' U R'",
    description: 'Sykle tre kanter i toppsjiktet med klokken.',
  },
];

export const TRACKS: Record<TrainingTrack, AlgorithmCase[]> = {
  beginner: BEGINNER_ALGORITHMS,
  'oll-pll-2look': OLL_PLL_2LOOK_ALGORITHMS,
};
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- algorithms`
Expected: PASS, 20 tests (1 unique-id + 9 cases × 2 checks + 1 TRACKS-contents = 20; `test.each` expands each of the 9 cases — 4 beginner + 5 oll-pll-2look — into its own named test for both the disturb-check and the round-trip-check).

- [ ] **Step 5: Commit**

```bash
git add src/cube/algorithms.ts src/cube/algorithms.test.ts
git commit -m "Add algorithm training data (beginner + 2-look OLL/PLL), self-verified"
```

---

## Task 2: Training progress logic (`trainingProgress.ts`)

**Files:**
- Create: `src/cube/trainingProgress.ts`
- Test: `src/cube/trainingProgress.test.ts`

**Interfaces:**
- Consumes: `TrainingTrack`, `AlgorithmCase`, `TRACKS` (algorithms.ts).
- Produces: `CaseStats { streak: number; attempts: number; correct: number; bestTimeMs: number | null; mastered: boolean }`, `TrackProgress { currentIndex: number; stats: Record<string, CaseStats> }`, `emptyProgress(): TrackProgress`, `loadProgress(track: TrainingTrack): TrackProgress`, `saveProgress(track: TrainingTrack, progress: TrackProgress): void`, `currentCase(track: TrainingTrack, progress: TrackProgress): AlgorithmCase`, `isTrackComplete(track: TrainingTrack, progress: TrackProgress): boolean`, `recordAttempt(track: TrainingTrack, progress: TrackProgress, caseId: string, correct: boolean, timeMs: number): TrackProgress`, `showSolution(progress: TrackProgress, caseId: string): TrackProgress`, `skipCase(track: TrainingTrack, progress: TrackProgress): TrackProgress`.

All of `recordAttempt`/`showSolution`/`skipCase`/`currentCase`/`isTrackComplete` are pure (no I/O) — only `loadProgress`/`saveProgress` touch `localStorage`. This project's Vitest runs in plain Node (see `vitest.config.ts` — no `jsdom`/browser environment configured), where `localStorage` is not a global at all, so the persistence tests below install a small in-memory stand-in before each test rather than relying on a real one.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/trainingProgress.test.ts
import { beforeEach, describe, expect, test } from 'vitest';
import { BEGINNER_ALGORITHMS } from './algorithms';
import {
  currentCase,
  emptyProgress,
  isTrackComplete,
  loadProgress,
  recordAttempt,
  saveProgress,
  showSolution,
  skipCase,
  type TrackProgress,
} from './trainingProgress';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = createMemoryStorage();
});

const track = 'beginner';
const firstId = BEGINNER_ALGORITHMS[0].id;
const secondId = BEGINNER_ALGORITHMS[1].id;

describe('currentCase / isTrackComplete', () => {
  test('starts at the first case', () => {
    expect(currentCase(track, emptyProgress())).toBe(BEGINNER_ALGORITHMS[0]);
  });

  test('is complete once the pointer reaches the end of the track', () => {
    const progress: TrackProgress = { currentIndex: BEGINNER_ALGORITHMS.length, stats: {} };
    expect(isTrackComplete(track, progress)).toBe(true);
    expect(isTrackComplete(track, emptyProgress())).toBe(false);
  });
});

describe('recordAttempt', () => {
  test('a correct attempt increases the streak and records the time', () => {
    const p1 = recordAttempt(track, emptyProgress(), firstId, true, 4200);
    expect(p1.stats[firstId]).toEqual({
      streak: 1,
      attempts: 1,
      correct: 1,
      bestTimeMs: 4200,
      mastered: false,
    });
  });

  test('an incorrect attempt resets the streak to zero', () => {
    let p = recordAttempt(track, emptyProgress(), firstId, true, 5000);
    p = recordAttempt(track, p, firstId, false, 9000);
    expect(p.stats[firstId].streak).toBe(0);
    expect(p.stats[firstId].attempts).toBe(2);
  });

  test('best time only improves, never regresses', () => {
    let p = recordAttempt(track, emptyProgress(), firstId, true, 5000);
    p = recordAttempt(track, p, firstId, true, 8000);
    expect(p.stats[firstId].bestTimeMs).toBe(5000);
  });

  test('3 correct in a row masters the case and advances the pointer', () => {
    let p = emptyProgress();
    p = recordAttempt(track, p, firstId, true, 3000);
    p = recordAttempt(track, p, firstId, true, 3000);
    expect(p.currentIndex).toBe(0);
    p = recordAttempt(track, p, firstId, true, 3000);
    expect(p.stats[firstId].mastered).toBe(true);
    expect(p.currentIndex).toBe(1);
  });

  test('a broken streak requires 3 fresh correct attempts, not 3 total correct', () => {
    let p = emptyProgress();
    p = recordAttempt(track, p, firstId, true, 3000);
    p = recordAttempt(track, p, firstId, false, 3000);
    p = recordAttempt(track, p, firstId, true, 3000);
    p = recordAttempt(track, p, firstId, true, 3000);
    expect(p.currentIndex).toBe(0);
    p = recordAttempt(track, p, firstId, true, 3000);
    expect(p.currentIndex).toBe(1);
  });

  test('mastering a case that is not the current pointer does not move the pointer', () => {
    let p: TrackProgress = { currentIndex: 0, stats: {} };
    p = recordAttempt(track, p, secondId, true, 3000);
    p = recordAttempt(track, p, secondId, true, 3000);
    p = recordAttempt(track, p, secondId, true, 3000);
    expect(p.stats[secondId].mastered).toBe(true);
    expect(p.currentIndex).toBe(0);
  });
});

describe('showSolution', () => {
  test('resets streak to zero without touching attempts/correct counts', () => {
    let p = recordAttempt(track, emptyProgress(), firstId, true, 3000);
    p = recordAttempt(track, p, firstId, true, 3000);
    p = showSolution(p, firstId);
    expect(p.stats[firstId]).toEqual({
      streak: 0,
      attempts: 2,
      correct: 2,
      bestTimeMs: 3000,
      mastered: false,
    });
  });
});

describe('skipCase', () => {
  test('advances the pointer without touching the skipped case stats', () => {
    let p = recordAttempt(track, emptyProgress(), firstId, true, 3000);
    p = skipCase(track, p);
    expect(p.currentIndex).toBe(1);
    expect(p.stats[firstId].streak).toBe(1);
  });

  test('does nothing once already past the end of the track', () => {
    const p: TrackProgress = { currentIndex: BEGINNER_ALGORITHMS.length, stats: {} };
    expect(skipCase(track, p)).toEqual(p);
  });

  test("does not undo itself: the pointer never snaps back to an earlier unmastered case", () => {
    let p = emptyProgress();
    p = skipCase(track, p);
    expect(currentCase(track, p)).toBe(BEGINNER_ALGORITHMS[1]);
    // Re-deriving "current" as "first unmastered case" here would have put
    // us right back on BEGINNER_ALGORITHMS[0] - the exact bug the spec's
    // self-review caught and this test guards against.
  });
});

describe('loadProgress / saveProgress', () => {
  test('round-trips through localStorage', () => {
    const p = recordAttempt(track, emptyProgress(), firstId, true, 4200);
    saveProgress(track, p);
    expect(loadProgress(track)).toEqual(p);
  });

  test('returns emptyProgress when nothing is stored yet', () => {
    expect(loadProgress('oll-pll-2look')).toEqual(emptyProgress());
  });

  test('falls back to emptyProgress, not a throw, when localStorage is unavailable', () => {
    (globalThis as { localStorage?: Storage }).localStorage = undefined as unknown as Storage;
    expect(() => loadProgress(track)).not.toThrow();
    expect(loadProgress(track)).toEqual(emptyProgress());
    expect(() => saveProgress(track, emptyProgress())).not.toThrow();
  });

  test('two tracks persist independently', () => {
    const p1 = recordAttempt('beginner', emptyProgress(), firstId, true, 1000);
    saveProgress('beginner', p1);
    expect(loadProgress('oll-pll-2look')).toEqual(emptyProgress());
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- trainingProgress`
Expected: FAIL — `Cannot find module './trainingProgress'`

- [ ] **Step 3: Implement**

```ts
// src/cube/trainingProgress.ts
import { TRACKS, type AlgorithmCase, type TrainingTrack } from './algorithms';

export interface CaseStats {
  streak: number;
  attempts: number;
  correct: number;
  bestTimeMs: number | null;
  mastered: boolean;
}

export interface TrackProgress {
  currentIndex: number;
  stats: Record<string, CaseStats>;
}

const STORAGE_PREFIX = 'rubiks-kube-solver:training:';
const MASTERY_STREAK = 3;

function emptyStats(): CaseStats {
  return { streak: 0, attempts: 0, correct: 0, bestTimeMs: null, mastered: false };
}

export function emptyProgress(): TrackProgress {
  return { currentIndex: 0, stats: {} };
}

export function loadProgress(track: TrainingTrack): TrackProgress {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + track);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as TrackProgress;
    if (typeof parsed.currentIndex !== 'number' || typeof parsed.stats !== 'object') {
      return emptyProgress();
    }
    return parsed;
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(track: TrainingTrack, progress: TrackProgress): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + track, JSON.stringify(progress));
  } catch {
    // localStorage unavailable (private browsing, quota, absent entirely) -
    // progress just won't persist across reloads; in-memory state the
    // caller already holds is unaffected. No error surfaced, per spec.
  }
}

function statsFor(progress: TrackProgress, caseId: string): CaseStats {
  return progress.stats[caseId] ?? emptyStats();
}

export function currentCase(track: TrainingTrack, progress: TrackProgress): AlgorithmCase {
  const cases = TRACKS[track];
  return cases[Math.min(progress.currentIndex, cases.length - 1)];
}

export function isTrackComplete(track: TrainingTrack, progress: TrackProgress): boolean {
  return progress.currentIndex >= TRACKS[track].length;
}

export function recordAttempt(
  track: TrainingTrack,
  progress: TrackProgress,
  caseId: string,
  correct: boolean,
  timeMs: number
): TrackProgress {
  const prevStats = statsFor(progress, caseId);
  const streak = correct ? prevStats.streak + 1 : 0;
  const mastered = prevStats.mastered || streak >= MASTERY_STREAK;
  const nextStats: CaseStats = {
    streak,
    attempts: prevStats.attempts + 1,
    correct: prevStats.correct + (correct ? 1 : 0),
    bestTimeMs:
      correct && (prevStats.bestTimeMs === null || timeMs < prevStats.bestTimeMs)
        ? timeMs
        : prevStats.bestTimeMs,
    mastered,
  };

  const justMastered = mastered && !prevStats.mastered;
  const cases = TRACKS[track];
  const currentIdx = Math.min(progress.currentIndex, cases.length - 1);
  const isCurrentCase = cases[currentIdx]?.id === caseId;
  const nextIndex = justMastered && isCurrentCase ? progress.currentIndex + 1 : progress.currentIndex;

  return {
    currentIndex: nextIndex,
    stats: { ...progress.stats, [caseId]: nextStats },
  };
}

export function showSolution(progress: TrackProgress, caseId: string): TrackProgress {
  const prevStats = statsFor(progress, caseId);
  return {
    ...progress,
    stats: { ...progress.stats, [caseId]: { ...prevStats, streak: 0 } },
  };
}

export function skipCase(track: TrainingTrack, progress: TrackProgress): TrackProgress {
  if (progress.currentIndex >= TRACKS[track].length) return progress;
  return { ...progress, currentIndex: progress.currentIndex + 1 };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- trainingProgress`
Expected: PASS, 15 tests. Then run the full suite: `npm test` — every test in the project should be green.

- [ ] **Step 5: Commit**

```bash
git add src/cube/trainingProgress.ts src/cube/trainingProgress.test.ts
git commit -m "Add training progress logic: streak, 3-in-a-row mastery, persistence"
```

---

## Task 3: Training state machine hook (`useAlgorithmTraining.ts`)

**Files:**
- Create: `src/hooks/useAlgorithmTraining.ts`

**Interfaces:**
- Consumes: `CubeController` (useCubeController.ts — specifically `facelets`, `moveCount`, `isAnimating`, `reset`, `enqueue`), `TrainingTrack`, `AlgorithmCase` (algorithms.ts), `TrackProgress`, `currentCase`, `isTrackComplete`, `loadProgress`, `recordAttempt`, `saveProgress`, `showSolution`, `skipCase` (trainingProgress.ts), `SOLVED_STATE` (facelets.ts).
- Produces: `useAlgorithmTraining(controller: CubeController)` hook returning training state and actions (below).

No dedicated unit test (thin React state machine over already-tested pure functions, reacting to an existing, already-tested controller) — exercised by Task 6's end-to-end test.

- [ ] **Step 1: Implement**

```ts
// src/hooks/useAlgorithmTraining.ts
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no type errors. Then run the full test suite: `npm test` — every existing test should still pass (this hook adds none of its own).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAlgorithmTraining.ts
git commit -m "Add algorithm training state machine hook"
```

---

## Task 4: Training HUD (`TrainingWizard.tsx`)

**Files:**
- Create: `src/components/TrainingWizard.tsx`

**Interfaces:**
- Consumes: `AlgorithmTraining` (useAlgorithmTraining.ts).
- Produces: `<TrainingWizard training={AlgorithmTraining} onExit={() => void} />` — a HUD-style overlay (header + footer), **not** an opaque full-screen cover. Unlike `ScanWizard` (which shows static captured photos and can safely cover the whole screen), training needs the user to keep dragging the *live* 3D cube that's already rendered underneath in `App.tsx`'s `.viewport`. The wrapping container is `pointer-events: none` so drags reach the cube; only the header/footer chrome itself is `pointer-events: auto`.

- [ ] **Step 1: Implement**

```tsx
// src/components/TrainingWizard.tsx
import { TRACKS } from '../cube/algorithms';
import type { AlgorithmTraining } from '../hooks/useAlgorithmTraining';

interface Props {
  training: AlgorithmTraining;
  onExit: () => void;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

export function TrainingWizard({ training, onExit }: Props) {
  const { phase, track, progress, lastResult, giveUp, skip } = training;

  if (phase.kind === 'idle' || !track || !progress) return null;

  if (phase.kind === 'track-complete') {
    return (
      <div className="training-hud">
        <div className="training-header">
          <span>Sporet er fullført! 🎉</span>
          <button onClick={onExit} className="scan-close">
            Avslutt
          </button>
        </div>
      </div>
    );
  }

  const algCase = phase.algCase;
  const stats = progress.stats[algCase.id];
  const caseNumber = progress.currentIndex + 1;

  return (
    <div className="training-hud">
      <div className="training-header">
        <div className="training-case-info">
          <span className="training-case-number">
            Case {caseNumber}/{TRACKS[track].length}
          </span>
          <span className="training-case-name">{algCase.name}</span>
        </div>
        <button onClick={onExit} className="scan-close">
          Avslutt
        </button>
      </div>

      <p className="training-description">{algCase.description}</p>
      <p className="training-hint">{algCase.solutionMoves}</p>

      {phase.kind === 'timing' && <p className="training-timing">Tar tid…</p>}
      {phase.kind === 'demonstrating' && <p className="training-timing">Viser løsning…</p>}
      {lastResult && phase.kind === 'setting-up' && (
        <p className="training-last-result">Riktig! {formatTime(lastResult.timeMs)}</p>
      )}

      <div className="training-footer">
        <div className="training-stats">
          <span>Streak: {stats?.streak ?? 0}/3</span>
          {stats?.bestTimeMs != null && <span>Beste: {formatTime(stats.bestTimeMs)}</span>}
        </div>
        <div className="training-actions">
          <button onClick={giveUp} disabled={phase.kind === 'setting-up' || phase.kind === 'demonstrating'}>
            Vis løsning
          </button>
          <button onClick={skip} disabled={phase.kind === 'demonstrating'}>
            Hopp over
          </button>
        </div>
      </div>
    </div>
  );
}
```

Add to `src/index.css`:

```css
.training-hud {
  position: fixed;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  gap: 12px;
}

.training-header,
.training-footer {
  pointer-events: auto;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.training-case-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.training-case-number {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.training-case-name {
  font-size: 1.05rem;
  font-weight: 600;
}

.training-description,
.training-hint,
.training-timing,
.training-last-result {
  pointer-events: none;
  align-self: flex-start;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 6px 12px;
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.training-hint {
  font-family: monospace;
  color: var(--text);
}

.training-stats {
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.training-actions {
  display: flex;
  gap: 8px;
}
```

Note: `.training-description`/`.training-hint`/`.training-timing`/`.training-last-result` are individually `pointer-events: none` (inheriting from `.training-hud`) so they never block drags either — only `.training-header`/`.training-footer`'s solid chrome captures pointer events, since those are the only parts with real buttons.

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrainingWizard.tsx src/index.css
git commit -m "Add training HUD overlay (pointer-events pass through to the live cube)"
```

---

## Task 5: Wire into `ControlPanel` and `App`

**Files:**
- Modify: `src/components/ControlPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAlgorithmTraining` (Task 3), `TrainingWizard` (Task 4), `TrainingTrack` (algorithms.ts).

- [ ] **Step 1: Add track-picker buttons to `ControlPanel`**

In `src/components/ControlPanel.tsx`, add an `onTrain: (track: TrainingTrack) => void` prop and two buttons in a new row (training track choice is a separate concern from the existing Bland/Løs/Nullstill/Skann row, so it gets its own row rather than crowding the existing one):

```tsx
import type { TrainingTrack } from '../cube/algorithms';
```

```tsx
interface Props {
  onScramble: () => void;
  onSolve: () => void;
  onReset: () => void;
  onScan: () => void;
  onTrain: (track: TrainingTrack) => void;
  isAnimating: boolean;
  // ...unchanged props below
}
```

```tsx
      <div className="button-row">
        <button onClick={onScramble} disabled={isAnimating}>
          Bland
        </button>
        <button onClick={onSolve} disabled={solveDisabled}>
          {solveLabel}
        </button>
        <button onClick={onReset} disabled={isAnimating}>
          Nullstill
        </button>
        <button onClick={onScan} disabled={isAnimating}>
          Skann
        </button>
      </div>

      <div className="button-row">
        <button onClick={() => onTrain('beginner')} disabled={isAnimating}>
          Tren: Nybegynner
        </button>
        <button onClick={() => onTrain('oll-pll-2look')} disabled={isAnimating}>
          Tren: 2-look OLL/PLL
        </button>
      </div>
```

- [ ] **Step 2: Wire the training hook into `App.tsx`**

```tsx
// src/App.tsx
import { useCallback, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Scene } from './components/Scene';
import { ScanReview } from './components/ScanReview';
import { ScanWizard } from './components/ScanWizard';
import { TrainingWizard } from './components/TrainingWizard';
import { SOLVED_STATE } from './cube/facelets';
import { generateScramble } from './cube/moveEngine';
import { useSolver } from './cube/useSolver';
import { useCubeController } from './hooks/useCubeController';
import { useCubeScan } from './hooks/useCubeScan';
import { useAlgorithmTraining } from './hooks/useAlgorithmTraining';

export default function App() {
  const controller = useCubeController();
  const { status: solverStatus, solve } = useSolver();
  const scan = useCubeScan();
  const training = useAlgorithmTraining(controller);
  const [speed, setSpeed] = useState(2.2);
  const [lastScramble, setLastScramble] = useState('');
  const [lastSolution, setLastSolution] = useState('');

  const clearLogs = useCallback(() => {
    setLastScramble('');
    setLastSolution('');
  }, []);

  const handleScramble = useCallback(() => {
    const algorithm = generateScramble(20);
    setLastScramble(algorithm);
    setLastSolution('');
    controller.enqueue(algorithm);
  }, [controller]);

  const handleSolve = useCallback(async () => {
    if (controller.isAnimating) return;
    const solution = await solve(controller.facelets);
    setLastSolution(solution);
    controller.enqueue(solution);
  }, [controller, solve]);

  const handleReset = useCallback(() => {
    controller.reset();
    clearLogs();
  }, [controller, clearLogs]);

  const handleUseScan = useCallback(
    (facelets: string) => {
      controller.loadState(facelets);
      clearLogs();
      scan.finish();
    },
    [controller, scan, clearLogs]
  );

  const isSolved = controller.facelets === SOLVED_STATE;

  return (
    <div className="app">
      <div className="viewport">
        <Scene controller={controller} turnsPerSecond={speed} />
      </div>
      <ControlPanel
        onScramble={handleScramble}
        onSolve={handleSolve}
        onReset={handleReset}
        onScan={scan.start}
        onTrain={training.start}
        isAnimating={controller.isAnimating}
        isSolved={isSolved}
        solverStatus={solverStatus}
        moveCount={controller.moveCount}
        speed={speed}
        onSpeedChange={setSpeed}
        lastScramble={lastScramble}
        lastSolution={lastSolution}
      />
      {(scan.phase.kind === 'capturing' || scan.phase.kind === 'capturingD') && (
        <ScanWizard scan={scan} onCancel={scan.cancel} />
      )}
      {scan.phase.kind === 'review' && (
        <ScanReview
          result={scan.phase.result}
          capturedFacelets={scan.capturedFacelets}
          onUse={handleUseScan}
          onCancel={scan.cancel}
        />
      )}
      {training.track && <TrainingWizard training={training} onExit={training.stop} />}
    </div>
  );
}
```

This also folds the pre-existing `setLastScramble('')` + `setLastSolution('')` duplication (flagged as a Minor finding in the earlier whole-branch review) into one `clearLogs()` helper while touching this file anyway — small, in scope, not a separate cleanup pass.

- [ ] **Step 3: Verify it typechecks and builds**

Run: `npx tsc -b && npm run build`
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/ControlPanel.tsx src/App.tsx
git commit -m "Wire algorithm training into ControlPanel and App"
```

---

## Task 6: End-to-end verification, README, push

**Files:**
- Create: a temporary Playwright script (not committed — same pattern used for every manual verification pass so far in this project; lives under the session's scratchpad, not the repo).
- Modify: `rubiks-kube-solver/README.md`

**Interfaces:** none new — this task only verifies what Tasks 1-5 built.

- [ ] **Step 1: Run the full automated suite**

```bash
cd rubiks-kube-solver
npx tsc -b
npm test
npx oxlint src
npm run build
```

Expected: all green (per `verification-before-completion` — do not report this task done without pasting/checking this output).

- [ ] **Step 2: Manual/Playwright pass for the parts automated tests can't reach**

The algorithm data's correctness is already proven by Task 1's round-trip test, and the progression logic by Task 2's unit tests. What's *not* yet proven end-to-end is the actual UI: click "Tren: Nybegynner" → case sets up → drag the cube yourself to solve it → timer records → streak increases → after 3 corrects the case advances → "Vis løsning"/"Hopp over" work → "Avslutt" returns to the normal view with Bland/Løs still working. Write a throwaway Playwright script that:

1. Starts the dev server (`npm run dev`).
2. Clicks "Tren: Nybegynner".
3. Reads the first case's `algCase.solutionMoves` off the rendered `.training-hint` text (or, more robustly, drive it by re-computing it from `src/cube/algorithms.ts` directly in the script rather than scraping the DOM).
4. Performs that exact algorithm's moves programmatically via `page.evaluate` calling into the same synthetic-pointer-drag pattern used by the existing drag-feature Playwright scripts in this project's history (a sequence of `pointerdown`/`pointermove`/`pointerup` on the relevant cubie face, matching each move's axis/layer/direction) — do this 3 times in a row for the first case and confirm the streak reaches 3 and the case advances (assert the rendered case name/number changes).
5. On a fresh case, click "Vis løsning" and confirm the cube animates to solved and the streak display resets to 0.
6. Click "Hopp over" and confirm the case number advances without the streak having reached 3.
7. Click "Avslutt" and confirm `.training-hud` unmounts, then confirm `Bland` and `Løs` still work on the underlying cube (reuse the exact polling pattern from the earlier drag-feature/scan-feature Playwright scripts in this project's history).

Fix anything this surfaces before moving on — in particular, verify the HUD's `pointer-events: none` container genuinely lets drags reach the cube underneath (this is the one part of Task 4 that can only be confirmed by actually dragging in a real rendered page, not by reading the CSS).

- [ ] **Step 3: Update the README**

Add a bullet to the Funksjoner list and an Arkitektur entry, following the existing style (see the camera-scanning bullet added previously):

```markdown
- **Tren på algoritmer**: øv på navngitte kube-algoritmer (nybegynnermetode
  eller 2-look OLL/PLL) direkte på 3D-kuben — appen setter opp et kjent
  case, du løser det selv ved å dra i lag, og appen tar tid og styrer
  fremgang med et 3-på-rad-krav for å låse opp neste algoritme.
```

```markdown
- `src/cube/algorithms.ts`, `trainingProgress.ts` – algoritme-data
  (nybegynner + 2-look OLL/PLL, selv-verifisert til å rundtrippe til løst
  tilstand) og ren fremgangslogikk (streak, mestring, lagret peker) for
  algoritmetrening. `src/hooks/useAlgorithmTraining.ts` er
  tilstandsmaskinen; `src/components/TrainingWizard.tsx` er HUD-en som
  ligger over den eksisterende 3D-visningen uten å blokkere den.
```

- [ ] **Step 4: Final commit and push**

```bash
git add rubiks-kube-solver/README.md
git commit -m "Update README for algorithm training mode"
git push origin claude/rubiks-kube-solver-mmt9s3
```

---

## Self-Review Notes

- **Spec coverage:** two tracks with a 3-in-a-row unlock (Tasks 1-2) ✓,
  timer starting on first move / stopping on solved (Task 3) ✓, "Vis
  løsning" resets streak without counting as an attempt (Task 2's
  `showSolution` + Task 3's `giveUp`) ✓, "Hopp over" advances the pointer
  without touching the skipped case's stats, and does *not* let the
  pointer snap back to an earlier unmastered case (Task 2, explicitly
  tested) ✓, `localStorage` persistence with silent fallback (Task 2) ✓,
  reuses the existing 3D view/drag interaction unmodified, via a
  pointer-events-passthrough HUD rather than an opaque overlay (Task 4) ✓,
  algorithm-data self-verification against real move application (Task 1)
  ✓, wiring into the existing app without disturbing Bland/Løs/Nullstill/
  Skann (Task 5) ✓, end-to-end verification (Task 6) ✓.
- **Type consistency checked:** `TrainingTrack` (algorithms.ts) used
  identically in `trainingProgress.ts`, `useAlgorithmTraining.ts`,
  `ControlPanel.tsx`. `AlgorithmCase` shape identical everywhere it's
  produced (algorithms.ts) and consumed (trainingProgress.ts,
  useAlgorithmTraining.ts, TrainingWizard.tsx). `TrackProgress`/`CaseStats`
  shapes match between `trainingProgress.ts`'s producers and
  `useAlgorithmTraining.ts`/`TrainingWizard.tsx`'s consumers.
- **Known risk flagged explicitly rather than hidden:** the HUD's
  `pointer-events: none`/`auto` split (Task 4) is the one place a CSS
  mistake could silently break the whole feature (drags not reaching the
  cube, or the HUD swallowing them) without any test catching it except a
  real rendered-page check — Task 6's Step 2 explicitly calls this out
  as the thing to verify hardest, not just eyeball.
- **Bug caught during this self-review, not left for an implementer to
  find:** the first draft of `giveUp` (Task 3) called `setUpCase`
  immediately after enqueueing the demo animation. Since `setUpCase` calls
  `controller.reset()`, which synchronously clears the move queue, this
  would have wiped the just-enqueued demo before a single frame of it
  played — "Vis løsning" would have silently done nothing visible. Fixed
  by adding a `'demonstrating'` phase that waits for
  `controller.isAnimating` to actually go false before advancing to the
  next attempt, mirroring the same pattern already used for the
  `'setting-up'` → `'ready'` transition.
