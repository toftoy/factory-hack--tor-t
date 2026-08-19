# Guided Solve Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single continuous "learn to solve" journey that chains all seven beginner-method stages (cross, first-layer corners, F2L, yellow cross, orient corners, place corners, place edges) in order, with one progress bar and one finish celebration, fronted by a redesigned entry screen whose primary action is starting this journey.

**Architecture:** Two new curated `AlgorithmCase` sets (cross + corners) fill the only real content gap in the existing algorithm-training data. A new pure module (`guidedJourney.ts`) defines the fixed 7-stage/10-case sequence and its (very simple, one-shot-per-case) progress persistence, mirroring `trainingProgress.ts`'s already-proven pattern. A new hook (`useGuidedJourney.ts`) mirrors `useAlgorithmTraining.ts`'s state machine but advances after one correct solve instead of a 3-streak mastery rule. A new component (`GuidedJourney.tsx`) is a sibling overlay to `TrainingWizard.tsx`, reusing its CSS classes. `ControlPanel.tsx` gets a redesign: one primary CTA up top, the seven existing buttons demoted into a collapsible "For viderekomne" section. Nothing about the three existing training tracks' code changes.

**Tech Stack:** React + TypeScript + Vite + Vitest + `cubejs` (already in use; no new dependencies).

**Spec:** `rubiks-kube-solver/docs/superpowers/specs/2026-08-19-guided-solve-journey-design.md`

## Global Constraints

- No new npm dependencies.
- Algorithm notation uses only `U D L R F B`, optionally suffixed `'` or `2` — no slice/whole-cube-rotation moves (`parseAlgorithm`/`MOVE_DEFS` don't define them).
- Every new `AlgorithmCase`'s `setupMoves`/`solutionMoves` must be verified inverses (round-trip to `SOLVED_STATE`), enforced by an automated test — same pattern as existing content in `algorithms.test.ts`.
- The guided journey is a **curated sequence of canned cases**, not a general arbitrary-scramble solver-guide — each case still resets to solved and applies its own fixed `setupMoves`, exactly like the existing engine (see spec's "Avviste alternativer"). Do not attempt to chain cases onto one physically continuous cube state.
- Guided-journey progress is a single stored pointer (`currentIndex` into the flat 10-case sequence), advanced by exactly one correct solve or one skip — never a 3-streak mastery rule (that model belongs to the existing practice tracks only).
- `localStorage` unavailable/corrupt degrades silently to in-memory-only progress, no error shown — same as `trainingProgress.ts`.
- Norwegian UI copy, matching the rest of the app.
- Reuses the existing `<Scene>` 3D view, drag-to-turn interaction, and `training-*` CSS visual language unmodified/as-is — no new 3D or pointer-handling code, no new color palette.
- The guided journey requires the notation track completed first, via the same two-click precedent already used for `beginner`/`oll-pll-2look`: if notation isn't done, the entry CTA starts the notation track instead; the user presses the CTA again afterward to actually enter the journey. No new cross-hook auto-chaining.

---

## Task 1: Cross + corner algorithm data

**Files:**
- Modify: `src/cube/algorithms.ts`
- Modify: `src/cube/algorithms.test.ts`

**Interfaces:**
- Consumes: nothing new (same `parseAlgorithm`/`SOLVED_STATE` the file already uses).
- Produces: `TrainingTrack` widened to include `'guided-basics'`; `CROSS_ALGORITHMS: AlgorithmCase[]` (2 cases); `CORNER_ALGORITHMS: AlgorithmCase[]` (2 cases); `TRACKS` gains a `'guided-basics'` entry (`[...CROSS_ALGORITHMS, ...CORNER_ALGORITHMS]`) so `Record<TrainingTrack, AlgorithmCase[]>` stays exhaustive. These two new arrays are consumed directly by Task 2's `guidedJourney.ts` (not through `TRACKS`) — the `TRACKS` entry exists only to satisfy the type and is not wired to any UI button.

The move pairs below are each other's group-theoretic inverse (reverse the move order, invert each move: bare↔`'`, `2` is self-inverse) — verified by the test in Step 1, not just asserted here.

- [ ] **Step 1: Extend the failing test first**

Add to `src/cube/algorithms.test.ts` (replacing the existing import line and `allCases` line):

```ts
import {
  BEGINNER_ALGORITHMS,
  CORNER_ALGORITHMS,
  CROSS_ALGORITHMS,
  NOTATION_ALGORITHMS,
  OLL_PLL_2LOOK_ALGORITHMS,
  TRACKS,
} from './algorithms';
```

```ts
  const allCases = [
    ...NOTATION_ALGORITHMS,
    ...BEGINNER_ALGORITHMS,
    ...OLL_PLL_2LOOK_ALGORITHMS,
    ...CROSS_ALGORITHMS,
    ...CORNER_ALGORITHMS,
  ];
```

And add this test alongside the existing `TRACKS` test:

```ts
  test('TRACKS exposes guided-basics with cross + corner cases', () => {
    expect(TRACKS['guided-basics']).toEqual([...CROSS_ALGORITHMS, ...CORNER_ALGORITHMS]);
  });
```

- [ ] **Step 2: Run and confirm it fails**

Run (from `rubiks-kube-solver/`): `npm test -- algorithms`
Expected: FAIL — `Cannot find module` / `CROSS_ALGORITHMS is not exported`

- [ ] **Step 3: Implement**

In `src/cube/algorithms.ts`, change the track type:

```ts
export type TrainingTrack = 'notation' | 'beginner' | 'oll-pll-2look' | 'guided-basics';
```

Add after `NOTATION_ALGORITHMS` (before `BEGINNER_ALGORITHMS`):

```ts
export const CROSS_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'cross-flip-in-place',
    track: 'guided-basics',
    name: 'Kors: vend kanten',
    setupMoves: 'F2',
    solutionMoves: 'F2',
    description:
      'Kant-brikken er rett over plassen sin, men vender feil vei - ett trekk vender den riktig og setter den på plass.',
  },
  {
    id: 'cross-free-then-place',
    track: 'guided-basics',
    name: 'Kors: løsne og sett på plass',
    setupMoves: "R F'",
    solutionMoves: "F R'",
    description: 'Kant-brikken sitter fast et annet sted. Løsne den først, så setter den seg rett på plass.',
  },
];

