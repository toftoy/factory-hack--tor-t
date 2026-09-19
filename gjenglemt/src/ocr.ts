import Tesseract, { PSM } from 'tesseract.js';

/**
 * OCR of the note photo.
 *
 * The input is a full-resolution phone photo (typically 3000-4000px wide) in which
 * a small pre-printed name sticker occupies a few percent of the frame. Feeding
 * that file straight to Tesseract does not work, for three measured reasons:
 *
 *  1. At full sensor resolution the photo's fine grain — sensor noise, JPEG
 *     artefacts, leather/fabric texture, blurred background — reads as text to
 *     Tesseract's binariser, and the real label drowns in noise "words".
 *     Downscaling to ~1280px low-pass filters the grain away and puts the text
 *     near the ~30px cap height Tesseract's LSTM likes. Measured: phone-number
 *     recovery 0/8 -> 8/8, and roughly 7x faster.
 *  2. These labels are *low contrast* — dark grey text on a pale mint sticker,
 *     often on a white or translucent object. The bold name survives, but the
 *     thinner digit row does not: on the bottle photo the plain pipeline read
 *     "Anne/Nils / Toftøy / — —", losing the number entirely, while the same
 *     image with a fixed contrast boost read "Anne/Nils / Toftøy / 47239791" at
 *     every scale tried. Which of plain and boosted wins is image-dependent, so
 *     the first stage runs both and takes whichever found more confident text.
 *     (Note this is a fixed gain/bias, *not* a histogram stretch — a global
 *     `normalise()`-style stretch was measured separately and made things worse,
 *     because on a photo with a bright background it mostly amplifies grain.)
 *  3. `PSM.SPARSE_TEXT` is the right mode: it looks for text scattered anywhere in
 *     the image with no page structure assumed, which is exactly "a small label
 *     somewhere in a photo". Measured 14/17 against 12/17 for `PSM.AUTO`.
 *     `PSM.SINGLE_BLOCK` — an earlier attempted fix — is catastrophic here, since
 *     it forces every noise blob into one text block: 14-34s per photo and no
 *     digits at all.
 *
 * Labels are also frequently *not upright*: a name sticker wrapped around a bottle
 * or a pencil case reads sideways in the frame. Sparse-text mode has no orientation
 * detection at all (that needs OSD data we do not ship), so orientation is resolved
 * explicitly by the cheap probe below.
 */

/** Recognition is always done on a grayscale image downscaled to this longest edge. */
const DEFAULT_MAX_DIM = 1280;

/**
 * Longest edge for the orientation probe — deliberately small.
 *
 * Recognition cost scales with pixel count, so a 640px probe is ~4x cheaper than a
 * full pass. Reading a sideways label used to require reaching pass 6 of 7, which
 * on a phone is far outside the budget; two cheap probes settle it instead.
 */
const PROBE_MAX_DIM = 640;

/**
 * Contrast boost. Never the sole preprocessing for a size — always paired with,
 * or a fallback to, a plain pass at the same size.
 *
 * A gentle gain (1.4) applied unconditionally to every pass was measured as a net
 * loss: it started eating the first letter of names ("ari Nordmann"). This
 * stronger gain blows out normally-exposed photos outright. Pairing it with a
 * plain pass and taking the better-scoring result gets its upside — it is what
 * reads the thin digit row on a pale label — without its downside.
 */
const CONTRAST_GAIN = 1.8;
const CONTRAST_BIAS = -60;

/**
 * How much a pass may *enlarge* an image that is already smaller than its target.
 *
 * A real camera photo is always far bigger than any target here, so this never
 * applies to one. It matters for small inputs — a cropped or shared image, or a
 * photo from a low-resolution source — where leaving the pixels alone hands
 * Tesseract text only a few pixels tall. Capped so a tiny image cannot blow up
 * into an enormous canvas.
 */
const MAX_UPSCALE = 4;

/**
 * A pass must find at least this much confident text before its result is taken.
 *
 * Without it, a pass that read nothing but background noise could still emit an
 * 8-digit run and win — two wrong phone numbers appeared in measurement exactly
 * that way. A pass that genuinely read the number scores at least the number's
 * own 8 characters, so this rejects noise without rejecting real reads.
 */
const MIN_ACCEPT_SCORE = 8;

/**
 * A word must clear this confidence to count towards a pass's score.
 *
 * Tesseract separates real label text from background noise very cleanly here:
 * on the bottle photo the correct pass scored `Anne/Nils@90 Toftøy@91` while every
 * other pass scored nothing at all.
 */
const MIN_WORD_CONFIDENCE = 60;
/** Shorter "words" are almost always speckle, whatever their confidence. */
const MIN_WORD_LENGTH = 3;

interface Pass {
  /** Longest edge, in pixels, to downscale the photo to before recognition. */
  maxDim: number;
  /** Extra rotation applied after downscaling, in degrees. */
  rotation: number;
  /** Apply the contrast boost. See `CONTRAST_GAIN`. */
  boostContrast?: boolean;
  /**
   * Recognise only this region of the photo, resampled by `scale`, instead of the
   * whole frame at `maxDim`. See the ROI crop stage below.
   */
  crop?: { rect: RoiRect; scale: number };
}

