import { describe, it, expect } from 'vitest';
import { pickVotedValue, shouldVoteOnDigits } from './ocr';

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

/**
 * When the vote is *triggered* — a separate rule from how it tallies, and the one
 * round 6 measured as the largest correctable defect in the pipeline: 9 of its 11
 * wrong numbers were decided by the fast path, which the vote never saw.
 *
 * Every expectation below is a bucket from round 6's 106-image run (section 42 of
 * `.superpowers/ocr-investigation-report.md`), with that bucket's measured
 * correct/wrong split quoted, so a future change that "simplifies" one of these
 * cases has to argue with the number.
 */
describe('shouldVoteOnDigits', () => {
  // 56 images, 54 correct / 2 wrong. The strongest correctness signal measured,
  // and the only one worth skipping the ~1.25s vote on.
  it('skips the vote when both primary passes read the same number', () => {
    expect(
      shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: ['47239791', '47239791'] })
    ).toBe(false);
  });

  // 8 images, 1 correct / 6 wrong / 1 missing — disagreement predicts a wrong
  // number better than anything else the pipeline already computes.
  it('votes when the two primary passes read different numbers', () => {
    expect(
      shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: ['47239791', '47250781'] })
    ).toBe(true);
  });

  // 20 images, 15 correct / 3 wrong. Not agreement: one pass reading a number the
  // other did not see is uncorroborated, its wrong rate is 15% against the agreeing
  // bucket's 3.6%, and it holds 3 of the 11 wrong numbers. Voting here is what takes
  // the trigger's coverage from 6/11 to 9/11; the 30 controls in round 6's vote
  // experiment included three of these (L013, L019, L024) and none regressed.
  it('votes when only one primary pass read a number', () => {
    expect(
      shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: ['47239791', null] })
    ).toBe(true);
    expect(
      shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: [null, '47239791'] })
    ).toBe(true);
  });

  // Neither primary read a number but the fast path still settled — an orientation
  // probe accepted it. A 640px probe is the weakest reader in the ladder, so its
  // number is the last one to take on trust.
  it('votes when the fast path settled on something other than the primary passes', () => {
    expect(shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: [null, null] })).toBe(
      true
    );
  });

  // The pre-existing trigger, which this change adds to rather than replaces.
  it('votes when the fast path produced no accepted result at all', () => {
    expect(shouldVoteOnDigits({ settledInFastPath: false, primaryCandidates: [null, null] })).toBe(
      true
    );
    expect(
      shouldVoteOnDigits({ settledInFastPath: false, primaryCandidates: ['47239791', '47250781'] })
    ).toBe(true);
  });

  // Agreement is only a signal when both passes actually ran and agreed. A pass
  // that threw, or an abort between the two, leaves one candidate — which is not
  // two passes agreeing, however much it looks like the first case above.
  it('votes when the primary passes did not both run', () => {
    expect(
      shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: ['47239791'] })
    ).toBe(true);
    expect(shouldVoteOnDigits({ settledInFastPath: true, primaryCandidates: [] })).toBe(true);
  });
});
