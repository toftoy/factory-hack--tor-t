# Kubesidededeteksjon — omskriving til `scanic` — design

## Bakgrunn

`src/cube/cornerDetection.ts` (spesifisert i
`2026-08-20-auto-grid-detection-design.md`) implementerer gitterdeteksjon
som en egenutviklet algoritme: gradient-magnitude-felt + koordinat-nedstigning
("hill climbing") fra flere start-gjetninger, med en score basert på
gjennomsnittlig kant-styrke langs 8 antatte linjer.

Denne tilnærmingen ble testet grundig mot fem ekte, vanskelige
telefonfoto (nærbilder, kube ikke midtstilt, tre-bord-tekstur, skygge
under kuben) og gjennomgikk fire iterasjonsrunder med rettelser
(minimumsareal, konveksitet, bredere multi-start, sideforhold-grense,
fargesignal for å skille kube-plast fra bakgrunn). Hver rettelse fjernet
én konkret svikt, men avslørte en ny — og på det vanskeligste bildet
klarte algoritmen aldri å finne riktig rutenett. Konklusjonen etter fire
runder: den strukturelle tilnærmingen (kontinuerlig 8-dimensjonalt søk
scoret på summert gradient-energi) har ingen forankring i at scoren
faktisk representerer *én sammenhengende avgrenset form* — en skygge, en
bordkant og ekte rutenettlinjer konkurrerer på likt grunnlag, og
"konfidens" er ikke kalibrert (kan være høy for et helt feil resultat).

Brukeren ba eksplisitt om en større omskriving, med forskningsbasert
tilnærming og bruk av kraftigere modell ved behov for selve
undersøkelsen. Et forskningsoppdrag (Opus-modell, 73 verktøykall, egne
kjøringer av kandidatbibliotek) sammenlignet:

- **OpenCV.js** (klassisk kontur-pipeline, industristandard): 3,5–3,8 MB
  gzippet for enkeltfil-bygg, ~1,85 MB for delt bygg, ~1,5 MB gulv selv
  for et skreddersydd, strippet Emscripten-bygg som må vedlikeholdes
  selv. Diskvalifiserende for artifakt-bygget spesifikt: `vite-plugin-singlefile`
  inline-legger kun JS/CSS (ikke separate WASM-filer), og
  enkeltfil-OpenCV-bygget alene (10,9–13,3 MB) spiser nesten hele
  artifakt-sidens 16 MB-tak.
- **jscanify**: samme størrelseskostnad (bunter inn OpenCV.js), men en
  svakere pipeline enn det vi allerede hadde — ingen `approxPolyDP`, ingen
  konveksitets- eller vinkelsjekk, velger blindt største kontur. Verifisert
  direkte (lastet ned og lest kildekoden): ville sannsynligvis gjort det
  verre, ikke bedre.
- **`image-js` + selvbygd polygon-scoring**: en reell, avhengighetsfri
  vei (~115 KB gzippet for hele biblioteket), men krever at vi selv
  utleder hele terskeltabellen (rett-vinkel-score, sideforhold,
  konturform-forhold) — nøyaktig den øvelsen som ikke konvergerte i forrige
  runde, bare med flere bevegelige deler.
- **`scanic`**: implementerer den samme kontur-basert-pipelinen som
  OpenCV.js (Suzuki–Abe konturspora, Ramer–Douglas–Peucker
  polygonforenkling, geometrisk validering), men på ~43 KB gzippet, med
  WASM-modulen base64-innebygd i selve JS-filen (ingen separate
  nettverkskall — fungerer derfor problemfritt i enkeltfil-artifaktet).
  Verifisert selv (lastet ned pakken, lest kildekoden direkte): den
  faktiske import-grafen fra `dist/scanic.js` er selvstendig og fri for
  de øvrige filene som ligger i npm-pakken (se "Merknad om pakkehygiene"
  under). API-et (`scanDocument`, `CornerPoints`, `[0,1]`-konfidens) passer
  nesten 1:1 med vårt eksisterende `GridQuad`/`DetectionResult`-grensesnitt.
- **ML-modell (DocCornerNet via `scanic-ml`)**: reell mulighet
  (~2,2 MB gzippet, ~13 ms inferens), men trent på dokumenter, ikke
  kuber — uprøvd for dette formålet, og for stor for artifakt-bygget.
  Bevisst utelatt fra dette omfanget (se "Ikke i omfang").

**Beslutning: erstatt den egenutviklede algoritmen med `scanic`s
klassiske (ikke-ML) detektor**, kube-tilpasset via bibliotekets egne
terskel-parametre.

### Merknad om pakkehygiene