/**
 * The ROI crop stage — round 9.
 *
 * Round 8 measured the pipeline's one remaining, genuinely-characterised weak
 * point: distance. Once the digit row's cap height falls below ~12px at the
 * primary pass's 1280px target, phone accuracy halves — 8/19 (42%) against 92-96%
 * from 14px up. It is a cliff, not a slope, which is what a resolution limit
 * looks like. The same round measured the obvious fix and rejected it: raising
 * `maxDim` globally to 2000px recovers 6 of 17 failures but costs a p90 of 4961ms
 * on textured frames (one control took 24179ms at 2560px), which does not fit the
 * 5s budget in `main.ts`.
 *
 * Cropping first is what makes the extra resolution affordable, and it is
 * measured, not assumed (section 61 of the investigation report):
 *
 *  - A primary pass that *failed* still says **where** the label is. On round 8's
 *    clean-background failures the two primary passes produced 2-5 word boxes
 *    sitting tightly on the label even when the digits they read were garbage
 *    ("254885g", "msno"). An ROI was derivable for 10 of the 17 failures.
 *  - The 7 failures with no derivable ROI are all fabric backgrounds, where the
 *    frame holds 69-236 speckle "words" and none of them clear the confidence
 *    bar. Those are also the images round 8 found unreadable at *every* `maxDim`
 *    it swept — a geometry-plus-texture problem, not a pixel one — so declining
 *    to crop them costs nothing that was available.
 *  - Recognising the crop costs 87-473ms for both passes (median ~160ms) against
 *    the 301ms median / 4961ms p90 of a full-frame 2000px pass, because the input
 *    is a few hundred pixels across instead of 2000, and carries no background.
 */
export interface RoiRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A word Tesseract found, in ORIGINAL photo pixels. See `wordRectInImage`. */
export interface RoiWord {
  text: string;
  confidence: number;
  rect: RoiRect;
}

export interface LabelRoi {
  /** Where to crop, in original photo pixels. */
  rect: RoiRect;
  /** Median height of the boxes it was built from — what the crop scales by. */
  wordHeight: number;
  /** How many word boxes agreed on the location. */
  words: number;
  /**
   * Longest side of the text that was found, *before* padding — how big the label
   * is in the frame, which is what the trigger reads. Measuring it on the padded
   * crop instead would let this file's own padding decide whether a label counts
   * as small.
   */
  span: number;
}

/** What `preprocess` did, so word boxes can be mapped back to the photo. */
export interface PassGeometry {
  canvasWidth: number;
  canvasHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  scale: number;
  rotation: number;
}

/**
 * Word boxes that may take part in locating the label. Same bar as
 * `scoreRecognition` uses to decide a pass found real text, for the same reason:
 * on a fabric background it is what separates the label from the weave.
 */
const ROI_MIN_WORD_CONFIDENCE = MIN_WORD_CONFIDENCE;
const ROI_MIN_WORD_LENGTH = MIN_WORD_LENGTH;

/**
 * Two boxes join the same cluster when the gap between them is within this many
 * line heights. The label's three lines sit within about one line height of each
 * other; anything the background contributes does not.
 */
const ROI_GAP_LINES = 2;

/**
 * How far the crop reaches beyond the boxes that were actually found — the larger
 * of a fraction of the cluster and a couple of line heights.
 *
 * The line-height floor is the one that matters: at distance the *digit row* is
 * the first line to fall under the confidence bar (R091 located "Kristiansen" and
 * nothing else), and a percentage of that single box would crop the number away.
 */
const ROI_PAD_FRACTION = 0.35;
const ROI_PAD_LINES = 2;

/** One box is a place; two are a corroborated place. */
const ROI_MIN_WORDS = 2;

/**
 * The cliff, in the units the trigger can actually observe.
 *
 * Round 8 reports *cap* height at the 1280px pass; a word box also holds
 * ascenders and descenders, so its height runs ~1.2-1.4x the cap. 15px of box is
 * therefore about 11-12px of cap — round 8's 42% bucket — and separates that
 * bucket cleanly from `far` (16-19px of box) on the measured images.
 */
const CROP_TRIGGER_WORD_PX = 15;

/**
 * The same cliff seen from the other side: how much of the frame the label fills.
 *
 * Round 8's closing recommendation puts it physically — "the pipeline is fine
 * down to a label filling ~20% of the frame and falls apart around 12%" — and
 * that view catches a case the per-word one misses. On R128 a severe pitch plus a
 * saddle bend left the name row's box twice the height of the digit row's, so the
 * median box cleared `CROP_TRIGGER_WORD_PX` while the digits were 9px; both
 * primary passes then agreed on a *wrong* number, which no other trigger in this
 * file looks at.
 *
 * The fraction is lower than round 8's 12% because this measures the *text* that
 * was found, not the sticker it sits on. Measured across round 8's images
 * (`.superpowers/ocr9/spancheck.mjs`): vfar 2.6-7.8%, the skewed R128 6.5%,
 * far 9.0-12.2%, mid 14-20%, near 22-31%. 8% sits in the gap.
 */
const CROP_TRIGGER_SPAN_FRACTION = 0.08;

/**
 * The crop passes: one boosted, one plain, at slightly different target text
 * heights, and the number is only taken when they agree.
 *
 * Measured over the 29 round-8 images an ROI could be derived for, this pair read
 * the true number on 7 of the 10 failures and **all 19** controls, with **no
 * wrong number at all**. A single boosted pass at 20px scores one better (8/10)
 * but emits a wrong number on R108 — where the two passes here read two
 * *different* wrong numbers and the agreement rule correctly reports nothing,
 * which is the trade every earlier round in this file has already made.
 */
const CROP_PASSES: { targetWordHeight: number; boostContrast: boolean }[] = [
  { targetWordHeight: 20, boostContrast: true },
  { targetWordHeight: 24, boostContrast: false },
];

