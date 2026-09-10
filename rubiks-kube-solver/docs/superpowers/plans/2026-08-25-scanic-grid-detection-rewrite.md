# Kubesidedeteksjon på `scanic` — implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatt den egenutviklede gradient-søk-algoritmen i `cornerDetection.ts` med biblioteket `scanic`s klassiske (kontur-basert) dokumentdetektor, kube-tilpasset, for markant mer robust automatisk gjenkjenning av kubesidens rutenett i skannede foto.

**Architecture:** `cornerDetection.ts` blir en tynn async adapter rundt `scanic`s `scanDocument()`: kall biblioteket med kube-tilpassede geometri-terskler, map `CornerPoints` → `GridQuad`, fall tilbake til dagens sentrerte-kvadrat-heuristikk med konfidens 0 når biblioteket ikke finner noe brukbart. `ScanWizard.tsx` tilpasses til at deteksjonen nå er asynkron og fjerner sin egen nedskalering (biblioteket gjør dette selv og returnerer hjørner i original oppløsning).

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest, `scanic` (ny avhengighet), `jsdom` + `canvas` (nye devDependencies, kun for test — se "Viktig teknisk forutsetning" under).

**Spec:** `docs/superpowers/specs/2026-08-25-scanic-grid-detection-rewrite-design.md`

## Viktig teknisk forutsetning (verifisert under planlegging, ikke gjett)

`scanic` bruker `document.createElement('canvas')` internt for sin egen
nedskalering/gråtone-konvertering — den kaster `ReferenceError: document is
not defined` i ren Node uten DOM. Vitest-prosjektet kjører i dag i
node-miljø (ingen `environment` satt i `vitest.config.ts`). Testene for
denne omskrivingen må derfor kjøre i `jsdom`-miljø, med
`document.createElement('canvas')` patchet til å gi et ekte
(Cairo-rendret) canvas fra npm-pakken `canvas` — jsdoms eget
`<canvas>`-element har ingen fungerende 2D-kontekst. Dette er **verifisert
direkte** under planleggingen (kjørt ekte `scanDocument()`-kall gjennom
akkurat dette oppsettet, se kode i Oppgave 1).

Dette er **kun for test** — i den ekte appen (nettleser) finnes
`document`, `HTMLCanvasElement` og `ImageData` allerede naturlig, og
`canvas`-pakken (native Cairo-binding) bygges aldri inn i selve
appen (kun `devDependencies`, aldri importert av produksjonskode).

Miljøet settes **kun for denne ene testfilen** via
`// @vitest-environment jsdom` øverst i filen — `vitest.config.ts` endres
ikke globalt, så alle andre testfiler fortsetter å kjøre i det raskere
node-miljøet.

**Også verifisert (viktig for Oppgave 2):** `scanDocument()`s
`success: true` betyr **kun** "fant en kontur med 4 hjørner et sted i
bildet" — IKKE at geometrien besto kube-terskeltestene. Den faktiske
gyldighetssjekken (konveksitet, sideforhold, rett-vinkel osv.) påvirker
kun `confidence` (satt til `score * 0.33` hvis geometrien er ugyldig, ellers
`score` uendret), aldri `success`-flagget. Siden `score` er en vektet sum
som alltid er ≤ 1, er `score * 0.33` **matematisk aldri høyere enn 0,33**
for en ugyldig geometri. Vår `isConfidentDetection`-terskel (0,5) ligger
trygt over dette taket — det er derfor adapteren avviser en ugyldig
deteksjon riktig **basert på `confidence`, aldri på `success` alene**.
Dette er dokumentert i kildekoden under, ikke noe som må gjettes på nytt.

## Global Constraints

- Kun `scanic`s klassiske detektor (`detector: 'classical'`) — ML-modellen (`scanic-ml`) er eksplisitt utenfor omfang.
- Ingen ekte brukerfoto (personvern) committes til repoet — kun syntetiske, prosedyre-genererte testbilder.
- `GridQuad`, `Point` beholdes uendret (`[TL, TR, BR, BL]` rekkefølge) — konsumeres av `gridSampler.ts` og `ScanGridOverlay.tsx`, som ikke skal trenge endring.
- `detectGridQuad` blir `async` (`Promise<DetectionResult>`) — eneste offentlige signaturendring.
- `canvas`/`jsdom` er `devDependencies` — aldri importert fra produksjonskode, bygges aldri inn i `npm run build` eller `npm run build:artifact`.
- Full `npm test` / `npx tsc -b` / `npx oxlint` / `npm run build` / `npm run build:artifact` skal være grønt før oppgave 4 anses ferdig.