export const CORNER_ALGORITHMS: AlgorithmCase[] = [
  {
    id: 'corner-pocket',
    track: 'guided-basics',
    name: 'Hjørne: lomme-trikset',
    setupMoves: "R U R'",
    solutionMoves: "R U' R'",
    description: 'Løft hjørnet ut av lomma, vend det riktig vei, og sett laget tilbake.',
  },
  {
    id: 'corner-from-the-side',
    track: 'guided-basics',
    name: 'Hjørne: fra siden',
    setupMoves: "F' D F",
    solutionMoves: "F' D' F",
    description: 'Hjørnet sitter fast på siden. Dette trikset drar det ut og setter det ned riktig vei.',
  },
];
```

Update the `TRACKS` export at the bottom of the file:

```ts
export const TRACKS: Record<TrainingTrack, AlgorithmCase[]> = {
  notation: NOTATION_ALGORITHMS,
  beginner: BEGINNER_ALGORITHMS,
  'oll-pll-2look': OLL_PLL_2LOOK_ALGORITHMS,
  'guided-basics': [...CROSS_ALGORITHMS, ...CORNER_ALGORITHMS],
};
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- algorithms`
Expected: PASS, all cases (including the 4 new ones) round-trip to `SOLVED_STATE`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors (the widened `TrainingTrack` union must not break `ControlPanel.tsx`'s existing `onTrain: (track: TrainingTrack) => void` prop — it won't, since adding a union member is backward-compatible with a function parameter type).

- [ ] **Step 6: Commit**

```bash
git add src/cube/algorithms.ts src/cube/algorithms.test.ts
git commit -m "Add cross and corner algorithm data for the guided solve journey"
```

---

## Task 2: Guided journey stage sequence + progress logic

**Files:**
- Create: `src/cube/guidedJourney.ts`
- Create: `src/cube/guidedJourney.test.ts`

**Interfaces:**
- Consumes: `AlgorithmCase`, `BEGINNER_ALGORITHMS`, `CORNER_ALGORITHMS`, `CROSS_ALGORITHMS` from `./algorithms` (Task 1).
- Produces: `GuidedStage { id: string; title: string; icon: string; cases: AlgorithmCase[] }`; `GUIDED_STAGES: GuidedStage[]` (7 stages, 10 cases total); `GUIDED_JOURNEY_CASES: AlgorithmCase[]` (flattened, length 10); `stageIndexForCase(flatIndex: number): number`; `JourneyProgress { currentIndex: number }`; `emptyJourneyProgress(): JourneyProgress`; `loadJourneyProgress(): JourneyProgress`; `saveJourneyProgress(progress: JourneyProgress): void`; `isJourneyComplete(progress: JourneyProgress): boolean`; `currentJourneyCase(progress: JourneyProgress): AlgorithmCase`; `advanceJourney(progress: JourneyProgress): JourneyProgress`; `skipJourneyCase(progress: JourneyProgress): JourneyProgress`. Consumed by Task 3's `useGuidedJourney.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/cube/guidedJourney.test.ts
import { beforeEach, describe, expect, test } from 'vitest';
import { BEGINNER_ALGORITHMS, CORNER_ALGORITHMS, CROSS_ALGORITHMS } from './algorithms';
import {
  GUIDED_JOURNEY_CASES,
  GUIDED_STAGES,
  advanceJourney,
  currentJourneyCase,
  emptyJourneyProgress,
  isJourneyComplete,
  loadJourneyProgress,
  saveJourneyProgress,
  skipJourneyCase,
  stageIndexForCase,
  type JourneyProgress,
} from './guidedJourney';

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