/** Bounds on the crop's rendered size: the stage's whole value is being cheap. */
const CROP_MAX_EDGE = 2200;
const CROP_MIN_SCALE = 0.2;

/**
 * Map a word box from a pass's preprocessed canvas back to original photo pixels,
 * undoing that pass's downscale and rotation, so boxes from passes at different
 * sizes and orientations can be pooled.
 */
export function wordRectInImage(bbox: RoiRect, geometry: PassGeometry): RoiRect {
  const radians = (-geometry.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centreX = geometry.canvasWidth / 2;
  const centreY = geometry.canvasHeight / 2;
  const corners: [number, number][] = [
    [bbox.x0, bbox.y0],
    [bbox.x1, bbox.y0],
    [bbox.x1, bbox.y1],
    [bbox.x0, bbox.y1],
  ];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of corners) {
    const dx = px - centreX;
    const dy = py - centreY;
    const ix = (dx * cos - dy * sin + geometry.scaledWidth / 2) / geometry.scale;
    const iy = (dx * sin + dy * cos + geometry.scaledHeight / 2) / geometry.scale;
    x0 = Math.min(x0, ix);
    y0 = Math.min(y0, iy);
    x1 = Math.max(x1, ix);
    y1 = Math.max(y1, iy);
  }
  return { x0, y0, x1, y1 };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

/**
 * Where the label is, from the word boxes the passes that already ran produced.
 * Exported for unit testing; the shapes in `ocr.test.ts` are real dumps.
 *
 * Deliberately conservative: it would rather return nothing than a wrong region,
 * because the crop pass is additive — failing to crop leaves the existing ladder
 * exactly as it was, while cropping the wrong place would hide the label from it.
 */
export function deriveLabelRoi(
  words: RoiWord[],
  imageWidth: number,
  imageHeight: number
): LabelRoi | null {
  const usable = words.filter(
    (word) =>
      word.confidence >= ROI_MIN_WORD_CONFIDENCE &&
      word.text.trim().length >= ROI_MIN_WORD_LENGTH &&
      /[\p{L}\d]/u.test(word.text)
  );
  if (usable.length < ROI_MIN_WORDS) return null;

  const gap = ROI_GAP_LINES * median(usable.map((word) => word.rect.y1 - word.rect.y0));
  const textLength = (word: RoiWord) => word.text.trim().length;

  // Single-linkage growth from the most text-bearing seeds. Only a handful of
  // seeds are tried: the cluster containing the most confident text wins, which
  // on a noisy frame is the label rather than whichever speckle came first.
  let best: { rect: RoiRect; members: RoiWord[]; score: number } | null = null;
  const seeds = [...usable].sort((a, b) => textLength(b) - textLength(a)).slice(0, 5);
  for (const seed of seeds) {
    let rect: RoiRect = { ...seed.rect };
    const members = [seed];
    let grew = true;
    while (grew) {
      grew = false;
      for (const word of usable) {
        if (members.includes(word)) continue;
        const dx = Math.max(0, rect.x0 - word.rect.x1, word.rect.x0 - rect.x1);
        const dy = Math.max(0, rect.y0 - word.rect.y1, word.rect.y0 - rect.y1);
        if (dx > gap || dy > gap) continue;
        rect = {
          x0: Math.min(rect.x0, word.rect.x0),
          y0: Math.min(rect.y0, word.rect.y0),
          x1: Math.max(rect.x1, word.rect.x1),
          y1: Math.max(rect.y1, word.rect.y1),
        };
        members.push(word);
        grew = true;
      }
    }
    const score = members.reduce((total, word) => total + textLength(word), 0);
    if (!best || score > best.score) best = { rect, members, score };
  }
  if (!best || best.members.length < ROI_MIN_WORDS) return null;

  const wordHeight = median(best.members.map((word) => word.rect.y1 - word.rect.y0));
  const padX = Math.max((best.rect.x1 - best.rect.x0) * ROI_PAD_FRACTION, ROI_PAD_LINES * wordHeight);
  const padY = Math.max((best.rect.y1 - best.rect.y0) * ROI_PAD_FRACTION, ROI_PAD_LINES * wordHeight);
  return {
    rect: {
      x0: Math.max(0, Math.round(best.rect.x0 - padX)),
      y0: Math.max(0, Math.round(best.rect.y0 - padY)),
      x1: Math.min(imageWidth, Math.round(best.rect.x1 + padX)),
      y1: Math.min(imageHeight, Math.round(best.rect.y1 + padY)),
    },
    wordHeight,
    words: best.members.length,
    span: Math.max(best.rect.x1 - best.rect.x0, best.rect.y1 - best.rect.y0),
  };
}

/**
 * Whether to spend the crop stage on this photo. Exported for unit testing.
 *
 * Two triggers, both from round 8's measurements and neither of them the digit
 * vote's rule — that one keys on two primary passes disagreeing about a number,
 * which is a *wrong-number* signal, while distance produces empty fields:
 *
 *  1. Nothing has been accepted yet. The ladder is already going to keep
 *     spending passes, and a cropped one is the cheapest it has.
 *  2. Something *was* accepted, but the label text the passes located is below
 *     the resolution cliff. That bucket is 42% correct and it is where both of
 *     round 8's wrong numbers in the distance sweep sat (R116, R128) — accepted
 *     results, so trigger 1 alone would never have looked at them.
 */
export function shouldCropToRoi({
  settled,
  roi,
  imageWidth,
  imageHeight,
}: {
  settled: boolean;
  roi: LabelRoi | null;
  imageWidth: number;
  imageHeight: number;
}): boolean {
  if (!roi) return false;
  if (!settled) return true;
  const imageMaxDim = Math.max(1, imageWidth, imageHeight);
  const atPrimaryScale = roi.wordHeight * (DEFAULT_MAX_DIM / imageMaxDim);
  if (atPrimaryScale < CROP_TRIGGER_WORD_PX) return true;
  // Round 8 measures a label's size as a fraction of the frame's *width*, which
  // on a portrait phone photo is its shorter side.
  return roi.span / Math.max(1, Math.min(imageWidth, imageHeight)) < CROP_TRIGGER_SPAN_FRACTION;
}

/**
 * How much to resample the crop by so its text lands near `targetWordHeight`.
 * Exported for unit testing.
 *
 * Note this is as often a *downscale* as an upscale: a near-distance label is
 * already 145px per line in the frame, and the measured sweet spot for these
 * crops is well below that.
 */
export function cropPassScale(roi: LabelRoi, targetWordHeight: number): number {
  const width = roi.rect.x1 - roi.rect.x0;
  const height = roi.rect.y1 - roi.rect.y0;
  const wanted = targetWordHeight / Math.max(1, roi.wordHeight);
  const capped = Math.min(wanted, CROP_MAX_EDGE / Math.max(1, width, height));
  return Math.max(CROP_MIN_SCALE, capped);
}

/**
 * First stage: the best target size, tried both plain and contrast-boosted.
 *
 * Which of the two wins is image-dependent and not predictable in advance, and
 * getting it wrong is expensive in a way the rest of the ladder cannot repair:
 * a pass that reads the digits *confidently but wrongly* is accepted and stops
 * everything. Measured in a real browser, plain read `res_3024.jpg` as
 * "3 7239791" and `res_1563.jpg` as "4725 .." while boosted read both correctly,
 * so both run and the better-scoring one is taken. The cost is one extra
 * recognition, a few hundred milliseconds inside a five-second budget.
 */
const PRIMARY_PASSES: Pass[] = [
  { maxDim: DEFAULT_MAX_DIM, rotation: 0 },
  { maxDim: DEFAULT_MAX_DIM, rotation: 0, boostContrast: true },
];

/**
 * Quarter turns the probe chooses between once upright has already failed.
 *
 * Upright is not probed because `PRIMARY_PASSES` just tried it at full quality.
 *
 * The probes run *with* the contrast boost, unlike the passes. Measured in a real
 * browser over eight sideways cases: plain probes picked the right orientation
 * 6/8 and returned literally nothing on the other two, which were the
 * low-contrast ones — so the orientation fallback was blind on exactly the
 * images that need it. Boosted probes picked correctly 8/8, and on several
 * cases read the whole label outright and finished there.
 */
const PROBE_ROTATIONS = [90, 270];

/**
 * Tried in order, at whichever orientation won, until one is accepted. Each entry
 * earns its place against a measured failure: a blurred photo needs a smaller
 * target and a distant sticker a larger one; low-contrast labels need the boost;
 * and Tesseract's own deskew gives up somewhere past ~10 degrees of camera tilt.
 */
const REFINEMENT_PASSES: Pass[] = [
  { maxDim: 1600, rotation: 0 },
  { maxDim: 1600, rotation: 0, boostContrast: true },
  { maxDim: 1000, rotation: 0, boostContrast: true },
  { maxDim: DEFAULT_MAX_DIM, rotation: 12, boostContrast: true },
  { maxDim: DEFAULT_MAX_DIM, rotation: -12, boostContrast: true },
];

/** Alphabet for the digit vote. Excluding letters stops the number picking any up. */
const DIGIT_WHITELIST = '0123456789';

/**
 * Angles for the digit vote (see `voteOnDigits`).
 *
 * Every remaining failure measured after round 3 was an in-plane rotation of
 * roughly 4 to 15 degrees, and Tesseract's line segmentation is *chaotic* under
 * that parameter rather than smoothly degrading: on the bottle photo a one-degree
 * sweep read the number correctly at ten of fifteen angles, and the four that
 * failed (-13, -12, -10, -6) sit between angles that succeed. So the answer is not
 * to estimate the angle more precisely — it is to sample several and see what most
 * of them agree on.
 */
const DIGIT_VOTE_ROTATIONS = [-12, -8, -4, 4, 8];

/**
 * How many passes must agree before a voted value is used.
 *
 * Two is deliberately the floor rather than one: a single pass agreeing with
 * nothing is exactly the confidently-wrong read this whole mechanism exists to
 * reject. An empty field the user types into is much better than a plausible
 * wrong phone number they might not check.
 */
const MIN_VOTES = 2;

/**
 * TEMPORARY DIAGNOSTIC. One entry per recognition actually performed, so the
 * `?debug=1` panel can show what really happened on a real phone — how many passes
 * fitted in the budget, how long each took, and what each produced. Remove this,
 * `onPass`, and the panel in `main.ts` once the on-device behaviour is understood.
 * See `.superpowers/ocr-investigation-report.md`.
 */
export interface OcrPassReport {
  stage: 'probe' | 'pass' | 'digit' | 'crop';
  maxDim: number;
  rotation: number;
  ms: number;
  score: number;
  confidence: number;
  text: string;
  accepted: boolean;
}

export interface RunOcrOptions {
  /**
   * Predicate deciding whether a pass produced usable text. When it returns true
   * the remaining passes are skipped. Without it, only the first pass runs.
   *
   * `ocr.ts` deliberately knows nothing about names or phone numbers, so the
   * caller supplies this (see `main.ts`, which asks `extract.ts`).
   */
  accept?: (text: string) => boolean;
  /**
   * Pull out the value worth voting on, or null if this text has none.
   *
   * `runOcr` uses it twice: to tally the digit sweep's passes (see
   * `voteOnDigits`), and to ask what each primary pass read, which is what
   * decides whether that sweep runs at all (see `shouldVoteOnDigits`). Supplying
   * it keeps `ocr.ts` ignorant of what a phone number looks like — `main.ts`
   * answers with `extract.ts`.
   */
  voteCandidate?: (text: string) => string | null;
  /** Abort remaining passes once this signal aborts. */
  signal?: AbortSignal;
  /** TEMPORARY DIAGNOSTIC — see `OcrPassReport`. */
  onPass?: (report: OcrPassReport) => void;
}

export interface OcrResult {
  /** Best text the ladder produced, for the caller to parse as usual. */
  text: string;
  /**
   * Outcome of the digit vote. Three states, and the caller must tell them apart:
   *
   *  - `undefined` — the vote has nothing to say, either because it never ran
   *    (the fast path answered and both primary passes corroborated the number —
   *    see `shouldVoteOnDigits`), or because it ran and *abstained*: not one of
   *    its passes read a value. Trust the number in `text`.
   *  - a string — the vote ran and the passes agreed. This value wins over
   *    anything in `text`, which came from passes the vote exists to distrust.
   *  - `null` — the vote ran, its passes *did* read values, and they disagreed.
   *    Report no value at all rather than an unvalidated number from `text`.
   *
   * Abstention and disagreement are deliberately different. On a photo where the
   * label is small in frame the digit passes read nothing whatsoever while the
   * ladder read the number perfectly at a larger size — silence is not evidence
   * against the ladder, and treating it as such threw away correct answers.
   */
  voted: string | null | undefined;
}

/**
 * Pick the value the passes agree on: the mode, if it is unambiguous and clears
 * `MIN_VOTES`. Exported for unit testing; the rules are deliberately strict.
 *
 * Every ambiguous shape resolves to "no answer" rather than a guess — a tie for
 * first place, a field of one-vote singletons, or nothing recognised at all.
 */
export function pickVotedValue(candidates: (string | null)[]): string | null {
  const tally = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate) tally.set(candidate, (tally.get(candidate) ?? 0) + 1);
  }
  let winner: string | null = null;
  let best = 0;
  let tied = false;
  for (const [value, count] of tally) {
    if (count > best) {
      best = count;
      winner = value;
      tied = false;
    } else if (count === best) {
      tied = true;
    }
  }
  if (tied || best < MIN_VOTES) return null;
  return winner;
}

