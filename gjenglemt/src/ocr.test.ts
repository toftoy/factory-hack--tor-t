import { describe, it, expect } from 'vitest';
import { pickVotedValue } from './ocr';

// Only the pure vote-tallying rule is unit tested here. Recognition itself needs a
// real image and a downloaded language model, which is why `ocr.ts` otherwise has
// no unit test — it is covered by the real-browser harness instead.
describe('pickVotedValue', () => {
  it('takes the value the most passes agree on', () => {
    expect(pickVotedValue(['47239791', '47250781', '47239791', '47239791'])).toBe('47239791');
  });

  it('accepts a clear winner with exactly two votes', () => {
    expect(pickVotedValue(['47239791', '47239791', '37259791'])).toBe('47239791');
  });

  it('ignores passes that read nothing', () => {
    expect(pickVotedValue([null, '98765432', null, '98765432', null])).toBe('98765432');
  });

  // Everything below is a shape where guessing would be worse than saying nothing.
  it('declines when the best candidate has only one vote', () => {
    expect(pickVotedValue(['47239791', null, null])).toBeNull();
  });

  it('declines a three-way split of single votes', () => {
    expect(pickVotedValue(['47239791', '47250781', '37259791'])).toBeNull();
  });

  it('declines two candidates with one vote each', () => {
    expect(pickVotedValue(['47239791', '47250781'])).toBeNull();
  });

  it('declines a tie for first place', () => {
    expect(pickVotedValue(['47239791', '47239791', '47250781', '47250781'])).toBeNull();
  });

  it('declines when nothing was read at all', () => {
    expect(pickVotedValue([null, null, null, null, null])).toBeNull();
    expect(pickVotedValue([])).toBeNull();
  });
});
