# Algoritmetrening — design

Status: godkjent av bruker, klar for implementeringsplan.

## Mål

La brukeren trene på å utføre navngitte kube-algoritmer på den ekte 3D-kuben
i appen: appen setter opp et kjent case, brukeren utfører algoritmen selv
ved å dra i lag (samme interaksjon som ellers i appen), og appen avgjør om
den ble løst riktig, tar tid, og styrer en enkel progresjon gjennom et sett
med algoritmer.

## Omfang

Dette er delprosjekt 3 av 3 (se tidligere samtale: kamera-skanning →
løsningsmetode → treningsmodus). **Denne spesifikasjonen dekker kun
treningsmodus.** Den er ikke koblet til løsningsmetode-valget (delprosjekt
2, ikke bygget ennå) på noen måte — treningsmodus bruker sitt eget faste
algoritme-datasett, uavhengig av hvordan `Løs`-knappen løser kuben.

To algoritme-sett (kalt "spor"):

- **Nybegynner** — det lille settet med navngitte algoritmer som faktisk
  trengs i en vanlig nybegynnermetode (ikke de intuitive stegene som kors
  og hjørner i første lag — de er ikke algoritme-baserte og hører ikke
  hjemme i et treningsverktøy).
- **2-look OLL/PLL** — et mellomsteg mot hurtigløsning: siste lag løses i
  nøyaktig to algoritme-oppslag (~10 OLL-mønstre + 6 PLL-algoritmer).

Ikke i omfang for v1:
- Kobling mot løsningsmetode-valget eller mot kamera-skanning.
- Full CFOP (57 OLL + 21 PLL) — for stort omfang for en første versjon.
- "Spaced repetition" (automatisk hyppigere gjentagelse av svake
  algoritmer) eller detaljert statistikk-dashbord — kun det som trengs for
  fremdrift + tid, se under.
- Flerbruker/skyloagring — alt lagres lokalt i nettleseren
  (`localStorage`), akkurat som resten av appen ikke har noen backend.

## Algoritme-data

Hvert case er en fast, deterministisk oppskrift — **ikke** en tilfeldig
blanding appen må gjenkjenne:

```ts
interface AlgorithmCase {
  id: string;
  track: 'beginner' | 'oll-pll-2look';
  name: string;              // f.eks. "Sune", "H-perm"
  setupMoves: string;        // anvendes på en løst kube for å produsere caset
  solutionMoves: string;     // den korrekte algoritmen (inverse av setupMoves,
                              // men skrevet ut eksplisitt og lesbart for hint-visning)
  description: string;       // kort forklaring av når casen oppstår
}
```

`setupMoves` og `solutionMoves` er alltid inverse av hverandre (anvend
`setupMoves` på en løst kube, så anvend `solutionMoves`, og du er tilbake
på løst tilstand) — dette er selve grunnlaget for korrekthets-sjekken
under, og verifiseres automatisk i test (se Testing).

De to sporenes eksakte algoritme-lister (navn, notasjon) skrives ut og
verifiseres nøye mot etablerte kuber-referanser under implementeringen —
ikke gjettet på her i spesifikasjonen. Rekkefølgen internt i hvert spor
går fra enklest/mest grunnleggende til vanskeligst, siden progresjonen
(se under) låser dem opp i denne rekkefølgen.

## Treningsflyt

1. Brukeren trykker "Tren" (ny knapp i kontrollpanelet, ved siden av
   Bland/Løs/Nullstill/Skann), velger spor (Nybegynner eller 2-look
   OLL/PLL).
2. Appen henter **gjeldende case** for sporet: en lagret peker (indeks i
   caselisten), ikke noe som regnes ut på nytt hver gang — se Fremgang
   under for hvorfor dette skillet er viktig.
3. Kuben nullstilles til løst tilstand, deretter anvendes casets
   `setupMoves` (animert, som ved Bland).
4. Casets navn og en hint-visning av `solutionMoves`-notasjonen vises.
   Tidtaker er **ikke** i gang ennå.
5. Idet brukeren gjør sitt første drag i et lag, starter tidtakeren.
6. Etter hvert fullførte trekk sammenlignes kubens tilstand med løst
   tilstand (`SOLVED_STATE`) — siden `setupMoves`+`solutionMoves` alltid
   fører tilbake dit ved korrekt utførelse, er dette en eksakt sjekk, ikke
   en tilnærming.
7. Ved treff: tidtakeren stopper, forsøket registreres (tid, riktig),
   streak for dette caset økes med 1.
8. Ved streak = 3 for gjeldende case: caset merkes mestret, neste case i
   sporet blir gjeldende, og steg 3 gjentas automatisk for det.
9. Var det siste caset i sporet: sporet vises som fullført.

**"Vis løsning"**-knapp tilgjengelig når som helst under et forsøk:
animerer `solutionMoves` (som en løsning), nullstiller streak for caset
til 0 (telles ikke som riktig), og går videre til neste forsøk på samme
case.

