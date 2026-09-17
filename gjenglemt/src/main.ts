import './styles.css';
import type { CapturedPhoto, PhotoRole } from './types';
import { nextCaptureRole, canProceed } from './capture';
import { runOcr, warmUpOcr, type OcrPassReport, type OcrResult } from './ocr';
import { extractNameAndPhone } from './extract';
import { resolveLocation } from './location';
import { renderMessage } from './template';
import { buildSmsLink } from './share';

type Screen = 'capture' | 'analyzing' | 'confirm';

/**
 * Hard budget between the shutter for the *last* photo and the confirm screen.
 *
 * Recognition is started the moment a photo is captured (see `startNoteOcr` and
 * `startLocationLookup`) so that it overlaps the user taking their next photo
 * and tapping through. This deadline is what is left of the budget by the time
 * `analyze()` actually runs; anything still unfinished is dropped so the confirm
 * screen never makes the user wait.
 */
const RESULT_DEADLINE_MS = 5_000;

/**
 * TEMPORARY DIAGNOSTIC (`?debug=1`).
 *
 * Every latency number behind the 5s budget was measured in Node with native
 * libraries, never in a browser — there is no way to run one in the environment
 * this was developed in. So we do not actually know how long a recognition pass
 * takes on a real phone, and "the deadline cut the ladder short" and "recognition
 * genuinely failed" look identical from the outside.
 *
 * With `?debug=1` the confirm screen grows a panel reporting exactly that: how
 * many passes ran, how long each took, what each produced, and whether the
 * deadline was hit. Remove this flag, the `diagnostics` state, `renderDebugPanel`,
 * and `onPass`/`OcrPassReport` in `ocr.ts` once the real bottleneck is known.
 * See `.superpowers/ocr-investigation-report.md`.
 */
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';

/** TEMPORARY DIAGNOSTIC — timings and per-pass results for the `?debug=1` panel. */
interface Diagnostics {
  passes: OcrPassReport[];
  noteCapturedAt: number;
  ocrSettledAt: number;
  budgetMs: number;
  waitedMs: number;
  deadlineHit: boolean;
}

/** A recognition job started early, plus whatever partial text it has produced. */
interface PendingOcr {
  result: Promise<OcrResult>;
  /** Best text from the passes that finished, for when the deadline cuts us off. */
  partial: () => string;
}

/** A location lookup started early, plus its answer once it has arrived. */
interface PendingLocation {
  value: Promise<string | null>;
  /** Null until it resolves, so `analyze()` can take it without waiting. */
  resolved: string | null;
}

/**
 * Handles on the confirm screen's live fields, so a late location can be filled
 * in without re-rendering the screen out from under the user.
 */
interface ConfirmFields {
  setSted: (value: string) => void;
}

let confirmFields: ConfirmFields | null = null;

interface AppState {
  screen: Screen;
  photos: CapturedPhoto[];
  extraRequested: boolean;
  /** Timestamp of the most recent capture, whichever photo it was. */
  lastCaptureAt: number;
  ocr: PendingOcr | null;
  location: PendingLocation | null;
  navn: string;
  telefon: string;
  sted: string;
  melding: string;
  meldingDirty: boolean;
  /** TEMPORARY DIAGNOSTIC — see `DEBUG`. */
  diagnostics: Diagnostics;
}

const state: AppState = {
  screen: 'capture',
  photos: [],
  extraRequested: false,
  lastCaptureAt: 0,
  ocr: null,
  location: null,
  navn: '',
  telefon: '',
  sted: '',
  melding: '',
  meldingDirty: false,
  diagnostics: {
    passes: [],
    noteCapturedAt: 0,
    ocrSettledAt: 0,
    budgetMs: 0,
    waitedMs: 0,
    deadlineHit: false,
  },
};

const app = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  app.innerHTML = '';
  // The old confirm screen's inputs are gone; drop the handles to them.
  confirmFields = null;
  if (state.screen === 'capture') {
    app.appendChild(renderCaptureScreen());
  } else if (state.screen === 'analyzing') {
    app.appendChild(renderAnalyzingScreen());
  } else {
    app.appendChild(renderConfirmScreen());
  }
}

function labelForRole(role: PhotoRole): string {
  switch (role) {
    case 'note':
      return 'Ta bilde av lappen';
    case 'garment':
      return 'Ta bilde av plagget';
    case 'extra':
      return 'Ta et ekstra bilde';
  }
}

function nounForRole(role: PhotoRole): string {
  switch (role) {
    case 'note':
      return 'lappen';
    case 'garment':
      return 'plagget';
    case 'extra':
      return 'ekstrabildet';
  }
}

