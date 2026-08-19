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
- **Skann en ekte kube**: fotografer en fysisk, blandet kube (5 bilder,
  kuben løftes aldri) og få tilstanden lastet inn direkte — se
  `docs/superpowers/specs/2026-08-17-camera-scanning-design.md` for
  hvordan bunnen og toppens retning regnes ut fra bare 5 bilder.
- **Tren på algoritmer**: øv på navngitte kube-algoritmer (nybegynnermetode
  eller 2-look OLL/PLL) direkte på 3D-kuben — appen setter opp et kjent
  case, du løser det selv ved å dra i lag, og appen tar tid og styrer
  fremgang med et 3-på-rad-krav for å låse opp neste algoritme. Et eget
  notasjons-spor ("Tren: Notasjon") lærer bort hva bokstaver og symboler
  betyr — ti case som dekker alle seks sidene og alle modifikatorene
  (f.eks. U, U', U2) — og må fullføres én gang før nybegynner- eller
  2-look-sporet blir tilgjengelig. Det forblir tilgjengelig for gjenbesøk
  etterpå, med en egen nullstill-knapp for å starte et spor helt på nytt.
- **Lær å løse kuben** ("🧩 Lær å løse kuben"): den nye primærknappen og
  appens standard inngangspunkt — en styrt reise gjennom hele
  nybegynnermetoden i 7 steg (kors, hjørner, mellomlag, gult kors, vend
  hjørner, plasser hjørner, plasser kanter), bygget oppå samme
  case-for-case-motor som algoritmetreningen over, men med ett-gangs
  fremgang per case i stedet for et 3-på-rad-krav. Krever, akkurat som de
  andre sporene, at notasjonssporet er fullført først — trykker du på
  knappen før det er gjort, starter den notasjonsleksjonen i stedet. Når
  alle 7 stegene er unnagjort vises en egen feiringsskjerm ("Du løste
  kuben fra bunnen av!"). Bland/løs/skann og de navngitte
  algoritme-treningssporene er fortsatt tilgjengelige, nå samlet bak en
  "▸ Verktøy for viderekomne"-seksjon i panelet for de som allerede
  kjenner metoden.

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
- `src/cube/colorClassifier.ts`, `gridSampler.ts`, `scanInference.ts`,
  `scanAssembly.ts`, `scanValidation.ts` – ren logikk for å skanne en ekte
  kube fra 5 (eller unntaksvis 6) bilder: fargeklassifisering av rutene,
  utledning av bunnens/toppens retning, sammenstilling til en full
  facelet-streng og gyldighetssjekk (paritet). `src/hooks/useCubeScan.ts` er
  tilstandsmaskinen for skanne-veiviseren; `src/components/ScanWizard.tsx`,
  `ScanGridOverlay.tsx` og `ScanReview.tsx` er UI-et for fotografering,
  det justerbare rutenett-overlayet og manuell retting før tilstanden tas i bruk
- `src/cube/algorithms.ts`, `trainingProgress.ts` – algoritme-data
  (nybegynner + 2-look OLL/PLL, selv-verifisert til å rundtrippe til løst
  tilstand) og ren fremgangslogikk (streak, mestring, lagret peker) for
  algoritmetrening. `src/hooks/useAlgorithmTraining.ts` er
  tilstandsmaskinen; `src/components/TrainingWizard.tsx` er HUD-en som
  ligger over den eksisterende 3D-visningen uten å blokkere den.
- `src/cube/guidedJourney.ts`, `src/hooks/useGuidedJourney.ts`,
  `src/components/GuidedJourney.tsx` – den styrte løse-reisen: 7 steg satt
  sammen av egne kors-/hjørne-case (`CROSS_ALGORITHMS`/`CORNER_ALGORITHMS`)
  pluss et utvalg fra `algorithms.ts` sine eksisterende nybegynner-case.
  `useGuidedJourney` speiler `useAlgorithmTraining.ts` sitt
  ready/timing/solved/demonstrating-tilstandsmønster (samme
  `SOLVED_PAUSE_MS`-pause før neste case settes opp), men med ett-gangs
  fremgang lagret under en egen `localStorage`-nøkkel i stedet for
  streak-basert mestring per spor. `GuidedJourney.tsx` er HUD-en, inkludert
  den avsluttende feiringsskjermen. Se
  `docs/superpowers/specs/2026-08-19-guided-solve-journey-design.md` for
  fullt design.

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
