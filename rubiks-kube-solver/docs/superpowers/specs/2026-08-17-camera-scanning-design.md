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

### Hvorfor 5 bilder er nok

Hver flis på en uskannet side tilhører enten et hjørne (der de 2 andre
fargene allerede er observert på sidene) eller en kant (der den ene fargen
er observert, og den andre må være den uskannede sidens egen — se under).
Midtflisen er den eneste fargen igjen av de 6 når de andre 5 midtflisene er
kjent.

### Hjørne-utledning (brukes til både D og U-rotasjon)

For hvert av kubens 8 hjørner er de 3 fargene en fast, kjent kombinasjon
(f.eks. Hvit+Grønn+Rød er én bestemt fysisk brikke). Når 5 sider er
fotografert (alt unntatt D), er de 4 øvre hjørnene (UFR, UFL, UBR, UBL) alle
fullt synlige — vi kjenner deres identitet eksakt. De 4 nedre hjørnene
(DFR, DFL, DBR, DBL) må da nødvendigvis være nøyaktig de 4 resterende
brikkene fra det totale settet på 8. For en gitt nedre hjørne-posisjon ser
vi allerede 2 av dens 3 farger (sidene); vi slår opp hvilken av de
resterende brikkene som inneholder akkurat det fargeparet, og leser av den
3. (D-vendte) fargen.

**Presisering:** i sjeldne blandinger deler to av de resterende brikkene
samme fargepar (f.eks. begge inneholder Hvit+Rød, men én har Grønn og den
andre Blå som 3. farge) — da er det lokalt tvetydig. Se "Validering og
tvetydighet" for hvordan dette løses.

Kant-flisene på D utledes enklere: av kubens 12 kanter er de 4 som ligger
helt innenfor F/R/B/L allerede fullt kjent (fullt synlige på sidebildene).
De resterende 8 (4 mot U, 4 mot D) er dermed nøyaktig de 8 resterende
kant-brikkene. For en kant mot D ser vi allerede dens side-farge direkte;
den D-vendte fargen er tvunget til å være D-sidens egen (allerede kjente)
senterfarge, siden det er den eneste gjenværende kant-brikken som er
konsistent med den observerte sidefargen på akkurat den posisjonen.

### U-bildets rotasjon

U fotograferes rett ovenfra, og fotografen kan i praksis stå i en
vilkårlig retning — bildets "opp" har ingen kjent sammenheng med F/R/B/L.
Vi kjenner likevel U sine 4 hjørnefarger på forhånd (utledet fra sidene,
akkurat som for D over). Vi prøver alle 4 mulige 90°-rotasjoner av det
gjenkjente 3×3-rutenettet fra U-bildet og velger den rotasjonen der
bildets 4 hjørneceller stemmer overens med de uavhengig utledede
hjørnefargene. Dermed kan brukeren holde telefonen i hvilken som helst
retning når toppen fotograferes.

## Validering og tvetydighet

Etter at alle 54 flisene er samlet (5 fotografert + D utledet, U rotert
riktig):

1. **Antall:** nøyaktig 9 av hver av de 6 fargene.
2. **Distinkte midtfliser:** alle 6 senterfargene må være forskjellige.
3. **Fysisk gyldighet (paritet):** kombinasjonen må kunne eksistere på en
   ekte kube. Verifiseres mot `cubejs` (`Cube.fromString(...)` +
   forsøk på løsning) — nøyaktig oppførsel på ugyldig input verifiseres
   under implementering; egen paritetssjekk skrives om `cubejs` ikke gir
   et pålitelig svar.

**Tvetydig hjørne-/kant-utledning håndteres slik:** hvis noen posisjoner
hadde mer enn ett mulig svar under utledningen (sjeldent), prøves
kombinasjonene av kandidater i rekkefølge inntil steg 3 (paritet) validerer
— siden kun én kombinasjon noensinne gir en gyldig, løsbar kube. I det
ekstremt sjeldne tilfellet ingen kombinasjon validerer, ber vi brukeren om
et 6. bilde (bunnen) som siste utvei, og faller da tilbake til ren
observasjon i stedet for utledning.

Feiler validering av andre grunner (feil antall, like midtfliser), vises:
"Fargene stemmer ikke med en ekte kube — sjekk rutene" — ingen teknisk
sjargong.

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
- Validering feiler etter alle 5 bilder: se "Validering og tvetydighet"
  over. Brukeren kan alltid gå tilbake og ta et bilde på nytt for et
  spesifikt steg.

## Testing

- **Rene, testbare enheter (TDD, samme mønster som `dragResolver.ts`):**
  - Fargeklassifisering (RGB/HSV → nærmeste kubefarge)
  - Hjørne-/kant-utledning (kjente 5 sider → utledet 6. side, inkludert
    tvetydighets-fallback)
  - U-rotasjonsgjenkjenning (rå rutenett + kjente hjørnefarger → riktig
    rotasjon)
  - Validering (antall, distinkte midtfliser, paritet)
- **Integrasjon/E2E (Playwright, samme mønster som drag-testene):**
  bygge syntetiske testbilder (canvas-tegnet, kjente farger på kjente
  posisjoner) og kjøre dem gjennom hele veiviseren, verifisere korrekt
  sluttilstand og at `Løs` fungerer etterpå på en skannet (ikke
  programmatisk blandet) kube.
