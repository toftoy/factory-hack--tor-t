import { describe, it, expect } from 'vitest';
import {
  cropPassScale,
  deriveLabelRoi,
  pickVotedValue,
  shouldCropToRoi,
  shouldVoteOnDigits,
  wordRectInImage,
  type RoiWord,
} from './ocr';

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

/**
 * Where the label is, derived from the word boxes the passes that already ran
 * produced — the ROI crop stage's input.
 *
 * Every shape below is taken from real Tesseract output on round 8's images
 * (`.superpowers/ocr9/roidump.json`, section 61 of the investigation report), with
 * the coordinates rounded and the frame kept at the 3024x4032 that test set uses,
 * so a future change that "tidies" one of these rules has to argue with a
 * measured image.
 */
const word = (
  text: string,
  confidence: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): RoiWord => ({ text, confidence, rect: { x0, y0, x1, y1 } });

describe('deriveLabelRoi', () => {
  // R008: a vfar label the pipeline could not read, whose primary pass still
  // located all three of its lines to within a few pixels.
  it('boxes the label from its three lines', () => {
    const roi = deriveLabelRoi(
      [
        word('Jonas', 71, 1817, 2129, 1930, 2154),
        word('Nordmann', 95, 1773, 2173, 1978, 2201),
        word('60728412', 79, 1789, 2214, 1965, 2249),
      ],
      3024,
      4032
    );
    expect(roi).not.toBeNull();
    // Every line inside, and not much else: the crop is a small part of the frame.
    expect(roi!.rect.x0).toBeLessThanOrEqual(1773);
    expect(roi!.rect.y0).toBeLessThanOrEqual(2129);
    expect(roi!.rect.x1).toBeGreaterThanOrEqual(1978);
    expect(roi!.rect.y1).toBeGreaterThanOrEqual(2249);
    const area = (roi!.rect.x1 - roi!.rect.x0) * (roi!.rect.y1 - roi!.rect.y0);
    expect(area / (3024 * 4032)).toBeLessThan(0.05);
  });

  // R076 and the other fabric frames: 90-236 "words", none of them the label.
  // Cropping the wrong region turns a recoverable miss into a confident one, so
  // saying nothing is the required answer here.
  it('finds nothing in a frame of low-confidence background speckle', () => {
    const noise: RoiWord[] = [];
    for (let i = 0; i < 40; i += 1) {
      noise.push(word('på', 45, i * 70, i * 90, i * 70 + 30, i * 90 + 25));
    }
    expect(deriveLabelRoi(noise, 3024, 4032)).toBeNull();
  });

  // The digit row is the first line to fall below the confidence bar at distance
  // (R091 read "Kristiansen" and nothing else). Padding measured as a fraction of
  // the found box alone would crop the number away; it has to be at least a
  // couple of line heights.
  it('leaves room for the lines it did not find', () => {
    const roi = deriveLabelRoi(
      [
        word('Kristiansen', 60, 721, 1234, 894, 1272),
        word('Kristiansen', 94, 721, 1234, 894, 1272),
      ],
      3024,
      4032
    );
    expect(roi).not.toBeNull();
    // Two more lines of the same height have to fit above and below what was found.
    expect(roi!.rect.y1).toBeGreaterThanOrEqual(1272 + 2 * 38);
    expect(roi!.rect.y0).toBeLessThanOrEqual(1234 - 2 * 38);
  });

  it('keeps the crop inside the image', () => {
    const roi = deriveLabelRoi(
      [word('Nordmann', 92, 0, 0, 180, 30), word('60728412', 80, 10, 40, 170, 72)],
      3024,
      4032
    );
    expect(roi!.rect.x0).toBe(0);
    expect(roi!.rect.y0).toBe(0);
    expect(roi!.rect.x1).toBeLessThanOrEqual(3024);
    expect(roi!.rect.y1).toBeLessThanOrEqual(4032);
  });

  it('takes the cluster holding the most text, not a lone confident word elsewhere', () => {
    const roi = deriveLabelRoi(
      [
        word('Forsiktig', 95, 200, 200, 460, 250),
        word('Jonas', 71, 1817, 2129, 1930, 2154),
        word('Nordmann', 95, 1773, 2173, 1978, 2201),
        word('60728412', 79, 1789, 2214, 1965, 2249),
      ],
      3024,
      4032
    );
    expect(roi!.rect.x0).toBeGreaterThan(1000);
    expect(roi!.rect.y0).toBeGreaterThan(1000);
  });

  // One box is a location, not a corroborated one. Two boxes in the same place —
  // often the same word seen by both the plain and the boosted primary pass — is
  // the weakest evidence worth cropping on.
  it('declines a single qualifying word', () => {
    expect(deriveLabelRoi([word('Nordmann', 95, 1773, 2173, 1978, 2201)], 3024, 4032)).toBeNull();
  });

  it('reports the line height it found, for the crop to scale by', () => {
    const roi = deriveLabelRoi(
      [word('Nordmann', 95, 1773, 2173, 1978, 2201), word('60728412', 79, 1789, 2214, 1965, 2249)],
      3024,
      4032
    );
    expect(roi!.wordHeight).toBeGreaterThanOrEqual(28);
    expect(roi!.wordHeight).toBeLessThanOrEqual(35);
  });

  // How big the label is in the frame, which the trigger reads — measured on the
  // text that was found, not on the padded crop, since the padding is this file's
  // own choice and would otherwise decide whether the label counts as small.
  it('reports how far the text it found spans, before padding', () => {
    const roi = deriveLabelRoi(
      [word('Nordmann', 95, 1773, 2173, 1978, 2201), word('60728412', 79, 1789, 2214, 1965, 2249)],
      3024,
      4032
    );
    expect(roi!.span).toBe(1978 - 1773);
  });
});

