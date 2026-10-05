# Automatisk gitterdeteksjon for kube-skanning — design

Status: satt i gang autonomt under en `/goal`-styrt økt, etter eksplisitt
brukervalg ("automatisk deteksjon, velger jeg. Verifiser autonomt med
forskjellige bilder av kuber med forskjellige farger og vinkler"). Samme
begrunnelse som forrige spec i denne økten: brukeren har bedt om at jeg
jobber videre selvstendig, så det vanlige godkjenningssteget her erstattes
av denne loggførte begrunnelsen.

## Bakgrunn / gap

Dagens skanne-flyt (`ScanWizard.tsx`, `ScanGridOverlay.tsx`,
`gridSampler.ts`): appen ber om ett bilde per side (via native
kamera-app, `<input type=file capture>`), tegner det på en canvas, og
viser et blått rutenett-overlegg brukeren selv må dra og skalere til å
dekke kubesiden i bildet, før 9 farger sampler fra rutenettets celler.
Rutenettet (`GridBounds = { x, y, size }`) er en **akseparallell firkant**
— det kan flyttes og skaleres, men ikke roteres eller skjevstilles.

Bruker-tilbakemelding: "Det var nesten umulig å se og justere på det blå
rutenettet" og et ønske om at appen selv finner rutene automatisk, med
eksplisitt krav om at det må tåle "litt variasjoner i farge" og fungere
"med forskjellige vinkler."

To reelle problemer i dagens løsning:
1. Ingen automatikk — brukeren gjør alt justeringsarbeidet manuelt, per
   bilde, seks ganger.
2. Selv om brukeren er nøye, kan ikke en akseparallell firkant
   representere en kubeside fotografert i vinkel riktig — et ekte foto av
   en flate sett skrått er en (perspektivisk skjevstilt) firkant, ikke et
   kvadrat. Dette er en strukturell begrensning i datamodellen, ikke bare
   en UX-mangel.

## Mål

Appen finner automatisk de fire hjørnene til kubesidens rutenett i det
nylig tatte bildet, umiddelbart etter at bildet lastes — brukeren trenger
i det vanlige tilfellet ikke røre noe før "Bekreft". Manuell korrigering
forblir tilgjengelig (dra i hjørnene) for de tilfellene deteksjonen
bommer, og brukes også som falltilbake når treffsikkerheten er lav.

## Ikke i omfang

- **Levende kamera i appen.** Dette dekker kun deteksjon på det allerede
  tatte (native-kamera) bildet — ikke å bytte ut `<input capture>` med et
  live `getUserMedia`-forhåndsvisningsvindu. Det er en egen, større
  endring (diskutert separat med bruker) og velges ikke her.
- **Ekte maskinlæring / trent modell.** Som avtalt: klassisk
  bildeanalyse (gradient/kant-energi), ikke et nevralt nett — kuben sitt
  rutenett er et strukturert, høykontrast mønster som ikke trenger
  trening for å gjenkjennes.
- **Vilkårlig kraftig perspektiv-/blur-toleranse.** Et bilde tatt nesten
  parallelt med siden, sterkt ute av fokus, eller i svært dårlig lys kan
  fortsatt kreve manuell korrigering — det er et bevisst akseptert
  scenario der falltilbaket (se under) dekker brukeren, ikke noe
  algoritmen garanterer å løse.

## Tilnærming

**Datamodell:** `GridBounds { x, y, size }` erstattes av en generell
firkant, fire uavhengige hjørner:

```ts
export interface Point { x: number; y: number }
export type GridQuad = [Point, Point, Point, Point]; // [TL, TR, BR, BL]
```

Celle-sampling (`computeSamplePoints`/`sampleGridColors` i
`gridSampler.ts`) bruker bilineær interpolasjon i stedet for
akseparallell aritmetikk: for celle (rad r, kolonne c), normaliserte
koordinater `u=(c+0.5)/3, v=(r+0.5)/3`, og punktet er
`lerp(lerp(TL,TR,u), lerp(BL,BR,u), v)`. Dette håndterer skjevstilte
firkanter korrekt — akseparallelle firkanter er bare specialtilfellet der
alle fire hjørner danner et rektangel.

**Deteksjon (ny modul `cornerDetection.ts`):**

1. *Gradientfelt*: konverter bildet til luminans, regn ut et enkelt
   Sobel-lignende gradient-magnitude-felt (kant-styrke per piksel). Rene
   funksjoner over `{ width, height, data: Uint8ClampedArray }` (samme
   struktur som `ImageData`, men ikke avhengig av DOM-typen — så det kan
   enhetstestes i Node uten nettleser-/jsdom-avhengighet).
2. *Score for en kandidat-firkant*: en kubeside har et sterkt,
   forutsigbart mønster — to indre vertikale og to indre horisontale
   sorte linjer, pluss ytterkanten. Scoren er gjennomsnittlig
   gradient-styrke langs disse linjene (linjene regnes ut fra
   kandidat-firkantens hjørner via samme bilineære interpolasjon som
   over, samplet i N jevnt fordelte punkter per linje).
3. *Søk*: koordinat-nedstigning ("hill climbing") — start fra 2-3
   forskjellige innledende gjetninger (sentrerte kvadrater i ulik
   størrelse, samme konvensjon som dagens `size = min(bredde,høyde)*0.7`
   -defaultverdi), flytt ett hjørne-koordinat om gangen med avtagende
   steglengde over flere runder, behold alltid beste funnet firkant.
   Deterministisk og rent funksjonelt — enhetstestbart med syntetiske
   gradientfelt der fasit er kjent på forhånd.
4. *Konfidens og falltilbake*: den beste scoren normaliseres til en
   konfidens; under en empirisk fastsatt terskel (målt under
   implementeringens verifiseringssteg mot syntetiske testbilder, ikke
   gjettet på her) brukes i stedet dagens sentrerte kvadrat som
   utgangspunkt — brukeren ser da nøyaktig samme opplevelse som i dag,
   pluss den forbedrede overlay-UI-en (se under).

**Overlay (redesign av `ScanGridOverlay.tsx`):** fire tydelige,
høykontrast hjørnehåndtak (større enn dagens ene hjørne-håndtak, adressér
"vanskelig å se"-tilbakemeldingen samtidig), hver uavhengig drabar for å
rette opp perspektiv. Hele firkanten kan fortsatt dras som helhet for grov
flytting (samme "dra for å flytte"-bekvemmelighet som i dag). De to indre
rutenett-linjene tegnes med bilineær interpolasjon slik at de følger
korrekt skjevstilling.

**Robusthet mot fargevariasjon:** deteksjonen bruker kun gradient/kontrast
(luminans), ikke absolutt fargeverdi — den er i praksis fargeuavhengig
(virker likt for en rød og en blå kube). Selve fargeklassifiseringen
(`colorClassifier.ts`) er allerede tolerant for hue-variasjon (nærmeste
referansefarge, ikke eksakt match) og røres ikke av denne endringen.

## Arkitektur / filer

- **`src/cube/cornerDetection.ts`** (ny) — `Point`, `GridQuad`,
  `computeGradientField`, `scoreQuad`, `searchGridQuad`, og
  `detectGridQuad` (orkestrerer: gradientfelt → multi-start søk →
  konfidens-sjekk → resultat). Ren logikk, ingen DOM-avhengighet utover
  strukturell typing mot `ImageData`s form.
- **`src/cube/gridSampler.ts`** (endres) — `GridBounds` → `GridQuad`;
  `computeSamplePoints`/`sampleGridColors` bruker bilineær interpolasjon.
- **`src/components/ScanGridOverlay.tsx`** (skrives om) — firkant med 4
  uavhengige hjørnehåndtak i stedet for akseparallell
  flytt-og-skalér-boks.
- **`src/components/ScanWizard.tsx`** (endres) — når et bilde lastes:
  hent `ImageData` fra canvasen, kjør `detectGridQuad`, bruk resultatet
  (eller falltilbaket) som start-`GridQuad` i stedet for dagens
  hardkodede sentrerte kvadrat.
- **`src/hooks/useCubeScan.ts`** (endres) — `confirmStep`/`confirmD`
  bytter parametertype fra `GridBounds` til `GridQuad`; logikken ellers
  uendret.

Ingen endring i `colorClassifier.ts`, `scanAssembly.ts`,
`scanValidation.ts`, `scanInference.ts` eller den overordnede
5-bilder-+-eventuelt-D-flyten i `useCubeScan.ts` — kun hvordan
rutenett-firkanten fastsettes og representeres.

## Testing

- **`cornerDetection.ts`**: rene enhetstester med syntetiske
  gradientfelt der riktig firkant er kjent nøyaktig på forhånd (bygg et
  gradientfelt med kunstig høy verdi langs bestemte linjer, verifiser at
  søket konvergerer til akkurat de linjene, også fra en bevisst dårlig
  start-firkant). Egne tester for skjevstilte (ikke-akseparallelle)
  fasit-firkanter, for å bevise at algoritmen faktisk håndterer
  perspektiv og ikke bare det akseparallelle specialtilfellet.
- **`gridSampler.ts`**: eksisterende `computeSamplePoints`-tester
  oppdateres til `GridQuad`-input; ny test for et bevisst skjevstilt
  (ikke-rektangulært) firkant-tilfelle, som viser at bilineær
  interpolasjon gir riktige cellesentre der gammel akseparallell
  aritmetikk ville bommet.
- **Syntetiske "bilder", forskjellige farger og vinkler** (siden
  brukeren ba om nettopp dette, og ekte kubefoto ikke er tilgjengelig i
  denne økten): en Playwright-drevet generator tegner en 3×3
  rutenett-side på en `<canvas>` med varierte stickerfarger (alle seks
  kubefargene representert på tvers av testmatrisen), roterer/skjevstiller
  firkanten for å simulere ulike kamera-vinkler, og varierer lysstyrke
  for å simulere fargevariasjon. Kjøres gjennom den faktiske
  `detectGridQuad`-koden (samme kodesti som appen bruker), og
  sammenlignes mot de kjente, prosedyre-genererte fasit-hjørnene innenfor
  en pikseltoleranse. Rapporteres ærlig som **syntetisk, prosedyre-generert
  testdekning** — ikke ekte kubefotografier — i implementeringens
  sluttrapport.