/**
 * Start OCR on the note photo immediately, so it runs while the user is still
 * taking the next photo instead of after they tap through.
 *
 * `runOcr` works through a ladder of preprocessing passes and asks this
 * predicate after each one whether the text is good enough to stop. We treat
 * "a phone number came out" as good enough, and remember the fullest text seen
 * so far in case the deadline cuts the ladder short.
 */
function startNoteOcr(file: File): PendingOcr {
  let best = '';
  state.diagnostics.noteCapturedAt = Date.now();
  state.diagnostics.passes = [];
  const result = runOcr(file, {
    accept: (candidate) => extractNameAndPhone(candidate).phone !== null,
    // What the digit vote tallies. `ocr.ts` only knows it is comparing strings.
    //
    // The whitespace collapse matters: a vote pass contains nothing but the
    // number, and Tesseract quite often breaks it across two lines ("47239" /
    // "791"). `extractNameAndPhone` is line-based — rightly, since on a real
    // label the lines mean something — so without this it reads two short runs
    // and reports no number. There are no other lines here to confuse, and a
    // digit group that only lines up by accident will not repeat across angles.
    voteCandidate: (candidate) => extractNameAndPhone(candidate.replace(/\s+/g, ' ')).phone,
    onPass: (report) => {
      // TEMPORARY DIAGNOSTIC — see DEBUG. Also doubles as the partial-result
      // fallback: `runOcr` ranks passes by confident word content, so take the
      // best-scoring text seen so far rather than the most recent or the longest.
      state.diagnostics.passes.push(report);
      // Digit-vote passes hold no letters, so they can never be the text a name
      // is read from.
      const nameBearing = state.diagnostics.passes.filter((p) => p.stage !== 'digit');
      if (nameBearing.length > 0) {
        best = nameBearing.reduce((a, b) => (b.score > a.score ? b : a)).text;
      }
    },
  }).catch((): OcrResult => ({ text: best, voted: undefined }));
  void result.then(() => {
    state.diagnostics.ocrSettledAt = Date.now();
  });
  return { result, partial: () => best };
}

/**
 * Same trick for the garment photo's location lookup, but its result is also
 * recorded as it lands so the confirm screen never has to wait for it.
 *
 * Location can involve a permission prompt, a GPS fix and a reverse-geocode
 * round trip, none of which this app controls, and it used to gate the confirm
 * screen alongside OCR: a run where OCR had the right answer in 314ms still sat
 * on the analysing screen for 4935ms because location never resolved. The 5s is
 * an absolute ceiling for the worst case, not a duration every run should take.
 */
function startLocationLookup(file: File): PendingLocation {
  const pending: PendingLocation = {
    value: resolveLocation(file).catch(() => null),
    resolved: null,
  };
  void pending.value.then((value) => {
    pending.resolved = value;
    backfillLocation(value);
  });
  return pending;
}

/**
 * Fill in `Sted` once a slow location lookup finally lands.
 *
 * Follows the same rule as `meldingDirty`: anything the user has already put
 * there wins, and we only ever fill a field that is still empty.
 */
function backfillLocation(value: string | null): void {
  if (!value) return;
  if (state.sted !== '') return;
  state.sted = value;
  confirmFields?.setSted(value);
}

function renderCaptureButton(role: PhotoRole): HTMLElement {
  const wrapper = document.createElement('div');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) {
      state.photos.push({ role, file });
      state.lastCaptureAt = Date.now();
      if (role === 'note') state.ocr = startNoteOcr(file);
      if (role === 'garment') state.location = startLocationLookup(file);
      render();
    }
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = labelForRole(role);
  button.addEventListener('click', () => input.click());

  wrapper.append(button, input);

  // Every OCR failure left after round 4 came down to the label being rotated in
  // the frame, and unlike a curved or shiny surface the user can fix that for
  // free by turning the phone. Only worth saying for the note photo.
  if (role === 'note') {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Tips: hold telefonen slik at teksten på lappen står vannrett.';
    wrapper.appendChild(hint);
  }

  return wrapper;
}

/**
 * Short pitch shown before the first photo is taken, explaining what the app
 * is for and how it works. Gone once capture starts so it doesn't clutter the
 * screen the user actually returns to while taking photos.
 */
