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
 *     every scale tried. So the boost is applied on every pass, not as a fallback.
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
 * Contrast boost, applied only on the dedicated rescue pass below.
 *
 * Measured both ways: applying a gain to *every* pass is a net loss. A gentle
 * gain (1.4) scored 31/34 against 29/34 plain on phone numbers but started eating
 * the first letter of names ("ari Nordmann"), and a strong gain (1.8) dropped to
 * 25/34 because it blows out normally-exposed photos. Used as one fallback pass
 * it can only ever add recoveries, which is what the bottle photo needs.
 */
const CONTRAST_GAIN = 1.8;
const CONTRAST_BIAS = -60;

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
  /** Apply the contrast boost. Off except on the dedicated rescue pass. */
  boostContrast?: boolean;
}

/** The best single configuration measured. Most photos are answered here and stop. */
const PRIMARY_PASS: Pass = { maxDim: DEFAULT_MAX_DIM, rotation: 0 };

/**
 * Quarter turns the probe chooses between once upright has already failed.
 *
 * Upright is not probed because `PRIMARY_PASS` just tried it at full quality.
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
  { maxDim: DEFAULT_MAX_DIM, rotation: 0, boostContrast: true },
  { maxDim: 1000, rotation: 0 },
  { maxDim: DEFAULT_MAX_DIM, rotation: 12 },
  { maxDim: DEFAULT_MAX_DIM, rotation: -12 },
];

/**
 * TEMPORARY DIAGNOSTIC. One entry per recognition actually performed, so the
 * `?debug=1` panel can show what really happened on a real phone — how many passes
 * fitted in the budget, how long each took, and what each produced. Remove this,
 * `onPass`, and the panel in `main.ts` once the on-device behaviour is understood.
 * See `.superpowers/ocr-investigation-report.md`.
 */
export interface OcrPassReport {
  stage: 'probe' | 'pass';
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
  /** Abort remaining passes once this signal aborts. */
  signal?: AbortSignal;
  /** TEMPORARY DIAGNOSTIC — see `OcrPassReport`. */
  onPass?: (report: OcrPassReport) => void;
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
  const scale = Math.min(1, pass.maxDim / Math.max(sourceWidth, sourceHeight));
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

export async function runOcr(imageFile: File, options: RunOcrOptions = {}): Promise<string> {
  const { accept, signal, onPass } = options;
  const [worker, image] = await Promise.all([getWorker(), loadImageElement(imageFile)]);

  let best: Recognition = { text: '', score: -1, confidence: 0 };
  let recognised = false;
  let settled = false;
  let lastError: unknown = null;

  /** Runs one recognition. Returns its score, or null if it threw. */
  const attempt = async (pass: Pass, stage: 'probe' | 'pass'): Promise<number | null> => {
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
    if (result.score > best.score) best = result;
    if (accepted) settled = true;
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
    return result.score;
  };

  // Stage 1: the best single configuration, upright. Most photos stop here, so
  // the common case costs exactly one recognition.
  await attempt(PRIMARY_PASS, 'pass');

  // Stage 2: only now, having failed upright, ask whether the label is sideways —
  // a name sticker wrapped around a bottle or a pencil case reads at a quarter
  // turn. Cheap probes decide it instead of brute-forcing full passes.
  let orientation = 0;
  if (!settled && !signal?.aborted) {
    let bestProbeScore = 0;
    for (const rotation of PROBE_ROTATIONS) {
      if (settled || signal?.aborted) break;
      const score = await attempt({ maxDim: PROBE_MAX_DIM, rotation }, 'probe');
      if (score !== null && score > bestProbeScore) {
        bestProbeScore = score;
        orientation = rotation;
      }
    }
  }

  // Stage 3: refine at whichever orientation won. With no orientation signal at
  // all this stays upright, which is the right prior.
  if (!settled) {
    const passes =
      orientation === 0 ? REFINEMENT_PASSES : [PRIMARY_PASS, ...REFINEMENT_PASSES];
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

  if (!recognised && lastError) throw lastError;
  return best.text;
}
