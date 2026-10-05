# Syvseterjakten fase 1: datakjerne og diagnose — implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Et nytt repo `toftoy/syvseterjakten` med prosjektoppsett og CI, en testet datakjerne (importvalidering, merge med solgt-logikk og prishistorikk, ingest-skript og ingest-workflow) og et diagnose-bokmerke som lager en ekte Finn-fikstur til fase 2.

**Architecture:** Ren TypeScript-logikk i `src/core/` (ingen DOM, ingen I/O), testet med Vitest etter TDD. `scripts/ingest.ts` er det eneste stedet med filsystem-I/O. En GitHub Action kjører ingest ved push til `inbox/**` og committer `data/` som bot. Diagnose-bokmerket er et frittstående IIFE-bundle bygget med esbuild.

**Tech Stack:** Node 22, TypeScript (strict), Vite, Vitest, tsx, esbuild, jsdom (kun tester).

**Spec:** `docs/superpowers/specs/2026-10-05-syvseterjakten-design.md`

## Global Constraints

- Repo: `toftoy/syvseterjakten`, **privat**.
- Ingen automatisert henting fra Finn. Ingen kode i denne fasen gjør nettverkskall til finn.no.
- Datoer i `firstSeen`/`lastSeen`/`soldAt`/`priceHistory[].date` er `YYYY-MM-DD` i Europe/Oslo.
- `capturedAt` og `updatedAt` er ISO 8601 i UTC med `Z` (f.eks. `2026-10-03T18:02:11Z`).
- Felter som mangler lagres som `null`, ikke utelates.
- Modell-id-er: `kodiaq`, `model-y`, `model-x`, `eqb`. Drivlinjer: `diesel`, `bensin`, `el`, `plugin-hybrid`, `hybrid`.
- Brukerrettet tekst er på norsk (bokmål). Identifikatorer i kode er på engelsk.
- Kodeendringer går via PR. Bare bot-commits med data går direkte til `main`.
- Commit-meldinger avsluttes med repoets attribusjonslinjer (se sesjonsinstruksene).

## Faseoversikt (hele prosjektet)

| Fase | Innhold | Plan |
|---|---|---|
| **1** | Repo, CI, typer, importvalidering, merge, ingest + workflow, diagnose-bokmerke | denne |
| 2 | `parse.ts` mot ekte fikstur, innsamlingsbokmerke, importside, postnummer-geokoding, Cloudflare Pages + Access-deploy | skrives når fiksturen finnes |
| 3 | `valuation.ts` (referansekurve, krymping, usikkerhet, tilbaketest), `cost.ts`, `pickup.ts`, `rank.ts`, `assumptions.json` med kilder | etter fase 2 |
| 4 | Dashbord: Biler, Sammenlign, Forutsetninger, Oppdater, Metode | etter fase 3 |
| 5 | Kart: MapLibre 3D, prikker/søyler, flyplasser/stasjoner/veier | etter fase 4 |

## Forutsetninger (brukeren gjør dette før Task 1)

1. Opprett et **tomt, privat** repo `toftoy/syvseterjakten` på github.com (ingen README, ingen .gitignore).
2. Si fra i Claude-økten. Claude legger repoet til med `add_repo` (access `push`) og kloner det.

## Filstruktur etter fase 1

```
.github/workflows/ci.yml        PR: typecheck, test, build
.github/workflows/ingest.yml    push til inbox/** + workflow_dispatch: ingest og commit
.gitignore
README.md                       hva, status, utvikling, diagnose-bokmerket
package.json, package-lock.json
tsconfig.json
vite.config.ts                  Vite + Vitest-oppsett
index.html, src/main.ts         midlertidig startside
src/core/types.ts               alle delte datatyper
src/core/dates.ts               osloDate()
src/core/validateImport.ts      validering av inbox-filer
src/core/merge.ts               emptyStore(), merge()
scripts/ingest.ts               runIngest(root, geocode?)
scripts/ingest-cli.ts           CLI-innpakning for npm run ingest
bookmarklet/diagnose.ts         diagnose(doc, now) — ren funksjon
bookmarklet/diagnose-entry.ts   overlegg med kopier/last ned
bookmarklet/build.ts            buildBookmarklet(entry) → javascript:-URL
bookmarklet/dist/diagnose.txt   generert, committet (for installasjon fra mobil)
config/searches.json            de seks søkene
data/listings.json, data/runs.json  opprettes av første ingest
inbox/.gitkeep
docs/superpowers/specs/…, docs/superpowers/plans/…
tests/dates.test.ts, tests/validateImport.test.ts, tests/merge.test.ts,
tests/ingest.test.ts, tests/diagnose.test.ts, tests/bookmarkletBuild.test.ts
```

---

### Task 1: Repo, prosjektoppsett, typer og `osloDate`

**Files:**
- Create: `README.md`, `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/core/types.ts`, `src/core/dates.ts`, `.github/workflows/ci.yml`, `docs/superpowers/specs/2026-10-05-syvseterjakten-design.md`, `docs/superpowers/plans/2026-10-05-syvseterjakten-fase-1.md`
- Test: `tests/dates.test.ts`

**Interfaces:**
- Produces: alle typer i `src/core/types.ts` (se Step 6), `osloDate(iso: string): string`.

- [ ] **Step 1: Første commit på `main` (kun dokumenter)**

Kopier spec og plan fra grenen `syvseterjakten-spec` i `toftoy/factory-hack--tor-t` til samme stier i det nye repoet. Lag `README.md`:

```markdown
# Syvseterjakten

Privat dashbord som sammenligner 6/7-seters bruktbiler (Skoda Kodiaq,
Tesla Model Y, Tesla Model X, Mercedes EQB) fra Finn.no, med forventet
årskostnad over 8 år for en bilist i Bergen.

Status: under bygging. Se `docs/superpowers/specs/` og `docs/superpowers/plans/`.
```

```bash
git add README.md docs
git commit -m "docs: legg til spesifikasjon og plan for fase 1"
git push -u origin main
git checkout -b fase-1
```

- [ ] **Step 2: Installer avhengigheter**

Lag `package.json`:

```json
{
  "name": "syvseterjakten",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "ingest": "tsx scripts/ingest-cli.ts",
    "build:bookmarklets": "tsx bookmarklet/build.ts"
  }
}
```

```bash
npm install -D typescript vite vitest tsx esbuild jsdom @types/jsdom @types/node
```

Dette registrerer gjeldende versjoner i `package.json` og `package-lock.json`.

- [ ] **Step 3: Konfigurasjon**

`.gitignore`:

```
node_modules/
dist/
!bookmarklet/dist/
*.local
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src", "scripts", "bookmarklet", "tests", "vite.config.ts"]
}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist' },
  test: { include: ['tests/**/*.test.ts'] },
});
```

`index.html`:

```html
<!doctype html>
<html lang="nb">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Syvseterjakten</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:

```ts
const app = document.querySelector<HTMLElement>('#app');
if (app) app.textContent = 'Syvseterjakten – under bygging';
```

- [ ] **Step 4: Skriv den feilende testen for `osloDate`**

`tests/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { osloDate } from '../src/core/dates';