---

## Oppgave 1: Grunnleggende adapter — `cornerDetection.ts` på `scanic`

**Files:**
- Modify: `package.json` (legg til `scanic` i `dependencies`; `jsdom`, `canvas` i `devDependencies`)
- Modify: `src/cube/cornerDetection.ts` (full omskriving)
- Create: `src/cube/cornerDetection.test.ts` (erstatter eksisterende innhold helt)
- Create: `src/cube/cornerDetection.fallback.test.ts` (ny, egen fil for feilhåndtering med mocket `scanic`)

**Interfaces:**
- Produces: `Point { x: number; y: number }`, `GridQuad = [Point, Point, Point, Point]`, `DetectionResult { quad: GridQuad; confidence: number }`, `CONFIDENCE_THRESHOLD: number`, `isConfidentDetection(confidence: number): boolean`, `detectGridQuad(image: HTMLCanvasElement | HTMLImageElement | ImageData): Promise<DetectionResult>` — alle brukt av Oppgave 3 (`ScanWizard.tsx`) og allerede av `gridSampler.ts`/`ScanGridOverlay.tsx` (uendret).

- [ ] **Step 1: Installer avhengigheter**

```bash
cd rubiks-kube-solver
npm install scanic
npm install --save-dev jsdom canvas
```

Verifiser: `grep '"scanic"' package.json` og `grep '"jsdom"\|"canvas"' package.json` viser de nye linjene.

- [ ] **Step 2: Skriv de feilende testene for grunnleggende adapter-oppførsel**

Erstatt hele innholdet i `src/cube/cornerDetection.test.ts` med:

```ts
// @vitest-environment jsdom
import { beforeAll, describe, expect, test } from 'vitest';
import { createCanvas, ImageData as NodeCanvasImageData } from 'canvas';
import {
  CONFIDENCE_THRESHOLD,
  detectGridQuad,
  isConfidentDetection,
  type GridQuad,
  type Point,
} from './cornerDetection';

// scanic uses document.createElement('canvas') internally for its own
// downscaling/grayscale step. jsdom's built-in <canvas> has no working 2D
// context, so document.createElement is patched to hand out a real
// (Cairo-backed) canvas from the `canvas` package instead - verified
// directly to make scanic work end-to-end under Vitest. Test-only: the
// real app runs in an actual browser, where this all works natively and
// none of this file's setup exists.
beforeAll(() => {
  (globalThis as unknown as { ImageData: unknown }).ImageData = NodeCanvasImageData;
  const realCreateElement = document.createElement.bind(document);
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    if (tag === 'canvas') return createCanvas(1, 1) as unknown as HTMLCanvasElement;
    return realCreateElement(tag, options);
  }) as typeof document.createElement;
});

/** Renders a white background with a black cube-grid outline plus its two
 * internal vertical/horizontal lines along the given quad, simulating the
 * high-contrast pattern a real cube face produces, as a real ImageData. */
function buildSyntheticGridImage(width: number, height: number, quad: GridQuad): ImageData {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const setPixel = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const i = (py * width + px) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  };
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const drawLine = (a: Point, b: Point) => {
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const p = lerp(a, b, i / steps);
      setPixel(p.x, p.y);
    }
  };
  const [tl, tr, br, bl] = quad;
  drawLine(tl, tr);
  drawLine(tr, br);
  drawLine(br, bl);
  drawLine(bl, tl);
  const quadPoint = (u: number, v: number): Point => {
    const top = lerp(tl, tr, u);
    const bottom = lerp(bl, br, u);
    return lerp(top, bottom, v);
  };
  drawLine(quadPoint(1 / 3, 0), quadPoint(1 / 3, 1));
  drawLine(quadPoint(2 / 3, 0), quadPoint(2 / 3, 1));
  drawLine(quadPoint(0, 1 / 3), quadPoint(1, 1 / 3));
  drawLine(quadPoint(0, 2 / 3), quadPoint(1, 2 / 3));
  return new ImageData(data, width, height);
}

describe('detectGridQuad - basic adapter behavior', () => {
  test('finds a clean, centered grid with confidence above the threshold', async () => {
    const trueQuad: GridQuad = [
      { x: 40, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 260 },
      { x: 40, y: 260 },
    ];
    const image = buildSyntheticGridImage(300, 300, trueQuad);
    const result = await detectGridQuad(image);
    // Measured directly against this exact scenario during planning:
    // confidence 0.938, corners within 1-3px of true. 10px leaves headroom.
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(10);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(10);
    }
    expect(isConfidentDetection(result.confidence)).toBe(true);
  });

  test('falls back to a centered square with zero confidence on a blank (no-signal) image', async () => {
    const width = 200;
    const height = 200;
    const data = new Uint8ClampedArray(width * height * 4).fill(200);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const image = new ImageData(data, width, height);
    const result = await detectGridQuad(image);
    const size = Math.min(width, height) * 0.7;
    const expectedX = (width - size) / 2;
    expect(result.quad[0].x).toBeCloseTo(expectedX, 0);
    expect(result.confidence).toBe(0);
    expect(isConfidentDetection(result.confidence)).toBe(false);
  });
});

describe('CONFIDENCE_THRESHOLD', () => {
  test('sits above the mathematically-guaranteed ceiling for an invalid detection (0.33)', () => {
    // scanic's own scoring caps an invalid-geometry candidate's confidence
    // at score*0.33 where score <= 1 - see cornerDetection.ts for the full
    // explanation. This is a structural property of the library, not a
    // number to re-guess: as long as this test passes, isConfidentDetection
    // can never call an invalid detection confident.
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0.33);
  });
});
```

