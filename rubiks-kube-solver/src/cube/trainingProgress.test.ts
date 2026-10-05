import { beforeEach, describe, expect, test } from 'vitest';
import { BEGINNER_ALGORITHMS } from './algorithms';
import {
  currentCase,
  emptyProgress,
  isTrackComplete,
  loadProgress,
  recordAttempt,
  saveProgress,
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