/**
 * Whether the digit vote should run. Exported for unit testing.
 *
 * The vote used to run only when the fast path failed outright, on the theory that
 * a fast-path answer is trustworthy. Round 6 measured that over 106 images and it
 * is not: **9 of the 11 wrong numbers were decided confidently by the fast path**,
 * so the vote never saw the cases it exists for.
 *
 * Voting on every photo fixes most of them (4 of 9 corrected, 4 blanked, 30/30
 * controls untouched) but costs +1253ms median on *every* capture, and since the
 * single-photo flow there is nothing left to overlap that wait with — the user
 * watches it. So the trigger is the cheapest signal that is already computed:
 * whether the two primary passes, plain and contrast-boosted, read the *same*
 * number. Measured over the same 106 images:
 *
 * | the two primary passes | n | correct | wrong | missing |
 * | --- | --- | --- | --- | --- |
 * | read the same number   | 56 | 54 | 2 | 0 |
 * | read different numbers |  8 |  1 | 6 | 1 |
 * | only one read a number | 20 | 15 | 3 | 2 |
 * | neither read a number  | 22 | 10 | 0 | 12 |
 *
 * Agreement is the correctness signal (54/56); everything else is worth the vote.
 * Note that "only one of them read a number" is deliberately *not* treated as
 * agreement: one pass reading what the other could not see is uncorroborated, its
 * wrong rate is 15% against 3.6%, and it holds 3 of the 11 wrong numbers — leaving
 * it out would take the trigger's coverage from 9 of 11 down to 6 of 11.
 *
 * The result runs the vote on roughly a quarter of photos instead of all of them,
 * and leaves the easy majority — including every upright printed label — at the
 * fast path's ~950ms.
 */
