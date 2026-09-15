# Gjenglemt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `gjenglemt/`, a static, client-side-only web app that lets staff photograph a forgotten item and the note left with it, guesses the owner's name/phone (OCR) and the item's location (photo GPS), lets the staff member review/correct the guess, then hands off to the phone's native share sheet to text the owner.

**Architecture:** Vanilla Vite + TypeScript single-page app, no UI framework. Business logic (text extraction, message templating, location resolution, share-link building, capture-flow state) lives in small, independently unit-tested pure/near-pure modules under `src/`; `main.ts` is a thin DOM-rendering orchestrator that wires those modules into four screens (capture → analyzing → confirm → share). No backend, no bundler plugins beyond Vite's defaults.

**Tech Stack:** Vite 8, TypeScript 7, Vitest 5 + jsdom (unit tests), Tesseract.js 7 (in-browser OCR), exifr 7 (EXIF GPS reading), playwright-core 1.63 (headless smoke test), plain CSS.

**Spec:** `docs/superpowers/specs/2026-09-15-gjenglemt-design.md`

## Global Constraints

- Everything runs client-side in the browser. No backend, no server component, no accounts, no database — nothing persists once the tab closes.
- The only network call the app ever makes is a reverse-geocoding request to OpenStreetMap's Nominatim API, sending only latitude/longitude — never photos.
- No address is ever extracted from the note photo's text — only from the garment photo's location (EXIF GPS, falling back to live `navigator.geolocation`).
- All user-facing UI text is in Norwegian.
- The confirm/edit screen is mandatory and can never be skipped — OCR and location guesses are best-effort and a human must review them before anything is shared.
- The exact default message template is: `Hei. Vi fant et gjenglemt plagg. Sted: ${sted}. Navn: ${navn}` (with placeholders substituted, falling back to `(ukjent sted)` / `(ukjent navn)` when blank).
- The project lives entirely inside its own top-level folder `gjenglemt/` in the repo, self-contained with its own `package.json`, independent of the rest of the repo.
- Deploys as static files (e.g. GitHub Pages) — the build output must be a plain `dist/` folder with no server-side requirements.
- Camera capture, EXIF reading on real photos, live geolocation, and `navigator.share` cannot be exercised in this sandbox (no phone, no real camera/GPS). Tasks that touch these must say so explicitly rather than claim device behavior is verified, and must leave a manual QA checklist for real-device testing.

---

## Task 1: Project scaffolding

**Files:**
- Create: `gjenglemt/package.json`
- Create: `gjenglemt/tsconfig.json`
- Create: `gjenglemt/vite.config.ts`
- Create: `gjenglemt/index.html`
- Create: `gjenglemt/src/styles.css`
- Create: `gjenglemt/src/main.ts`
- Create: `gjenglemt/.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a buildable, runnable, testable empty Vite+TS app. `npm run dev`, `npm run build`, `npm test` all work from inside `gjenglemt/`. Later tasks add modules under `src/` and eventually replace `main.ts`'s body.

- [ ] **Step 1: Create the package manifest**

Create `gjenglemt/package.json`:

```json
{
  "name": "gjenglemt",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "smoke": "node scripts/smoke-test.mjs",
    "generate-icons": "node scripts/generate-icons.mjs"
  },
  "dependencies": {
    "exifr": "^7.1.3",
    "tesseract.js": "^7.0.0"
  },
  "devDependencies": {
    "jsdom": "^30.0.1",
    "playwright-core": "^1.63.0",
    "typescript": "^7.0.2",
    "vite": "^8.3.0",
    "vitest": "^5.0.1"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Create `gjenglemt/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the Vite + Vitest config**

Create `gjenglemt/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 4: Create the HTML shell**

Create `gjenglemt/index.html`:

```html
<!doctype html>
<html lang="no">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gjenglemt</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the stylesheet**

Create `gjenglemt/src/styles.css`:

```css
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  padding: 1rem;
  background: #f5f5f5;
}

.screen {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 480px;
  margin: 0 auto;
}

button {
  padding: 0.9rem 1rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #2b6777;
  background: white;
  color: #2b6777;
}

