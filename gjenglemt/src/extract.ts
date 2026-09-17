/**
 * Parsing of raw OCR text into a {name, phone} guess.
 *
 * The OCR pass (see `ocr.ts`) runs in sparse-text mode over a whole phone photo,
 * so its output is NOT a clean transcription of the label: it is the label's text
 * mixed in with short garbage "words" hallucinated from background texture
 * (leather grain, blurred clutter, fabric). Every heuristic here is built around
 * that reality:
 *
 *  - The phone number is the only thing in the text with a hard, checkable shape
 *    (8 digits, Norwegian numbers start with 2-9), so we find it first and treat
 *    it as the anchor.
 *  - The name is then read off the lines *adjacent to the phone line*, because on
 *    a pre-printed name sticker the name sits directly above (or below) the
 *    number. Picking "the first non-phone line" instead — what this module used
 *    to do — reliably returns a background noise fragment.
 */

export interface ExtractedContact {
  name: string | null;
  phone: string | null;
}

/** Separators OCR plausibly emits inside a phone number. */
const PHONE_SEPARATORS = '\\s.\u00a0\u2010\u2011\u2012\u2013\u2014\u2015/-';

/** A maximal run of digits possibly broken up by separators, e.g. "47 23 97 91". */
const DIGIT_RUN = new RegExp(`\\d(?:[${PHONE_SEPARATORS}\\d]*\\d)?`, 'g');

/**
 * Letters Tesseract commonly substitutes for digits on low-contrast label text.
 * Only applied as a fallback, and only inside tokens that are already mostly
 * digits, so it cannot turn a word into a phone number.
 */
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0',
  I: '1', l: '1', i: '1', '|': '1', '!': '1', '[': '1', ']': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6', b: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

interface PhoneHit {
  phone: string;
  lineIndex: number;
  /** The exact substring of the line that produced this hit, so we can cut it out. */
  raw: string;
  /** True when the number starts 2-9, i.e. it is a structurally valid NO number. */
  plausible: boolean;
}

/**
 * A line with almost nothing in it — a stray ".", "oe", "å" read out of a
 * shadow. These are worth dropping rather than ignoring in place, because a
 * single speckle line lands between the two lines of a name often enough to
 * split them ("Ida Marie" / "." / "Hauge") and cost us half the name.
 */
function isSpeckle(line: string): boolean {
  // Keep anything with a real run of digits — that is a phone number candidate,
  // however mangled. A lone stray digit is not: real OCR output put a bare "0"
  // between the two lines of "Ida Marie" / "Hauge" and cost us half the name.
  if (/\d{4,}/.test(line.replace(new RegExp(`[${PHONE_SEPARATORS}]`, 'g'), ''))) return false;
  if (looksLikeName(line)) return false;
  return (line.match(/\p{L}/gu) ?? []).length < 3;
}

function toLines(ocrText: string): string[] {
  return ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0 && !isSpeckle(line));
}

/**
 * Turn a raw digit run into an 8-digit Norwegian local number, or null.
 *
 * `+47`/`0047` country codes are stripped, but a bare 8-digit number is never
 * stripped even if it happens to start with "47" — 47xxxxxx is a perfectly
 * normal Norwegian mobile number (the real test label is 47239791).
 */
function normalizeCandidate(digits: string, hadPlus: boolean): string | null {
  let local = digits;
  if (local.length === 12 && local.startsWith('0047')) {
    local = local.slice(4);
  } else if (local.length === 10 && local.startsWith('47')) {
    local = local.slice(2);
  } else if (hadPlus && local.length > 8 && local.startsWith('47')) {
    local = local.slice(2);
  }
  return local.length === 8 ? local : null;
}

function findPhonesInLine(line: string, lineIndex: number): PhoneHit[] {
  const hits: PhoneHit[] = [];
  DIGIT_RUN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIGIT_RUN.exec(line)) !== null) {
    const raw = match[0];
    const digits = raw.replace(/\D/g, '');
    const before = line.slice(Math.max(0, match.index - 3), match.index);
    const hadPlus = /[+]\s*$/.test(before) || /\+\s*47\s*$/.test(before);
    const phone = normalizeCandidate(digits, hadPlus);
    if (phone) {
      hits.push({ phone, lineIndex, raw, plausible: /^[2-9]/.test(phone) });
    }
  }
  return hits;
}

