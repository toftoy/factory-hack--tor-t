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

export function skipCase(track: TrainingTrack, progress: TrackProgress): TrackProgress {
  if (progress.currentIndex >= TRACKS[track].length) return progress;
  return { ...progress, currentIndex: progress.currentIndex + 1 };
}