button.primary {
  background: #2b6777;
  color: white;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

input[type='text'],
textarea {
  padding: 0.6rem;
  font-size: 1rem;
  border-radius: 0.4rem;
  border: 1px solid #ccc;
  font-family: inherit;
}

.thumbnails {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
}

.thumbnails img {
  height: 96px;
  border-radius: 0.4rem;
  object-fit: cover;
}

.share-status a {
  display: block;
  margin-top: 0.5rem;
}
```

- [ ] **Step 6: Create a placeholder entry point**

Create `gjenglemt/src/main.ts` (a later task replaces the body entirely once the supporting modules exist):

```ts
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<h1>Gjenglemt</h1><p>Under utvikling &hellip;</p>';
```

- [ ] **Step 7: Add a .gitignore**

Create `gjenglemt/.gitignore`:

```
node_modules
dist
```

- [ ] **Step 8: Install dependencies and verify the build**

Run:

```bash
cd gjenglemt
npm install
npm run build
```

Expected: install succeeds, `tsc` reports no errors, `vite build` produces `dist/index.html` and `dist/assets/*`.

- [ ] **Step 9: Verify the dev server serves the placeholder**

Run:

```bash
npm run dev -- --port 5173 &
sleep 2
curl -s http://localhost:5173/ | grep -o '<div id="app">'
kill %1
```

Expected: the `curl` output contains `<div id="app">` (confirms the dev server is serving `index.html`).

- [ ] **Step 10: Commit**

```bash
cd ..
git add gjenglemt/package.json gjenglemt/tsconfig.json gjenglemt/vite.config.ts \
  gjenglemt/index.html gjenglemt/src/styles.css gjenglemt/src/main.ts gjenglemt/.gitignore
git commit -m "gjenglemt: scaffold empty Vite+TypeScript app"
```

(`node_modules`, `dist`, and the lockfile that `npm install` created are handled by `.gitignore` / committed as-is — do not add `node_modules` or `dist`.)

Note: also `git add gjenglemt/package-lock.json` — the lockfile is not gitignored and should be committed for reproducible installs.

---

## Task 2: PWA manifest and icons

**Files:**
- Create: `gjenglemt/scripts/generate-icons.mjs`
- Create: `gjenglemt/public/manifest.json`
- Create: `gjenglemt/public/icon-192.png` (generated, not hand-written)
- Create: `gjenglemt/public/icon-512.png` (generated, not hand-written)
- Modify: `gjenglemt/index.html`

**Interfaces:**
- Consumes: `gjenglemt/index.html` from Task 1
- Produces: `npm run generate-icons` regenerates the two PNG icons on demand; `index.html` links to the manifest and icons so "Add to Home Screen" works.

- [ ] **Step 1: Write the icon generator script**

Create `gjenglemt/scripts/generate-icons.mjs` (writes a solid-teal square with a white circle — a minimal placeholder mark, no external image tooling required):

```js
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size) {
  const bg = [0x2b, 0x67, 0x77];
  const fg = [0xff, 0xff, 0xff];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.28;
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // PNG filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inCircle = dx * dx + dy * dy <= r * r;
      const [rr, gg, bb] = inCircle ? fg : bg;
      raw[offset++] = rr;
      raw[offset++] = gg;
      raw[offset++] = bb;
      raw[offset++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), makeIcon(size));
  console.log(`Wrote public/icon-${size}.png`);
}
```

- [ ] **Step 2: Run the generator and verify the output**

Run:

```bash
mkdir -p gjenglemt/public
node gjenglemt/scripts/generate-icons.mjs
file gjenglemt/public/icon-192.png gjenglemt/public/icon-512.png
```

Expected: `file` reports both as `PNG image data, 192 x 192, 8-bit/color RGBA, non-interlaced` and `512 x 512` respectively.

- [ ] **Step 3: Write the web manifest**

Create `gjenglemt/public/manifest.json`:

```json
{
  "name": "Gjenglemt",
  "short_name": "Gjenglemt",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2b6777",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: Link the manifest and icons from index.html**

Edit `gjenglemt/index.html`, adding inside `<head>` after `<title>Gjenglemt</title>`:

```html
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
    <link rel="icon" href="/icon-192.png" />
    <meta name="theme-color" content="#2b6777" />
```

- [ ] **Step 5: Verify the build serves the manifest and icons**

Run:

```bash
cd gjenglemt
npm run build
ls dist/manifest.json dist/icon-192.png dist/icon-512.png
grep -o 'rel="manifest"' dist/index.html
```

Expected: all three files exist in `dist/`, and the manifest link tag is present in the built HTML.

- [ ] **Step 6: Commit**

```bash
cd ..
git add gjenglemt/scripts/generate-icons.mjs gjenglemt/public/manifest.json \
  gjenglemt/public/icon-192.png gjenglemt/public/icon-512.png gjenglemt/index.html
git commit -m "gjenglemt: add PWA manifest and generated icons"
```

---

## Task 3: Message template module

**Files:**
- Create: `gjenglemt/src/template.ts`
- Test: `gjenglemt/src/template.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `MessageFields` type (`{ navn: string; sted: string }`) and `renderMessage(fields: MessageFields): string`, used by `main.ts` in Task 9 to pre-fill the confirm screen's message field.

- [ ] **Step 1: Write the failing test**

Create `gjenglemt/src/template.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMessage } from './template';

describe('renderMessage', () => {
  it('fills in navn and sted', () => {
    expect(renderMessage({ navn: 'Per Persem', sted: 'Storgata 1, Oslo' })).toBe(
      'Hei. Vi fant et gjenglemt plagg. Sted: Storgata 1, Oslo. Navn: Per Persem'
    );
  });

  it('falls back to placeholders when fields are blank', () => {
    expect(renderMessage({ navn: '', sted: '' })).toBe(
      'Hei. Vi fant et gjenglemt plagg. Sted: (ukjent sted). Navn: (ukjent navn)'
    );
  });

  it('trims whitespace-only fields to the placeholder', () => {
    expect(renderMessage({ navn: '   ', sted: '  ' })).toBe(
      'Hei. Vi fant et gjenglemt plagg. Sted: (ukjent sted). Navn: (ukjent navn)'
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gjenglemt && npx vitest run src/template.test.ts`
Expected: FAIL — `template.ts` does not exist yet.

- [ ] **Step 3: Implement the module**

Create `gjenglemt/src/template.ts`:

```ts
export interface MessageFields {
  navn: string;
  sted: string;
}

export function renderMessage({ navn, sted }: MessageFields): string {
  const navnPart = navn.trim() || '(ukjent navn)';
  const stedPart = sted.trim() || '(ukjent sted)';
  return `Hei. Vi fant et gjenglemt plagg. Sted: ${stedPart}. Navn: ${navnPart}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/template.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add gjenglemt/src/template.ts gjenglemt/src/template.test.ts
git commit -m "gjenglemt: add message template module"
```

---

## Task 4: Phone/name extraction module

**Files:**
- Create: `gjenglemt/src/extract.ts`
- Test: `gjenglemt/src/extract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ExtractedContact` type (`{ name: string | null; phone: string | null }`) and `extractNameAndPhone(ocrText: string): ExtractedContact`, used by `main.ts` in Task 9 on the OCR output of the note photo.

- [ ] **Step 1: Write the failing test**

Create `gjenglemt/src/extract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractNameAndPhone } from './extract';

describe('extractNameAndPhone', () => {
  it('extracts a plain 8-digit number and the name on the other line', () => {
    expect(extractNameAndPhone('Per Persem\n99887766')).toEqual({
      name: 'Per Persem',
      phone: '99887766',
    });
  });

  it('extracts a number written with spaces', () => {
    expect(extractNameAndPhone('Kari Nordmann\n99 88 77 66').phone).toBe('99887766');
  });

  it('strips a +47 country code prefix', () => {
    expect(extractNameAndPhone('Ola Nordmann\n+47 99887766').phone).toBe('99887766');
  });

  it('picks the first non-phone line as the name guess', () => {
    expect(extractNameAndPhone('99887766\nPer Persem').name).toBe('Per Persem');
  });

  it('returns nulls when nothing matches', () => {
    expect(extractNameAndPhone('')).toEqual({ name: null, phone: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gjenglemt && npx vitest run src/extract.test.ts`
Expected: FAIL — `extract.ts` does not exist yet.

- [ ] **Step 3: Implement the module**

Create `gjenglemt/src/extract.ts`:

```ts
const PHONE_PATTERN = /(?:\+47[\s]?)?(?:\d[\s]?){8}/g;

function normalizePhone(match: string): string {
  const digits = match.replace(/\D/g, '');
  const local = digits.length > 8 && digits.startsWith('47') ? digits.slice(2) : digits;
  return local;
}

export interface ExtractedContact {
  name: string | null;
  phone: string | null;
}

export function extractNameAndPhone(ocrText: string): ExtractedContact {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let phone: string | null = null;
  let phoneLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(PHONE_PATTERN);
    if (!matches) continue;
    const digitsOnly = matches.map(normalizePhone).find((digits) => digits.length === 8);
    if (digitsOnly) {
      phone = digitsOnly;
      phoneLineIndex = i;
      break;
    }
  }

  const name = lines.find((_, i) => i !== phoneLineIndex) ?? null;

  return { name, phone };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/extract.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add gjenglemt/src/extract.ts gjenglemt/src/extract.test.ts
git commit -m "gjenglemt: add phone/name extraction module"
```

---

## Task 5: Capture flow state module

**Files:**
- Create: `gjenglemt/src/types.ts`
- Create: `gjenglemt/src/capture.ts`
- Test: `gjenglemt/src/capture.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `PhotoRole` (`'note' | 'garment' | 'extra'`), `CapturedPhoto` (`{ role: PhotoRole; file: File }`), `nextCaptureRole(photos: CapturedPhoto[], extraRequested: boolean): PhotoRole | null`, `canProceed(photos: CapturedPhoto[]): boolean`. Used by `main.ts` in Task 9 to drive the capture screen.

- [ ] **Step 1: Define the shared types**

Create `gjenglemt/src/types.ts`:

```ts
export type PhotoRole = 'note' | 'garment' | 'extra';

export interface CapturedPhoto {
  role: PhotoRole;
  file: File;
}
```

- [ ] **Step 2: Write the failing test**

Create `gjenglemt/src/capture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextCaptureRole, canProceed } from './capture';
import type { CapturedPhoto } from './types';

function photo(role: CapturedPhoto['role']): CapturedPhoto {
  return { role, file: new File([''], `${role}.jpg`, { type: 'image/jpeg' }) };
}

describe('nextCaptureRole', () => {
  it('asks for the note first when nothing captured', () => {
    expect(nextCaptureRole([], false)).toBe('note');
  });

  it('asks for the garment after the note', () => {
    expect(nextCaptureRole([photo('note')], false)).toBe('garment');
  });

  it('returns null once note and garment exist and no extra was requested', () => {
    expect(nextCaptureRole([photo('note'), photo('garment')], false)).toBeNull();
  });

  it('asks for an extra photo once requested', () => {
    expect(nextCaptureRole([photo('note'), photo('garment')], true)).toBe('extra');
  });

  it('returns null once the requested extra photo exists', () => {
    expect(
      nextCaptureRole([photo('note'), photo('garment'), photo('extra')], true)
    ).toBeNull();
  });
});

describe('canProceed', () => {
  it('is false until both note and garment are captured', () => {
    expect(canProceed([])).toBe(false);
    expect(canProceed([photo('note')])).toBe(false);
  });

  it('is true once note and garment are captured, regardless of extra', () => {
    expect(canProceed([photo('note'), photo('garment')])).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd gjenglemt && npx vitest run src/capture.test.ts`
Expected: FAIL — `capture.ts` does not exist yet.

- [ ] **Step 4: Implement the module**

Create `gjenglemt/src/capture.ts`:

```ts
import type { CapturedPhoto, PhotoRole } from './types';

export function nextCaptureRole(
  photos: CapturedPhoto[],
  extraRequested: boolean
): PhotoRole | null {
  const hasNote = photos.some((p) => p.role === 'note');
  const hasGarment = photos.some((p) => p.role === 'garment');
  if (!hasNote) return 'note';
  if (!hasGarment) return 'garment';
  const hasExtra = photos.some((p) => p.role === 'extra');
  if (extraRequested && !hasExtra) return 'extra';
  return null;
}

export function canProceed(photos: CapturedPhoto[]): boolean {
  return photos.some((p) => p.role === 'note') && photos.some((p) => p.role === 'garment');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/capture.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
cd ..
git add gjenglemt/src/types.ts gjenglemt/src/capture.ts gjenglemt/src/capture.test.ts
git commit -m "gjenglemt: add capture flow state module"
```

---

## Task 6: Share module

**Files:**
- Create: `gjenglemt/src/share.ts`
- Test: `gjenglemt/src/share.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `buildSmsLink(phone: string, body: string, userAgent: string): string`, `ShareResult` type (`{ shared: boolean; fallbackSmsLink?: string }`), `shareOrFallback(files: File[], text: string, phone: string): Promise<ShareResult>`. Used by `main.ts` in Task 9's "Send" button handler.

- [ ] **Step 1: Write the failing test**

Create `gjenglemt/src/share.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSmsLink, shareOrFallback } from './share';

describe('buildSmsLink', () => {
  it('uses & as separator on iOS', () => {
    const link = buildSmsLink(
      '99887766',
      'Hei',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    );
    expect(link).toBe('sms:99887766&body=Hei');
  });

  it('uses ? as separator on Android', () => {
    const link = buildSmsLink('99887766', 'Hei', 'Mozilla/5.0 (Linux; Android 14)');
    expect(link).toBe('sms:99887766?body=Hei');
  });

  it('URL-encodes the message body', () => {
    const link = buildSmsLink('99887766', 'Hei. Sted: Oslo.', 'Android');
    expect(link).toContain(encodeURIComponent('Hei. Sted: Oslo.'));
  });
});

describe('shareOrFallback', () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).canShare;
    delete (navigator as unknown as Record<string, unknown>).share;
  });

  it('calls navigator.share when file sharing is supported', async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    const file = new File([''], 'note.jpg', { type: 'image/jpeg' });
    const result = await shareOrFallback([file], 'Hei', '99887766');

    expect(share).toHaveBeenCalledWith({ files: [file], text: 'Hei' });
    expect(result).toEqual({ shared: true });
  });

  it('falls back to an sms: link when sharing is unsupported', async () => {
    const file = new File([''], 'note.jpg', { type: 'image/jpeg' });
    const result = await shareOrFallback([file], 'Hei', '99887766');

    expect(result.shared).toBe(false);
    expect(result.fallbackSmsLink).toContain('sms:99887766');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gjenglemt && npx vitest run src/share.test.ts`
Expected: FAIL — `share.ts` does not exist yet.

- [ ] **Step 3: Implement the module**

Create `gjenglemt/src/share.ts`:

```ts
export function buildSmsLink(phone: string, body: string, userAgent: string): string {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const separator = isIOS ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`;
}

export interface ShareResult {
  shared: boolean;
  fallbackSmsLink?: string;
}

export async function shareOrFallback(
  files: File[],
  text: string,
  phone: string
): Promise<ShareResult> {
  const shareData = { files, text };
  if (
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare(shareData)
  ) {
    await navigator.share(shareData);
    return { shared: true };
  }
  return { shared: false, fallbackSmsLink: buildSmsLink(phone, text, navigator.userAgent) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/share.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add gjenglemt/src/share.ts gjenglemt/src/share.test.ts
git commit -m "gjenglemt: add share module with sms: fallback"
```

---

## Task 7: Location module

**Files:**
- Create: `gjenglemt/src/location.ts`
- Test: `gjenglemt/src/location.test.ts`

**Interfaces:**
- Consumes: `exifr` package (Task 1 dependency)
- Produces: `Coords` type (`{ lat: number; lng: number }`), `buildNominatimUrl(lat: number, lng: number): string`, `parseNominatimResponse(response: NominatimResponse | null): string | null`, `getExifCoords(file: File): Promise<Coords | null>`, `getLiveCoords(): Promise<Coords | null>`, `reverseGeocode(coords: Coords): Promise<string | null>`, `resolveLocation(garmentPhoto: File): Promise<string | null>`. Used by `main.ts` in Task 9 during the "analyzing" step.

- [ ] **Step 1: Write the failing test**

Create `gjenglemt/src/location.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import exifr from 'exifr';
import { buildNominatimUrl, parseNominatimResponse, resolveLocation } from './location';

vi.mock('exifr', () => ({ default: { gps: vi.fn() } }));

describe('buildNominatimUrl', () => {
  it('builds a reverse-geocode URL with the coordinates', () => {
    expect(buildNominatimUrl(59.91, 10.75)).toBe(
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=59.91&lon=10.75'
    );
  });
});

describe('parseNominatimResponse', () => {
  it('returns the display name', () => {
    expect(parseNominatimResponse({ display_name: 'Storgata 1, Oslo' })).toBe(
      'Storgata 1, Oslo'
    );
  });

  it('returns null when there is no display name', () => {
    expect(parseNominatimResponse(null)).toBeNull();
    expect(parseNominatimResponse({})).toBeNull();
  });
});

describe('resolveLocation', () => {
  const file = new File([''], 'garment.jpg', { type: 'image/jpeg' });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ display_name: 'Storgata 1, Oslo' }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>).geolocation;
  });

  it('uses EXIF GPS coordinates when present', async () => {
    vi.mocked(exifr.gps).mockResolvedValue({ latitude: 59.91, longitude: 10.75 });

    const result = await resolveLocation(file);

    expect(result).toBe('Storgata 1, Oslo');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lat=59.91'), expect.anything());
  });

  it('falls back to live geolocation when EXIF has no GPS data', async () => {
    vi.mocked(exifr.gps).mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 63.43, longitude: 10.39 } } as GeolocationPosition),
      },
      configurable: true,
    });

    const result = await resolveLocation(file);

    expect(result).toBe('Storgata 1, Oslo');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lat=63.43'), expect.anything());
  });

  it('returns null when neither EXIF nor live location is available', async () => {
    vi.mocked(exifr.gps).mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
      configurable: true,
    });

    const result = await resolveLocation(file);

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gjenglemt && npx vitest run src/location.test.ts`
Expected: FAIL — `location.ts` does not exist yet.

- [ ] **Step 3: Implement the module**

Create `gjenglemt/src/location.ts`:

```ts
import exifr from 'exifr';

export interface Coords {
  lat: number;
  lng: number;
}

export interface NominatimResponse {
  display_name?: string;
}

export function buildNominatimUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: lat.toString(),
    lon: lng.toString(),
  });
  return `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
}

export function parseNominatimResponse(response: NominatimResponse | null): string | null {
  return response?.display_name?.trim() || null;
}

export async function getExifCoords(file: File): Promise<Coords | null> {
  const gps = await exifr.gps(file).catch(() => null);
  if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
    return null;
  }
  return { lat: gps.latitude, lng: gps.longitude };
}

export function getLiveCoords(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { timeout: 10_000 }
    );
  });
}

export async function reverseGeocode(coords: Coords): Promise<string | null> {
  const response = await fetch(buildNominatimUrl(coords.lat, coords.lng), {
    headers: { Accept: 'application/json' },
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const json = (await response.json().catch(() => null)) as NominatimResponse | null;
  return parseNominatimResponse(json);
}

export async function resolveLocation(garmentPhoto: File): Promise<string | null> {
  const coords = (await getExifCoords(garmentPhoto)) ?? (await getLiveCoords());
  if (!coords) return null;
  return reverseGeocode(coords);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/location.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd ..
git add gjenglemt/src/location.ts gjenglemt/src/location.test.ts
git commit -m "gjenglemt: add location module (EXIF + geolocation + reverse geocoding)"
```

---

## Task 8: OCR module

**Files:**
- Create: `gjenglemt/src/ocr.ts`

**Interfaces:**
- Consumes: `tesseract.js` package (Task 1 dependency)
- Produces: `runOcr(imageFile: File): Promise<string>`. Used by `main.ts` in Task 9 during the "analyzing" step.

No automated test for this task — running real OCR needs a real image and downloads a language model, which is unreliable to depend on in CI/sandbox. This is a thin wrapper around a single library call; correctness is verified manually on-device per the Task 11 QA checklist and via code review of the two-line body against the Tesseract.js API.

- [ ] **Step 1: Implement the wrapper**

Create `gjenglemt/src/ocr.ts`:

```ts
import Tesseract from 'tesseract.js';

export async function runOcr(imageFile: File): Promise<string> {
  const {
    data: { text },
  } = await Tesseract.recognize(imageFile, 'nor');
  return text;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd gjenglemt && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add gjenglemt/src/ocr.ts
git commit -m "gjenglemt: add Tesseract.js OCR wrapper"
```

---

## Task 9: Main app wiring

**Files:**
- Modify: `gjenglemt/src/main.ts` (replace the Task 1 placeholder body entirely)

**Interfaces:**
- Consumes: `nextCaptureRole`, `canProceed` (Task 5), `runOcr` (Task 8), `extractNameAndPhone` (Task 4), `resolveLocation` (Task 7), `renderMessage` (Task 3), `shareOrFallback` (Task 6), `PhotoRole`/`CapturedPhoto` (Task 5)
- Produces: the working app — no new exports other modules rely on.

This task is DOM orchestration wired from already-tested pure modules, so it has no dedicated unit test; it's verified by the Task 10 headless smoke test and manual device QA (Task 11).

- [ ] **Step 1: Replace main.ts with the full app**

Replace the entire contents of `gjenglemt/src/main.ts` with:

```ts
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
}

const state: AppState = {
  screen: 'capture',
  photos: [],
  extraRequested: false,
  navn: '',
  telefon: '',
  sted: '',
  melding: '',
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

async function analyze(): Promise<void> {
  const notePhoto = state.photos.find((p) => p.role === 'note')!;
  const garmentPhoto = state.photos.find((p) => p.role === 'garment')!;

  const [ocrText, sted] = await Promise.all([
    runOcr(notePhoto.file).catch(() => ''),
    resolveLocation(garmentPhoto.file).catch(() => null),
  ]);

  const { name, phone } = extractNameAndPhone(ocrText);

  state.navn = name ?? '';
  state.telefon = phone ?? '';
  state.sted = sted ?? '';
  state.melding = renderMessage({ navn: state.navn, sted: state.sted });
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
    img.alt = photo.role;
    thumbs.appendChild(img);
  }
  container.appendChild(thumbs);

  container.appendChild(
    labeledTextInput('Navn', state.navn, (value) => {
      state.navn = value;
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
    })
  );

  const meldingLabel = document.createElement('label');
  meldingLabel.textContent = 'Melding';
  const meldingTextarea = document.createElement('textarea');
  meldingTextarea.rows = 4;
  meldingTextarea.value = state.melding;
  meldingTextarea.addEventListener('input', () => {
    state.melding = meldingTextarea.value;
  });
  meldingLabel.appendChild(meldingTextarea);
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
        download.textContent = `Last ned ${photo.role}-bildet`;
        status.appendChild(download);
      }
    })();
  });

  return container;
}

render();
```

- [ ] **Step 2: Verify it builds**

Run: `cd gjenglemt && npm run build`
Expected: `tsc` and `vite build` both succeed with no errors.

- [ ] **Step 3: Verify existing unit tests still pass**

Run: `npx vitest run`
Expected: all tests from Tasks 3-7 still PASS (main.ts doesn't change their behavior).

- [ ] **Step 4: Commit**

```bash
cd ..
git add gjenglemt/src/main.ts
git commit -m "gjenglemt: wire capture, OCR, extraction, location, and share into the app"
```

---

## Task 10: Headless smoke test

**Files:**
- Create: `gjenglemt/scripts/smoke-test.mjs`

**Interfaces:**
- Consumes: the running app from Task 9, `playwright-core` (Task 1 dependency)
- Produces: `npm run smoke`, a headless check that the app loads and the capture screen renders with its expected first button. This is the only automated check that touches real DOM rendering in a real browser; it does not and cannot exercise camera/GPS/share behavior.

- [ ] **Step 1: Write the smoke test script**

Create `gjenglemt/scripts/smoke-test.mjs`:

```js
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({
  configFile: new URL('../vite.config.ts', import.meta.url).pathname,
  root: new URL('..', import.meta.url).pathname,
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) {
  throw new Error('Vite dev server did not report a local URL');
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const page = await browser.newPage();
  await page.goto(url);
  const button = await page.waitForSelector('button', { timeout: 10_000 });
  const text = (await button.textContent())?.trim();
  if (text !== 'Ta bilde av lappen') {
    throw new Error(`Expected first button to say "Ta bilde av lappen", got "${text}"`);
  }
  console.log('Smoke test passed: capture screen renders with the expected button.');
} finally {
  await browser.close();
  await server.close();
}
```

- [ ] **Step 2: Run it and verify it passes**

Run: `cd gjenglemt && npm run smoke`
Expected: prints `Smoke test passed: capture screen renders with the expected button.` and exits with status 0.

- [ ] **Step 3: Commit**

```bash
cd ..
git add gjenglemt/scripts/smoke-test.mjs
git commit -m "gjenglemt: add headless smoke test"
```

---

## Task 11: README and manual device QA checklist

**Files:**
- Create: `gjenglemt/README.md`

**Interfaces:**
- Consumes: all scripts defined in Tasks 1, 2, 10 (`dev`, `build`, `preview`, `test`, `smoke`, `generate-icons`)
- Produces: documentation — nothing else depends on this file.

- [ ] **Step 1: Write the README**

Create `gjenglemt/README.md`:

```markdown
# gjenglemt

En liten mobilvennlig webapp som hjelper med å varsle eiere av
gjenglemte klær. Ta bilde av en lapp med navn/telefon og bilde av
plagget, så gjetter appen navn, telefon og finnested (fra bildets
posisjon), lar deg rette gjetningene, og åpner telefonens delingsmeny
med bildene og en ferdig meldingstekst — du velger selv å sende via
Meldinger.

Se designdokumentet i
`../docs/superpowers/specs/2026-09-15-gjenglemt-design.md` for
bakgrunn og valgene bak løsningen.

## Kjøre lokalt

\`\`\`bash
npm install
npm run dev
\`\`\`

Åpne den viste adressen i en mobilnettleser (eller bruk nettleserens
enhetssimulering) for å teste kamera-flyten.

## Bygge

\`\`\`bash
npm run build
npm run preview
\`\`\`

## Teste

\`\`\`bash
npm test    # enhetstester (vitest) for tekstuttrekk, meldingsmal, deling og sted
npm run smoke   # headless sjekk av at appen laster (playwright)
\`\`\`

## Ikoner

Home-screen-ikonene i `public/` er generert, ikke håndtegnet. Kjør
`npm run generate-icons` på nytt hvis du vil regenerere dem (f.eks.
etter å ha endret fargen i `scripts/generate-icons.mjs`).

## Deploy

Appen er en ren statisk side (`dist/` etter `npm run build`) og kan
hostes hvor som helst som serverer statiske filer, f.eks. GitHub
Pages. Det finnes ingen backend å drifte.

## Manuell test på enhet (kan ikke automatiseres herfra)

Følgende må sjekkes på en ekte iPhone og Android-telefon før bruk,
siden de avhenger av ekte kamera/GPS/deling som ikke finnes i denne
utviklingsomgivelsen:

- [ ] Kameraet åpner seg direkte når du trykker en "Ta bilde"-knapp,
      på både iOS Safari og Android Chrome
- [ ] Bildeflyten går automatisk videre fra lapp → plagg → (evt.
      ekstra) uten at du må velge hvilket bilde som er hva
- [ ] OCR klarer å lese et vanlig håndskrevet/trykt navn og
      telefonnummer fra lappen
- [ ] Finnested fylles ut automatisk (enten fra bildets
      EXIF-posisjon, eller ved at nettleseren spør om
      posisjonstilgang som fallback)
- [ ] "Send"-knappen åpner delingsmenyen med begge bildene og teksten
      ferdig utfylt, og Meldinger-appen dukker opp som et alternativ
- [ ] Skru av stedstjenester og bekreft at appen fortsatt lar deg
      fylle inn Sted manuelt uten å henge seg opp
- [ ] "Legg til på Hjem-skjerm" viser riktig ikon og navn
\`\`\`
```

(Write the file without the outer triple backticks shown above — they're only there to delimit this step's content; the actual `gjenglemt/README.md` file should contain plain Markdown starting at `# gjenglemt`.)

- [ ] **Step 2: Verify the checkboxes render**

Run: `grep -c '^- \[ \]' gjenglemt/README.md`
Expected: `7` (one per manual QA item).

- [ ] **Step 3: Commit**

```bash
git add gjenglemt/README.md
git commit -m "gjenglemt: add README with usage, deploy, and manual QA checklist"
```

---

## Post-plan note

Tasks 8 (OCR) and 9 (main wiring) — plus the manual QA items in Task
11 — depend on real camera, EXIF, geolocation, and share-sheet
behavior that this environment cannot exercise. Once these tasks are
done, the app is complete and internally consistent (it builds, unit
tests pass, and the smoke test confirms it renders), but say so
explicitly rather than claiming device behavior is verified: the
manual QA checklist in the README must actually be run on a real
iPhone and Android phone before relying on this in production.