describe('GUIDED_STAGES / GUIDED_JOURNEY_CASES', () => {
  test('has exactly 7 stages', () => {
    expect(GUIDED_STAGES).toHaveLength(7);
  });

  test('flattens to 10 cases: 2 cross + 2 corner + 2 f2l + 1 each for the last 4 stages', () => {
    expect(GUIDED_JOURNEY_CASES).toHaveLength(10);
    expect(GUIDED_JOURNEY_CASES.slice(0, 2)).toEqual(CROSS_ALGORITHMS);
    expect(GUIDED_JOURNEY_CASES.slice(2, 4)).toEqual(CORNER_ALGORITHMS);
    expect(GUIDED_JOURNEY_CASES.slice(4, 6)).toEqual([BEGINNER_ALGORITHMS[0], BEGINNER_ALGORITHMS[1]]);
    expect(GUIDED_JOURNEY_CASES[6]).toBe(BEGINNER_ALGORITHMS[2]);
    expect(GUIDED_JOURNEY_CASES[7]).toBe(BEGINNER_ALGORITHMS[3]);
    expect(GUIDED_JOURNEY_CASES[8]).toBe(BEGINNER_ALGORITHMS[4]);
    expect(GUIDED_JOURNEY_CASES[9]).toBe(BEGINNER_ALGORITHMS[5]);
  });

  test('every case id in the journey is unique', () => {
    const ids = GUIDED_JOURNEY_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('stageIndexForCase', () => {
  test('maps flat indices to their stage', () => {
    expect(stageIndexForCase(0)).toBe(0); // cross case 1
    expect(stageIndexForCase(1)).toBe(0); // cross case 2
    expect(stageIndexForCase(2)).toBe(1); // corner case 1
    expect(stageIndexForCase(4)).toBe(2); // f2l case 1
    expect(stageIndexForCase(9)).toBe(6); // last stage, last case
  });

  test('an out-of-range index (journey complete) resolves to the last stage', () => {
    expect(stageIndexForCase(10)).toBe(6);
  });
});

describe('journey progress', () => {
  const firstCase = GUIDED_JOURNEY_CASES[0];

  test('starts at the first case, not complete', () => {
    const p = emptyJourneyProgress();
    expect(currentJourneyCase(p)).toBe(firstCase);
    expect(isJourneyComplete(p)).toBe(false);
  });

  test('advanceJourney moves the pointer forward by one', () => {
    let p = emptyJourneyProgress();
    p = advanceJourney(p);
    expect(currentJourneyCase(p)).toBe(GUIDED_JOURNEY_CASES[1]);
  });

  test('skipJourneyCase behaves the same as advanceJourney', () => {
    const p: JourneyProgress = { currentIndex: 3 };
    expect(skipJourneyCase(p)).toEqual(advanceJourney(p));
  });

  test('is complete once the pointer reaches the end', () => {
    const p: JourneyProgress = { currentIndex: GUIDED_JOURNEY_CASES.length };
    expect(isJourneyComplete(p)).toBe(true);
  });

  test('advancing past the end does not overshoot the length', () => {
    let p: JourneyProgress = { currentIndex: GUIDED_JOURNEY_CASES.length - 1 };
    p = advanceJourney(p);
    p = advanceJourney(p);
    expect(p.currentIndex).toBe(GUIDED_JOURNEY_CASES.length);
  });

  test('round-trips through localStorage', () => {
    const p = advanceJourney(emptyJourneyProgress());
    saveJourneyProgress(p);
    expect(loadJourneyProgress()).toEqual(p);
  });

  test('falls back to emptyJourneyProgress, not a throw, when localStorage is unavailable', () => {
    (globalThis as { localStorage?: Storage }).localStorage = undefined as unknown as Storage;
    expect(() => loadJourneyProgress()).not.toThrow();
    expect(loadJourneyProgress()).toEqual(emptyJourneyProgress());
    expect(() => saveJourneyProgress(emptyJourneyProgress())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npm test -- guidedJourney`
Expected: FAIL — `Cannot find module './guidedJourney'`

- [ ] **Step 3: Implement**

```ts
// src/cube/guidedJourney.ts
import { BEGINNER_ALGORITHMS, CORNER_ALGORITHMS, CROSS_ALGORITHMS, type AlgorithmCase } from './algorithms';

export interface GuidedStage {
  id: string;
  title: string;
  icon: string;
  cases: AlgorithmCase[];
}

function beginnerCase(id: string): AlgorithmCase {
  const found = BEGINNER_ALGORITHMS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown beginner case: ${id}`);
  return found;
}

export const GUIDED_STAGES: GuidedStage[] = [
  { id: 'cross', title: 'Kors', icon: '➕', cases: CROSS_ALGORITHMS },
  { id: 'corners', title: 'Hjørner', icon: '🔺', cases: CORNER_ALGORITHMS },
  {
    id: 'f2l',
    title: 'Mellomlag',
    icon: '🧩',
    cases: [beginnerCase('beginner-f2l-left'), beginnerCase('beginner-f2l-right')],
  },
  { id: 'yellow-cross', title: 'Gult kors', icon: '✝️', cases: [beginnerCase('beginner-yellow-cross')] },
  { id: 'orient-corners', title: 'Vend hjørner', icon: '🔄', cases: [beginnerCase('beginner-sune')] },
  { id: 'place-corners', title: 'Plasser hjørner', icon: '📍', cases: [beginnerCase('beginner-corner-perm')] },
  { id: 'place-edges', title: 'Plasser kanter', icon: '🏁', cases: [beginnerCase('beginner-edge-perm')] },
];

export const GUIDED_JOURNEY_CASES: AlgorithmCase[] = GUIDED_STAGES.flatMap((stage) => stage.cases);

export function stageIndexForCase(flatIndex: number): number {
  let cursor = 0;
  for (let i = 0; i < GUIDED_STAGES.length; i++) {
    cursor += GUIDED_STAGES[i].cases.length;
    if (flatIndex < cursor) return i;
  }
  return GUIDED_STAGES.length - 1;
}

export interface JourneyProgress {
  currentIndex: number;
}

const STORAGE_KEY = 'rubiks-kube-solver:guided-journey';

export function emptyJourneyProgress(): JourneyProgress {
  return { currentIndex: 0 };
}

export function loadJourneyProgress(): JourneyProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyJourneyProgress();
    const parsed = JSON.parse(raw) as JourneyProgress;
    if (typeof parsed.currentIndex !== 'number') return emptyJourneyProgress();
    return parsed;
  } catch {
    return emptyJourneyProgress();
  }
}

export function saveJourneyProgress(progress: JourneyProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage unavailable - progress just won't persist across reloads.
  }
}

export function isJourneyComplete(progress: JourneyProgress): boolean {
  return progress.currentIndex >= GUIDED_JOURNEY_CASES.length;
}

export function currentJourneyCase(progress: JourneyProgress): AlgorithmCase {
  return GUIDED_JOURNEY_CASES[Math.min(progress.currentIndex, GUIDED_JOURNEY_CASES.length - 1)];
}

export function advanceJourney(progress: JourneyProgress): JourneyProgress {
  return { currentIndex: Math.min(progress.currentIndex + 1, GUIDED_JOURNEY_CASES.length) };
}

export function skipJourneyCase(progress: JourneyProgress): JourneyProgress {
  return advanceJourney(progress);
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test -- guidedJourney`
Expected: PASS.

- [ ] **Step 5: Typecheck + full test suite**

Run: `npx tsc -b && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/cube/guidedJourney.ts src/cube/guidedJourney.test.ts
git commit -m "Add guided journey stage sequence and progress logic"
```

---

## Task 3: `useGuidedJourney` hook

**Files:**
- Create: `src/hooks/useGuidedJourney.ts`

**Interfaces:**
- Consumes: `CubeController` from `./useCubeController` (same shape `useAlgorithmTraining` consumes: `reset()`, `enqueue(alg: string)`, `isAnimating`, `moveCount`, `facelets`); `SOLVED_STATE` from `../cube/facelets`; everything from Task 2's `../cube/guidedJourney`.
- Produces: `JourneyPhase` union (`idle | setting-up | ready | timing | solved | demonstrating | journey-complete`, each carrying `algCase` except `idle`/`journey-complete`); `useGuidedJourney(controller: CubeController)` returning `{ active: boolean; phase: JourneyPhase; stageIndex: number; lastResult: { timeMs: number } | null; start(): void; exit(): void; giveUp(): void; skip(): void; resetJourney(): void }`. Consumed by Task 4's `GuidedJourney.tsx` and Task 5's `App.tsx`.

This mirrors `useAlgorithmTraining.ts`'s effect structure closely (same `setUpCase`/ready/timing/solved/demonstrating cycle, same `SOLVED_PAUSE_MS` pause-before-advancing pattern) but swaps its 3-streak mastery/track-selection logic for the journey's one-shot advance and has no track parameter. No dedicated unit test for this task, per the same precedent as `useAlgorithmTraining.ts` (thin state layer over already-tested pure logic; covered by Task 6's end-to-end check) — but it must typecheck cleanly and is manually smoke-tested via the dev server before Task 4 builds UI on top of it.

- [ ] **Step 1: Implement**

```ts
// src/hooks/useGuidedJourney.ts
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
```

- [ ] **Step 2: Typecheck + full test suite**

Run: `npx tsc -b && npm test`
Expected: no errors, all tests still pass (this task adds no new tests of its own).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGuidedJourney.ts
git commit -m "Add useGuidedJourney state machine hook"
```

---

## Task 4: `GuidedJourney` component + styling

**Files:**
- Create: `src/components/GuidedJourney.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `GuidedJourney` (return type of `useGuidedJourney`, Task 3), `GUIDED_STAGES` (Task 2).
- Produces: `<GuidedJourney journey={...} onExit={...} onResetCamera={...} />`, a default export-free named export `GuidedJourney` component. Consumed by Task 5's `App.tsx`.

Reuses `TrainingWizard.tsx`'s exact CSS classes (`training-hud`, `training-header`, `training-exit`, `training-reset`, `training-bottom-stack`, `training-move-card`, `training-move-label/chip/desc`, `training-status`, `training-footer`, `training-actions`, `training-help-btn`, `training-skip-btn`, `training-reset-progress-btn`/`-armed`, `training-complete-*`, `Confetti`) — only the stage progress indicator (replacing `TrainingWizard`'s per-case dots) and the journey-complete copy are new. Copy the `Confetti` helper component and `CONFETTI_COLORS`/`CONFIRM_ARM_MS` constants and the tap-to-arm reset pattern verbatim from `TrainingWizard.tsx` (small, self-contained, not worth extracting into a shared module for two call sites — see spec's isolation ruling).

- [ ] **Step 1: Implement the component**

```tsx
// src/components/GuidedJourney.tsx
import { useEffect, useState } from 'react';
import { GUIDED_STAGES } from '../cube/guidedJourney';
import { SOLVED_PAUSE_MS } from '../hooks/useAlgorithmTraining';
import type { GuidedJourney as GuidedJourneyState } from '../hooks/useGuidedJourney';

interface Props {
  journey: GuidedJourneyState;
  onExit: () => void;
  onResetCamera: () => void;
}

const CONFIRM_ARM_MS = 3000;

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

const CONFETTI_COLORS = ['#ffb703', '#06d6a0', '#ff5470', '#9670ff', '#4cc9f0'];

function Confetti() {
  return (
    <div className="training-confetti" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="training-confetti-piece"
          style={{
            left: `${(i * 8.3) % 100}%`,
            animationDelay: `${(i % 4) * 0.12}s`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  );
}

export function GuidedJourney({ journey, onExit, onResetCamera }: Props) {
  const { phase, stageIndex, lastResult, giveUp, skip, resetJourney } = journey;

  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), CONFIRM_ARM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  const handleResetTap = () => {
    if (resetArmed) {
      setResetArmed(false);
      resetJourney();
    } else {
      setResetArmed(true);
    }
  };

  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!lastResult) return;
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), SOLVED_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lastResult]);

  if (phase.kind === 'idle') return null;

  if (phase.kind === 'journey-complete') {
    return (
      <div className="training-hud">
        <Confetti />
        <div className="training-complete-card">
          <div className="training-complete-emoji">🏆</div>
          <div className="training-complete-title">Du løste kuben fra bunnen av!</div>
          <div className="training-complete-subtitle">Alle {GUIDED_STAGES.length} stegene er unnagjort. Kjempebra jobbet!</div>
          <div className="training-complete-actions">
            <button onClick={resetJourney} className="training-skip-btn">
              🔄 Løs en ny kube
            </button>
            <button onClick={onExit} className="training-exit training-complete-exit">
              ✕ Avslutt
            </button>
          </div>
        </div>
      </div>
    );
  }

  const algCase = phase.algCase;
  const stage = GUIDED_STAGES[stageIndex];
  const showCelebration = celebrating && Boolean(lastResult);

  return (
    <div className="training-hud">
      {showCelebration && <Confetti />}

      <div className="training-header">
        <div className="journey-stage-icons">
          {GUIDED_STAGES.map((s, i) => (
            <span
              key={s.id}
              className={
                'journey-stage-icon' +
                (i < stageIndex ? ' journey-stage-icon-done' : '') +
                (i === stageIndex ? ' journey-stage-icon-current' : '')
              }
              title={s.title}
            >
              {s.icon}
            </span>
          ))}
        </div>
        <span className="training-case-name">
          {stage.title} <span className="training-case-number">({stageIndex + 1}/{GUIDED_STAGES.length})</span>
        </span>
        <button onClick={onResetCamera} className="training-reset" aria-label="Nullstill kameravisning">
          🧭
        </button>
        <button onClick={onExit} className="training-exit">
          ✕
        </button>
      </div>

      <div className="training-bottom-stack">
        <div className={'training-move-card' + (showCelebration ? ' training-move-card-celebrate' : '')}>
          {showCelebration && lastResult ? (
            <>
              <div className="training-move-label">Riktig! ⭐</div>
              <div className="training-move-time">{formatTime(lastResult.timeMs)}</div>
            </>
          ) : (
            <>
              <div className="training-move-label">Gjør dette trekket</div>
              <div className="training-move-chip">{algCase.solutionMoves}</div>
              <div className="training-move-desc">{algCase.description}</div>
              {phase.kind === 'ready' && (
                <div className="training-status">Klar? Gjør et trekk for å starte! ⏱️</div>
              )}
              {phase.kind === 'timing' && <div className="training-status">Tar tid… ⏱️</div>}
              {phase.kind === 'demonstrating' && <div className="training-status">Se her! 👀</div>}
            </>
          )}
        </div>

        <div className="training-footer">
          <span className="training-case-number">Steg {stageIndex + 1} av {GUIDED_STAGES.length}</span>
          <div className="training-actions">
            <button
              className="training-help-btn"
              onClick={giveUp}
              disabled={phase.kind === 'setting-up' || phase.kind === 'solved' || phase.kind === 'demonstrating'}
            >
              💡 Vis meg
            </button>
            <button
              className="training-skip-btn"
              onClick={skip}
              disabled={phase.kind === 'solved' || phase.kind === 'demonstrating'}
            >
              Hopp over
            </button>
            <button
              className={'training-reset-progress-btn' + (resetArmed ? ' training-reset-progress-armed' : '')}
              onClick={handleResetTap}
              disabled={phase.kind === 'demonstrating'}
            >
              {resetArmed ? 'Sikker? 🗑️' : '🗑️ Start på nytt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the stage-icon CSS**

Append to `src/index.css` (after the existing `.training-dot-current` rule):

```css
.journey-stage-icons {
  display: flex;
  gap: 4px;
  flex: none;
  font-size: 0.9rem;
  filter: grayscale(1) opacity(0.4);
}

.journey-stage-icon-done,
.journey-stage-icon-current {
  filter: none;
}

.journey-stage-icon-current {
  transform: scale(1.2);
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: no errors (component isn't wired into `App.tsx` yet, so this only confirms it compiles standalone — `GuidedJourney` will show as unused-export, which is fine, not an error).

- [ ] **Step 4: Commit**

```bash
git add src/components/GuidedJourney.tsx src/index.css
git commit -m "Add GuidedJourney HUD component"
```

---

## Task 5: Wire into `ControlPanel` + `App`, redesign entry screen

**Files:**
- Modify: `src/components/ControlPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `useGuidedJourney` (Task 3), `GuidedJourney` component (Task 4), `isTrackComplete`/`loadProgress` from `../cube/trainingProgress` (already exist, unmodified).
- Produces: `ControlPanel` gains a required `onStartJourney: () => void` prop and a new primary CTA; the seven existing controls move under a collapsible "For viderekomne" section (no prop changes to those, purely a layout/JSX change). `App.tsx` renders `<GuidedJourney>` when the journey is active, alongside (never simultaneously with) `TrainingWizard`.

- [ ] **Step 1: Redesign `ControlPanel.tsx`**

Add `onStartJourney: () => void;` to the `Props` interface (after `onTrain`), and add `onStartJourney` to the destructured parameter list in the function signature (`export function ControlPanel({ onScramble, onSolve, onReset, onScan, onTrain, onStartJourney, isAnimating, ... }: Props) {` — insert it right after `onTrain`). Replace the component body's return statement with:

```tsx
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <aside className="panel">
      <div>
        <h1>Rubik's kube solver</h1>
        <p className="hint">Trykk under for å lære å løse kuben fra bunnen av, steg for steg.</p>
      </div>

      <button className="journey-cta" onClick={onStartJourney} disabled={isAnimating || isScanning}>
        🧩 Lær å løse kuben
      </button>

      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? '▾ Skjul verktøy for viderekomne' : '▸ Verktøy for viderekomne'}
      </button>

      {showAdvanced && (
        <div className="advanced-section">
          <p className="subtitle">3D Rubik's kube med Kociemba-basert løser</p>
          <p className="hint">Dra i en rute for å vri det laget selv. Dra utenfor kuben for å rotere kameraet.</p>

          <div className="button-row">
            <button onClick={onScramble} disabled={isAnimating || isScanning}>
              Bland
            </button>
            <button onClick={onSolve} disabled={solveDisabled}>
              {solveLabel}
            </button>
            <button onClick={onReset} disabled={isAnimating || isScanning}>
              Nullstill
            </button>
            <button onClick={onScan} disabled={isAnimating}>
              Skann
            </button>
          </div>

          <div className="button-row">
            <button className="train-button" onClick={() => onTrain('notation')} disabled={isAnimating || isScanning}>
              Tren: Notasjon
            </button>
            <button className="train-button" onClick={() => onTrain('beginner')} disabled={isAnimating || isScanning}>
              Tren: Nybegynner
            </button>
            <button
              className="train-button"
              onClick={() => onTrain('oll-pll-2look')}
              disabled={isAnimating || isScanning}
            >
              Tren: 2-look OLL/PLL
            </button>
          </div>

          <label className="speed-control">
            <span>
              Hastighet <span className="speed-value">{speed.toFixed(1)}×</span>
            </span>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={speed}
              onChange={(event) => onSpeedChange(Number(event.target.value))}
            />
          </label>

          <div className="status-row">
            <span className={`badge ${isSolved ? 'badge-solved' : ''}`}>{isSolved ? 'Løst' : 'Ikke løst'}</span>
            <span className="move-count">{moveCount} trekk</span>
          </div>

          {lastScramble && (
            <div className="log">
              <h2>Blanding</h2>
              <p>{lastScramble}</p>
            </div>
          )}

          {lastSolution && (
            <div className="log">
              <h2>Løsning ({lastSolution.trim().split(/\s+/).length} trekk)</h2>
              <p>{lastSolution}</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
```

Add `useState` to the existing `import` line at the top of the file (change `import type { SolverStatus }` block to also `import { useState } from 'react';` as a separate import above it).

- [ ] **Step 2: Add the new CSS**

Append to `src/index.css`:

```css
.journey-cta {
  flex: none;
  min-height: 56px;
  font-size: 1.05rem;
  background: linear-gradient(135deg, var(--train-accent), #5a2fd6);
  box-shadow: 0 6px 18px rgba(124, 77, 255, 0.4);
}

.journey-cta:hover:not(:disabled) {
  filter: brightness(1.08);
}

.advanced-toggle {
  flex: none;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.8rem;
  padding: 4px 0;
  text-align: left;
  min-height: 0;
}

.advanced-toggle:hover:not(:disabled) {
  background: transparent;
  color: var(--text);
}

.advanced-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
```

- [ ] **Step 3: Wire `useGuidedJourney` into `App.tsx`**

Add the import and hook call, and the notation-gate + render-gate logic:

```tsx
import { useGuidedJourney } from './hooks/useGuidedJourney';
import { GuidedJourney } from './components/GuidedJourney';
import { isTrackComplete, loadProgress } from './cube/trainingProgress';
```

```tsx
  const journey = useGuidedJourney(controller);

  const handleStartJourney = useCallback(() => {
    if (!isTrackComplete('notation', loadProgress('notation'))) {
      training.start('notation');
      return;
    }
    journey.start();
  }, [training, journey]);
```

Update the JSX: `TrainingWizard` render-gate stays as-is; add the journey overlay alongside it (both live inside `.viewport`, mutually exclusive in practice since starting one doesn't start the other), and pass `onStartJourney={handleStartJourney}` to `ControlPanel`, and only render `ControlPanel` when neither overlay is active:

```tsx
      <div className="viewport">
        <Scene ref={sceneRef} controller={controller} turnsPerSecond={speed} />
        {training.track && (
          <TrainingWizard training={training} onExit={training.stop} onResetCamera={handleResetCamera} />
        )}
        {journey.active && (
          <GuidedJourney journey={journey} onExit={journey.exit} onResetCamera={handleResetCamera} />
        )}
      </div>
      {!training.track && !journey.active && (
        <ControlPanel
          onScramble={handleScramble}
          onSolve={handleSolve}
          onReset={handleReset}
          onScan={scan.start}
          onTrain={training.start}
          onStartJourney={handleStartJourney}
          isAnimating={controller.isAnimating}
          isScanning={scan.phase.kind !== 'idle'}
          isSolved={isSolved}
          solverStatus={solverStatus}
          moveCount={controller.moveCount}
          speed={speed}
          onSpeedChange={setSpeed}
          lastScramble={lastScramble}
          lastSolution={lastSolution}
        />
      )}
```

- [ ] **Step 4: Typecheck, lint, test, build**

Run: `npx tsc -b && npx oxlint src && npm test && npm run build`
Expected: all pass with no errors.

- [ ] **Step 5: Manual smoke check with the dev server**

Run: `npm run dev` (background), then open the printed local URL and verify by hand (or via a quick Playwright script, same pattern used earlier this session):
1. Entry screen shows the big "🧩 Lær å løse kuben" button and a collapsed "▸ Verktøy for viderekomne" toggle; expanding it reveals the original controls unchanged.
2. Clicking the journey CTA on a fresh browser profile starts the Notation track (gate working).
3. After clicking the journey CTA again, the guided journey starts on stage 1 ("Kors", 1/7 with the ➕ icon highlighted).

Stop the dev server once confirmed.

- [ ] **Step 6: Commit**

```bash
git add src/components/ControlPanel.tsx src/App.tsx src/index.css
git commit -m "Wire guided journey into the app, redesign entry screen around it"
```

---

## Task 6: End-to-end verification, README, artifact republish

**Files:**
- Create: `scratch/verify-guided-journey.cjs` (throwaway Playwright script, not committed — same pattern as this session's earlier `verify-*.cjs` scratch scripts)
- Modify: `README.md`

**Interfaces:**
- Consumes: the fully wired app from Tasks 1-5.
- Produces: nothing new — this task is verification + documentation only.

- [ ] **Step 1: Full verification suite**

Run (from `rubiks-kube-solver/`): `npx tsc -b && npx oxlint src && npm test && npm run build`
Expected: all green, matching every prior task's individual checks run together.

- [ ] **Step 2: Playwright end-to-end run through the whole journey**

Write a scratch script (not committed — put it in the scratchpad directory) that: starts the dev server (or points at an already-running one on the port already in use this session), clears `localStorage`, clicks "🧩 Lær å løse kuben" (lands on notation — same gate as every other track), completes or bypasses notation via `giveUp`/"Vis meg" repeatedly until the notation track is marked complete in `localStorage` (same technique as this session's earlier `verify-complete-final.cjs`, which seeded `localStorage` directly with a completed track — reuse that seeding approach here instead of playing through 10 real notation cases, to keep the script fast), clicks the journey CTA again, then repeatedly clicks "💡 Vis meg" through all 10 guided-journey cases (this demonstrates the animation and advances the journey without depending on flaky synthetic drag-to-solve gestures — acceptable for this check since Tasks 1-3's tests already prove the underlying solve-detection logic is identical to the already-verified `useAlgorithmTraining` engine), and finally asserts the journey-complete screen ("Du løste kuben fra bunnen av!") renders. Take a screenshot at the finish screen.

Run it and inspect the output/screenshot. If any assertion fails, treat it as a real bug in Tasks 1-5, not a script issue — fix the app, re-verify, and only then proceed. Report honestly if a step in the script itself is flaky (matching this session's existing "evidence before assertions" practice) rather than claiming success without it.

- [ ] **Step 3: Update `README.md`**

In the "Funksjoner" section, add a bullet after the existing "Tren på algoritmer" bullet describing the guided journey (new primary entry point, 7 steg, notation-krav, "For viderekomne"-seksjonen), and in the "Arkitektur" section add a line for `src/cube/guidedJourney.ts`, `src/hooks/useGuidedJourney.ts`, `src/components/GuidedJourney.tsx`, following the existing bullet style and cross-referencing `docs/superpowers/specs/2026-08-19-guided-solve-journey-design.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the guided solve journey in the README"
```

- [ ] **Step 5: Push, rebuild artifact, republish**

```bash
git push -u origin claude/rubiks-kube-solver-mmt9s3
npm run build:artifact
```

Strip the `<!doctype>/<html>/<head>/<body>` wrapper and the favicon `<link>` from `dist-artifact/index.html` (same `sed` recipe used earlier this session) into a scratch file, then publish it via the `Artifact` tool to the existing URL (`https://claude.ai/code/artifact/ea451482-3b34-49b0-981d-bd0c61ccce55`) so the user can try the guided journey on their own device.