export function shouldVoteOnDigits({
  settledInFastPath,
  primaryCandidates,
}: {
  settledInFastPath: boolean;
  /** What each primary pass that ran read as a number, in order, null for none. */
  primaryCandidates: (string | null)[];
}): boolean {
  if (!settledInFastPath) return true;
  const [first, second] = primaryCandidates;
  // Both passes must have run and read the same number. One candidate is not two
  // passes agreeing, however much a single confident-looking number resembles one.
  if (primaryCandidates.length < 2) return true;
  return !(first !== null && first === second);
}

type Worker = Awaited<ReturnType<typeof Tesseract.createWorker>>;

let workerPromise: Promise<Worker> | null = null;

function createConfiguredWorker(): Promise<Worker> {
  return (async () => {
    const worker = await Tesseract.createWorker('nor');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      // Without this Tesseract guesses a DPI per image and the guess swings wildly
      // on photos (256-416 across the test set), which changes how it scales text
      // internally. Pinning it makes results reproducible.
      user_defined_dpi: '300',
    });
    return worker;
  })().catch((error) => {
    workerPromise = null;
    throw error;
  });
}

/**
 * Start loading the Tesseract worker and its language model.
 *
 * Safe to call more than once and safe to ignore the result. Called at app start
 * so the ~5.5MB of model and WASM downloads overlap the user taking their photos
 * rather than landing in the critical path after the last shutter.
 */
