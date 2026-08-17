# Kamera-skanning av fysisk kube — design

Status: godkjent av bruker, klar for implementeringsplan.

## Mål

La brukeren fotografere en ekte, blandet Rubik's kube med telefonen og få
kubetilstanden lastet inn i appen — som et alternativ til å blande
programmatisk. Skanningen skal være pålitelig, trygg å utføre fysisk (lav
risiko for at et lag vris utilsiktet underveis), og gi tydelig feilmelding
med mulighet til å rette opp hvis noe blir feiltolket.

## Omfang

Dette er delprosjekt 1 av 3 (se tidligere samtale): kamera-skanning →
løsningsmetode (færrest trekk vs. færrest algoritmer) → treningsmodus for
algoritmer. **Denne spesifikasjonen dekker kun kamera-skanning.** De to
neste får hver sin egen brainstorming-runde og spesifikasjon. Skanningens
eneste kontaktflate mot resten av appen er å produsere en gyldig 54-tegns
facelet-streng og laste den inn i den eksisterende kube-kontrolleren — den
er ikke koblet til løsningsmetode eller trening på noen måte.

Ikke i omfang for v1: opplasting av eksisterende bilder som alternativ til
kamera (native filvelger med `capture`-attributt dekker dette i praksis av
seg selv, se Feilhåndtering), støtte for ikke-standard fargeskjema
(kuber der fargene ikke følger vestlig standard: Hvit-Gul, Grønn-Blå,
Rød-Oransje motsatte par).

## Fysisk skanne-protokoll

Kuben legges flatt på et bord og **løftes aldri** under skanningen — dette
minimerer risikoen for at et lag vris utilsiktet, som ville gjort skanningen
feil uten at brukeren merker det.

**Oppsett:** "Legg kuben på bordet foran deg."

| Steg | Instruksjon | Ikon |
|------|-------------|------|
| 1/5 | "Ta bilde av siden som ser på deg." | kamera |
| 2/5 | "Snu en gang til høyre. Ta bilde." | dreie-pil |
| 3/5 | "Snu en gang til høyre. Ta bilde." | dreie-pil |
| 4/5 | "Snu en gang til høyre. Ta bilde." | dreie-pil |
| 5/5 | "Se rett ned ovenfra. Ta bilde av toppen." | pil ned |

De 4 første bildene er internt referert til som F, R, B, L (i akkurat den
rekkefølgen — hvilken fysisk farge som havner hvor er irrelevant, det er
bare vår egen referanseramme). Bilde 5 er U (toppen). D (bunnen) fotograferes
aldri — se "Matematisk utledning" under.

Fordi de 4 sidebildene tas mens kuben *spinnes* (ikke fotografen som
flytter seg), og kameraet holdes normalt/vannrett, er "opp" i hvert bilde
alltid den samme fysiske retningen (mot U) — ingen ekstra retningslogikk
trengs for disse fire.

## Datamodell og bildeflyt

1. Hvert steg bruker `<input type="file" accept="image/*" capture="environment">`
   — åpner telefonens native kamera-app direkte. Ingen `getUserMedia`,
   ingen live-forhåndsvisning, ingen egne kameratillatelser å håndtere i
   nettleseren (viktig for at det skal virke pålitelig også når appen
   kjøres i en sandkassed artifact-forhåndsvisning).
2. Valgt bilde tegnes til et `<canvas>`. Et 3×3-rutenett vises oppå bildet,
   auto-plassert over de midterste ~70 % av bildets korteste side. Brukeren
   kan dra i rutenettets hjørner for å justere det hvis kuben ikke fyller
   rammen perfekt.
3. For hver av de 9 rutene sampler vi en liten flate (ikke bare ett piksel,
   for å dempe støy fra JPEG-komprimering) og regner gjennomsnittsfarge.

## Fargegjenkjenning

Hver sample-farge konverteres til HSV. Klassifisering:

- Lav metning (< terskel) → **Hvit**
- Ellers: sammenlign fargetonen (hue) mot 6 faste referanse-vinkler
  (Rød ≈0°, Oransje ≈30°, Gul ≈60°, Grønn ≈120°, Blå ≈210°) og velg
  nærmeste. Hue foretrekkes fremfor rå RGB-avstand fordi det er langt mer
  robust mot skygger/belysningsforskjeller.