describe('osloDate', () => {
  it('gir norsk dato for et UTC-tidspunkt på dagtid', () => {
    expect(osloDate('2026-10-03T18:02:11Z')).toBe('2026-10-03');
  });

  it('ruller over til neste dag etter midnatt norsk sommertid (UTC+2)', () => {
    expect(osloDate('2026-10-03T22:30:00Z')).toBe('2026-10-04');
  });

  it('bruker vintertid (UTC+1) i januar', () => {
    expect(osloDate('2026-01-15T22:30:00Z')).toBe('2026-01-15');
    expect(osloDate('2026-01-15T23:30:00Z')).toBe('2026-01-16');
  });
});
```

- [ ] **Step 5: Kjør testen og se at den feiler**

Run: `npx vitest run tests/dates.test.ts`
Expected: FAIL, `Failed to resolve import "../src/core/dates"`

- [ ] **Step 6: Implementer typer og `osloDate`**

`src/core/types.ts`:

```ts
export type ModelId = 'kodiaq' | 'model-y' | 'model-x' | 'eqb';
export type Fuel = 'diesel' | 'bensin' | 'el' | 'plugin-hybrid' | 'hybrid';
export type Status = 'active' | 'sold';
export type SeatsSource = 'filter' | 'unknown';

/** Et fast søk fra config/searches.json. */
export interface SearchDef {
  id: string;
  model: ModelId;
  label: string;
  /** true når søket bruker Finns seats_from=6-filter. */
  seatsFilter: boolean;
  /** Finn-URL for søket. Fylles inn i fase 2. */
  url: string | null;
}

/** Én annonse slik bokmerket leser den fra en resultatside. */
export interface RawListing {
  finnkode: string;
  url: string;
  title: string;
  price: number | null;
  year: number | null;
  km: number | null;
  fuel: Fuel | null;
  seats: number | null;
  postalCode: string | null;
  place: string | null;
  dealer: boolean | null;
}