/**
 * When the crop stage runs.
 *
 * Round 8 measured a cliff, not a slope: everything from a 14px cap height at the
 * primary pass upwards is 92-96% correct, and below ~12px it halves to 42%
 * (8/19). So the trigger is that cliff plus the ordinary "nothing was accepted"
 * signal — deliberately not the digit vote's disagreement rule, which is about
 * *wrong* numbers and does not fire on the empty fields distance produces.
 */
describe('shouldCropToRoi', () => {
  const frame = { imageWidth: 3024, imageHeight: 4032 };
  const roi = { rect: { x0: 1773, y0: 2129, x1: 1978, y1: 2249 }, wordHeight: 30, words: 3, span: 205 };
  const bigRoi = { rect: { x0: 500, y0: 500, x1: 1700, y1: 1400 }, wordHeight: 145, words: 6, span: 706 };

  it('does not run without an ROI', () => {
    expect(shouldCropToRoi({ settled: false, roi: null, ...frame })).toBe(false);
  });

  it('runs when no pass has produced an accepted result', () => {
    expect(shouldCropToRoi({ settled: false, roi: bigRoi, ...frame })).toBe(true);
  });

  // R128: a distant label bent and tilted enough that the *name* row's box is
  // twice the height of the digit row's, which drags the median above the
  // per-word threshold although the label is 11% of the frame wide — round 8's
  // "falls apart around 12%" case. It read a wrong number confidently, with both
  // primary passes agreeing on it, so nothing else in the pipeline looks at it.
  it('runs when the located label covers little of the frame, whatever its tallest row measures', () => {
    const skewed = { rect: { x0: 1301, y0: 1688, x1: 1710, y1: 1993 }, wordHeight: 54, words: 4, span: 195 };
    expect(shouldCropToRoi({ settled: true, roi: skewed, ...frame })).toBe(true);
  });

  // 30px in a 4032px frame is ~9.5px at the 1280px primary pass — round 8's 42%
  // bucket. Two of that bucket's failures were *wrong* numbers the ladder
  // accepted (R116, R128), so "something was accepted" is no reason to skip it.
  it('runs on an accepted result whose label text is below the resolution cliff', () => {
    expect(shouldCropToRoi({ settled: true, roi, ...frame })).toBe(true);
  });

  // 145px is ~46px at the primary pass, and the label is 40% of the frame wide:
  // round 8's 96% bucket. Nothing to fix, and the stage is not free.
  it('stays out of the way when an accepted result read text the primary pass saw clearly', () => {
    expect(shouldCropToRoi({ settled: true, roi: bigRoi, ...frame })).toBe(false);
  });

  // A `far` label — 20% of the frame, 17px of box at the primary pass — is
  // round 8's 95% bucket, on the safe side of the cliff.
  it('leaves the bucket above the cliff alone', () => {
    const far = { rect: { x0: 1000, y0: 1000, x1: 1600, y1: 1340 }, wordHeight: 54, words: 6, span: 290 };
    expect(shouldCropToRoi({ settled: true, roi: far, ...frame })).toBe(false);
  });
});

describe('cropPassScale', () => {
  const roi = { rect: { x0: 1773, y0: 2129, x1: 1978, y1: 2249 }, wordHeight: 30, words: 3, span: 205 };

  it('scales the crop so its text reaches the target height', () => {
    expect(cropPassScale(roi, 60)).toBeCloseTo(2, 5);
    expect(cropPassScale(roi, 15)).toBeCloseTo(0.5, 5);
  });

  // The whole point of cropping is a *cheap* pass. A near-distance ROI is already
  // 1600px wide; upscaling that to the same target would cost more than the
  // full-frame pass it is meant to spare.
  it('never enlarges a crop past the pass size cap', () => {
    const wide = { rect: { x0: 0, y0: 0, x1: 1600, y1: 940 }, wordHeight: 145, words: 6, span: 1200 };
    const scale = cropPassScale(wide, 300);
    expect(1600 * scale).toBeLessThanOrEqual(2200);
  });
});

/**
 * The word boxes come back in the coordinate space of the pass's preprocessed
 * canvas — downscaled, and rotated when the orientation probe turned the frame.
 * Pooling boxes from passes at different sizes and angles means mapping them back
 * to the original photo's pixels first.
 */
describe('wordRectInImage', () => {
  it('undoes a pass downscale', () => {
    const rect = wordRectInImage(
      { x0: 563, y0: 690, x1: 628, y1: 699 },
      {
        canvasWidth: 960,
        canvasHeight: 1280,
        scaledWidth: 960,
        scaledHeight: 1280,
        scale: 0.3175,
        rotation: 0,
      }
    );
    expect(rect.x0).toBeCloseTo(563 / 0.3175, 3);
    expect(rect.y1).toBeCloseTo(699 / 0.3175, 3);
  });

  it('undoes a quarter turn', () => {
    // A 100x200 image drawn 1:1 and rotated 90 degrees is a 200x100 canvas. The
    // box at that canvas's top-left corner came from the image's bottom-left.
    const rect = wordRectInImage(
      { x0: 0, y0: 0, x1: 20, y1: 10 },
      {
        canvasWidth: 200,
        canvasHeight: 100,
        scaledWidth: 100,
        scaledHeight: 200,
        scale: 1,
        rotation: 90,
      }
    );
    expect(rect.x0).toBeCloseTo(0, 5);
    expect(rect.x1).toBeCloseTo(10, 5);
    expect(rect.y0).toBeCloseTo(180, 5);
    expect(rect.y1).toBeCloseTo(200, 5);
  });
});
