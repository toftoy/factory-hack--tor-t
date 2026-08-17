# Rubik's kube solver

En interaktiv 3D Rubik's kube i nettleseren, bygget med React, Three.js og
[react-three-fiber](https://github.com/pmndrs/react-three-fiber). Kuben kan
blandes med et klikk og løses automatisk med Herbert Kociembas
two-phase-algoritme, med animerte trekk i 3D.

## Funksjoner

- Full 3D-visualisering av en 3x3x3 Rubik's kube (drei/`OrbitControls` for å rotere kameraet)
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
npm run build    # typesjekk + produksjonsbygg til dist/
npm run preview  # server produksjonsbygget lokalt
```

## Arkitektur

- `src/cube/moveEngine.ts` – trekknotasjon (`U`, `R'`, `F2` osv.), rotasjonsakser og blandingsgenerator
- `src/cube/facelets.ts` – fargeskjema og den geometriske mappingen fra en 54-tegns
  facelet-streng (Kociemba-format) til kubie-posisjoner i 3D
- `src/cube/solverWorker.ts` / `useSolver.ts` – løseren kjører i en dedikert Web
  Worker; `cubejs` sin oppslagstabell-precalculation (noen sekunder) og selve
  løsingen skjer utenfor hovedtråden
- `src/hooks/useCubeController.ts` – logisk kubetilstand (en `cubejs`-instans),
  trekkkø og animasjonsfremdrift
- `src/components/` – `Scene` (Canvas/lys/kamera), `RubiksCube` (animasjonsløkke via
  `useFrame`), `Cubie` (enkelt kubie-mesh), `ControlPanel` (UI)

Kubens logiske tilstand holdes alltid som en 54-tegns facelet-streng. Under en
trekk-animasjon rendres kun det aktive laget i en roterende gruppe; når trekket
er fullført committes den nye tilstanden og alle 26 kubiene tegnes på nytt ut fra
den nye strengen. Dette holder rendring og logikk fullstendig frikoblet fra
historikk – det finnes ingen kubie-identitet å spore på tvers av trekk.

## Merknad om avhengigheter

`cubejs@1.1.0` er patchet via [patch-package](https://github.com/ds300/patch-package)
(se `patches/`) for å fjerne en `this.Cube || require('./cube')`-fallback i
`lib/solve.js` som er ment for gammeldagse `<script>`-baserte nettlesermiljøer.
I en moderne ESM-bundler (Vite/esbuild) evalueres modulens topp-nivå `this` til
`undefined`, noe som får biblioteket til å kaste en feil ved import. Patchen
fjerner fallback-grenen og bruker kun `require('./cube')`, som er den eneste
koden-stien som noensinne faktisk kjørte i Node/bundler-kontekst uansett.