- [ ] **Step 3: Kjør testene og bekreft at de feiler riktig**

```bash
npx vitest run src/cube/cornerDetection.test.ts
```

Forventet: kompileringsfeil eller "not a function" for `detectGridQuad`/`isConfidentDetection`/`CONFIDENCE_THRESHOLD` — de finnes ikke ennå i sin nye form. Ikke gå videre før du har sett denne feile av riktig grunn (manglende implementasjon, ikke en skrivefeil i testen).

- [ ] **Step 4: Skriv den nye `cornerDetection.ts`**

Erstatt hele innholdet med:

```ts
import { scanDocument, type CornerPoints, type DetectionOptions } from 'scanic';

export interface Point {
  x: number;
  y: number;
}

/** [TL, TR, BR, BL] - this order is used everywhere a quad is consumed or produced. */
export type GridQuad = [Point, Point, Point, Point];

export interface DetectionResult {
  quad: GridQuad;
  confidence: number;
}

// A cube face is nearly square (unlike a general document, which can be
// elongated) and background clutter (table, shadow) should be actively
// rejected, not just tolerated. Starting values verified during planning
// against a synthetic off-center + wood-grain-texture + shadow-edge scene
// (the exact failure class the previous hand-rolled algorithm could never
// solve): confidence 0.767-0.779, corner error 1.4-3.6px. Re-verify against
// the regression corpus in this file if these ever need adjusting.
const CUBE_DETECTION_OPTIONS: DetectionOptions = {
  detector: 'classical',
  maxDocumentAspectRatio: 1.7,
  minRightAngleScore: 0.6,
  minOppositeSideConsistency: 0.6,
  minDocumentCoverageRatio: 0.06,
  minContourFitRatio: 0.8,
  maxContourFitRatio: 1.15,
};

// scanic's `success` flag means only "found a 4-cornered contour somewhere"
// - it does NOT mean the geometry passed the validity gates above (verified
// by reading scanic's source: `success: true` is returned whenever any
// candidate has corners at all, regardless of whether it's geometrically
// valid). The gates instead cap an invalid candidate's confidence at
// `score * 0.33` (score is a weighted sum of sub-scores that never exceeds
// 1), so 0.33 is a hard mathematical ceiling for anything that failed
// validation. This threshold must always stay above that ceiling - see the
// "sits above the mathematically-guaranteed ceiling" test in
// cornerDetection.test.ts, which fails loudly if it doesn't.
export const CONFIDENCE_THRESHOLD = 0.5;

/** True when detectGridQuad's reported confidence is high enough that a
 * real grid was found (as opposed to the centered-square fallback, or a
 * candidate that failed scanic's own geometry validity gates). The UI uses
 * this to decide whether to nudge the user to drag the corners into place
 * manually. */
export function isConfidentDetection(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLD;
}

function defaultQuad(width: number, height: number, sizeFraction: number): GridQuad {
  const size = Math.min(width, height) * sizeFraction;
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

function cornersToQuad(corners: CornerPoints): GridQuad {
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
}

/** Detects the cube face's grid quad in a photo using scanic's classical
 * (contour-based) document detector, tuned for a near-square, high-contrast
 * subject. Falls back to a centered square with confidence 0 - the same
 * shape the manual drag-to-correct UI already expects - whenever scanic
 * doesn't return usable corners, or throws (e.g. its WASM module fails to
 * initialize on an unsupported engine). */
export async function detectGridQuad(
  image: HTMLCanvasElement | HTMLImageElement | ImageData
): Promise<DetectionResult> {
  const fallback: DetectionResult = { quad: defaultQuad(image.width, image.height, 0.7), confidence: 0 };
  try {
    const result = await scanDocument(image, { mode: 'detect', ...CUBE_DETECTION_OPTIONS });
    if (!result.corners) return fallback;
    return { quad: cornersToQuad(result.corners), confidence: result.confidence ?? 0 };
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 5: Kjør testene og bekreft at de består**

```bash
npx vitest run src/cube/cornerDetection.test.ts
```

Forventet: alle 3 tester grønne. Hvis "finds a clean, centered grid"-testen feiler på konfidens eller posisjon: sjekk at `beforeAll`-oppsettet faktisk kjørte (legg til en midlertidig `console.log` i patchen for å bekrefte) før du justerer noe annet.

- [ ] **Step 6: Skriv den feilende testen for feilhåndtering (mocket `scanic`)**

Opprett `src/cube/cornerDetection.fallback.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';