function renderIntro(): HTMLElement {
  const intro = document.createElement('div');
  intro.className = 'intro';

  const title = document.createElement('h1');
  title.textContent = 'Gjenglemt';
  intro.appendChild(title);

  const pitch = document.createElement('p');
  pitch.textContent =
    'Masse klær og greier blir gjenglemt. Denne siden gjør det lettere å varsle eieren om hva du har funnet og hvor.';
  intro.appendChild(pitch);

  const howHeading = document.createElement('p');
  howHeading.className = 'intro-how';
  howHeading.textContent = 'Slik funker det:';
  intro.appendChild(howHeading);

  const steps = document.createElement('ol');
  for (const step of [
    'Ta bilde av lappen med navn og telefonnummer',
    'Ta bilde av plagget',
    'Sjekk at navn, telefon og sted stemmer',
    'Åpne meldingen og send den',
  ]) {
    const item = document.createElement('li');
    item.textContent = step;
    steps.appendChild(item);
  }
  intro.appendChild(steps);

  return intro;
}

function renderCaptureScreen(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'screen screen-capture';

  if (state.photos.length === 0) {
    container.appendChild(renderIntro());
  }

  const role = nextCaptureRole(state.photos, state.extraRequested);
  if (role) {
    container.appendChild(renderCaptureButton(role));
  }

  if (canProceed(state.photos)) {
    if (!state.extraRequested) {
      const addExtra = document.createElement('button');
      addExtra.type = 'button';
      addExtra.textContent = 'Legg til et bilde til';
      addExtra.addEventListener('click', () => {
        state.extraRequested = true;
        render();
      });
      container.appendChild(addExtra);
    }

    const proceed = document.createElement('button');
    proceed.type = 'button';
    proceed.className = 'primary';
    proceed.textContent = 'Gå videre';
    proceed.addEventListener('click', () => {
      state.screen = 'analyzing';
      render();
      void analyze();
    });
    container.appendChild(proceed);
  }

  return container;
}

function renderAnalyzingScreen(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'screen screen-analyzing';
  container.textContent = 'Analyserer bilder …';
  return container;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

async function analyze(): Promise<void> {
  const notePhoto = state.photos.find((p) => p.role === 'note')!;
  const garmentPhoto = state.photos.find((p) => p.role === 'garment')!;

  // Both jobs were started at capture time; only pick them up here. Whatever is
  // left of the 5s budget since the last shutter is all the extra time they get.
  const ocr = state.ocr ?? startNoteOcr(notePhoto.file);
  const location = state.location ?? startLocationLookup(garmentPhoto.file);
  const budget = Math.max(0, RESULT_DEADLINE_MS - (Date.now() - state.lastCaptureAt));
  const waitStartedAt = Date.now();

  // Only OCR gates the screen. Location gets whatever time OCR happened to take
  // and is then taken as-is; if it has not landed yet it keeps going and
  // `backfillLocation` fills the field in when it does.
  const ocrResult = await withTimeout(ocr.result, budget, null);

  // TEMPORARY DIAGNOSTIC — see DEBUG.
  state.diagnostics.budgetMs = budget;
  state.diagnostics.waitedMs = Date.now() - waitStartedAt;
  state.diagnostics.deadlineHit = ocrResult === null;

  const { name, phone } = extractNameAndPhone(ocrResult?.text ?? ocr.partial());

  // The digit vote overrules the number read straight out of the text whenever it
  // ran — including when it ran and found no agreement, where the honest answer
  // is an empty field rather than a number no two passes could corroborate.
  const voted = ocrResult?.voted;
  const telefon = voted === undefined ? phone : voted;

  state.navn = name ?? '';
  state.telefon = telefon ?? '';
  state.sted = location.resolved ?? '';
  state.melding = renderMessage({ navn: state.navn, sted: state.sted });
  state.meldingDirty = false;
  state.screen = 'confirm';
  render();
}

function labeledTextInput(
  labelText: string,
  value: string,
  onChange: (value: string) => void
): [HTMLLabelElement, HTMLInputElement] {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', () => onChange(input.value));
  label.appendChild(input);
  return [label, input];
}

/**
 * TEMPORARY DIAGNOSTIC (`?debug=1`) — see `DEBUG`.
 *
 * Renders the per-pass OCR report as selectable text plus a copy button, so the
 * operator can paste back what actually happened on their phone. Delete this
 * function together with the rest of the `?debug=1` plumbing.
 */
function renderDebugPanel(): HTMLElement {
  const { passes, noteCapturedAt, ocrSettledAt, budgetMs, waitedMs, deadlineHit } =
    state.diagnostics;

  const totalOcrMs = passes.reduce((total, pass) => total + pass.ms, 0);
  const lines = [
    `deadlineHit=${deadlineHit}  budget=${budgetMs}ms  waited=${waitedMs}ms`,
    `passes=${passes.length}  ocrTime=${totalOcrMs}ms` +
      `  noteShutter->ocrDone=${ocrSettledAt ? ocrSettledAt - noteCapturedAt : -1}ms` +
      `  noteShutter->lastShutter=${state.lastCaptureAt - noteCapturedAt}ms`,
    `ua=${navigator.userAgent}`,
    '',
    ...passes.map(
      (pass, index) =>
        `${index + 1}. ${pass.stage} dim=${pass.maxDim} rot=${pass.rotation} ` +
        `${pass.ms}ms score=${pass.score} conf=${Math.round(pass.confidence)} ` +
        `ok=${pass.accepted} :: ${JSON.stringify(pass.text.replace(/\s+/g, ' ').slice(0, 120))}`
    ),
  ];
  const report = lines.join('\n');

  const details = document.createElement('details');
  details.className = 'debug-panel';
  const summary = document.createElement('summary');
  summary.textContent = `Debug: ${passes.length} passes, ${totalOcrMs}ms${deadlineHit ? ', DEADLINE HIT' : ''}`;
  details.appendChild(summary);

  const pre = document.createElement('pre');
  pre.textContent = report;
  details.appendChild(pre);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Kopier debug';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(report).then(
      () => {
        copy.textContent = 'Kopiert';
      },
      () => {
        copy.textContent = 'Kunne ikke kopiere';
      }
    );
  });
  details.appendChild(copy);

  return details;
}

