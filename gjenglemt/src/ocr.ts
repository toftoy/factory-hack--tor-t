import Tesseract, { PSM } from 'tesseract.js';

/**
 * OCR of the note photo.
 *
 * The input is a full-resolution phone photo (typically 3000-4000px wide) in which
 * a small pre-printed name sticker occupies a few percent of the frame. Feeding
 * that file straight to Tesseract does not work, for two measured reasons:
 *
 *  1. At full sensor resolution the photo's fine grain — sensor noise, JPEG
 *     artefacts, leather/fabric texture, blurred background — reads as text to
 *     Tesseract's binariser. Layout analysis then drowns the real label in
 *     hundreds of noise "words" and the number is lost completely.
 *  2. `PSM.SINGLE_BLOCK` makes that much worse, because it forces every one of
 *     those noise blobs into a single text block: recognition of a noisy 3024px
 *     photo took 14-34s and returned no digits at all in measurements.
 *
 * Downscaling the photo before recognition fixes both: it low-pass filters the
 * grain away and puts the sticker's text near the ~30px cap height Tesseract's
 * LSTM likes. On the empirical test set this took phone-number recovery from
 * 0/8 to 8/8 while making recognition roughly 7x faster.
 *
 * `PSM.SPARSE_TEXT` is then the right mode: it looks for text scattered anywhere
 * in the image with no page structure assumed, which is exactly "a small label
 * somewhere in a photo". It measured 14/17 against 12/17 for `PSM.AUTO` on the
 * adverse test set. It emits noise lines alongside the label text, which
 * `extract.ts` is written to expect.
 */

interface Pass {
  /** Longest edge, in pixels, to downscale the photo to before recognition. */
  maxDim: number;
  /** Extra rotation applied after downscaling, in degrees. */
  rotation: number;
}

/**
 * Preprocessing variants, tried in order until one satisfies `accept`.
 *
 * The first entry is the best single configuration measured (1280px upright),
 * so the normal case costs exactly one pass. The rest only run when the label
 * was not read, and each one targets a specific measured failure:
 *
 *  - other scales: a blurred photo needs a smaller target, a distant sticker a
 *    larger one — different photos fail at different scales.
 *  - +/-12 degrees: Tesseract's own deskew gives up somewhere past ~10 degrees
 *    of camera tilt, and a hand-held shot of a label on a bag is often tilted.
 *  - quarter turns: sideways text is unreadable in `PSM.SPARSE_TEXT`, which has
 *    no orientation detection (that needs OSD data we do not ship). This catches
 *    photos whose EXIF orientation tag is missing or wrong.
 */
const PASSES: Pass[] = [
  { maxDim: 1280, rotation: 0 },
  { maxDim: 1600, rotation: 0 },
  { maxDim: 1000, rotation: 0 },
  { maxDim: 1280, rotation: 12 },
  { maxDim: 1280, rotation: -12 },
  { maxDim: 1280, rotation: 90 },
  { maxDim: 1280, rotation: 270 },
];

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
 * Start loading the Tesseract worker and its ~2MB Norwegian language model.
 *
 * Safe to call more than once and safe to ignore the result. Called at app start
 * so the download overlaps the user taking their photos rather than being paid
 * at recognition time.
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

/**
 * Downscale to `pass.maxDim`, apply `pass.rotation`, and flatten to grayscale.
 *
 * Grayscale is done by hand rather than with a CSS filter so the result does not
 * depend on the browser's filter implementation. A global contrast stretch was
 * measured here too and made results slightly worse (13/17 against 14/17) — on a
 * photo with a bright background it mostly amplifies the grain — so the pixels
 * are left alone beyond the luminance conversion.
 */
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
    data[i] = luminance;
    data[i + 1] = luminance;
    data[i + 2] = luminance;
  }
  context.putImageData(pixels, 0, 0);

  return canvas;
}

export async function runOcr(imageFile: File, options: RunOcrOptions = {}): Promise<string> {
  const { accept, signal } = options;
  const [worker, image] = await Promise.all([getWorker(), loadImageElement(imageFile)]);

  let best = '';
  let recognised = false;
  let lastError: unknown = null;

  for (const pass of PASSES) {
    if (signal?.aborted) break;

    let text: string;
    try {
      ({
        data: { text },
      } = await worker.recognize(preprocess(image, pass)));
    } catch (error) {
      // One pass blowing up (an oversized canvas, a transient worker error)
      // should not throw away the passes that did work.
      lastError = error;
      continue;
    }

    recognised = true;
    if (!accept || accept(text)) return text;
    if (text.trim().length > best.trim().length) best = text;
  }

  if (!recognised && lastError) throw lastError;
  return best;
}
