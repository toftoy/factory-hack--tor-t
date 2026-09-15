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