Ingen maskinlæring, ingen nye tunge avhengigheter — konsistent med resten
av prosjektet.

## Matematisk utledning av U-rotasjon og D-siden

> **Revidert etter nærmere ettersyn** (før implementering ble påbegynt):
> en tidligere versjon av dette avsnittet beskrev utledningen som "slå opp
> riktig brikke lokalt, sjelden tvetydig." Ved grundigere gjennomgang viste
> det seg at et rent lokalt oppslag (2 av 3 kjente farger → 3. farge) *ikke*
> er generelt entydig — det finnes reelle blandinger der to gjenværende
> brikker deler samme fargepar, og dette er ikke bare et sjeldent
> spesialtilfelle å ha en fallback for, det er noe algoritmen må håndtere
> som en integrert del av design. Avsnittet under beskriver den korrigerte,
> bevisbart korrekte tilnærmingen. Brukeropplevelsen er uendret (5 bilder,
> ingen løfting, vilkårlig rotasjon på toppbildet) — dette er en presisering
> av den interne algoritmen, ikke en endring i hva brukeren opplever.

### Hvorfor 5 bilder er nok

Hver flis på en uskannet side tilhører enten et hjørne (der de 2 andre
fargene allerede er observert på sidene) eller en kant (der den ene fargen
er observert på siden). Midtflisen er den eneste fargen igjen av de 6 når
de andre 5 midtflisene er kjent.

### Tilnærming: generer kandidater, valider globalt

Fremfor å utlede hver manglende flis uavhengig med lokale regler (som viste
seg ikke alltid å være entydige), genereres et lite sett kandidat-løsninger
og den fysisk gyldige kandidaten velges ved global validering — samme
paritetssjekk som uansett trengs (se "Validering" under). Dette er
bevisbart korrekt (validering er selve definisjonen av "riktig"), og
enkelt å teste, fremfor å stole på en håndderivert formel som kan ha
uoppdagede hull.

Fremgangsmåte:

1. F, R, B, L plasseres direkte — ingen tvetydighet, alle 36 fliser kjent.
2. U sin midtflis leses direkte av fra det rå U-bildet (midtflisen endres
   ikke av hvilken av de 4 rotasjonene som er riktig — kun kant- og
   hjørneflisene på U gjør det).
3. D sin midtflis er den ene gjenværende fargen av de 6 som ikke brukes av
   noen av de andre 5 midtflisene (nå alle kjent).
4. For hver av de 4 mulige 90°-rotasjonene av U-bildets kant-/hjørneceller:
   a. Plasser U fullstendig ut fra denne rotasjonen — nå er 45 av 54
      fliser kjent (U+F+R+B+L), og de 4 øvre hjørnene og 4 øvre + 4
      midtre kantene er alle fullt identifisert (alle sine 2–3 farger
      direkte observert).
   b. De 4 gjenværende hjørnebrikkene (blant kubens totalt 8) og de 4
      gjenværende kantbrikkene (blant totalt 12) er da nøyaktig de som
      ikke ble brukt i (a) — et fast, lite sett.
   c. For hver av D sine 4 hjørneposisjoner (2 kjente farger fra sidene)
      og 4 kantposisjoner (1 kjent farge fra siden): finn hvilke av de
      gjenværende brikkene som er *konsistente* med de kjente fargene på
      akkurat den posisjonen (vanligvis nøyaktig én; sjelden to).
   d. Kombiner til komplette kandidat-kuber — ett gyldig sett tildeler
      hver gjenværende brikke til nøyaktig én posisjon (et lite
      tilordningsproblem, i praksis nesten alltid bare 1 kombinasjon per
      rotasjon siden de fleste posisjoner kun har én konsistent brikke).
5. For hver kandidat-kube (opptil 4 rotasjoner × noen få
   tildelings-kombinasjoner hver — i praksis typisk bare 4 totalt, sjelden
   mer enn noen titalls) kjøres full validering (se under). Nøyaktig én
   kandidat skal validere som en ekte, løsbar kube; den brukes.