export function warmUpOcr(): Promise<unknown> {
  if (!workerPromise) workerPromise = createConfiguredWorker();
  return workerPromise.catch(() => undefined);
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) workerPromise = createConfiguredWorker();
  return workerPromise;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kunne ikke lese bildet'));
    };
    // Decoding through an <img> element is what applies the photo's EXIF
    // orientation tag. Phones store portrait shots rotated with an orientation
    // flag, and Tesseract cannot read sideways text, so skipping this step
    // silently breaks every portrait photo.
    image.src = url;
  });
}

function newCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas er ikke tilgjengelig');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return [canvas, context];
}

/**
 * Shrink towards the target by repeated halving.
 *
 * One `drawImage` straight from 3024px to 1280px asks the browser for a 2.4x
 * reduction in a single filter step, and how well that is filtered varies by
 * engine — a badly aliased result would throw away exactly the fine strokes the
 * label text is made of. Halving at most 2x at a time keeps every step inside
 * what canvas filtering handles well.
 */
function shrinkTowards(
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): CanvasImageSource {
  let source: CanvasImageSource = image;
  let width = sourceWidth;
  let height = sourceHeight;
  while (width > targetWidth * 2 && height > targetHeight * 2) {
    width = Math.max(targetWidth, Math.round(width / 2));
    height = Math.max(targetHeight, Math.round(height / 2));
    const [canvas, context] = newCanvas(width, height);
    context.drawImage(source, 0, 0, width, height);
    source = canvas;
  }
  return source;
}

/**
 * Downscale to `pass.maxDim` — or crop to `pass.crop` and resample by its scale —
 * then apply `pass.rotation`, grayscale, and the contrast boost.
 */
function preprocess(image: HTMLImageElement, pass: Pass): {
  canvas: HTMLCanvasElement;
  geometry: PassGeometry;
} {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  // A cropped pass starts from the region rather than the frame. Copying the
  // region out at 1:1 first keeps the rest of this function — the halving
  // downscale, the rotation, the grayscale — working on it unchanged.
  let source: CanvasImageSource = image;
  let sourceWidth = imageWidth;
  let sourceHeight = imageHeight;
  if (pass.crop) {
    sourceWidth = Math.max(1, Math.round(pass.crop.rect.x1 - pass.crop.rect.x0));
    sourceHeight = Math.max(1, Math.round(pass.crop.rect.y1 - pass.crop.rect.y0));
    const [cropCanvas, cropContext] = newCanvas(sourceWidth, sourceHeight);
    cropContext.drawImage(
      image,
      pass.crop.rect.x0,
      pass.crop.rect.y0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );
    source = cropCanvas;
  }

  const scale = pass.crop
    ? pass.crop.scale
    : Math.min(MAX_UPSCALE, pass.maxDim / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const shrunk = shrinkTowards(source, sourceWidth, sourceHeight, width, height);

  const radians = (pass.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  const [canvas, context] = newCanvas(
    Math.max(1, Math.round(width * cos + height * sin)),
    Math.max(1, Math.round(width * sin + height * cos))
  );

  // A rotated photo leaves empty corners. Fill them black so they read as
  // background rather than as transparent pixels of undefined colour.
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.translate(canvas.width / 2, canvas.height / 2);
  if (pass.rotation !== 0) context.rotate(radians);
  context.drawImage(shrunk, -width / 2, -height / 2, width, height);
  context.setTransform(1, 0, 0, 1, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    const value = pass.boostContrast
      ? Math.max(0, Math.min(255, luminance * CONTRAST_GAIN + CONTRAST_BIAS))
      : luminance;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  context.putImageData(pixels, 0, 0);

  return {
    canvas,
    geometry: {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      scaledWidth: width,
      scaledHeight: height,
      scale,
      rotation: pass.rotation,
    },
  };
}

interface Recognition {
  text: string;
  score: number;
  confidence: number;
  /** Where this pass saw text, in original photo pixels. See `deriveLabelRoi`. */
  words: RoiWord[];
}

/**
 * How much real label text a pass found.
 *
 * This replaces ranking candidate passes by text length, which actively picked the
 * *worst* pass: on the bottle photo the correct sideways pass produced 22
 * characters of clean text while a garbage pass produced 23 characters of noise
 * and won, which is exactly the garbage name the user saw. Confidence separates
 * them cleanly — the correct pass scores 15 here and every other pass scores 0.
 */
function scoreRecognition(data: Tesseract.Page): number {
  let score = 0;
  let sawWords = false;
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          sawWords = true;
          const text = (word.text ?? '').trim();
          if (
            word.confidence >= MIN_WORD_CONFIDENCE &&
            text.length >= MIN_WORD_LENGTH &&
            /[\p{L}\d]/u.test(text)
          ) {
            score += text.length;
          }
        }
      }
    }
  }
  if (sawWords) return score;

  // No word-level data available: approximate from the text, still ignoring the
  // one- and two-character speckle that made plain length such a bad measure.
  return data.text
    .split(/\s+/)
    .filter((token) => token.length >= MIN_WORD_LENGTH && /[\p{L}\d]/u.test(token))
    .reduce((total, token) => total + token.length, 0);
}

