# gjenglemt

En liten mobilvennlig webapp som hjelper med å varsle eiere av
gjenglemte klær. Ta bilde av en lapp med navn/telefon og bilde av
plagget, så gjetter appen navn, telefon og finnested (fra bildets
posisjon), lar deg rette gjetningene, og åpner telefonens delingsmeny
med bildene og en ferdig meldingstekst — du velger selv å sende via
Meldinger.

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
npm test    # enhetstester (vitest) for tekstuttrekk, meldingsmal, deling, sted og capture-flow-tilstand
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

- [ ] Kameraet åpner seg direkte når du trykker en "Ta bilde"-knapp,
      på både iOS Safari og Android Chrome
- [ ] Bildeflyten går automatisk videre fra lapp → plagg → (evt.
      ekstra) uten at du må velge hvilket bilde som er hva
- [ ] OCR klarer å lese et vanlig håndskrevet/trykt navn og
      telefonnummer fra lappen
- [ ] Finnested fylles ut automatisk (enten fra bildets
      EXIF-posisjon, eller ved at nettleseren spør om
      posisjonstilgang som fallback)
- [ ] "Send"-knappen åpner delingsmenyen med begge bildene og teksten
      ferdig utfylt, og Meldinger-appen dukker opp som et alternativ
- [ ] Skru av stedstjenester og bekreft at appen fortsatt lar deg
      fylle inn Sted manuelt uten å henge seg opp
- [ ] "Legg til på Hjem-skjerm" viser riktig ikon og navn
- [ ] Sjekk om Sted faktisk fylles ut fra bildets EXIF-posisjon på
      iPhone, eller om appen alltid faller tilbake til å be om
      live posisjonstilgang i stedet (iOS Safari er kjent for av og
      til å fjerne posisjonsmetadata fra bilder tatt via
      `<input type="file">`, så fallback-veien kan i praksis være
      vanligste tilfelle, ikke unntaket)