Dette gir automatisk **både** riktig D-side **og** riktig U-rotasjon fra
samme mekanisme — ingen separat "sjekk hjørnene mot U-bildet"-logikk
trengs, siden en feil rotasjon rett og slett ikke vil gi noen gyldig
kandidat-kube i steg 5.

## Validering

Kjøres på hver kandidat-kube fra steg 5 over, og på nytt etter hver manuell
korrigering:

1. **Antall:** nøyaktig 9 av hver av de 6 fargene.
2. **Distinkte midtfliser:** alle 6 senterfargene må være forskjellige.
3. **Fysisk gyldighet (paritet):** kombinasjonen må kunne eksistere på en
   ekte kube. Verifiseres mot `cubejs` (`Cube.fromString(...)` +
   forsøk på løsning) — nøyaktig oppførsel på ugyldig input verifiseres
   under implementering; egen paritetssjekk skrives om `cubejs` ikke gir
   et pålitelig svar.

**Ingen kandidat validerer:** sannsynligvis en feillest farge et sted.
Brukeren får beskjeden "Fargene stemmer ikke med en ekte kube — sjekk
rutene" og kan gå tilbake og korrigere et hvilket som helst bilde. Som
siste utvei (ekstremt sjelden) kan brukeren bli bedt om et 6. bilde
(bunnen), og appen bruker da ren observasjon der i stedet for utledning.

**Flere kandidater validerer** (kan i teorien skje hvis fargelesingen i seg
selv var tvetydig nok til å tillate mer enn én fysisk tolkning): den første
gyldige brukes, siden appen uansett viser alle 6 sidene i
korrigeringssteget etterpå — brukeren ser og kan rette eventuelle feil der.

## Manuell korrigering

Etter skanning (og eventuell utledning) vises alle 6 sidene som små
3×3-rutenett med gjenkjente farger, i samme fargepalett som selve
3D-kuben. Trykk på en rute for å bla gjennom de 6 fargene og rette den.
Dette gjelder likt for fotograferte og utledede sider. Validering (over)
kjøres på nytt etter hver korrigering.

## Integrasjon med eksisterende app

Skanning er bare en ny måte å sette kubetilstanden på. Når validering
passerer og brukeren trykker "Bruk denne kuben":

- Den 54-tegns strengen erstatter `cubeRef` sin tilstand i
  `useCubeController` (samme mekanisme som `reset()`, bare med en annen
  starttilstand enn løst).
- Trekkteller nullstilles.
- `Bland`/`Løs`/dra-og-vri fortsetter å virke uendret — de kjenner ikke til
  at tilstanden kom fra et kamera.

Ny UI: en "Skann"-knapp ved siden av Bland/Løs/Nullstill åpner veiviseren
som et eget steg/overlegg over 3D-scenen.

## Feilhåndtering

- Avbrutt filvalg (ingen fil valgt): bli værende på samme steg, ingen krasj.
- `<input type="file" capture>` faller naturlig tilbake til vanlig
  bildevalg fra galleri hvis enheten ikke har/tillater direkte
  kameratilgang — ingen egen kode trengs for dette.
- Validering feiler etter alle 5 bilder: se "Validering" over. Brukeren
  kan alltid gå tilbake og ta et bilde på nytt for et spesifikt steg.

## Testing

- **Rene, testbare enheter (TDD, samme mønster som `dragResolver.ts`):**
  - Fargeklassifisering (RGB/HSV → nærmeste kubefarge)
  - Kandidatgenerering (kjente F/R/B/L + rått U-rutenett → alle
    kandidat-kuber for de 4 rotasjonene, inkludert flerbrikke-tvetydighet)
  - Validering (antall, distinkte midtfliser, paritet)
  - Hele utlednings-pipelinen (kandidatgenerering + validering sammen):
    kjente 5 sider → korrekt 6. side og korrekt U-rotasjon
- **Integrasjon/E2E (Playwright, samme mønster som drag-testene):**
  bygge syntetiske testbilder (canvas-tegnet, kjente farger på kjente
  posisjoner) og kjøre dem gjennom hele veiviseren, verifisere korrekt
  sluttilstand og at `Løs` fungerer etterpå på en skannet (ikke
  programmatisk blandet) kube.