`npm pack scanic` henter en tarball som (utover de 5 filene
`package.json` sitt `files`-felt faktisk lister) også inneholder
`dist/opencv.js` (10,9 MB) og `dist/image-js.esm.min.js`, samt
`src/jscanify.js`/`src/jscanify-node.js` — tydelig rester fra
bibliotekets egen sammenligningsbenchmark mot andre biblioteker, lekket
inn i den publiserte pakken. Verifisert direkte at **ingen** av disse
refereres fra den faktiske import-inngangen (`dist/scanic.js`, 106 KB
rått) — `grep` for "opencv", "image-js" og "jscanify" i den filen gir
null treff. Vite/Rollup bunter kun det som faktisk importeres fra
inngangspunktet, så dette blir liggende ubrukt i `node_modules` (litt
bortkastet diskplass ved installasjon) uten å påvirke vårt bygg. Nevnes
her fordi det er et reelt, om enn ufarlig, tegn på at dette er et lite
(59 stjerner, én hovedbidragsyter) bibliotek — vurdert og akseptert som
risiko av bruker.

## Mål

Bytt ut hele deteksjonskjernen med `scanic`, slik at:

1. Gitterdeteksjon bygger på en velprøvd, strukturelt mer robust
   pipeline (kontursporing + polygonforenkling + geometrisk validering)
   i stedet for kontinuerlig gradient-søk.
2. Konfidens blir meningsfull og kalibrert — en firkant som ikke består
   bibliotekets egne gyldighetssjekker (konveksitet, areal, rett-vinkel,
   sideforhold-konsistens) rapporteres med lav/ingen konfidens, ikke en
   ukalibrert sum som tilfeldigvis kan bli høy for feil svar.
3. Enkeltfil-artifakt-bygget fortsetter å fungere uendret (ingen
   nettverksavhengighet ved kjøretid, ingen ekstern WASM-fil som ikke
   inline-legges).
4. Det offentlige grensesnittet (`GridQuad`, `Point`,
   `detectGridQuad`/`DetectionResult`) endres minimalt — kun det som er
   strengt nødvendig (se under).

## Ikke i omfang

- **ML-detektoren** (`scanic-ml`/DocCornerNet). Trent på dokumenter, ikke
  kuber; upassende for enkeltfil-artifaktet (nettverksavhengig by
  default, ~2,2 MB om selv-hostet). Kan vurderes som eget, separat
  eksperiment senere i den vanlige (ikke-artifakt) nettutgaven, hvis den
  klassiske detektoren fortsatt ikke er god nok etter denne omskrivingen.
- **Endring av selve opptaks-flyten** (rekkefølge, instruksjonstekst,
  antall bilder). Uendret — kun *hvordan* rutenettet i det tatte bildet
  gjenkjennes.
- **`ScanGridOverlay.tsx`s manuelle korreksjons-UI.** Fungerer allerede
  bra og røres ikke.
- **Committing av brukerens ekte testbilder til repoet.** Bevisst valg
  (se "Testing") — syntetiske fixturer i stedet, av personvernhensyn.

## Tilnærming

### Grensesnitt

`cornerDetection.ts` beholder:

```ts
export interface Point { x: number; y: number }
export type GridQuad = [Point, Point, Point, Point]; // [TL, TR, BR, BL]
export interface DetectionResult { quad: GridQuad; confidence: number }
export function isConfidentDetection(confidence: number): boolean
```

Eneste grensesnittendring: **`detectGridQuad` blir asynkron**
(`Promise<DetectionResult>`) — `scanic`s `scanDocument` returnerer et
Promise. `confidence` er fortsatt et tall, men skalaen endres fra
ukalibrert gradient-sum (tidligere terskel: 20) til `scanic`s eget
`[0, 1]`-konfidensmål (ny terskel: se "Kube-tilpassede terskler").

### Implementasjon

`detectGridQuad(image)`:

1. Kall `scanDocument(image, { mode: 'detect', detector: 'classical', ...CUBE_OPTIONS })`.
2. Ved `result.success && result.corners`: map `CornerPoints`
   (`topLeft/topRight/bottomRight/bottomLeft`) til `GridQuad`
   (`[TL, TR, BR, BL]` — samme rekkefølge, bare annen navngiving) og
   returner `{ quad, confidence: result.confidence ?? 0 }`.
3. Ved `!result.success`, manglende hjørner, eller en kastet feil
   (f.eks. WASM feiler å initialisere): fall tilbake til dagens
   sentrerte-kvadrat-`defaultQuad` med `confidence: 0` — brukeren ser
   nøyaktig samme opplevelse som "lav konfidens" gir i dag (hint om å dra
   i hjørnene).

Hele den gamle interne implementasjonen
(`computeGradientField`, `scoreQuad`, `searchGridQuad`, `isConvex`,
`quadArea`, `hasReasonableSideRatio`, fargesignalet,
`bilinearSample*`) slettes — den blir dekket av `scanic` internt.

### Kube-tilpassede terskler

En kubeside er nær-kvadratisk (i motsetning til et dokument, som kan
være avlangt), og bakgrunnen rundt (bord, skygge) skal aktivt avvises,
ikke bare tolereres. Utgangspunkt (verifisert i forskningen — treff
overlever innstramming, et kube-fritt rotete bakgrunnsbilde blir
avvist):

```ts
const CUBE_OPTIONS = {
  maxDocumentAspectRatio: 1.7,
  minRightAngleScore: 0.6,
  minOppositeSideConsistency: 0.6,
  minDocumentCoverageRatio: 0.06,
  minContourFitRatio: 0.8,
  maxContourFitRatio: 1.15,
};
```

