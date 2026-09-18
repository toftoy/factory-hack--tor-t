import './styles.css';
import { runOcr, warmUpOcr, type OcrPassReport, type OcrResult } from './ocr';
import { extractNameAndPhone } from './extract';
import { resolveLocation, getLiveCoords, type Coords } from './location';
import { renderMessage } from './template';
import { buildSmsLink } from './share';

type Screen = 'capture' | 'analyzing' | 'confirm';

/**
 * Hard budget between the shutter and the confirm screen.
 *
 * Recognition is started the moment the photo is captured (see `startNoteOcr`
 * and `startLocationLookup`) so it overlaps whatever render/analyze plumbing
 * runs next. This deadline is what is left of the budget by the time
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
  locationStartedAt: number;
  locationSettledAt: number;
  locationValue: string | null;
}

function emptyDiagnostics(): Diagnostics {
  return {
    passes: [],
    noteCapturedAt: 0,
    ocrSettledAt: 0,
    budgetMs: 0,
    waitedMs: 0,
    deadlineHit: false,
    locationStartedAt: 0,
    locationSettledAt: 0,
    locationValue: null,
  };
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
  /** True once `value` has settled, even if it settled to null (nothing found). */
  settled: boolean;
}

/**
 * Handles on the confirm screen's live fields, so a late location can be filled
 * in without re-rendering the screen out from under the user.
 */
interface ConfirmFields {
  setSted: (value: string) => void;
  /** Clears the "Henter sted …" placeholder once the lookup has settled, found or not. */
  setStedSettled: () => void;
}

let confirmFields: ConfirmFields | null = null;

/**
 * Set by `renderConfirmScreen` to its "Åpne melding" handler, so `analyze()`
 * can fire it automatically the moment navn/telefon are read.
 */
let triggerOpenMessage: (() => void) | null = null;

/**
 * True once the intro pitch has been shown, so a "Nytt funn" reset (see
 * `renderConfirmScreen`) returns straight to the camera instead of repeating
 * the pitch for someone already partway through sorting several items.
 */
let hasCapturedBefore = false;

/** Caps a hung `getCurrentPosition()` — documented to sometimes never resolve at
 * all regardless of its own `timeout` option (Chromium #342194498, Mozilla
 * #822967), which would otherwise leave "Henter sted …" stuck forever. */
const LIVE_GPS_TIMEOUT_MS = 10_000;

/**
 * A live GPS fix, requested once — on the first "Ta bilde av lappen" tap, not
 * at page load — and reused for every item captured in this session, see
 * `resolveLocation`. Requesting it unprompted at load is a known anti-pattern
 * (flagged by Chrome's own Lighthouse audit) that can get the permission
 * prompt ignored or the call left hanging on some mobile browsers; tying it to
 * the button tap makes it a genuine user gesture instead, while still starting
 * it before the photo itself is even taken.
 */
let sessionLiveCoords: Promise<Coords | null> | null = null;

function getSessionLiveCoords(): Promise<Coords | null> {
  if (!sessionLiveCoords) {
    sessionLiveCoords = withTimeout(getLiveCoords(), LIVE_GPS_TIMEOUT_MS, null);
  }
  return sessionLiveCoords;
}

interface AppState {
  screen: Screen;
  photo: File | null;
  /** Timestamp of the capture. */
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
  photo: null,
  lastCaptureAt: 0,
  ocr: null,
  location: null,
  navn: '',
  telefon: '',
  sted: '',
  melding: '',
  meldingDirty: false,
  diagnostics: emptyDiagnostics(),
};

const app = document.querySelector<HTMLDivElement>('#app')!;

function render(): void {
  app.innerHTML = '';
  // The old confirm screen's inputs are gone; drop the handles to them.
  confirmFields = null;
  triggerOpenMessage = null;
  if (state.screen === 'capture') {
    app.appendChild(renderCaptureScreen());
  } else if (state.screen === 'analyzing') {
    app.appendChild(renderAnalyzingScreen());
  } else {
    app.appendChild(renderConfirmScreen());
  }
}