vi.mock('scanic', () => ({
  scanDocument: vi.fn().mockRejectedValue(new Error('WASM module failed to initialize')),
}));

const { detectGridQuad } = await import('./cornerDetection');

describe('detectGridQuad - error fallback', () => {
  test('falls back to a centered square with zero confidence when scanDocument throws', async () => {
    const image = { width: 300, height: 200 } as unknown as HTMLCanvasElement;
    const result = await detectGridQuad(image);
    const size = Math.min(300, 200) * 0.7;
    const expectedX = (300 - size) / 2;
    const expectedY = (200 - size) / 2;
    expect(result.quad[0].x).toBeCloseTo(expectedX, 5);
    expect(result.quad[0].y).toBeCloseTo(expectedY, 5);
    expect(result.confidence).toBe(0);
  });
});
```

This file runs in the default (node) Vitest environment - `scanDocument` is mocked, so it never touches a real canvas.

- [ ] **Step 7: Kjør testen og bekreft at den feiler riktig, så bekreft at den består**

```bash
npx vitest run src/cube/cornerDetection.fallback.test.ts
```

Should already pass once Step 4's `try/catch` exists (it was written before this test) - if it fails, the catch block in `detectGridQuad` is the bug to fix, not the test.

- [ ] **Step 8: Kjør hele testsuiten, typecheck og lint**

```bash
npx vitest run
npx tsc -b
npx oxlint
```

Alle skal være grønne. `oxlint`/`tsc` kan klage på `as unknown as HTMLCanvasElement`-castene i testfilene - dette er forventet og trygt (test-only DOM-shimming), behold dem.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/cube/cornerDetection.ts src/cube/cornerDetection.test.ts src/cube/cornerDetection.fallback.test.ts
git commit -m "Replace hand-rolled grid detection with scanic's contour-based detector"
```

---

## Oppgave 2: Kube-tilpasset regresjonskorpus

**Files:**
- Modify: `src/cube/cornerDetection.test.ts` (legg til nytt `describe`-block)