Disse tallene er utgangspunkt, ikke fasit — de kalibreres videre mot de
syntetiske regresjonsbildene og (lokalt, ikke committet) mot brukerens
ekte foto under implementeringen, med målte tall dokumentert i kildekode-
kommentarer (samme disiplin som resten av kodebasen: ingen tall uten
måling bak).

`isConfidentDetection`s terskel flyttes fra `20` til en verdi i
`[0, 1]`-skalaen (utgangspunkt `0.5`, kalibreres empirisk på samme måte).

### Bort med manuell nedskalering

`ScanWizard.tsx`s `DETECTION_WORKING_SIZE`/nedskalering-og-skaler-tilbake-
kode fjernes. `scanic` nedskalerer selv internt (`maxProcessingDimension`,
standardverdi 800) og returnerer hjørner i bildets *originale*
koordinatsystem direkte. Vi starter med standardverdien 800 og justerer
den kun hvis den syntetiske regresjonskorpusen eller den lokale
verifiseringen mot ekte foto viser at mer piksel-detalj gir bedre
treffsikkerhet nok til å veie opp for den ekstra prosesseringstiden det
koster — en målt avveining, ikke en antatt en. Vi sender hele det opprinnelige,
fulloppløselige canvaset (`canvasRef.current`) rett til `scanDocument` —
ingen mellomliggende `workCanvas`, ingen skala-tilbake-regning. Dette
fjerner en hel klasse tidligere skaleringsfeil, ikke bare kompleksitet.

### Asynkron effekt i `ScanWizard.tsx`

Deteksjons-`useEffect`en (kjører når et nytt bilde lastes) blir en
async-sikker effekt: en lokal `ignore`-flagg-variabel settes `true` i
opprydningsfunksjonen, og resultatet fra `scanDocument` brukes kun
(`setQuad`/`setConfidence`) hvis `ignore` fortsatt er `false` når
Promiset løses — standardmønsteret for å unngå at et sent svar for et
forlatt bilde overskriver state for et nyere bilde (f.eks. bruker tar
nytt bilde mens forrige deteksjon fortsatt kjører).

## Arkitektur / filer

- **`package.json`** — legg til `scanic` som avhengighet.
- **`src/cube/cornerDetection.ts`** — erstattes med en tynn adapter
  (som over). Fra ~260 linjer egenutviklet algoritme til en håndfull
  linjer kall + mapping + kube-tilpassede konstanter.
- **`src/cube/cornerDetection.test.ts`** — skrives om fra bunnen: ingen
  syntetisk-gradientfelt-tester (den underliggende algoritmen er ikke
  lenger vår kode å teste på det nivået). I stedet: adapter-tester
  (mapping, fallback ved `success: false`, fallback ved kastet feil) og
  den nye syntetiske regresjonskorpusen (se "Testing"), alle kjørt mot
  den ekte `scanic`-pakken (ingen mocking av selve deteksjonen).
- **`src/components/ScanWizard.tsx`** — deteksjons-effekten blir
  async-sikker (som over); nedskalerings-koden fjernes.
- **Ingen endring**: `src/cube/gridSampler.ts`, `ScanGridOverlay.tsx`,
  `useCubeScan.ts`, `scanAssembly.ts`, `scanValidation.ts`,
  `scanInference.ts`, `colorClassifier.ts` — disse konsumerer kun
  `GridQuad`/`Point`, som er uendret.

## Testing

**Personvern først:** brukerens fem testbilder viser barnet hans i
bakgrunnen. De committes **ikke** til repoet (som er koblet til GitHub).
I stedet:

- **Syntetisk regresjonskorpus** (ny, i `cornerDetection.test.ts` eller
  en egen fixture-fil): prosedyre-genererte bilder som etterligner de
  konkrete svikt-mønstrene fra forrige rundes ekte foto — kube forskjøvet
  fra sentrum, en trebord-tekstur (lav-frekvent stripemønster) rundt
  kuben, og en skygge-liknende kant like utenfor kubens sanne grense.
  Kjøres gjennom den ekte `scanic`-pakken (ikke mocket), sammenlignet mot
  kjente fasit-hjørner innenfor en dokumentert pikseltoleranse. Dette er
  nettopp den regresjons-artefakten forrige runde manglet.
- **Lokal, ikke-committet verifisering**: jeg kjører den nye
  implementasjonen mot brukerens fem ekte bilder (samme skript-tilnærming
  som i forrige økt) før jeg rapporterer ferdig — men verken bildene selv
  eller resultatene fra dem havner i git-historikken.
- **Eksisterende testdekning** for `gridSampler.ts`, `scanAssembly.ts`
  osv. er upåvirket og skal fortsatt bestå uendret (de tester ikke
  `cornerDetection.ts`s interne algoritme, kun `GridQuad`-forbruket).
- Full `npm test` / `tsc -b` / `oxlint` / `npm run build` (inkl.
  artifakt-bygget spesifikt, siden det er selve grunnen til at OpenCV.js
  ble avvist) skal være grønt før dette regnes som ferdig.
