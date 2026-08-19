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