**Interfaces:**
- Consumes: `detectGridQuad`, `isConfidentDetection`, `GridQuad`, `Point` fra Oppgave 1 (uendret signaturer).

- [ ] **Step 1: Skriv den feilende regresjonstesten for det vanskelige scenarioet**

Legg til i `src/cube/cornerDetection.test.ts` (etter det eksisterende innholdet, samme fil - gjenbruker `buildSyntheticGridImage`s hjelpefunksjoner):

```ts
/** Same line-drawing approach as buildSyntheticGridImage, but over a
 * wood-grain-like striped background instead of solid white, with an
 * optional dark shadow band drawn just past the quad's true bottom edge -
 * reproducing the exact failure class (off-center cube, textured
 * background, a shadow stronger than the real boundary) that defeated the
 * previous hand-rolled algorithm across four iteration rounds. */
function buildClutteredGridImage(
  width: number,
  height: number,
  quad: GridQuad,
  options: { shadow: boolean }
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const stripe = Math.sin(y * 0.4) * 15 + Math.sin((x + y) * 0.05) * 8;
      data[i] = 190 + stripe;
      data[i + 1] = 150 + stripe * 0.8;
      data[i + 2] = 110 + stripe * 0.6;
      data[i + 3] = 255;
    }
  }
  const setPixel = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const i = (py * width + px) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  };
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const drawLine = (a: Point, b: Point) => {
    for (let i = 0; i <= 200; i++) {
      const p = lerp(a, b, i / 200);
      setPixel(p.x, p.y);
    }
  };
  const [tl, tr, br, bl] = quad;
  drawLine(tl, tr);
  drawLine(tr, br);
  drawLine(br, bl);
  drawLine(bl, tl);
  const quadPoint = (u: number, v: number): Point => {
    const top = lerp(tl, tr, u);
    const bottom = lerp(bl, br, u);
    return lerp(top, bottom, v);
  };
  drawLine(quadPoint(1 / 3, 0), quadPoint(1 / 3, 1));
  drawLine(quadPoint(2 / 3, 0), quadPoint(2 / 3, 1));
  drawLine(quadPoint(0, 1 / 3), quadPoint(1, 1 / 3));
  drawLine(quadPoint(0, 2 / 3), quadPoint(1, 2 / 3));

  if (options.shadow) {
    const shadowY = Math.round((bl.y + br.y) / 2) + 20;
    for (let y = Math.max(0, shadowY - 10); y < Math.min(height, shadowY + 10); y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] *= 0.55;
        data[i + 1] *= 0.55;
        data[i + 2] *= 0.55;
      }
    }
  }
  return new ImageData(data, width, height);
}

describe('detectGridQuad - cube-tuned robustness (regression corpus)', () => {
  test('finds an off-center grid over a textured background with a shadow past its true edge', async () => {
    const width = 600;
    const height = 400;
    // Off-center: cube in the left half, open textured background to the
    // right - the exact framing that made the old algorithm latch onto
    // background clutter.
    const trueQuad: GridQuad = [
      { x: 40, y: 60 },
      { x: 260, y: 60 },
      { x: 260, y: 280 },
      { x: 40, y: 280 },
    ];
    const image = buildClutteredGridImage(width, height, trueQuad, { shadow: true });
    const result = await detectGridQuad(image);
    // Measured directly during planning: confidence 0.767, corner error
    // 1.4px on all four corners. 15px/0.6 leave real headroom.
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(result.quad[i].x - trueQuad[i].x)).toBeLessThan(15);
      expect(Math.abs(result.quad[i].y - trueQuad[i].y)).toBeLessThan(15);
    }
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(isConfidentDetection(result.confidence)).toBe(true);
  });

  test('does not confidently report a grid on cluttered background with no cube present', async () => {
    const width = 600;
    const height = 400;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const stripe = Math.sin(y * 0.4) * 15 + Math.sin((x + y) * 0.05) * 8;
        data[i] = 190 + stripe;
        data[i + 1] = 150 + stripe * 0.8;
        data[i + 2] = 110 + stripe * 0.6;
        data[i + 3] = 255;
      }
    }
    const shadowY = 260;
    for (let y = shadowY - 10; y < shadowY + 10; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] *= 0.55;
        data[i + 1] *= 0.55;
        data[i + 2] *= 0.55;
      }
    }
    const image = new ImageData(data, width, height);
    const result = await detectGridQuad(image);
    // Measured directly during planning: confidence 0.191 on this exact
    // scene (the shadow band itself gets picked up as a thin candidate
    // contour) - comfortably under CONFIDENCE_THRESHOLD (0.5) and nowhere
    // near the 0.33 ceiling a *valid* geometry could reach.
    expect(isConfidentDetection(result.confidence)).toBe(false);
  });
});
```