/**
 * Every word box the pass produced, mapped back to the photo's own pixels.
 *
 * This is the part that makes the crop stage possible at all: a pass whose text
 * was too poor to *accept* still reports where it found text, and on round 8's
 * distant labels those boxes sit on the label even when the characters inside
 * them are wrong.
 */
function locatedWords(data: Tesseract.Page, geometry: PassGeometry): RoiWord[] {
  const words: RoiWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (!word.bbox) continue;
          words.push({
            text: word.text ?? '',
            confidence: word.confidence,
            rect: wordRectInImage(
              { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 },
              geometry
            ),
          });
        }
      }
    }
  }
  return words;
}

async function recognize(
  worker: Worker,
  image: HTMLImageElement,
  pass: Pass
): Promise<Recognition> {
  const { canvas, geometry } = preprocess(image, pass);
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
  return {
    text: data.text,
    score: scoreRecognition(data),
    confidence: data.confidence,
    // A crop pass's boxes are in the crop's own frame, and the label has already
    // been located by the time one runs, so they are not worth mapping back.
    words: pass.crop ? [] : locatedWords(data, geometry),
  };
}

export async function runOcr(
  imageFile: File,
  options: RunOcrOptions = {}
): Promise<OcrResult> {
  const { accept, voteCandidate, signal, onPass } = options;
  const [worker, image] = await Promise.all([getWorker(), loadImageElement(imageFile)]);

  // Two separate bests: an accepted pass always beats an unaccepted one, however
  // much text the unaccepted one found, because only an accepted pass actually
  // produced what the caller is looking for.
  let bestAccepted: Recognition | null = null;
  let bestAny: Recognition = { text: '', score: -1, confidence: 0, words: [] };
  let recognised = false;
  let settled = false;
  let lastError: unknown = null;
  /** Every word box every full-frame pass produced, in photo pixels. */
  const seenWords: RoiWord[] = [];

  /** Runs one recognition. Returns what it read, or null if it threw. */
  const attempt = async (
    pass: Pass,
    stage: 'probe' | 'pass' | 'crop'
  ): Promise<Recognition | null> => {
    const startedAt = Date.now();
    let result: Recognition;
    try {
      result = await recognize(worker, image, pass);
    } catch (error) {
      // One pass blowing up (an oversized canvas, a transient worker error)
      // should not throw away the passes that did work.
      lastError = error;
      return null;
    }
    recognised = true;
    seenWords.push(...result.words);
    const accepted =
      result.score >= MIN_ACCEPT_SCORE && (accept ? accept(result.text) : true);
    if (result.score > bestAny.score) bestAny = result;
    if (accepted) {
      if (!bestAccepted || result.score > bestAccepted.score) bestAccepted = result;
      settled = true;
    }
    onPass?.({
      stage,
      maxDim: pass.maxDim,
      rotation: pass.rotation,
      ms: Date.now() - startedAt,
      score: result.score,
      confidence: result.confidence,
      text: result.text,
      accepted,
    });
    return result;
  };

  // Stage 1: the best target size upright, plain and boosted. Both always run —
  // no early break — so `bestAccepted` ends up holding whichever of the two found
  // more confident text, rather than just the first one that looked plausible.
  //
  // What each of them read as a number is kept: whether the two agree is what
  // decides the digit vote below (see `shouldVoteOnDigits`). Only passes that
  // actually ran are recorded, so an abort or a thrown pass reads as "did not
  // run" rather than as a pass that read nothing.
  const primaryCandidates: (string | null)[] = [];
  for (const pass of PRIMARY_PASSES) {
    if (signal?.aborted) break;
    const result = await attempt(pass, 'pass');
    if (result && voteCandidate) primaryCandidates.push(voteCandidate(result.text));
  }

  // Stage 2: only now, having failed upright, ask whether the label is sideways —
  // a name sticker wrapped around a bottle or a pencil case reads at a quarter
  // turn. Cheap probes decide it instead of brute-forcing full passes.
  let orientation = 0;
  if (!settled && !signal?.aborted) {
    let bestProbeScore = 0;
    for (const rotation of PROBE_ROTATIONS) {
      if (settled || signal?.aborted) break;
      const probe = await attempt(
        { maxDim: PROBE_MAX_DIM, rotation, boostContrast: true },
        'probe'
      );
      if (probe && probe.score > bestProbeScore) {
        bestProbeScore = probe.score;
        orientation = rotation;
      }
    }
  }

  // Whether the cheap stages above answered it. Anything beyond this point is the
  // tail, where the number read straight out of a pass is not to be trusted.
  const settledInFastPath = settled;

  // Stage 2.5: the ROI crop. The passes above have said where the label is, even
  // where they failed to read it (see `deriveLabelRoi`); crop to that and try
  // again with the text at a size the recogniser handles, which is the only way
  // the resolution round 8 showed is needed fits the budget.
  //
  // It runs before the refinement ladder on purpose. On the images it helps, the
  // ladder's five full-frame passes are ~1-2s of work that ends in nothing, and
  // two crop passes cost ~160ms; when the crop answers, the ladder is skipped
  // altogether. When it does not, nothing below has changed.
  let cropVoted: string | undefined;
  if (!signal?.aborted) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const roi = deriveLabelRoi(seenWords, imageWidth, imageHeight);
    if (roi && shouldCropToRoi({ settled, roi, imageWidth, imageHeight })) {
      const cropCandidates: (string | null)[] = [];
      for (const cropPass of CROP_PASSES) {
        if (signal?.aborted) break;
        const result = await attempt(
          {
            maxDim: DEFAULT_MAX_DIM,
            rotation: orientation,
            boostContrast: cropPass.boostContrast,
            crop: { rect: roi.rect, scale: cropPassScale(roi, cropPass.targetWordHeight) },
          },
          'crop'
        );
        if (result && voteCandidate) cropCandidates.push(voteCandidate(result.text));
      }
      // Corroboration, exactly as the digit vote demands it: one crop pass
      // reading a number is a guess, two passes at different scales and different
      // contrast reading the *same* number is an answer. Measured 7/10 of round
      // 8's ROI-bearing failures and 19/19 of its controls, with no wrong number.
      const [first, second] = cropCandidates;
      if (cropCandidates.length === CROP_PASSES.length && first !== null && first === second) {
        cropVoted = first;
      }
    }
  }

  // Stage 3: refine at whichever orientation won. With no orientation signal at
  // all this stays upright, which is the right prior.
  if (!settled) {
    // When a quarter turn won, the primary sizes have not been tried there yet.
    const passes =
      orientation === 0 ? REFINEMENT_PASSES : [...PRIMARY_PASSES, ...REFINEMENT_PASSES];
    for (const pass of passes) {
      if (settled || signal?.aborted) break;
      await attempt(
        {
          maxDim: pass.maxDim,
          rotation: (pass.rotation + orientation + 360) % 360,
          boostContrast: pass.boostContrast,
        },
        'pass'
      );
    }
  }

  // Stage 4: the digit vote. It runs whenever the *fast path* failed, even if a
  // refinement pass later declared itself happy — a refinement pass clears the
  // acceptance score on the strength of its confident *name* words while the
  // number it read is junk, which is exactly how the bottle photo produced a
  // confident `47250781`. On the tail the vote is the authority for the number;
  // the refinement passes above stay for the name.
  //
  // It also runs when the fast path *did* answer but the two primary passes did
  // not corroborate each other — see `shouldVoteOnDigits`, which is where the
  // measurement behind that lives. A fast-path answer is not self-evidently
  // right: 9 of round 6's 11 wrong numbers were fast-path answers.
  //
  // Unless the crop stage already settled it. Two corroborating reads of a label
  // rendered at a size the recogniser can handle beat five full-frame sweeps of a
  // digit row eight pixels tall — and the full-frame vote is not merely useless
  // there, it is harmful: on R008 the boosted primary pass read the number
  // correctly, the vote could not see it at all, its passes disagreed, and the
  // field was blanked. Skipping it when the crop agreed is what keeps that
  // answer.
  let voted: string | null | undefined = cropVoted;
  if (
    cropVoted === undefined &&
    voteCandidate &&
    shouldVoteOnDigits({ settledInFastPath, primaryCandidates }) &&
    recognised &&
    !signal?.aborted
  ) {
    const vote = await voteOnDigits({
      worker,
      image,
      orientation,
      voteCandidate,
      signal,
      onPass,
    });
    // Abstention (nothing read at all) leaves `voted` undefined, so the ladder's
    // own answer stands; only real disagreement blanks the field.
    voted = vote.winner ?? (vote.sawCandidate ? null : undefined);
  }

  if (!recognised && lastError) throw lastError;
  return { text: (bestAccepted ?? bestAny).text, voted };
}