/**
 * Start OCR on the photo immediately, so it runs while the rest of the
 * analyze/render plumbing catches up instead of after the fact.
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
 * Same trick for the location lookup, but its result is also recorded as it
 * lands so the confirm screen never has to wait for it.
 *
 * Location can involve a permission prompt, a GPS fix and a reverse-geocode
 * round trip, none of which this app controls, and it used to gate the confirm
 * screen alongside OCR: a run where OCR had the right answer in 314ms still sat
 * on the analysing screen for 4935ms because location never resolved. The 5s is
 * an absolute ceiling for the worst case, not a duration every run should take.
 */
function startLocationLookup(): PendingLocation {
  state.diagnostics.locationStartedAt = Date.now();
  const pending: PendingLocation = {
    value: resolveLocation(getSessionLiveCoords()).catch(() => null),
    resolved: null,
    settled: false,
  };
  void pending.value.then((value) => {
    pending.resolved = value;
    pending.settled = true;
    state.diagnostics.locationSettledAt = Date.now();
    state.diagnostics.locationValue = value;
    backfillLocation(value);
  });
  return pending;
}

/**
 * Fill in `Sted` once a slow location lookup finally lands.
 *
 * Follows the same rule as `meldingDirty`: anything the user has already put
 * there wins, and we only ever fill a field that is still empty. The confirm
 * screen's "Henter sted …" placeholder is cleared either way, since the lookup
 * has an answer now even when that answer is "nothing found" — reachable in the
 * overwhelming majority of runs, since OCR (median ~845ms) settles the confirm
 * screen long before a GPS fix and reverse-geocode round trip typically can.
 */
function backfillLocation(value: string | null): void {
  confirmFields?.setStedSettled();
  if (!value) return;
  if (state.sted !== '') return;
  state.sted = value;
  confirmFields?.setSted(value);
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
    'Trykk «Hent sted» først hvis du skal sortere flere gjenstander',
    'Ta bilde av lappen med navn og telefonnummer',
    'Meldingen åpnes automatisk, ferdig utfylt',
    'Ta bilde av plagget/tingen i meldingen og send det',
  ]) {
    const item = document.createElement('li');
    item.textContent = step;
    steps.appendChild(item);
  }
  intro.appendChild(steps);

  return intro;
}

function renderCaptureButton(): HTMLElement {
  const wrapper = document.createElement('div');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    state.photo = file;
    state.lastCaptureAt = Date.now();
    state.ocr = startNoteOcr(file);
    state.location = startLocationLookup();
    hasCapturedBefore = true;
    state.screen = 'analyzing';
    render();
    void analyze();
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary';
  button.textContent = 'Ta bilde av lappen';
  button.addEventListener('click', () => {
    // Started here, inside the tap, rather than at page load — see
    // `getSessionLiveCoords`.
    getSessionLiveCoords();
    input.click();
  });

  wrapper.append(button, input);

  // Every OCR failure left after round 4 came down to the label being rotated in
  // the frame, and unlike a curved or shiny surface the user can fix that for
  // free by turning the phone.
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Tips: hold telefonen slik at teksten på lappen står vannrett.';
  wrapper.appendChild(hint);

  return wrapper;
}

/**
 * Lets the user start the live GPS fetch (and its permission prompt) ahead of
 * time — e.g. right when arriving somewhere with several items to sort —
 * instead of only at the first photo. The message now opens automatically as
 * soon as navn/telefon are read (see `analyze`), which is usually well before
 * a GPS fix would otherwise be ready; fetching it here first is what makes
 * Sted actually make it into that auto-sent message instead of coming up
 * empty every time.
 */
function renderLocationButton(): HTMLElement {
  const wrapper = document.createElement('div');

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Hent sted';

  const status = document.createElement('p');
  status.className = 'hint';
  status.hidden = true;

  button.addEventListener('click', () => {
    status.hidden = false;
    status.textContent = 'Henter posisjon …';
    void getSessionLiveCoords().then((coords) => {
      status.textContent = coords ? 'Posisjon hentet.' : 'Fant ikke posisjon.';
    });
  });

  wrapper.append(button, status);
  return wrapper;
}

function renderCaptureScreen(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'screen screen-capture';

  if (!hasCapturedBefore) {
    container.appendChild(renderIntro());
  }

  container.appendChild(renderLocationButton());
  container.appendChild(renderCaptureButton());

  return container;
}