- [ ] **Step 2: Kjør testene og bekreft resultatet**

```bash
npx vitest run src/cube/cornerDetection.test.ts
```

Disse to testene er skrevet mot tall som allerede er **verifisert direkte** under planleggingen av dette dokumentet (samme scenario, samme bibliotek-versjon), så de forventes å bestå med det samme. Hvis en av dem likevel feiler: ikke juster toleransen blindt. Legg til `debug: true` i options-objektet sendt til `scanDocument` inni `detectGridQuad` midlertidig (eller kall `scanDocument` direkte fra testen med `{ ...CUBE_DETECTION_OPTIONS, debug: true }`), inspiser `result.debug.selectedCandidate` for å se nøyaktig hvilken kandidat som vant og hvorfor (dette feltet lister `score`, `confidence`, `isValid`, `rightAngleScore`, `aspectRatio` osv. for den valgte kandidaten - se kildekoden til `scanic`s `src/index.js` for feltnavnene), og juster enten scenariet eller `CUBE_DETECTION_OPTIONS` basert på hva du faktisk ser - samme fremgangsmåte som resten av denne kodebasen alltid har brukt for terskelverdier.

- [ ] **Step 3: Full verifisering**

```bash
npx vitest run
npx tsc -b
npx oxlint
```

- [ ] **Step 4: Commit**

```bash
git add src/cube/cornerDetection.test.ts
git commit -m "Add synthetic regression corpus for cube-tuned grid detection"
```

---

## Oppgave 3: Async-sikker `ScanWizard.tsx`, fjern nedskalering

**Files:**
- Modify: `src/components/ScanWizard.tsx:1-70` (deteksjons-effekten)

**Interfaces:**
- Consumes: `detectGridQuad(image: HTMLCanvasElement | HTMLImageElement | ImageData): Promise<DetectionResult>`, `isConfidentDetection(confidence: number): boolean` fra Oppgave 1.

- [ ] **Step 1: Les gjeldende effekt for å bekrefte nøyaktig kontekst**

```bash
sed -n '1,71p' src/components/ScanWizard.tsx
```

Bekreft at linjene 7-16 (`DETECTION_WORKING_SIZE`-kommentaren og konstanten) og 44-70 (`useEffect`) fortsatt matcher det denne oppgaven forventer å erstatte - hvis linjenumrene har flyttet seg pga. tidligere endringer i dette dokumentet, bruk innholdet (ikke linjenumrene) som fasit.

- [ ] **Step 2: Erstatt nedskalerings-konstanten og effekten**

Fjern helt (linje 7-16 i den opprinnelige filen):

```ts
/** Corner detection runs on a downscaled copy of the photo. The
 * algorithm's internal constants (line sample count, perpendicular
 * search offsets) are absolute pixel values that were tuned and verified
 * at roughly this scale, and running the gradient computation plus the
 * hill-climbing search on a full 12+ megapixel phone photo would also
 * stall the main thread for hundreds of milliseconds (much worse on
 * older phones) right after the camera returns. The detected quad is
 * scaled back up to full-resolution coordinates afterwards; colour
 * sampling still runs on the full-resolution canvas. */
const DETECTION_WORKING_SIZE = 600;
```

Erstatt hele `useEffect`-blokken (linje 44-70 i den opprinnelige filen: fra `useEffect(() => {` til dens avsluttende `}, [image]);`) med:

```ts
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);

    // scanic downscales internally and returns corners already in this
    // canvas's coordinate space - no manual downscale-and-scale-back needed.
    let ignore = false;
    detectGridQuad(canvas).then(({ quad, confidence }) => {
      if (ignore) return;
      setQuad(quad);
      setConfidence(confidence);
    });
    return () => {
      ignore = true;
    };
  }, [image]);
```