/** Innholdet i en fil i inbox/. */
export interface ImportFile {
  importVersion: 1;
  capturedAt: string;
  search: string;
  totalHits: number;
  listings: RawListing[];
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface ListingLocation {
  postalCode: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
}

export interface Listing {
  finnkode: string;
  url: string;
  model: ModelId;
  title: string;
  fuel: Fuel | null;
  year: number | null;
  km: number | null;
  price: number | null;
  seats: number | null;
  seatsSource: SeatsSource;
  location: ListingLocation;
  dealer: boolean | null;
  status: Status;
  firstSeen: string;
  lastSeen: string;
  soldAt: string | null;
  priceHistory: PricePoint[];
  searches: string[];
}

/** Innholdet i data/listings.json. */
export interface Store {
  schemaVersion: 1;
  updatedAt: string | null;
  listings: Record<string, Listing>;
}

/** Ett element i data/runs.json. */
export interface Run {
  id: string;
  search: string;
  totalHits: number;
  captured: number;
  complete: boolean;
}
```

`src/core/dates.ts`:

```ts
const osloFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Kalenderdato (YYYY-MM-DD) i Europe/Oslo for et ISO-tidspunkt. */
export function osloDate(iso: string): string {
  return osloFormatter.format(new Date(iso));
}
```

- [ ] **Step 7: Kjør testen og se at den passerer**

Run: `npx vitest run tests/dates.test.ts`
Expected: PASS (3 tester)

- [ ] **Step 8: CI-workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 9: Verifiser lokalt**

Run: `npm run typecheck && npm test && npm run build`
Expected: alle tre lykkes, `dist/index.html` finnes.

- [ ] **Step 10: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts index.html src tests .github
git commit -m "feat: prosjektoppsett, datatyper og osloDate"
```

---

### Task 2: Søkekonfigurasjon og importvalidering

**Files:**
- Create: `config/searches.json`, `src/core/validateImport.ts`
- Test: `tests/validateImport.test.ts`

**Interfaces:**
- Consumes: `ImportFile`, `RawListing`, `Fuel` fra `src/core/types.ts`.
- Produces: `validateImport(input: unknown, knownSearchIds: readonly string[]): Validation` der `type Validation = { ok: true; value: ImportFile } | { ok: false; errors: string[] }`.

- [ ] **Step 1: Søkekonfigurasjon**

`config/searches.json` (`url` fylles inn i fase 2 med URL-ene brukeren faktisk bruker):

```json
[
  { "id": "kodiaq-6plus", "model": "kodiaq", "label": "Kodiaq, 6+ seter", "seatsFilter": true, "url": null },
  { "id": "model-y-6plus", "model": "model-y", "label": "Model Y, 6+ seter", "seatsFilter": true, "url": null },
  { "id": "model-x-6plus", "model": "model-x", "label": "Model X, 6+ seter", "seatsFilter": true, "url": null },
  { "id": "eqb-6plus", "model": "eqb", "label": "EQB, 6+ seter", "seatsFilter": true, "url": null },
  { "id": "model-x-all", "model": "model-x", "label": "Model X, alle", "seatsFilter": false, "url": null },
  { "id": "eqb-all", "model": "eqb", "label": "EQB, alle", "seatsFilter": false, "url": null }
]
```

- [ ] **Step 2: Skriv de feilende testene**

`tests/validateImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateImport } from '../src/core/validateImport';

const known = ['kodiaq-6plus', 'eqb-all'];

function validListing(over: Record<string, unknown> = {}) {
  return {
    finnkode: '412345678',
    url: 'https://www.finn.no/mobility/item/412345678',
    title: 'Skoda Kodiaq 2.0 TDI 7-seter',
    price: 389000,
    year: 2021,
    km: 84000,
    fuel: 'diesel',
    seats: 7,
    postalCode: '5055',
    place: 'Bergen',
    dealer: true,
    ...over,
  };
}

function validImport(over: Record<string, unknown> = {}) {
  return {
    importVersion: 1,
    capturedAt: '2026-10-03T18:02:11Z',
    search: 'kodiaq-6plus',
    totalHits: 1,
    listings: [validListing()],
    ...over,
  };
}

function errorsOf(input: unknown): string[] {
  const r = validateImport(input, known);
  return r.ok ? [] : r.errors;
}

describe('validateImport', () => {
  it('godtar en gyldig import', () => {
    const r = validateImport(validImport(), known);
    expect(r.ok).toBe(true);
  });

  it('godtar null i valgfrie felter', () => {
    const listing = validListing({
      price: null, year: null, km: null, fuel: null, seats: null,
      postalCode: null, place: null, dealer: null,
    });
    expect(validateImport(validImport({ listings: [listing] }), known).ok).toBe(true);
  });

  it('avviser noe som ikke er et objekt', () => {
    expect(errorsOf('hei')).toEqual(['Importen er ikke et JSON-objekt']);
  });

  it('avviser ukjent importVersion', () => {
    expect(errorsOf(validImport({ importVersion: 2 }))).toContain('Ukjent importVersion: 2');
  });

  it('krever capturedAt i UTC med Z', () => {
    expect(errorsOf(validImport({ capturedAt: '2026-10-03 18:02' }))).toContain(
      'capturedAt må være ISO 8601 i UTC, f.eks. 2026-10-03T18:02:11Z',
    );
  });

  it('avviser ukjent søk', () => {
    expect(errorsOf(validImport({ search: 'golf' }))).toContain('Ukjent søk: golf');
  });

  it('krever ikke-negativt heltall for totalHits', () => {
    expect(errorsOf(validImport({ totalHits: -1 }))).toContain(
      'totalHits må være et ikke-negativt heltall',
    );
  });

  it('krever at listings er en liste', () => {
    expect(errorsOf(validImport({ listings: {} }))).toContain('listings må være en liste');
  });

  it('avviser ugyldig finnkode', () => {
    expect(errorsOf(validImport({ listings: [validListing({ finnkode: 'abc' })] }))).toContain(
      'listings[0]: ugyldig finnkode',
    );
  });

  it('avviser duplikat finnkode', () => {
    const errs = errorsOf(validImport({ listings: [validListing(), validListing()], totalHits: 2 }));
    expect(errs).toContain('listings[1]: duplikat finnkode 412345678');
  });

  it('krever finn.no-URL', () => {
    expect(
      errorsOf(validImport({ listings: [validListing({ url: 'https://example.com/1' })] })),
    ).toContain('listings[0]: url må starte med https://www.finn.no/');
  });

  it('avviser negative eller desimale tall', () => {
    const errs = errorsOf(validImport({ listings: [validListing({ price: -5, km: 1.5 })] }));
    expect(errs).toContain('listings[0]: price må være et ikke-negativt heltall eller null');
    expect(errs).toContain('listings[0]: km må være et ikke-negativt heltall eller null');
  });

  it('avviser ukjent drivlinje', () => {
    expect(errorsOf(validImport({ listings: [validListing({ fuel: 'hydrogen' })] }))).toContain(
      'listings[0]: ukjent fuel hydrogen',
    );
  });

  it('avviser feil type for tekstfelter og dealer', () => {
    const errs = errorsOf(
      validImport({ listings: [validListing({ title: 7, postalCode: 5055, dealer: 'ja' })] }),
    );
    expect(errs).toContain('listings[0]: title må være tekst');
    expect(errs).toContain('listings[0]: postalCode må være tekst eller null');
    expect(errs).toContain('listings[0]: dealer må være true, false eller null');
  });
});
```

- [ ] **Step 3: Kjør testene og se at de feiler**

Run: `npx vitest run tests/validateImport.test.ts`
Expected: FAIL, `Failed to resolve import "../src/core/validateImport"`

- [ ] **Step 4: Implementer `validateImport`**

`src/core/validateImport.ts`:

```ts
import type { Fuel, ImportFile } from './types';

export type Validation = { ok: true; value: ImportFile } | { ok: false; errors: string[] };

const FUELS: readonly Fuel[] = ['diesel', 'bensin', 'el', 'plugin-hybrid', 'hybrid'];
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

export function validateImport(input: unknown, knownSearchIds: readonly string[]): Validation {
  if (!isObject(input)) return { ok: false, errors: ['Importen er ikke et JSON-objekt'] };
  const errors: string[] = [];

  if (input.importVersion !== 1) errors.push(`Ukjent importVersion: ${String(input.importVersion)}`);
  if (typeof input.capturedAt !== 'string' || !UTC_ISO.test(input.capturedAt)) {
    errors.push('capturedAt må være ISO 8601 i UTC, f.eks. 2026-10-03T18:02:11Z');
  }
  if (typeof input.search !== 'string' || !knownSearchIds.includes(input.search)) {
    errors.push(`Ukjent søk: ${String(input.search)}`);
  }
  if (!isNonNegInt(input.totalHits)) errors.push('totalHits må være et ikke-negativt heltall');

  if (!Array.isArray(input.listings)) {
    errors.push('listings må være en liste');
  } else {
    const seen = new Set<string>();
    input.listings.forEach((l, i) => validateListing(l, `listings[${i}]`, seen, errors));
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: input as unknown as ImportFile };
}

function validateListing(l: unknown, at: string, seen: Set<string>, errors: string[]): void {
  if (!isObject(l)) {
    errors.push(`${at}: ikke et objekt`);
    return;
  }
  if (typeof l.finnkode !== 'string' || !/^\d{6,12}$/.test(l.finnkode)) {
    errors.push(`${at}: ugyldig finnkode`);
  } else if (seen.has(l.finnkode)) {
    errors.push(`${at}: duplikat finnkode ${l.finnkode}`);
  } else {
    seen.add(l.finnkode);
  }
  if (typeof l.url !== 'string' || !l.url.startsWith('https://www.finn.no/')) {
    errors.push(`${at}: url må starte med https://www.finn.no/`);
  }
  if (typeof l.title !== 'string') errors.push(`${at}: title må være tekst`);
  for (const key of ['price', 'year', 'km', 'seats'] as const) {
    if (!(l[key] === null || isNonNegInt(l[key]))) {
      errors.push(`${at}: ${key} må være et ikke-negativt heltall eller null`);
    }
  }
  if (!(l.fuel === null || FUELS.includes(l.fuel as Fuel))) {
    errors.push(`${at}: ukjent fuel ${String(l.fuel)}`);
  }
  for (const key of ['postalCode', 'place'] as const) {
    if (!(l[key] === null || typeof l[key] === 'string')) {
      errors.push(`${at}: ${key} må være tekst eller null`);
    }
  }
  if (!(l.dealer === null || typeof l.dealer === 'boolean')) {
    errors.push(`${at}: dealer må være true, false eller null`);
  }
}
```

- [ ] **Step 5: Kjør testene og se at de passerer**

Run: `npx vitest run tests/validateImport.test.ts`
Expected: PASS (14 tester)

- [ ] **Step 6: Commit**

```bash
git add config/searches.json src/core/validateImport.ts tests/validateImport.test.ts
git commit -m "feat: søkekonfigurasjon og validering av importfiler"
```

---

### Task 3: Merge med status, solgt-logikk og prishistorikk

**Files:**
- Create: `src/core/merge.ts`
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: typer fra `src/core/types.ts`, `osloDate` fra `src/core/dates.ts`.
- Produces:
  - `type Geocode = (postalCode: string) => { lat: number; lon: number } | null`
  - `emptyStore(): Store`
  - `merge(store: Store, imp: ImportFile, search: SearchDef, geocode?: Geocode): { store: Store; run: Run }` — ren funksjon, endrer aldri `store`.

Reglene som testes (spec §5): ny annonse, oppdatering, prishistorikk (ny dag = nytt punkt, samme dag = erstatt, lik pris = ingenting), null bevarer eksisterende verdi, komplett import markerer manglende som solgt, ufullstendig import markerer aldri solgt, bare annonser som tilhører søket, sett samme dag i annet søk forblir aktiv, gjenoppstått annonse blir aktiv, `searches` som union, `seatsSource`, idempotens, ingen mutasjon, `run` og `updatedAt`.

- [ ] **Step 1: Skriv de feilende testene**

`tests/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emptyStore, merge } from '../src/core/merge';
import type { ImportFile, RawListing, SearchDef, Store } from '../src/core/types';

const kodiaq6: SearchDef = { id: 'kodiaq-6plus', model: 'kodiaq', label: 'Kodiaq, 6+ seter', seatsFilter: true, url: null };
const eqb6: SearchDef = { id: 'eqb-6plus', model: 'eqb', label: 'EQB, 6+ seter', seatsFilter: true, url: null };
const eqbAll: SearchDef = { id: 'eqb-all', model: 'eqb', label: 'EQB, alle', seatsFilter: false, url: null };

const DAY1 = '2026-10-03T18:00:00Z'; // 2026-10-03 i Oslo
const DAY2 = '2026-10-05T09:00:00Z'; // 2026-10-05 i Oslo
const DAY2_LATER = '2026-10-05T15:00:00Z';