function renderAnalyzingScreen(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'screen screen-analyzing';
  container.textContent = 'Analyserer bilde …';
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
  const photo = state.photo!;

  // Both jobs were started at capture time; only pick them up here. Whatever is
  // left of the 5s budget since the shutter is all the extra time they get.
  const ocr = state.ocr ?? startNoteOcr(photo);
  const location = state.location ?? (state.location = startLocationLookup());
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
  // Land straight in Meldinger the moment navn/telefon are read, rather than
  // waiting for a manual tap — per explicit user request. Sted only makes it
  // into the message if it was already resolved by now (see
  // `renderLocationButton`); the confirm screen stays behind as a manual
  // fallback for fixing/resending afterwards.
  triggerOpenMessage?.();
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
  const {
    passes,
    noteCapturedAt,
    ocrSettledAt,
    budgetMs,
    waitedMs,
    deadlineHit,
    locationStartedAt,
    locationSettledAt,
    locationValue,
  } = state.diagnostics;

  const totalOcrMs = passes.reduce((total, pass) => total + pass.ms, 0);
  const lines = [
    `deadlineHit=${deadlineHit}  budget=${budgetMs}ms  waited=${waitedMs}ms`,
    `passes=${passes.length}  ocrTime=${totalOcrMs}ms` +
      `  shutter->ocrDone=${ocrSettledAt ? ocrSettledAt - noteCapturedAt : -1}ms`,
    `sted: ${locationSettledAt ? `settled after ${locationSettledAt - locationStartedAt}ms` : locationStartedAt ? 'still pending' : 'not started'}` +
      `  value=${JSON.stringify(locationValue)}`,
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

  if (state.photo) {
    const thumbs = document.createElement('div');
    thumbs.className = 'thumbnails';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(state.photo);
    img.alt = 'lappen';
    thumbs.appendChild(img);
    container.appendChild(thumbs);
  }

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
  // OCR (median ~845ms) settles the confirm screen well before a location lookup
  // usually can, so Sted is normally still empty here — without this the field
  // just looks blank/failed rather than still working on it.
  if (state.sted === '' && state.location && !state.location.settled) {
    stedInput.placeholder = 'Henter sted …';
  }
  container.appendChild(stedLabel);

  // Let a location lookup that is still running fill this in when it lands,
  // instead of the confirm screen waiting for it.
  confirmFields = {
    setSted: (value) => {
      stedInput.value = value;
      syncMeldingIfNotDirty();
    },
    setStedSettled: () => {
      stedInput.placeholder = '';
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

  // Opens Meldinger directly in the right conversation, text pre-filled — see
  // buildSmsLink for why this is the primary path rather than navigator.share.
  // The lapp photo was only ever for reading name/telefon/sted, not meant to be
  // shared, so nothing is attached automatically here: the user takes a fresh
  // photo of the item straight in that conversation instead.
  function openMessage(): void {
    window.location.href = buildSmsLink(state.telefon, state.melding, navigator.userAgent);

    status.hidden = false;
    status.textContent = 'Ta bilde av plagget/tingen i samtalen som åpner seg, og send det.';
  }
  sendButton.addEventListener('click', openMessage);
  // `analyze()` calls this the moment navn/telefon are read, so the user lands
  // straight in Meldinger without tapping anything — the button above stays as
  // a manual way to reopen/resend if something needs fixing afterwards.
  triggerOpenMessage = openMessage;

  const newFind = document.createElement('button');
  newFind.type = 'button';
  newFind.textContent = 'Nytt funn';
  // Resets everything about this item but keeps `sessionLiveCoords`, so the
  // next item's location lookup reuses the same GPS fix instead of asking for
  // permission and a fix all over again.
  newFind.addEventListener('click', () => {
    state.screen = 'capture';
    state.photo = null;
    state.ocr = null;
    state.location = null;
    state.navn = '';
    state.telefon = '';
    state.sted = '';
    state.melding = '';
    state.meldingDirty = false;
    state.diagnostics = emptyDiagnostics();
    render();
  });
  container.appendChild(newFind);

  // TEMPORARY DIAGNOSTIC — see DEBUG.
  if (DEBUG) container.appendChild(renderDebugPanel());

  return container;
}

// Pull the Tesseract worker and its language model down while the user is still
// on the capture screen, so the first recognition does not also pay for a ~2MB
// model download.
void warmUpOcr();

render();