Importlinjen øverst i filen (`import { detectGridQuad, isConfidentDetection } from '../cube/cornerDetection';`) trenger ingen endring - Oppgave 1 beholdt begge eksportnavnene uendret.

- [ ] **Step 3: Verifiser typecheck og at build fungerer**

```bash
npx tsc -b
npm run dev
```

Åpne appen i nettleseren (bruk `run`-skillet om tilgjengelig, ellers naviger manuelt til dev-serverens URL), start en kube-skanning, ta/last opp et bilde, og bekreft visuelt at:
1. Det oppdagede rutenettet vises på bildet (samme UI som før).
2. "Fant ikke rutenettet automatisk"-hintet vises kun når konfidensen faktisk er lav.
3. Å ta et nytt bilde mens forrige fortsatt "tenker" ikke krasjer eller viser feil rutenett for feil bilde (vanskelig å teste manuelt med vilje siden deteksjonen er rask - denne rase-beskyttelsen er hovedsakelig en kodegjennomgangs-sjekk: bekreft at `ignore`-mønsteret i Step 2 faktisk er der).

- [ ] **Step 4: Commit**

```bash
git add src/components/ScanWizard.tsx
git commit -m "Make ScanWizard's grid detection async-safe, drop manual downscaling"
```

---

## Oppgave 4: Full verifisering, lokal sjekk mot ekte foto, push

**Files:** Ingen nye/endrede filer - kun verifisering.

- [ ] **Step 1: Full automatisert testsuite**

```bash
cd rubiks-kube-solver
npx vitest run
npx tsc -b
npx oxlint
```

Alle skal være grønne, ingen advarsler.

- [ ] **Step 2: Begge byggene, inkludert enkeltfil-artifaktet**

```bash
npm run build
npm run build:artifact
```

Begge skal fullføre uten feil. Sjekk størrelsen på artifakt-utdataen spesifikt (dette er selve grunnen `scanic` ble valgt over OpenCV.js):

```bash
ls -la dist/index.html
```

Forvent en økning på omtrent 40-110 KB rått (scanic sin egen bunt-størrelse) sammenlignet med før denne omskrivingen - ikke flere megabyte. Hvis filen er dramatisk større enn det: `scanic`s WASM ble sannsynligvis ikke base64-innebygd som forventet (sjekk om Vite-bygget genererte en separat `.wasm`-fil i `dist/assets/` - i så fall er noe galt, siden `vite-plugin-singlefile` ikke inline-legger den, og det bryter den selvstendige artifakt-filen).

- [ ] **Step 3: Lokal (ikke-committet) verifisering mot ekte foto**

Dette steget bruker de fem ekte kubefotoene fra den forrige økten
(personvern: ikke committ dem eller resultater fra dem noe sted i
git-historikken). Skriv et engangsskript (i en scratch-mappe, ikke i
repoet) som:

1. Leser hvert foto med korrekt EXIF-rotasjon anvendt.
2. Kaller den nye `detectGridQuad` (via `tsx`, importert direkte fra
   `src/cube/cornerDetection.ts`) på hvert bilde.
3. Sammenligner konfidens og en visuell overlegg av det gjenkjente
   rutenettet mot bildet, som gjort flere ganger tidligere i denne økten.

Rapporter ærlig til brukeren hvor mange av de fem bildene som nå gir en
trygg (`isConfidentDetection`) og visuelt korrekt deteksjon, sammenlignet
med den forrige (fire-runders-patchede) hånd-rullede algoritmen. Ikke
påstå en forbedring uten å ha kjørt denne sammenligningen og sett tallene
selv.

- [ ] **Step 4: Push**

```bash
git push -u origin claude/rubiks-kube-solver-mmt9s3
```

- [ ] **Step 5: Rapporter til bruker**

Oppsummer (norsk, som resten av denne økten): hva som ble byttet ut og
hvorfor, de faktiske testresultatene fra Step 3 (inkludert eventuelle
gjenværende svakheter - ikke skjul dem), og bekreft at ingen personlige
bilder ble committet.