function raw(finnkode: string, over: Partial<RawListing> = {}): RawListing {
  return {
    finnkode,
    url: `https://www.finn.no/mobility/item/${finnkode}`,
    title: 'Skoda Kodiaq 2.0 TDI 7-seter',
    price: 389000,
    year: 2021,
    km: 84000,
    fuel: 'diesel',
    seats: 7,
    postalCode: '5055',
    place: 'Bergen',
    dealer: true,
    ...over,
  };
}

function imp(search: SearchDef, capturedAt: string, listings: RawListing[], totalHits = listings.length): ImportFile {
  return { importVersion: 1, capturedAt, search: search.id, totalHits, listings };
}

function apply(store: Store, ...steps: [SearchDef, ImportFile][]): Store {
  return steps.reduce((s, [search, i]) => merge(s, i, search).store, store);
}

describe('merge', () => {
  it('oppretter en ny annonse', () => {
    const { store } = merge(emptyStore(), imp(kodiaq6, DAY1, [raw('100000001')]), kodiaq6);
    expect(store.listings['100000001']).toEqual({
      finnkode: '100000001',
      url: 'https://www.finn.no/mobility/item/100000001',
      model: 'kodiaq',
      title: 'Skoda Kodiaq 2.0 TDI 7-seter',
      fuel: 'diesel',
      year: 2021,
      km: 84000,
      price: 389000,
      seats: 7,
      seatsSource: 'filter',
      location: { postalCode: '5055', place: 'Bergen', lat: null, lon: null },
      dealer: true,
      status: 'active',
      firstSeen: '2026-10-03',
      lastSeen: '2026-10-03',
      soldAt: null,
      priceHistory: [{ date: '2026-10-03', price: 389000 }],
      searches: ['kodiaq-6plus'],
    });
  });

  it('bruker geocode for koordinater', () => {
    const geocode = (pc: string) => (pc === '5055' ? { lat: 60.38, lon: 5.33 } : null);
    const { store } = merge(emptyStore(), imp(kodiaq6, DAY1, [raw('100000001')]), kodiaq6, geocode);
    expect(store.listings['100000001']?.location).toEqual({
      postalCode: '5055', place: 'Bergen', lat: 60.38, lon: 5.33,
    });
  });

  it('lager tom prishistorikk når pris mangler', () => {
    const { store } = merge(emptyStore(), imp(kodiaq6, DAY1, [raw('100000001', { price: null })]), kodiaq6);
    expect(store.listings['100000001']?.priceHistory).toEqual([]);
  });

  it('oppdaterer lastSeen og legger til nytt prispunkt ved prisendring en ny dag', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001', { price: 369000, km: 85000 })])],
    );
    const l = store.listings['100000001'];
    expect(l?.firstSeen).toBe('2026-10-03');
    expect(l?.lastSeen).toBe('2026-10-05');
    expect(l?.price).toBe(369000);
    expect(l?.km).toBe(85000);
    expect(l?.priceHistory).toEqual([
      { date: '2026-10-03', price: 389000 },
      { date: '2026-10-05', price: 369000 },
    ]);
  });

  it('legger ikke til prispunkt når prisen er uendret', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001')])],
    );
    expect(store.listings['100000001']?.priceHistory).toHaveLength(1);
  });

  it('erstatter dagens prispunkt ved flere prisendringer samme dag', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001', { price: 379000 })])],
      [kodiaq6, imp(kodiaq6, DAY2_LATER, [raw('100000001', { price: 369000 })])],
    );
    expect(store.listings['100000001']?.priceHistory).toEqual([
      { date: '2026-10-03', price: 389000 },
      { date: '2026-10-05', price: 369000 },
    ]);
  });

  it('beholder eksisterende verdier når feltet mangler i ny import', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001', { km: null, price: null, postalCode: null, place: null })])],
    );
    const l = store.listings['100000001'];
    expect(l?.km).toBe(84000);
    expect(l?.price).toBe(389000);
    expect(l?.location.postalCode).toBe('5055');
    expect(l?.location.place).toBe('Bergen');
  });

  it('markerer manglende annonse som solgt etter komplett import', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001'), raw('100000002')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001')], 1)],
    );
    expect(store.listings['100000002']?.status).toBe('sold');
    expect(store.listings['100000002']?.soldAt).toBe('2026-10-05');
    expect(store.listings['100000001']?.status).toBe('active');
  });

  it('markerer aldri solgt etter ufullstendig import', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001'), raw('100000002')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001')], 60)],
    );
    expect(store.listings['100000002']?.status).toBe('active');
  });

  it('markerer bare annonser som tilhører søket', () => {
    const store = apply(
      emptyStore(),
      [eqbAll, imp(eqbAll, DAY1, [raw('200000001', { title: 'Mercedes EQB 300' })])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001')])],
    );
    expect(store.listings['200000001']?.status).toBe('active');
  });

  it('lar en annonse sett samme dag i et annet søk forbli aktiv', () => {
    const store = apply(
      emptyStore(),
      [eqb6, imp(eqb6, DAY1, [raw('200000001')])],
      [eqbAll, imp(eqbAll, DAY1, [raw('200000001')])],
      [eqbAll, imp(eqbAll, DAY2, [raw('200000001')])],
      [eqb6, imp(eqb6, DAY2_LATER, [], 0)],
    );
    expect(store.listings['200000001']?.status).toBe('active');
  });

  it('setter solgt annonse tilbake til aktiv når den dukker opp igjen', () => {
    const store = apply(
      emptyStore(),
      [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001'), raw('100000002')])],
      [kodiaq6, imp(kodiaq6, DAY2, [raw('100000001')], 1)],
      [kodiaq6, imp(kodiaq6, '2026-10-07T10:00:00Z', [raw('100000001'), raw('100000002')])],
    );
    expect(store.listings['100000002']?.status).toBe('active');
    expect(store.listings['100000002']?.soldAt).toBeNull();
  });

  it('slår sammen søk og setter seatsSource', () => {
    const onlyAll = apply(emptyStore(), [eqbAll, imp(eqbAll, DAY1, [raw('200000001')])]);
    expect(onlyAll.listings['200000001']?.seatsSource).toBe('unknown');

    const both = apply(onlyAll, [eqb6, imp(eqb6, DAY2, [raw('200000001')])]);
    expect(both.listings['200000001']?.seatsSource).toBe('filter');
    expect(both.listings['200000001']?.searches).toEqual(['eqb-6plus', 'eqb-all']);

    const again = apply(both, [eqbAll, imp(eqbAll, DAY2_LATER, [raw('200000001')])]);
    expect(again.listings['200000001']?.seatsSource).toBe('filter');
  });

  it('er idempotent', () => {
    const i = imp(kodiaq6, DAY1, [raw('100000001'), raw('100000002')]);
    const once = merge(emptyStore(), i, kodiaq6);
    const twice = merge(once.store, i, kodiaq6);
    expect(twice.store).toEqual(once.store);
    expect(twice.run).toEqual(once.run);
  });

  it('endrer ikke input-store', () => {
    const before = apply(emptyStore(), [kodiaq6, imp(kodiaq6, DAY1, [raw('100000001')])]);
    const snapshot = structuredClone(before);
    merge(before, imp(kodiaq6, DAY2, [raw('100000001', { price: 1 })], 1), kodiaq6);
    expect(before).toEqual(snapshot);
  });

  it('returnerer run og oppdaterer updatedAt', () => {
    const { store, run } = merge(emptyStore(), imp(kodiaq6, DAY1, [raw('100000001')], 57), kodiaq6);
    expect(run).toEqual({ id: DAY1, search: 'kodiaq-6plus', totalHits: 57, captured: 1, complete: false });
    expect(store.updatedAt).toBe(DAY1);

    const older = merge(store, imp(kodiaq6, '2026-10-01T10:00:00Z', [raw('100000001')]), kodiaq6);
    expect(older.store.updatedAt).toBe(DAY1);
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run tests/merge.test.ts`
Expected: FAIL, `Failed to resolve import "../src/core/merge"`

- [ ] **Step 3: Implementer `merge`**

`src/core/merge.ts`:

```ts
import { osloDate } from './dates';
import type { ImportFile, Listing, ListingLocation, RawListing, Run, SearchDef, Store } from './types';

export type Geocode = (postalCode: string) => { lat: number; lon: number } | null;

const noGeocode: Geocode = () => null;

export function emptyStore(): Store {
  return { schemaVersion: 1, updatedAt: null, listings: {} };
}

/**
 * Slår en import sammen med lagrede annonser. Ren funksjon: `store` endres ikke.
 * Regler: se spec §5.
 */
export function merge(
  store: Store,
  imp: ImportFile,
  search: SearchDef,
  geocode: Geocode = noGeocode,
): { store: Store; run: Run } {
  const next: Store = structuredClone(store);
  const date = osloDate(imp.capturedAt);
  const seen = new Set<string>();

  for (const raw of imp.listings) {
    seen.add(raw.finnkode);
    const existing = next.listings[raw.finnkode];
    next.listings[raw.finnkode] = existing
      ? updateListing(existing, raw, search, date, geocode)
      : createListing(raw, search, date, geocode);
  }

  const complete = seen.size >= imp.totalHits;
  if (complete) {
    for (const listing of Object.values(next.listings)) {
      const missing =
        listing.status === 'active' &&
        listing.searches.includes(search.id) &&
        !seen.has(listing.finnkode) &&
        listing.lastSeen < date; // sett i dag i et annet søk → fortsatt aktiv
      if (missing) {
        listing.status = 'sold';
        listing.soldAt = date;
      }
    }
  }

  if (next.updatedAt === null || imp.capturedAt > next.updatedAt) next.updatedAt = imp.capturedAt;

  return {
    store: next,
    run: { id: imp.capturedAt, search: search.id, totalHits: imp.totalHits, captured: seen.size, complete },
  };
}

function locate(postalCode: string | null, place: string | null, geocode: Geocode): ListingLocation {
  const coords = postalCode ? geocode(postalCode) : null;
  return { postalCode, place, lat: coords?.lat ?? null, lon: coords?.lon ?? null };
}

function createListing(raw: RawListing, search: SearchDef, date: string, geocode: Geocode): Listing {
  return {
    finnkode: raw.finnkode,
    url: raw.url,
    model: search.model,
    title: raw.title,
    fuel: raw.fuel,
    year: raw.year,
    km: raw.km,
    price: raw.price,
    seats: raw.seats,
    seatsSource: search.seatsFilter ? 'filter' : 'unknown',
    location: locate(raw.postalCode, raw.place, geocode),
    dealer: raw.dealer,
    status: 'active',
    firstSeen: date,
    lastSeen: date,
    soldAt: null,
    priceHistory: raw.price === null ? [] : [{ date, price: raw.price }],
    searches: [search.id],
  };
}

function updateListing(
  old: Listing,
  raw: RawListing,
  search: SearchDef,
  date: string,
  geocode: Geocode,
): Listing {
  const postalCode = raw.postalCode ?? old.location.postalCode;
  const place = raw.place ?? old.location.place;
  const location =
    postalCode === old.location.postalCode && old.location.lat !== null
      ? { ...old.location, place }
      : locate(postalCode, place, geocode);

  const updated: Listing = {
    ...old,
    url: raw.url,
    model: search.model,
    title: raw.title || old.title,
    fuel: raw.fuel ?? old.fuel,
    year: raw.year ?? old.year,
    km: raw.km ?? old.km,
    seats: raw.seats ?? old.seats,
    dealer: raw.dealer ?? old.dealer,
    location,
    seatsSource: search.seatsFilter ? 'filter' : old.seatsSource,
    lastSeen: date > old.lastSeen ? date : old.lastSeen,
    status: 'active',
    soldAt: null,
    searches: [...new Set([...old.searches, search.id])].sort(),
    priceHistory: [...old.priceHistory],
  };

  if (raw.price !== null && raw.price !== old.price) {
    updated.price = raw.price;
    const last = updated.priceHistory.at(-1);
    if (last && last.date === date) {
      updated.priceHistory[updated.priceHistory.length - 1] = { date, price: raw.price };
    } else {
      updated.priceHistory.push({ date, price: raw.price });
    }
  }
  return updated;
}
```

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run tests/merge.test.ts`
Expected: PASS (16 tester)

- [ ] **Step 5: Kjør hele testsuiten og typecheck**

Run: `npm run typecheck && npm test`
Expected: alt grønt.

- [ ] **Step 6: Commit**

```bash
git add src/core/merge.ts tests/merge.test.ts
git commit -m "feat: merge med solgt-logikk og prishistorikk"
```

---

### Task 4: Ingest-skript og ingest-workflow

**Files:**
- Create: `scripts/ingest.ts`, `scripts/ingest-cli.ts`, `inbox/.gitkeep`, `.github/workflows/ingest.yml`
- Test: `tests/ingest.test.ts`

**Interfaces:**
- Consumes: `validateImport` (Task 2), `emptyStore`, `merge`, `Geocode` (Task 3), typer.
- Produces: `runIngest(root: string, geocode?: Geocode): Promise<IngestResult>` der `interface IngestResult { processed: string[]; rejected: { file: string; errors: string[] }[] }`.

Oppførsel:
- Leser `config/searches.json` (påkrevd), `data/listings.json` (standard `emptyStore()`) og `data/runs.json` (standard `[]`).
- Behandler `inbox/*.json` sortert på filnavn (filnavn starter med ISO-tid, så sortering = tidsrekkefølge).
- Ugyldig fil → flyttes til `inbox/rejected/<fil>` med `<fil>.errors.txt` ved siden av. Data endres ikke av den filen.
- Gyldige filer → merges i rekkefølge. `data/` skrives **før** behandlede inbox-filer slettes.
- Ingen behandlede filer → `data/` skrives ikke.

- [ ] **Step 1: Skriv de feilende testene**

`tests/ingest.test.ts`:

```ts
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { runIngest } from '../scripts/ingest';
import type { Run, Store } from '../src/core/types';

const searches = [
  { id: 'kodiaq-6plus', model: 'kodiaq', label: 'Kodiaq, 6+ seter', seatsFilter: true, url: null },
];

function listing(finnkode: string) {
  return {
    finnkode,
    url: `https://www.finn.no/mobility/item/${finnkode}`,
    title: 'Skoda Kodiaq',
    price: 389000, year: 2021, km: 84000, fuel: 'diesel', seats: 7,
    postalCode: '5055', place: 'Bergen', dealer: true,
  };
}

function importFile(capturedAt: string, finnkodes: string[], totalHits = finnkodes.length) {
  return { importVersion: 1, capturedAt, search: 'kodiaq-6plus', totalHits, listings: finnkodes.map(listing) };
}

let root: string;

async function write(path: string, value: unknown) {
  await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(root, path), 'utf8')) as T;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ingest-'));
  await mkdir(join(root, 'config'));
  await mkdir(join(root, 'data'));
  await mkdir(join(root, 'inbox'));
  await write('config/searches.json', searches);
});