/**
 * Read the digit string several times over and return what most reads agree on.
 *
 * Restricting the alphabet to digits stops the number absorbing stray letters,
 * and sweeping rotations exploits the fact that the engine's errors *scatter*
 * while the truth *concentrates*: each bad angle fails in its own way, so the
 * correct string is the mode and the wrong ones are singletons. Measured 7/7 on
 * the round-4 test set, including all three cases the ladder alone gets wrong.
 *
 * Deliberately does not touch the caller's best-text bookkeeping: these passes
 * contain no letters, so they can never be the text the name is read from.
 */
async function voteOnDigits({
  worker,
  image,
  orientation,
  voteCandidate,
  signal,
  onPass,
}: {
  worker: Worker;
  image: HTMLImageElement;
  orientation: number;
  voteCandidate: (text: string) => string | null;
  signal?: AbortSignal;
  onPass?: (report: OcrPassReport) => void;
}): Promise<{ winner: string | null; sawCandidate: boolean }> {
  const candidates: (string | null)[] = [];
  try {
    await worker.setParameters({ tessedit_char_whitelist: DIGIT_WHITELIST });
    for (const rotation of DIGIT_VOTE_ROTATIONS) {
      if (signal?.aborted) break;
      const pass: Pass = {
        maxDim: DEFAULT_MAX_DIM,
        rotation: (rotation + orientation + 360) % 360,
        boostContrast: true,
      };
      const startedAt = Date.now();
      try {
        const result = await recognize(worker, image, pass);
        const candidate = voteCandidate(result.text);
        candidates.push(candidate);
        onPass?.({
          stage: 'digit',
          maxDim: pass.maxDim,
          rotation: pass.rotation,
          ms: Date.now() - startedAt,
          score: result.score,
          confidence: result.confidence,
          text: result.text,
          accepted: candidate !== null,
        });
      } catch {
        // A failed angle is just a missing vote.
      }
    }
  } finally {
    // The worker is a session-long singleton, so the whitelist has to come off
    // again or every later recognition would be digits-only.
    await worker.setParameters({ tessedit_char_whitelist: '' }).catch(() => undefined);
  }
  return {
    winner: pickVotedValue(candidates),
    sawCandidate: candidates.some((candidate) => candidate !== null),
  };
}
