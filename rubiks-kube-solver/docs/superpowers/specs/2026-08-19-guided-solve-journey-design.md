# Guided Solve Journey — design

Status: satt i gang autonomt under en `/goal`-styrt økt ("løsningen skal
kunne lære en 8-åring uten forkunnskaper å løse rubiks kube på en gøy måte.
Designet skal føles moderne og intuitivt") — brukeren ba selv om et forslag
til flere timers selvstendig arbeid rett før målet ble satt. Normalt venter
denne spesifikasjonen på eksplisitt brukergodkjenning før implementering;
her erstattes det gated steget av denne loggførte begrunnelsen, siden
formålet med økten er å jobbe videre uten å stoppe for spørsmål.

## Bakgrunn / gap

Appen har i dag tre uavhengige "flashcard"-treningsspor
(`src/cube/algorithms.ts`, `useAlgorithmTraining.ts`, `TrainingWizard.tsx`):
Notasjon (obligatorisk første gang), Nybegynner og 2-look OLL/PLL. Hvert
case er isolert: kuben nullstilles til løst, et kjent case settes opp,
brukeren løser *det ene caset*, og appen går videre til neste — uavhengig
repetisjon, ikke en sammenhengende fortelling.

To konkrete hull mot målet "en 8-åring uten forkunnskaper lærer å løse
kuben på en gøy måte":

1. **Ingen sammenhengende løsnings-reise.** Nybegynnermetoden har seks
   trinn (kors → hjørner → mellomlag → gult kors → orienter hjørner →
   plasser hjørner → plasser kanter). Appen har algoritme-innhold for fire
   av dem (mellomlag, gult kors, orienter, plasser hjørner/kanter) men
   **ingen** for de to første — kors og hjørner i første lag er de mest
   intuitive stegene og helt fraværende som innhold. Uten dem kan ikke en
   nybegynner faktisk løse en hel kube i appen; de kan bare øve på
   fragmenter av siste lag.
2. **Inngangsskjermen er ikke bygget for en nybegynner.** `ControlPanel`
   viser i dag sju likestilte knapper (Bland/Løs/Nullstill/Skann + tre
   treningsspor) og undertittelen "3D Rubik's kube med Kociemba-basert
   løser" — teknisk voksenspråk, ingen tydelig "start her"-vei for et barn
   som aldri har rørt en kube.

## Mål for dette delprosjektet

En ny **guidet løsnings-reise**: én sammenhengende opplevelse som tar
brukeren fra "kan ingenting" til "løste akkurat en kube selv", strukturert
som de sju nybegynnermetode-stegene i rekkefølge, med én fremdriftslinje
og én stor feiring på slutten. Pluss en modernisert inngangsskjerm som
gjør reisen til det tydelige første valget, med det tekniske
verktøybeltet tilgjengelig men nedtonet.

## Ikke i omfang

- **Generell case-gjenkjenning på en vilkårlig (f.eks. skannet) blandet
  kube.** Å bygge en motor som ser på *enhver* kubetilstand og regner ut
  riktig steg/case live, er et mye større prosjekt (i praksis en egen
  forenklet løser-guide). Hvert steg i reisen forblir et **kuratert case**
  — appen nullstiller til løst og setter opp et kjent mønster, akkurat som
  eksisterende treningsspor — det er *rekkefølgen og fortellingen* som er
  nytt, ikke evnen til å analysere en vilkårlig tilstand. Konsekvens:
  reisen lærer metoden på representative mønstre; å løse sin egen fysiske,
  virkelig blandede kube skjer fortsatt via de eksisterende verktøyene
  (Skann + Løs, eller fri utforskning med treningssporene). Dette er en
  bevisst avveining for å holde omfanget trygt — se Avviste alternativer.
- Endringer i persistens-modellen eller UI-mønsteret til de tre
  eksisterende treningssporene (notasjon/nybegynner/2-look) — de forblir
  som de er, som et "for viderekomne"-tilbud etter reisen.
- Lyd/musikk, avatarer, badges eller annen gamification utover det som
  allerede finnes (stjerner, konfetti) — egen vurdering senere.

## Avviste alternativer

**Én fysisk sammenhengende kube gjennom hele reisen** (reelt: løs *din*
blandede kube steg for steg, uten reset mellom stegene) ble vurdert og
avvist for v1. Grunnen: lagdreininger flytter hjørner og kanter på samme
lag sammen — det finnes ingen enkel, trygg måte å garantere at f.eks.
hjørne-steget sitt oppsett aldri rører kors-kantene brukeren nettopp løste,
uten enten (a) å bygge ordentlig case-gjenkjenning (avvist over) eller
(b) håndplukke flyttesekvenser og *anta* de er trygge — nøyaktig den
typen kube-algebra-feil som tidligere i dette prosjektet har vist seg
vanskelig å få riktig uten grundig verifisering, og som ville risikere
akkurat den "kuben løser seg visstnok selv/ødelegger tidligere steg"-følelsen
brukeren allerede har rapportert som forvirrende ved en tidligere bug.
Den narrative løsningen (fremdriftslinje + rekkefølge, uten fysisk
kontinuitet) gir 90 % av den opplevde verdien uten den risikoen, og
gjenbruker den allerede testede `reset()` + `setupMoves`-mekanikken
uendret.

## De sju stegene

| # | Steg | Innhold |
|---|------|---------|
| 1 | Kors | **Nytt**: 2 kurerte case (samme detaljnivå som dagens mellomlag-steg har 2 case for venstre/høyre) |
| 2 | Hjørner i første lag | **Nytt**: 2 kurerte case |
| 3 | Mellomlag | Gjenbruk `beginner-f2l-left` + `beginner-f2l-right` |
| 4 | Gult kors | Gjenbruk `beginner-yellow-cross` |
| 5 | Orienter hjørner | Gjenbruk `beginner-sune` |
| 6 | Plasser hjørner | Gjenbruk `beginner-corner-perm` |
| 7 | Plasser kanter | Gjenbruk `beginner-edge-perm` |

De nye case-ene (steg 1–2) følger nøyaktig samme `AlgorithmCase`-kontrakt
og selv-verifiserende korrekthetstest som alt eksisterende innhold
(`setupMoves` + `solutionMoves` er inverse, anvendt på løst kube ender man
på `SOLVED_STATE` — verifiseres automatisk i test, se
`2026-08-18-algorithm-training-design.md`s "Testing"-seksjon for
presedens). De eksakte trekkene skrives ut og verifiseres under
implementering, ikke gjettet på her.

Reisen krever notasjon-sporet fullført først, med samme
omdirigerings-mekanisme som allerede finnes for nybegynner/2-look
(`useAlgorithmTraining.ts` sin `start()`-gate) — et barn som ikke vet hva
`U` betyr kan ikke lese en hint-chip.

## Reisens flyt (ny, isolert tilstandsmaskin)

Egen hook `useGuidedJourney.ts`, parallell til `useAlgorithmTraining.ts`
men med enklere progresjon — **ett riktig løst forsøk holder**, ikke
streak-på-3 (det er poenget med de separate øve-sporene; reisen handler om
å komme i mål, ikke om automatisering):

1. Bruker trykker den nye primærknappen "🧩 Lær å løse kuben".
2. Er notasjon ikke fullført: samme omdirigering som i dag.
3. Reisens gjeldende steg-indeks lastes fra `localStorage` (egen nøkkel,
   separat fra `trainingProgress.ts` — se Arkitektur). Ingen indeks lagret
   ennå ⇒ start på steg 0.
4. Kuben nullstilles til løst, steg-casets `setupMoves` animeres inn
   (gjenbruker `controller.reset()`/`enqueue()` akkurat som i dag).
5. Bruker løser caset ved å dra i lag. Samme "sammenlign mot
   `SOLVED_STATE`"-sjekk som eksisterende motor.
6. Riktig løst: kort feiring, steg-indeksen økes og lagres, neste steg
   settes opp automatisk (samme `SOLVED_PAUSE_MS`-mønster som hindrer at
   kuben "hopper tilbake" synlig før brukeren rekker å se den løst).
7. Siste steg løst: hele reisen markeres fullført — stor feiring ("Du
   løste kuben fra bunnen av! 🏆"), forskjellig fra dagens
   per-spor-fullført-skjerm.
8. "Vis meg" (samme oppførsel som i dag: viser løsningen, går videre til
   et nytt forsøk på samme steg) og "Hopp over steg" (samme oppførsel som
   dagens "Hopp over") er tilgjengelig på hvert steg — et barn som sitter
   fast skal aldri oppleve å stå fast permanent.
9. "Start på nytt" tilgjengelig når som helst (samme tap-to-arm-mønster
   som allerede finnes for treningssporenes nullstill-knapp, av samme
   sandkasse-iframe-grunn) og på fullført-skjermen.

## Arkitektur

- **`src/cube/algorithms.ts`** — legg til `CROSS_ALGORITHMS` og
  `CORNER_ALGORITHMS` (2 case hver, samme `AlgorithmCase`-type). Ren
  data, ingen ny type nødvendig — disse casene tilhører ikke noen av de
  tre eksisterende `TrainingTrack`-verdiene og importeres direkte av
  reise-modulen, ikke via `TRACKS`-oppslaget.
- **`src/cube/guidedJourney.ts`** (ny) — ren data/logikk: den faste,
  ordnede listen av sju steg (hver med et tittel/ikon + hvilket
  case/spor+id den bruker), og rene hjelpefunksjoner for
  stegindeks-fremgang (parallell til `trainingProgress.ts`s mønster, men
  enklere — ingen streak/mestring, kun "gjeldende stegindeks" +
  "fullført"). Egen `localStorage`-nøkkel, rører ikke
  `trainingProgress.ts` i det hele tatt.
- **`src/hooks/useGuidedJourney.ts`** (ny) — tilstandsmaskin, se Reisens
  flyt. Gjenbruker `useCubeController` akkurat som `useAlgorithmTraining`
  gjør.
- **`src/components/GuidedJourney.tsx`** (ny) — fullskjerm-HUD, gjenbruker
  de eksisterende `training-*`-CSS-klassene/visuelle språket fra
  `TrainingWizard.tsx` (samme HUD-plassering nederst, samme
  bevegelseskort-mønster) men med en **reise-fremdriftslinje** (7 steg,
  med ikon per steg) i stedet for per-case-prikker, siden konteptet her er
  "hvor er jeg i hele reisen", ikke "hvor er jeg i dette ene sporet".
- **`ControlPanel.tsx`** (redesign) — ny stor primærknapp øverst: "🧩 Lær å
  løse kuben" (kaller `onStartJourney`). Undertittelen
  "Kociemba-basert løser" fjernes/tones ned fra toppen. De sju
  eksisterende knappene (Bland/Løs/Nullstill/Skann + tre treningsspor)
  samles under en sammenleggbar seksjon "For viderekomne" (lukket som
  standard, ett trykk å åpne) — funksjonaliteten er uendret, bare
  hierarkiet i UI-et endres.
- **`App.tsx`** — nytt render-gate for `GuidedJourney`, samme mønster som
  `TrainingWizard`/`ScanWizard` i dag.

Ingen eksisterende fil sin *logikk* endres utover `ControlPanel.tsx`s
layout og en ny prop (`onStartJourney`) — `useAlgorithmTraining.ts`,
`trainingProgress.ts` og de tre eksisterende sporene er urørt.

## Visuelt / "moderne og intuitivt"

- Primærknappen er stor, med ikon, og eneste ting som skiller seg
  visuelt på inngangsskjermen først — matcher prinsippet fra forrige
  UX-runde (bold/playful lilla/koral-palett, allerede etablert i
  `index.css` sine `--train-*`-variabler) fremfor å introdusere en ny
  fargeprofil.
- "For viderekomne"-seksjonen bruker et enkelt utvid/kollaps-mønster
  (ingen ny avhengighet) — holder skjermen ren for et barn uten å fjerne
  noe en øvet bruker (eller forelderen) trenger.
- Reise-fremdriftslinjen bruker samme stjerne/konfetti-feiringsspråk som
  allerede er bygget og verifisert (`training-confetti`,
  `training-complete-card`-mønster) — gjenbruk, ikke ny visuell dialekt.

## Testing

- **Case-korrekthet**: samme selvverifiserende rundtur-test som
  eksisterende innhold, utvidet til `CROSS_ALGORITHMS`/
  `CORNER_ALGORITHMS`.
- **Reise-fremgangslogikk**: rene enhetstester av
  `guidedJourney.ts` (stegindeks-fremgang, fullført-tilstand,
  persistens-serialisering) — samme mønster som
  `trainingProgress.ts`s eksisterende tester.
- **E2E**: én Playwright-sjekk som spiller gjennom hele reisen
  (drag-to-solve hvert steg eller bruk "Vis meg" for å garantere
  fremgang) og bekrefter fullført-skjermen vises, samme mønster som
  tidligere runders sluttverifisering i denne økten.
