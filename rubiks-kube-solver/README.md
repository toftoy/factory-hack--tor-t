# Rubik's kube solver

En interaktiv 3D Rubik's kube i nettleseren, bygget med React, Three.js og
[react-three-fiber](https://github.com/pmndrs/react-three-fiber). Kuben kan
blandes med et klikk og løses automatisk med Herbert Kociembas
two-phase-algoritme, med animerte trekk i 3D.

## Funksjoner

- Full 3D-visualisering av en 3x3x3 Rubik's kube (drei/`OrbitControls` for å rotere kameraet)
- **Dra i en rute for å vri det laget selv** — fri dra-og-slipp som følger pekeren i
  sanntid og smetter til nærmeste lovlige kvart-/halvomdreining ved slipp, akkurat
  som en fysisk kube. Dra utenfor kuben for å rotere kameraet i stedet.
- **Bland**: genererer en tilfeldig, gyldig blanding (ingen påfølgende trekk på samme akse)
- **Løs**: løser gjeldende kubetilstand med [cubejs](https://github.com/ldez/cubejs)
  sin implementasjon av Kociembas two-phase-algoritme (typisk ≤ 22 trekk), kjørt i en
  Web Worker slik at UI-et aldri fryser
- Jevnt animerte lag-rotasjoner med justerbar hastighet
- Trekktelling og logg over siste blanding/løsning

## Kom i gang

```bash
npm install
npm run dev
```

Åpne deretter `http://localhost:5173`.

Andre kommandoer:

```bash
npm test              # kjører Vitest (kun ren logikk, se under)
npm run build          # typesjekk + produksjonsbygg til dist/
npm run build:artifact # typesjekk + produksjonsbygg til dist-artifact/index.html
                        # (alt inlinet i én selvstendig fil, ingen server nødvendig)
npm run preview        # server produksjonsbygget lokalt
```

## Arkitektur

- `src/cube/moveEngine.ts` – trekknotasjon (`U`, `R'`, `F2` osv.), rotasjonsakser og blandingsgenerator
- `src/cube/facelets.ts` – fargeskjema og den geometriske mappingen fra en 54-tegns
  facelet-streng (Kociemba-format) til kubie-posisjoner i 3D
- `src/cube/dragResolver.ts` – ren geometri/matematikk for dra-og-vri: hvilket
  trekk en gitt rute + draretning tilsvarer, og hvordan en sluppet dra-gest
  smetter til nærmeste lovlige omdreining. Enhetstestet (`src/cube/dragResolver.test.ts`).
- `src/hooks/useCubeDrag.ts` – den imperative pointer-håndteringen (raycasting,
  skjermprojeksjon av draretninger, kamera-vs-kube-avgjørelse) som bruker
  `dragResolver.ts` sin matematikk
- `src/cube/solverWorker.ts` / `useSolver.ts` – løseren kjører i en dedikert Web
  Worker; `cubejs` sin oppslagstabell-precalculation (noen sekunder) og selve
  løsingen skjer utenfor hovedtråden
- `src/hooks/useCubeController.ts` – logisk kubetilstand (en `cubejs`-instans),
  trekkkø og animasjonsfremdrift; `commitMove` deles mellom den automatiske
  animasjonskøen og manuell dra-og-slipp
- `src/components/` – `Scene` (Canvas/lys/kamera/OrbitControls), `RubiksCube`
  (animasjonsløkke via `useFrame` + pointer-håndtak på hver kubie), `Cubie`
  (enkelt kubie-mesh), `ControlPanel` (UI)

Kubens logiske tilstand holdes alltid som en 54-tegns facelet-streng. Under en
trekk-animasjon (automatisk eller manuell) rendres kun det aktive laget i en
roterende gruppe; når trekket er fullført committes den nye tilstanden og alle
26 kubiene tegnes på nytt ut fra den nye strengen. Dette holder rendring og
logikk fullstendig frikoblet fra historikk – det finnes ingen kubie-identitet
å spore på tvers av trekk.

## Merknad om avhengigheter

`cubejs@1.1.0` er patchet via [patch-package](https://github.com/ds300/patch-package)
(se `patches/`) for å fjerne en `this.Cube || require('./cube')`-fallback i
`lib/solve.js` som er ment for gammeldagse `<script>`-baserte nettlesermiljøer.
I en moderne ESM-bundler (Vite/esbuild) evalueres modulens topp-nivå `this` til
`undefined`, noe som får biblioteket til å kaste en feil ved import. Patchen
fjerner fallback-grenen og bruker kun `require('./cube')`, som er den eneste
koden-stien som noensinne faktisk kjørte i Node/bundler-kontekst uansett.
