import './styles.css';
import type { CapturedPhoto, PhotoRole } from './types';
import { nextCaptureRole, canProceed } from './capture';
import { runOcr } from './ocr';
import { extractNameAndPhone } from './extract';
import { resolveLocation } from './location';
import { renderMessage } from './template';
import { shareOrFallback } from './share';

type Screen = 'capture' | 'analyzing' | 'confirm';

interface AppState {
  screen: Screen;
  photos: CapturedPhoto[];
  extraRequested: boolean;
  navn: string;
  telefon: string;
  sted: string;
  melding: string;
  meldingDirty: boolean;
}

const state: AppState = {
  screen: 'capture',
  photos: [],
  extraRequested: false,
  navn: '',
  telefon: '',
  sted: '',
  melding: '',
  meldingDirty: false,
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

  const [ocrText, sted] = await Promise.all([
    withTimeout(runOcr(notePhoto.file).catch(() => ''), 30_000, ''),
    withTimeout(resolveLocation(garmentPhoto.file).catch(() => null), 15_000, null),
  ]);

  const { name, phone } = extractNameAndPhone(ocrText);

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

render();
