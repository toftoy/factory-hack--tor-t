# gjenglemt

En liten mobilvennlig webapp som hjelper med å varsle eiere av
gjenglemte klær/ting. Trykk «Hent sted» på forhånd hvis du skal sortere
flere gjenstander (henter GPS-posisjonen én gang og gjenbruker den for
hele økten), ta bilde av en lapp med navn/telefon, og appen åpner
Meldinger automatisk — direkte i riktig samtale, med navn, telefon og
sted ferdig utfylt i teksten, uten at du trenger å trykke på noe selv.
Bekreftelsesskjermen finnes fortsatt i bakgrunnen som en manuell
reserve hvis noe må rettes og meldingen åpnes på nytt. Bildet av
plagget/tingen tas ikke gjennom appen — det tas rett i samtalen som
åpner seg, siden det uansett må legges ved manuelt.

Se designdokumentet i
`../docs/superpowers/specs/2026-09-15-gjenglemt-design.md` for
bakgrunn og valgene bak løsningen.

## Nettverk og lagring for tekstgjenkjenning (OCR)

Tekstgjenkjenningen (OCR) av lappen kjører med Tesseract.js. Første
gang appen brukes trenger den derfor internettilgang: OCR-motoren
(kjøremotor, WASM-kjerne og en norsk språkmodell) lastes ned fra et
CDN, til sammen noen få MB. Den nedlastede språkmodellen mellomlagres
i nettleseren (IndexedDB), slik at senere bruk går raskere og kan
fungere selv uten nett. Ingen brukerdata (bilder, navn,
telefonnummer eller sted) er del av denne nedlastingen — det er en
engangsnedlasting av en generisk, offentlig språkmodell, uavhengig av
reversgeokodings-oppslaget mot Nominatim nevnt andre steder i
dokumentasjonen.

## Kjøre lokalt

```bash
npm install
npm run dev
```

Åpne den viste adressen i en mobilnettleser (eller bruk nettleserens
enhetssimulering) for å teste kamera-flyten.

## Bygge

```bash
npm run build
npm run preview
```

## Teste

```bash
npm test    # enhetstester (vitest) for tekstuttrekk, meldingsmal, deling og sted
npm run smoke   # headless sjekk av at appen laster (playwright)
```

`npm run smoke` krever en lokal Chromium-installasjon. Sett
miljøvariabelen `CHROMIUM_PATH` til stien til din Chromium, eller
installer en med `npx playwright install chromium` og juster stien
deretter — med mindre du kjører i et miljø som allerede har Chromium
på standardstien.

## Ikoner

Home-screen-ikonene i `public/` er generert, ikke håndtegnet. Kjør
`npm run generate-icons` på nytt hvis du vil regenerere dem (f.eks.
etter å ha endret fargen i `scripts/generate-icons.mjs`).

## Deploy

Appen er en ren statisk side (`dist/` etter `npm run build`) og kan
hostes hvor som helst som serverer statiske filer, f.eks. GitHub
Pages. Det finnes ingen backend å drifte.

## Manuell test på enhet (kan ikke automatiseres herfra)

Følgende må sjekkes på en ekte iPhone og Android-telefon før bruk,
siden de avhenger av ekte kamera/GPS/deling som ikke finnes i denne
utviklingsomgivelsen:

- [ ] Kameraet åpner seg direkte når du trykker "Ta bilde av lappen",
      på både iOS Safari og Android Chrome
- [ ] "Hent sted" på forsiden ber om posisjonstillatelse og viser
      "Posisjon hentet." (eller "Fant ikke posisjon.") — kan trykkes
      før noe bilde er tatt
- [ ] OCR klarer å lese et vanlig håndskrevet/trykt navn og
      telefonnummer fra lappen
- [ ] Meldinger åpnes automatisk rett etter at lapp-bildet er tatt, uten
      at du trenger å trykke "Åpne melding" selv — sjekk at samtalen som
      åpner seg er adressert til riktig nummer
- [ ] Sted er med i den automatisk åpnede meldingen hvis "Hent sted" ble
      trykket først; hvis ikke, sjekk at det i alle fall dukker opp i
      bekreftelsesskjermen i etterkant (feltet skal aldri stå på
      "Henter sted …" i mer enn ca. 10 sekunder)
- [ ] Skru av stedstjenester og bekreft at appen fortsatt lar deg
      fylle inn Sted manuelt uten å henge seg opp
- [ ] "Nytt funn" på meldingsskjermen fører deg tilbake til kameraet
      for neste gjenstand uten å be om posisjonstillatelse på nytt
- [ ] Etter at meldingen er åpnet automatisk, sjekk at "Åpne melding"
      fortsatt fungerer manuelt hvis du retter et felt og vil sende på
      nytt
- [ ] "Legg til på Hjem-skjerm" viser riktig ikon og navn
- [ ] Kom tilbake til appen etter et kamera-opptak og bekreft at du
      havner i meldingsskjermen, ikke tilbake på forsiden — iOS er
      kjent for av og til å laste en hjemskjerm-installert side helt på
      nytt (og dermed miste JS-tilstanden) når kameraet lukkes, særlig
      under minnepress