describe('runIngest', () => {
  it('behandler en gyldig fil, skriver data og sletter inbox-filen', async () => {
    await write('inbox/2026-10-03T18-00-00Z-kodiaq-6plus.json', importFile('2026-10-03T18:00:00Z', ['100000001']));

    const result = await runIngest(root);

    expect(result).toEqual({ processed: ['2026-10-03T18-00-00Z-kodiaq-6plus.json'], rejected: [] });
    const store = await readJson<Store>('data/listings.json');
    expect(Object.keys(store.listings)).toEqual(['100000001']);
    const runs = await readJson<Run[]>('data/runs.json');
    expect(runs).toEqual([
      { id: '2026-10-03T18:00:00Z', search: 'kodiaq-6plus', totalHits: 1, captured: 1, complete: true },
    ]);
    expect(await readdir(join(root, 'inbox'))).toEqual([]);
  });

  it('behandler filer i navnerekkefølge', async () => {
    await write('inbox/2026-10-05T09-00-00Z-kodiaq-6plus.json', importFile('2026-10-05T09:00:00Z', ['100000001']));
    await write('inbox/2026-10-03T18-00-00Z-kodiaq-6plus.json', importFile('2026-10-03T18:00:00Z', ['100000001', '100000002']));

    await runIngest(root);

    const store = await readJson<Store>('data/listings.json');
    expect(store.listings['100000002']?.status).toBe('sold');
    expect(store.listings['100000002']?.soldAt).toBe('2026-10-05');
  });

  it('avviser ugyldige filer uten å endre data', async () => {
    await write('inbox/a.json', '{ikke json');
    await write('inbox/b.json', { ...importFile('2026-10-03T18:00:00Z', ['100000001']), search: 'golf' });

    const result = await runIngest(root);

    expect(result.processed).toEqual([]);
    expect(result.rejected).toEqual([
      { file: 'a.json', errors: ['Ugyldig JSON'] },
      { file: 'b.json', errors: ['Ukjent søk: golf'] },
    ]);
    expect((await readdir(join(root, 'inbox', 'rejected'))).sort()).toEqual([
      'a.json', 'a.json.errors.txt', 'b.json', 'b.json.errors.txt',
    ]);
    expect(await readFile(join(root, 'inbox/rejected/b.json.errors.txt'), 'utf8')).toBe('Ukjent søk: golf\n');
    await expect(readFile(join(root, 'data/listings.json'))).rejects.toThrow();
  });

  it('bygger videre på eksisterende data', async () => {
    await write('inbox/1.json', importFile('2026-10-03T18:00:00Z', ['100000001']));
    await runIngest(root);
    await write('inbox/2.json', importFile('2026-10-05T09:00:00Z', ['100000002'], 99));
    await runIngest(root);

    const store = await readJson<Store>('data/listings.json');
    expect(Object.keys(store.listings).sort()).toEqual(['100000001', '100000002']);
    expect(await readJson<Run[]>('data/runs.json')).toHaveLength(2);
  });

  it('gjør ingenting når inbox er tom', async () => {
    expect(await runIngest(root)).toEqual({ processed: [], rejected: [] });
    await expect(readFile(join(root, 'data/listings.json'))).rejects.toThrow();
  });

  it('ignorerer filer som ikke er .json, for eksempel .gitkeep', async () => {
    await write('inbox/.gitkeep', '');
    expect(await runIngest(root)).toEqual({ processed: [], rejected: [] });
    expect(await readdir(join(root, 'inbox'))).toEqual(['.gitkeep']);
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run tests/ingest.test.ts`
Expected: FAIL, `Failed to resolve import "../scripts/ingest"`

- [ ] **Step 3: Implementer `runIngest`**

`scripts/ingest.ts`:

```ts
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyStore, merge, type Geocode } from '../src/core/merge';
import type { Run, SearchDef, Store } from '../src/core/types';
import { validateImport } from '../src/core/validateImport';

export interface IngestResult {
  processed: string[];
  rejected: { file: string; errors: string[] }[];
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

export async function runIngest(root: string, geocode?: Geocode): Promise<IngestResult> {
  const searches = await readJson<SearchDef[] | null>(join(root, 'config/searches.json'), null);
  if (!searches) throw new Error('config/searches.json mangler');
  const searchIds = searches.map((s) => s.id);

  const listingsPath = join(root, 'data/listings.json');
  const runsPath = join(root, 'data/runs.json');
  let store = await readJson<Store>(listingsPath, emptyStore());
  const runs = await readJson<Run[]>(runsPath, []);

  const inbox = join(root, 'inbox');
  const files = (await readdir(inbox).catch(() => [] as string[]))
    .filter((f) => f.endsWith('.json'))
    .sort();

  const result: IngestResult = { processed: [], rejected: [] };

  for (const file of files) {
    const path = join(inbox, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      await reject(inbox, file, ['Ugyldig JSON'], result);
      continue;
    }
    const validation = validateImport(parsed, searchIds);
    if (!validation.ok) {
      await reject(inbox, file, validation.errors, result);
      continue;
    }
    const search = searches.find((s) => s.id === validation.value.search);
    if (!search) throw new Error(`Søk forsvant under ingest: ${validation.value.search}`);
    const out = merge(store, validation.value, search, geocode);
    store = out.store;
    runs.push(out.run);
    result.processed.push(file);
  }

  if (result.processed.length > 0) {
    await mkdir(join(root, 'data'), { recursive: true });
    await writeJson(listingsPath, store);
    await writeJson(runsPath, runs);
    for (const file of result.processed) await rm(join(inbox, file));
  }
  return result;
}

async function reject(inbox: string, file: string, errors: string[], result: IngestResult): Promise<void> {
  const dir = join(inbox, 'rejected');
  await mkdir(dir, { recursive: true });
  await rename(join(inbox, file), join(dir, file));
  await writeFile(join(dir, `${file}.errors.txt`), errors.join('\n') + '\n');
  result.rejected.push({ file, errors });
}
```

`scripts/ingest-cli.ts`:

```ts
import { runIngest } from './ingest';

const result = await runIngest(process.cwd());
console.log(`Behandlet: ${result.processed.length}, avvist: ${result.rejected.length}`);
for (const r of result.rejected) console.error(`${r.file}: ${r.errors.join('; ')}`);
if (result.rejected.length > 0) process.exitCode = 1;
```

`inbox/.gitkeep`: tom fil.

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run tests/ingest.test.ts`
Expected: PASS (6 tester)

- [ ] **Step 5: Røyktest CLI-en mot repoet**

Run: `npm run ingest`
Expected: `Behandlet: 0, avvist: 0`, ingen filer endret (`git status` viser ingenting nytt utenom det du har laget).

- [ ] **Step 6: Ingest-workflow**

`.github/workflows/ingest.yml`:

```yaml
name: Ingest

on:
  push:
    branches: [main]
    paths: ['inbox/**']
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: ingest
  cancel-in-progress: false

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - id: ingest
        run: npm run ingest
        continue-on-error: true
      - name: Commit data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A data inbox
          if git diff --cached --quiet; then
            echo "Ingen endringer å committe"
            exit 0
          fi
          git commit -m "data: ingest $(date -u +%Y-%m-%dT%H:%MZ)"
          git pull --rebase origin main
          git push origin HEAD:main
      - name: Feil hvis noe ble avvist
        if: steps.ingest.outcome == 'failure'
        run: |
          echo "Noen importfiler ble avvist. Se inbox/rejected/ i repoet."
          exit 1
```

Merk: commits laget med `GITHUB_TOKEN` trigger ikke nye workflow-kjøringer, så bot-commiten starter ikke ingest på nytt. I fase 2 utvides workflowen med build og deploy og får navnet `ingest-deploy.yml` (spec §3).

- [ ] **Step 7: Verifiser og commit**

Run: `npm run typecheck && npm test`
Expected: alt grønt.

```bash
git add scripts inbox/.gitkeep tests/ingest.test.ts .github/workflows/ingest.yml
git commit -m "feat: ingest-skript og ingest-workflow"
```

---

### Task 5: Diagnose-bokmerke

**Files:**
- Create: `bookmarklet/diagnose.ts`, `bookmarklet/diagnose-entry.ts`, `bookmarklet/build.ts`, `bookmarklet/dist/diagnose.txt` (generert)
- Test: `tests/diagnose.test.ts`, `tests/bookmarkletBuild.test.ts`

**Interfaces:**
- Produces:
  - `diagnose(doc: Document, now: Date): Diagnosis` med
    `interface Diagnosis { url: string; title: string; capturedAt: string; finnkodes: string[]; hitTextCandidates: string[]; jsonScripts: JsonScriptInfo[]; articleSamples: string[] }` og
    `interface JsonScriptInfo { id: string | null; type: string | null; length: number; topLevelKeys: string[] }`
  - `buildBookmarklet(entry: string): Promise<string>` → `javascript:`-URL. Gjenbrukes i fase 2 for innsamlingsbokmerket.

Formål: Vi vet ikke hvordan Finns resultatside er bygget (sandkassen når ikke finn.no). Bokmerket viser et sammendrag (finnkoder i lenker, tekst som ligner «57 treff», innebygde JSON-skript med toppnøkler, to eksempler på `<article>`) og lar brukeren laste ned hele siden. Den nedlastede siden blir testfikstur for `parse.ts` i fase 2.

- [ ] **Step 1: Skriv de feilende testene for `diagnose`**

`tests/diagnose.test.ts`:

```ts
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { diagnose } from '../bookmarklet/diagnose';

const html = `<!doctype html>
<html><head><title>Bil til salgs | FINN</title>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}},"page":"/search"}</script>
<script type="application/ld+json">[1,2]</script>
<script type="application/json" id="broken">{nope</script>
<script>var x = 1;</script>
</head><body>
<h1><span>57 treff</span></h1>
<p>Dette er en lang tekst som nevner 3 annonser men er altfor lang til å være en treffteller, så den skal ikke tas med i det hele tatt.</p>
<article><a href="https://www.finn.no/mobility/item/412345678">Skoda Kodiaq</a></article>
<article><a href="/car/used/ad.html?finnkode=412345679">Tesla Model Y</a></article>
<article><a href="/mobility/item/412345678">Duplikat</a></article>
<a href="/annet">Ingen kode</a>
</body></html>`;

function run() {
  const dom = new JSDOM(html, { url: 'https://www.finn.no/mobility/search/car?seats_from=6' });
  return diagnose(dom.window.document, new Date('2026-10-05T10:00:00Z'));
}

describe('diagnose', () => {
  it('tar med URL, tittel og tidspunkt', () => {
    const d = run();
    expect(d.url).toBe('https://www.finn.no/mobility/search/car?seats_from=6');
    expect(d.title).toBe('Bil til salgs | FINN');
    expect(d.capturedAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it('finner unike finnkoder i lenker', () => {
    expect(run().finnkodes).toEqual(['412345678', '412345679']);
  });

  it('finner korte tekster som ligner treffteller', () => {
    expect(run().hitTextCandidates).toEqual(['57 treff']);
  });

  it('beskriver JSON-skript og ignorerer vanlige skript', () => {
    expect(run().jsonScripts).toEqual([
      { id: '__NEXT_DATA__', type: 'application/json', length: 43, topLevelKeys: ['props', 'page'] },
      { id: null, type: 'application/ld+json', length: 5, topLevelKeys: ['0', '1'] },
      { id: 'broken', type: 'application/json', length: 5, topLevelKeys: ['<ugyldig JSON>'] },
    ]);
  });

  it('tar med de to første artiklene, avkortet', () => {
    const d = run();
    expect(d.articleSamples).toHaveLength(2);
    expect(d.articleSamples[0]).toContain('412345678');
    expect(d.articleSamples.every((s) => s.length <= 4000)).toBe(true);
  });
});
```

- [ ] **Step 2: Kjør testene og se at de feiler**

Run: `npx vitest run tests/diagnose.test.ts`
Expected: FAIL, `Failed to resolve import "../bookmarklet/diagnose"`

- [ ] **Step 3: Implementer `diagnose`**

`bookmarklet/diagnose.ts`:

```ts
export interface JsonScriptInfo {
  id: string | null;
  type: string | null;
  length: number;
  topLevelKeys: string[];
}

export interface Diagnosis {
  url: string;
  title: string;
  capturedAt: string;
  finnkodes: string[];
  hitTextCandidates: string[];
  jsonScripts: JsonScriptInfo[];
  articleSamples: string[];
}

const FINNKODE_RE = /(?:\/item\/|finnkode=)(\d{6,12})/;
const HITS_RE = /\d[\d\s ]*\s*(treff|annonser|resultater)/i;
const JSON_TYPES = ['application/json', 'application/ld+json'];

/** Beskriver strukturen på en Finn-resultatside. Ren funksjon, endrer ikke dokumentet. */
export function diagnose(doc: Document, now: Date): Diagnosis {
  const finnkodes = [
    ...new Set(
      [...doc.querySelectorAll('a[href]')]
        .map((a) => FINNKODE_RE.exec(a.getAttribute('href') ?? '')?.[1])
        .filter((code): code is string => code !== undefined),
    ),
  ];

  const hitTextCandidates = [...doc.querySelectorAll('body *')]
    .filter((el) => el.children.length === 0)
    .map((el) => (el.textContent ?? '').trim())
    .filter((text) => text.length < 80 && HITS_RE.test(text))
    .slice(0, 5);

  const jsonScripts = [...doc.querySelectorAll('script')]
    .filter((s) => JSON_TYPES.includes(s.getAttribute('type') ?? '') || s.id === '__NEXT_DATA__')
    .map((s): JsonScriptInfo => {
      const text = s.textContent ?? '';
      let topLevelKeys: string[];
      try {
        const value: unknown = JSON.parse(text);
        topLevelKeys = value !== null && typeof value === 'object' ? Object.keys(value).slice(0, 30) : [];
      } catch {
        topLevelKeys = ['<ugyldig JSON>'];
      }
      return { id: s.id || null, type: s.getAttribute('type'), length: text.length, topLevelKeys };
    });

  const articleSamples = [...doc.querySelectorAll('article')]
    .slice(0, 2)
    .map((a) => a.outerHTML.slice(0, 4000));

  return {
    url: doc.location?.href ?? '',
    title: doc.title,
    capturedAt: now.toISOString(),
    finnkodes,
    hitTextCandidates,
    jsonScripts,
    articleSamples,
  };
}
```

- [ ] **Step 4: Kjør testene og se at de passerer**

Run: `npx vitest run tests/diagnose.test.ts`
Expected: PASS (5 tester)

- [ ] **Step 5: Overlegg (inngangspunkt for bokmerket)**

`bookmarklet/diagnose-entry.ts`:

```ts
import { diagnose } from './diagnose';

const d = diagnose(document, new Date());
const summary = JSON.stringify(d, null, 2);

const box = document.createElement('div');
box.setAttribute(
  'style',
  'position:fixed;inset:0;z-index:2147483647;background:#fff;color:#000;' +
    'padding:16px;overflow:auto;font:15px/1.4 system-ui,sans-serif',
);

const info = document.createElement('p');
info.textContent =
  `Fant ${d.finnkodes.length} finnkoder, ${d.jsonScripts.length} JSON-skript og ` +
  `${d.hitTextCandidates.length} mulige treff-tekster.`;

const text = document.createElement('textarea');
text.value = summary;
text.readOnly = true;
text.setAttribute('style', 'width:100%;height:50vh;font:12px monospace');

function button(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.setAttribute('style', 'margin:0 8px 8px 0;padding:10px 14px;font-size:15px');
  b.addEventListener('click', () => void onClick());
  return b;
}

const copy = button('Kopier sammendrag', async () => {
  try {
    await navigator.clipboard.writeText(summary);
    info.textContent = 'Sammendraget er kopiert. Lim det inn i Claude-appen.';
  } catch {
    text.select();
    info.textContent = 'Kunne ikke kopiere automatisk. Teksten er markert, kopier den manuelt.';
  }
});

const download = button('Last ned hele siden', () => {
  const blob = new Blob(['<!doctype html>\n' + document.documentElement.outerHTML], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finn-${d.capturedAt.replace(/[:.]/g, '-')}.html`;
  a.click();
  info.textContent = 'Lagret. Legg ved filen i Claude-appen (fra Filer → Nedlastinger).';
});

