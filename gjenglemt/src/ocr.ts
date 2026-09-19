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
  stage: 'probe' | 'pass' | 'digit';
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
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): CanvasImageSource {
  let source: CanvasImageSource = image;
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  while (width > targetWidth * 2 && height > targetHeight * 2) {
    width = Math.max(targetWidth, Math.round(width / 2));
    height = Math.max(targetHeight, Math.round(height / 2));
    const [canvas, context] = newCanvas(width, height);
    context.drawImage(source, 0, 0, width, height);
    source = canvas;
  }
  return source;
}

/** Downscale to `pass.maxDim`, apply `pass.rotation`, grayscale, then boost contrast. */
function preprocess(image: HTMLImageElement, pass: Pass): HTMLCanvasElement {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(MAX_UPSCALE, pass.maxDim / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const shrunk = shrinkTowards(image, width, height);

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

  return canvas;
}

interface Recognition {
  text: string;
  score: number;
  confidence: number;
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

async function recognize(
  worker: Worker,
  image: HTMLImageElement,
  pass: Pass
): Promise<Recognition> {
  const { data } = await worker.recognize(preprocess(image, pass), {}, { text: true, blocks: true });
  return { text: data.text, score: scoreRecognition(data), confidence: data.confidence };
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
  let bestAny: Recognition = { text: '', score: -1, confidence: 0 };
  let recognised = false;
  let settled = false;
  let lastError: unknown = null;

  /** Runs one recognition. Returns what it read, or null if it threw. */
  const attempt = async (pass: Pass, stage: 'probe' | 'pass'): Promise<Recognition | null> => {
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
  let voted: string | null | undefined;
  if (
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
