import './styles.css';
import type { CapturedPhoto, PhotoRole } from './types';
import { nextCaptureRole, canProceed } from './capture';
import { runOcr, warmUpOcr, type OcrPassReport } from './ocr';
import { extractNameAndPhone } from './extract';
import { resolveLocation } from './location';
import { renderMessage } from './template';
import { shareOrFallback } from './share';

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
  text: Promise<string>;
  /** Best text from the passes that finished, for when the deadline cuts us off. */
  partial: () => string;
}

interface AppState {
  screen: Screen;
  photos: CapturedPhoto[];
  extraRequested: boolean;
  /** Timestamp of the most recent capture, whichever photo it was. */
  lastCaptureAt: number;
  ocr: PendingOcr | null;
  location: Promise<string | null> | null;
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
  const text = runOcr(file, {
    accept: (candidate) => extractNameAndPhone(candidate).phone !== null,
    onPass: (report) => {
      // TEMPORARY DIAGNOSTIC — see DEBUG. Also doubles as the partial-result
      // fallback: `runOcr` ranks passes by confident word content, so take the
      // best-scoring text seen so far rather than the most recent or the longest.
      state.diagnostics.passes.push(report);
      const bestSoFar = state.diagnostics.passes.reduce((a, b) => (b.score > a.score ? b : a));
      best = bestSoFar.text;
    },
  }).catch(() => best);
  void text.then(() => {
    state.diagnostics.ocrSettledAt = Date.now();
  });
  return { text, partial: () => best };
}

/** Same trick for the garment photo's location lookup. */
function startLocationLookup(file: File): Promise<string | null> {
  return resolveLocation(file).catch(() => null);
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
  return wrapper;
}

function renderCaptureScreen(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'screen screen-capture';

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

  const [ocrText, sted] = await Promise.all([
    withTimeout(ocr.text, budget, null),
    withTimeout(location, budget, null),
  ]);

  // TEMPORARY DIAGNOSTIC — see DEBUG.
  state.diagnostics.budgetMs = budget;
  state.diagnostics.waitedMs = Date.now() - waitStartedAt;
  state.diagnostics.deadlineHit = ocrText === null;

  const { name, phone } = extractNameAndPhone(ocrText ?? ocr.partial());

  state.navn = name ?? '';
  state.telefon = phone ?? '';
  state.sted = sted ?? '';
  state.melding = renderMessage({ navn: state.navn, sted: state.sted });
  state.meldingDirty = false;
  state.screen = 'confirm';
  render();
}

function labeledTextInput(
  labelText: string,
  value: string,
  onChange: (value: string) => void
): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('input', () => onChange(input.value));
  label.appendChild(input);
  return label;
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

  container.appendChild(
    labeledTextInput('Navn', state.navn, (value) => {
      state.navn = value;
      syncMeldingIfNotDirty();
    })
  );
  container.appendChild(
    labeledTextInput('Telefon', state.telefon, (value) => {
      state.telefon = value;
    })
  );
  container.appendChild(
    labeledTextInput('Sted', state.sted, (value) => {
      state.sted = value;
      syncMeldingIfNotDirty();
    })
  );

  container.appendChild(meldingLabel);

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'primary';
  sendButton.textContent = 'Send';
  container.appendChild(sendButton);

  const status = document.createElement('div');
  status.className = 'share-status';
  status.hidden = true;
  container.appendChild(status);

  // TEMPORARY DIAGNOSTIC — see DEBUG.
  if (DEBUG) container.appendChild(renderDebugPanel());

  sendButton.addEventListener('click', () => {
    void (async () => {
      const files = state.photos.map((p) => p.file);
      const result = await shareOrFallback(files, state.melding, state.telefon);
      if (result.shared) return;

      status.hidden = false;
      status.innerHTML = '';
      const note = document.createElement('p');
      note.textContent = 'Husk å legge ved bildene manuelt:';
      status.appendChild(note);

      if (result.fallbackSmsLink) {
        const link = document.createElement('a');
        link.href = result.fallbackSmsLink;
        link.textContent = 'Åpne meldinger';
        status.appendChild(link);
      }

      for (const photo of state.photos) {
        const download = document.createElement('a');
        download.href = URL.createObjectURL(photo.file);
        download.download = photo.file.name || `${photo.role}.jpg`;
        download.textContent = `Last ned bilde av ${nounForRole(photo.role)}`;
        status.appendChild(download);
      }
    })();
  });

  return container;
}

// Pull the Tesseract worker and its language model down while the user is still
// on the capture screen, so the first recognition does not also pay for a ~2MB
// model download.
void warmUpOcr();

render();