**"Hopp over"**-knapp: hopper til neste case i sporet uten å kreve
mestring av gjeldende — for brukere som ikke bryr seg om streng rekkefølge.
Påvirker ikke streak-tellingen for det hoppede caset (den forblir der den
var).

## Fremgang og persistens

Per case lagres i `localStorage`: gjeldende streak, antall forsøk, antall
riktige, personlig rekord (raskeste riktige tid), og om caset er mestret.
Per spor lagres **gjeldende case som en egen, lagret peker** (indeks i
sporets liste) — *ikke* utledet som "det første umestrede caset" ved hver
visning. Pekeren flyttes fremover av nøyaktig to hendelser: mestring
(streak = 3) eller "Hopp over". Den flyttes aldri bakover automatisk.

Dette skillet løser en ellers reell selvmotsigelse: hvis "gjeldende case"
var utledet på nytt som "første umestrede case" hver gang, ville "Hopp
over" vært virkningsløst — appen ville bare hoppet rett tilbake til det
samme (fortsatt umestrede) caset i det øyeblikket. Med en egen lagret
peker beholder "Hopp over" sin hensikt: gjeldende case flyttes fremover,
og det hoppede caset blir liggende umestret til brukeren eventuelt går
tilbake og øver på det spesifikt (fri navigering i caselisten er en
naturlig, billig UI-tilleggsfunksjon, ikke noe som påvirker denne
kjernelogikken).

## Arkitektur

- **`src/cube/algorithms.ts`** — statisk data: de to sporenes
  `AlgorithmCase[]`-lister. Ren data, ingen logikk.
- **`src/hooks/useAlgorithmTraining.ts`** — tilstandsmaskin for
  treningsflyten (samme mønster som `useCubeScan.ts`): sporvalg, gjeldende
  case, streak/forsøk/PB per case (lest/skrevet til `localStorage`),
  tidtaker-tilstand, og selve syklusen beskrevet over. Gjenbruker
  `useCubeController`s `reset`/`enqueue` for å sette opp et case, og
  samme "sammenlign mot `SOLVED_STATE`"-mønster appen allerede bruker
  andre steder for "Løst"-merket.
- **`src/components/TrainingWizard.tsx`** — fullskjerm-overlegg (samme
  mønster som `ScanWizard.tsx`): sporvelger, gjenbruker den eksisterende
  `<Scene>`-komponenten uendret for selve 3D-kuben og dra-i-lag-
  interaksjonen (ingen ny 3D- eller interaksjonskode trengs), viser
  casenavn, hint-notasjon, tidtaker, streak, "Vis løsning" og "Hopp over".
- **`ControlPanel.tsx`** — ny "Tren"-knapp, samme mønster som "Skann".
- **`App.tsx`** — render-gate for `TrainingWizard` når treningsmodus er
  aktiv, samme mønster som skanne-veiviseren.

Ingen av disse filene rører kamera-skanningens kode i det hele tatt —
treningsmodus er et helt uavhengig tillegg som kun deler den underliggende
kube-kontrolleren og 3D-visningen, akkurat som skanning kun deler
`loadState`.

## Feilhåndtering

- Bruker forlater treningsmodus midt i et forsøk ("Avbryt", samme mønster
  som skanningens Avbryt-knapp): pågående forsøk telles verken som riktig
  eller feil, streak forblir uendret, kuben forblir i sin nåværende
  (ufullførte) tilstand — brukeren kan fritt fortsette å bruke kuben
  manuelt eller starte en ny blanding.
- `localStorage` utilgjengelig eller korrupt (f.eks. privat nettlesing):
  fremgang lagres ikke, treningsmodus fungerer likevel innenfor
  økten (in-memory fallback) — ingen feilmelding trengs, dette skal bare
  gli stille inn i en tilstand uten persistens.

## Testing

- **Algoritme-data-korrekthet**: en test anvender hver eneste
  `setupMoves`+`solutionMoves` fra begge spor på en løst kube via appens
  egen `parseAlgorithm`/kube-motor, og forsikrer seg om at resultatet er
  nøyaktig `SOLVED_STATE`. Dette fanger enhver notasjons- eller
  transkripsjonsfeil i algoritme-dataen automatisk, samme prinsipp som
  skanningens matematiske selvsjekk.
- **Progresjons-logikk**: rene enhetstester av streak-telling,
  mestrings-terskel (3 på rad), og case-opplåsings-rekkefølge, uavhengig
  av UI.
- **`useAlgorithmTraining`**: tynt tilstands-lag over allerede testet
  logikk (som `useCubeScan.ts`) — ingen dedikert enhetstest, dekkes av en
  ende-til-ende Playwright-sjekk i implementeringens siste steg (samme
  mønster som skanningens Task 14).