function renderConfirmScreen(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'screen screen-confirm';

  const thumbs = document.createElement('div');
  thumbs.className = 'thumbnails';
  for (const photo of state.photos) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(photo.file);
    img.alt = nounForRole(photo.role);
    thumbs.appendChild(img);
  }
  container.appendChild(thumbs);

  const meldingLabel = document.createElement('label');
  meldingLabel.textContent = 'Melding';
  const meldingTextarea = document.createElement('textarea');
  meldingTextarea.rows = 4;
  meldingTextarea.value = state.melding;
  meldingTextarea.addEventListener('input', () => {
    state.melding = meldingTextarea.value;
    state.meldingDirty = true;
  });
  meldingLabel.appendChild(meldingTextarea);

  function syncMeldingIfNotDirty(): void {
    if (state.meldingDirty) return;
    state.melding = renderMessage({ navn: state.navn, sted: state.sted });
    meldingTextarea.value = state.melding;
  }

  const [navnLabel] = labeledTextInput('Navn', state.navn, (value) => {
    state.navn = value;
    syncMeldingIfNotDirty();
  });
  container.appendChild(navnLabel);

  const [telefonLabel] = labeledTextInput('Telefon', state.telefon, (value) => {
    state.telefon = value;
  });
  container.appendChild(telefonLabel);

  const [stedLabel, stedInput] = labeledTextInput('Sted', state.sted, (value) => {
    state.sted = value;
    syncMeldingIfNotDirty();
  });
  container.appendChild(stedLabel);

  // Let a location lookup that is still running fill this in when it lands,
  // instead of the confirm screen waiting for it.
  confirmFields = {
    setSted: (value) => {
      stedInput.value = value;
      syncMeldingIfNotDirty();
    },
  };

  container.appendChild(meldingLabel);

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'primary';
  sendButton.textContent = 'Åpne melding';
  container.appendChild(sendButton);

  const status = document.createElement('div');
  status.className = 'share-status';
  status.hidden = true;
  container.appendChild(status);

  // TEMPORARY DIAGNOSTIC — see DEBUG.
  if (DEBUG) container.appendChild(renderDebugPanel());

  // Opens Meldinger directly in the right conversation, text pre-filled — see
  // buildSmsLink for why this is the primary path rather than navigator.share.
  // Photos can't be attached this way, so they're offered as a manual
  // follow-up: the conversation is already open and correctly addressed, so
  // attaching a photo there is a couple of taps.
  sendButton.addEventListener('click', () => {
    window.location.href = buildSmsLink(state.telefon, state.melding, navigator.userAgent);

    status.hidden = false;
    status.innerHTML = '';
    const note = document.createElement('p');
    note.textContent = 'Legg ved bildene i samtalen som åpner seg:';
    status.appendChild(note);

    for (const photo of state.photos) {
      const download = document.createElement('a');
      download.href = URL.createObjectURL(photo.file);
      download.download = photo.file.name || `${photo.role}.jpg`;
      download.textContent = `Last ned bilde av ${nounForRole(photo.role)}`;
      status.appendChild(download);
    }
  });

  return container;
}

// Pull the Tesseract worker and its language model down while the user is still
// on the capture screen, so the first recognition does not also pay for a ~2MB
// model download.
void warmUpOcr();

render();
