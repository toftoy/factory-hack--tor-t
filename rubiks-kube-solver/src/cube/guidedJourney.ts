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
  { id: 'yellow-cross', title: 'Kors på toppen', icon: '✝️', cases: [beginnerCase('beginner-yellow-cross')] },
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