const close = button('Lukk', () => box.remove());

box.append(info, copy, download, close, text);
document.body.append(box);
```

- [ ] **Step 6: Skriv den feilende testen for byggingen**

`tests/bookmarkletBuild.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBookmarklet } from '../bookmarklet/build';

describe('buildBookmarklet', () => {
  it('lager en kompakt javascript:-URL med overlegget', async () => {
    const url = await buildBookmarklet('bookmarklet/diagnose-entry.ts');
    expect(url.startsWith('javascript:')).toBe(true);
    const code = decodeURIComponent(url.slice('javascript:'.length));
    expect(code).toContain('Kopier sammendrag');
    expect(code).not.toContain('import ');
    expect(url.length).toBeLessThan(30000);
  });
});
```

- [ ] **Step 7: Kjør testen og se at den feiler**

Run: `npx vitest run tests/bookmarkletBuild.test.ts`
Expected: FAIL, `Failed to resolve import "../bookmarklet/build"`

- [ ] **Step 8: Implementer `buildBookmarklet`**

`bookmarklet/build.ts`:

```ts
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Bundler et inngangspunkt til en javascript:-URL som kan lagres som bokmerke. */
export async function buildBookmarklet(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'safari15',
    write: false,
  });
  const code = result.outputFiles[0]?.text.trim();
  if (!code) throw new Error(`Tomt bundle for ${entry}`);
  return 'javascript:' + encodeURIComponent(code);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir('bookmarklet/dist', { recursive: true });
  await writeFile('bookmarklet/dist/diagnose.txt', (await buildBookmarklet('bookmarklet/diagnose-entry.ts')) + '\n');
  console.log('Skrev bookmarklet/dist/diagnose.txt');
}
```

- [ ] **Step 9: Kjør testene og bygg bokmerket**

Run: `npm test && npm run build:bookmarklets`
Expected: alle tester grønne, `Skrev bookmarklet/dist/diagnose.txt`, og filen starter med `javascript:`.

- [ ] **Step 10: Typecheck og commit**

Run: `npm run typecheck`
Expected: ingen feil.

```bash
git add bookmarklet tests/diagnose.test.ts tests/bookmarkletBuild.test.ts
git commit -m "feat: diagnose-bokmerke for Finn-resultatsider"
```

---

### Task 6: README, PR og overlevering av fikstur

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Skriv README**

Erstatt `README.md` med:

````markdown
# Syvseterjakten

Privat dashbord som sammenligner 6/7-seters bruktbiler (Skoda Kodiaq,
Tesla Model Y, Tesla Model X, Mercedes EQB) fra Finn.no, med forventet
årskostnad over 8 år for en bilist i Bergen.

**Status:** fase 1 av 5. Datakjernen (import, merge, ingest) og
diagnose-bokmerket er ferdig. Innsamlingsbokmerke, dashbord og publisering
kommer i senere faser. Se `docs/superpowers/plans/`.

## Hvordan data kommer inn

Finn tillater ikke automatisert innhenting, så ingenting hentes automatisk.
Du søker selv på Finn og trykker et bokmerke. Dataene havner som en fil i
`inbox/`, og workflowen **Ingest** slår dem sammen med `data/listings.json`
og committer resultatet.

- Ugyldige filer flyttes til `inbox/rejected/`, med en `.errors.txt` som
  forklarer hvorfor. Workflowen blir da rød.
- Kjør Ingest manuelt: GitHub-appen → repoet → Actions → Ingest → Run workflow.

## Diagnose-bokmerket (iPhone, Safari)

Brukes én gang, for at fase 2 skal kunne lese Finns resultatsider.

1. Åpne `bookmarklet/dist/diagnose.txt` i GitHub-appen og kopier hele innholdet.
2. I Safari: lag et bokmerke av en hvilken som helst side, og kall det
   «Finn-diagnose».
3. Bokmerker → Rediger → «Finn-diagnose» → lim inn teksten i adressefeltet.
4. Åpne et Finn-søk, f.eks. Skoda Kodiaq med minst 6 seter.
5. Bokmerker → «Finn-diagnose». Et hvitt panel dekker siden.
6. Trykk **Last ned hele siden**, og legg ved filen i Claude-appen. Hvis det
   ikke går, trykk **Kopier sammendrag** og lim inn teksten i stedet.

## Utvikling

```bash
npm ci
npm test            # Vitest
npm run typecheck
npm run build
npm run ingest      # slår sammen inbox/ lokalt
npm run build:bookmarklets
```

Kodeendringer går via pull requests. CI kjører typecheck, tester og bygg på
hver PR. Bare bot-commits med data går direkte til `main`.
````

- [ ] **Step 2: Full verifisering**

Run: `npm ci && npm run typecheck && npm test && npm run build && npm run build:bookmarklets && git status --short`
Expected: alt grønt, og `git status` viser bare `README.md` som endret (`bookmarklet/dist/diagnose.txt` er uendret fra Task 5).

- [ ] **Step 3: Commit, push og PR**

```bash
git add README.md
git commit -m "docs: README for fase 1"
git push -u origin fase-1
```

Opprett PR `fase-1` → `main` med tittel «Fase 1: datakjerne og diagnose-bokmerke». Vent til CI er grønn.

- [ ] **Step 4: Overlevering**

Når PR-en er merget, gir Claude brukeren innholdet i `bookmarklet/dist/diagnose.txt` direkte i chatten (enklere å kopiere enn fra GitHub-appen) og ber om en nedlastet resultatside for hvert av de seks søkene. Brukeren sender også URL-ene til søkene. Begge deler er input til planen for fase 2.