/** Rewrite digit-lookalike letters inside tokens that are already mostly digits. */
function repairDigitLookalikes(line: string): string {
  return line
    .split(' ')
    .map((token) => {
      const digitCount = (token.match(/\d/g) ?? []).length;
      if (token.length < 6 || token.length > 14) return token;
      if (digitCount < Math.ceil(token.length * 0.6)) return token;
      return token.replace(/[A-Za-z|!\[\]]/g, (ch) => DIGIT_LOOKALIKES[ch] ?? ch);
    })
    .join(' ');
}

function findPhone(lines: string[]): PhoneHit | null {
  const passes: ((line: string) => string)[] = [(line) => line, repairDigitLookalikes];
  for (const transform of passes) {
    const hits: PhoneHit[] = [];
    for (let i = 0; i < lines.length; i++) {
      hits.push(...findPhonesInLine(transform(lines[i]), i));
    }
    const plausible = hits.find((hit) => hit.plausible);
    if (plausible) return plausible;
    if (hits.length > 0) return hits[0];
  }
  return null;
}

/** Trim leading/trailing characters that are not letters (OCR speckle, punctuation). */
function trimToLetters(line: string): string {
  return line.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}.]+$/u, '');
}

/**
 * Does this line look like a printed personal name rather than OCR noise?
 *
 * Deliberately shape-based, not dictionary-based: the label may hold any name,
 * including two names joined with a slash ("Anne/Nils").
 */
function looksLikeName(line: string): boolean {
  const trimmed = trimToLetters(line);
  if (trimmed.length === 0) return false;
  if (/\d/.test(trimmed)) return false;

  const letters = trimmed.match(/\p{L}/gu) ?? [];
  if (letters.length < 3) return false;

  const nonSpace = trimmed.replace(/\s/g, '');
  if (letters.length / nonSpace.length < 0.7) return false;

  // Printed names are capitalised; requiring a Capitalised word throws away most
  // of the lowercase noise fragments sparse-text mode invents ("pass", "gå", "hd").
  return /\p{Lu}\p{Ll}/u.test(trimmed);
}

function cleanName(line: string): string {
  return trimToLetters(line).replace(/\s+/g, ' ').trim();
}

/** How far from the phone line we will look before giving up on finding the name. */
const NAME_SEARCH_RADIUS = 4;
/** A printed label name spans at most two lines ("Anne/Nils" / "Toftøy"). */
const MAX_NAME_LINES = 2;

/**
 * Collect the run of name-like lines nearest to `start`, walking in `step`
 * direction, allowing a couple of noise lines in between before the first hit.
 */
function collectNameRun(lines: string[], start: number, step: -1 | 1): string[] {
  let i = start;
  let skipped = 0;
  while (i >= 0 && i < lines.length && skipped < NAME_SEARCH_RADIUS) {
    if (looksLikeName(lines[i])) break;
    skipped++;
    i += step;
  }
  if (i < 0 || i >= lines.length || !looksLikeName(lines[i])) return [];

  const run = [i];
  let j = i + step;
  while (
    run.length < MAX_NAME_LINES &&
    j >= 0 &&
    j < lines.length &&
    looksLikeName(lines[j])
  ) {
    run.push(j);
    j += step;
  }
  return run.sort((a, b) => a - b).map((index) => cleanName(lines[index]));
}

function bestStandaloneName(lines: string[]): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const line of lines) {
    if (!looksLikeName(line)) continue;
    const cleaned = cleanName(line);
    // Longer, multi-word lines are far more likely to be the real name than a
    // three-letter fragment Tesseract read out of a shadow.
    const score = (cleaned.match(/\p{L}/gu) ?? []).length + cleaned.split(' ').length * 2;
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }
  return best;
}

export function extractNameAndPhone(ocrText: string): ExtractedContact {
  const lines = toLines(ocrText);
  const hit = findPhone(lines);

  if (!hit) {
    return { name: bestStandaloneName(lines), phone: null };
  }

  // The name and the number sometimes land on the same recognised line.
  const remainder = lines[hit.lineIndex].replace(hit.raw, ' ');
  if (looksLikeName(remainder)) {
    return { name: cleanName(remainder), phone: hit.phone };
  }

  const above = collectNameRun(lines, hit.lineIndex - 1, -1);
  const run = above.length > 0 ? above : collectNameRun(lines, hit.lineIndex + 1, 1);
  const name = run.length > 0 ? run.join(' ') : bestStandaloneName(lines);

  return { name: name ?? null, phone: hit.phone };
}
