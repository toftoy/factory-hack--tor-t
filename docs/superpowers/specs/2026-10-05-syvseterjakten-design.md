# Syvseterjakten — design

Dato: 2026-10-05 · Status: til gjennomgang

Et privat dashbord som sammenligner 6/7-seters bruktbiler fra Finn.no for å
velge erstatter for en Skoda Octavia diesel. Brukeren bor i Bergen, kjører
ca. 10 000 km/år, har ikke hjemmelading, men har lading på hytta.

## 1. Mål og avgrensning

- **Modeller:** Skoda Kodiaq, Tesla Model Y, Tesla Model X, Mercedes EQB.
- **Varianter:** alt med ≥ 6 seter, alle drivlinjer (Kodiaq diesel, bensin,
  PHEV; Model X 6-seter inkludert). Drivlinje er et filter i dashbordet.
- **Geografi:** hele Norge, ingen pris- eller årsmodellgrense.
- **Beslutningsstøtte:** forventet årskostnad (LCC fordelt per år) ved 8 års
  eierskap med salg etter 8 år, inkludert valgfri hentekostnad til Bergen.
- **Ikke i scope:** automatisk innhenting fra Finn, varsler, flere brukere,
  andre modeller enn de fire.

## 2. Datakilde og vilkår

Finns `robots.txt` sier «Crawling FINN.no is prohibited unless you have
written permission», og vilkårene forbyr roboter og systematisk/regelmessig
kopi uten skriftlig samtykke. Derfor:

- **Ingen automatisert henting** (ingen scheduled scraping i Actions, ingen
  omgåelse av blokkering).
- **Halvmanuell innsamling:** brukeren søker selv på Finn i nettleseren og
  trykker et bokmerke som leser annonsene på siden som vises.
- **Privat:** repoet er privat, og dashbordet er bak innlogging. Data
  videreformidles ikke.

### Faste søk (`config/searches.json`)

Seks søk, hvert med `id`, `model`, `label` og Finn-URL (Finns egne filtre,
`registration_class=1`, `price_from=100000`):

| id | modell | setefilter |
|---|---|---|
| `kodiaq-6plus` | kodiaq | `seats_from=6` |
| `model-y-6plus` | model-y | `seats_from=6` |
| `model-x-6plus` | model-x | `seats_from=6` |
| `eqb-6plus` | eqb | `seats_from=6` |
| `model-x-all` | model-x | ingen |
| `eqb-all` | eqb | ingen |

Annonser som bare finnes i et `*-all`-søk får `seatsSource: "unknown"` og
vises med merket «seter ukjent».

## 3. Arkitektur

```
Finn (Safari) ──bokmerke──▶ dashbord /#import ──GitHub API──▶ inbox/<ts>.json
                                                                  │ push
                                                                  ▼
          Cloudflare Pages + Access ◀── build ◀── ingest (merge → data/*.json)
```

- **Repo:** `toftoy/syvseterjakten` (privat). Vite + TypeScript, ingen
  rammeverk.
- **Hosting:** Cloudflare Pages (`syvseterjakten.pages.dev`) beskyttet av
  Cloudflare Access (e-post-engangskode, kun godkjent(e) e-postadresse(r)).
  Deploy fra GitHub Actions med `wrangler` (secrets
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- **Hvorfor dashbordet som mellomledd:** Finns CSP vil sannsynligvis stoppe
  `fetch` fra bokmerket til `api.github.com`. Navigasjon til en ny side med
  data i URL-hash stoppes ikke. GitHub-tokenen ligger da i `localStorage` på
  dashbord-origin bak Access, ikke på finn.no.

### Mappestruktur

```
src/core/       ren logikk, ingen DOM, Vitest + TDD
  parse.ts        Finn-side (HTML/innebygd JSON) → RawListing[] + totalHits
  importPayload.ts koding/dekoding av bokmerke-payload (komprimert, versjonert)
  merge.ts        RawImport + Store → Store (status, prishistorikk, solgt)
  geo.ts          postnummer → koordinater, avstand, nærmeste flyplass/stasjon
  valuation.ts    verdikurve og restverdi (lav/middels/høy)
  cost.ts         årskostnad og kostnadsfordeling
  pickup.ts       hentekostnad til Bergen
  rank.ts         «beste kjøp», «godt kjøp», «jevnt løp»
src/ui/         dashbord-faner og importside
bookmarklet/    kilde → bygges til javascript:-lenke
scripts/ingest.ts  kjøres i Actions
config/         searches.json, assumptions.json, places.json
data/           listings.json, runs.json, postnummer.json
inbox/          råimporter (slettes etter ingest)
```

### Workflows

- `ingest-deploy.yml`: trigges av push til `inbox/**`, `data/**`,
  `config/**`, `src/**` på `main`, og `workflow_dispatch`. Steg: `npm ci` →
  `npm test` → `npm run ingest` (hvis inbox ikke er tom: merge, slett inbox,
  commit data som bot til `main`) → `npm run build` → `wrangler pages deploy`.
- `ci.yml`: på pull requests: typecheck, test, build.
- Ingen `schedule` — det er ingenting å hente automatisk.
- Kodeendringer går via PR. Data-commits går direkte til `main`.

## 4. Innsamlingsflyt

1. Brukeren åpner fanen **Oppdater** og trykker lenken for et søk (åpner Finn).
2. På Finn-resultatsiden trykker brukeren bokmerket. Det:
   - leser annonsene på siden og totalt antall treff,
   - finner søk-id ved å matche URL-ens filtre mot `searches.json` (innbakt
     i bokmerket); ukjent søk → brukeren velger søk på importsiden,
   - åpner `https://syvseterjakten.pages.dev/#import=<payload>`.
3. Importsiden viser f.eks. «47 annonser, side 1 av 2 for Kodiaq 6+ seter».
   Sider fra samme søk samme dag samles lokalt til `captured ≥ totalHits`.
4. **Lagre** skriver `inbox/<ISO-tid>-<søk>.json` via GitHub Contents API
   (fine-grained PAT, kun dette repoet, `contents: write`).
5. Actionen kjører ingest og deploy. Importsiden viser lenke til Actions-kjøringen.

Feil: bokmerket på feil side → «Fant ingen annonser. Er du på en
Finn-resultatside?». Lagringsfeil (token, nett) → data beholdes lokalt,
«Prøv igjen». Ingest avviser filer med ugyldig skjema (filen flyttes til
`inbox/rejected/` og jobben feiler synlig), og `listings.json` endres ikke.

**Risiko:** Finns sidestruktur er ukjent for oss (sandkassen når ikke
finn.no). Første steg i implementeringen er at brukeren lager en eksempelside
med et diagnose-bokmerke. Den blir testfikstur for `parse.ts`. Endrer Finn
strukturen, feiler parsertesten mot ny fikstur, og parseren oppdateres.

## 5. Datamodell

### `data/listings.json`

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-03T18:04:00Z",
  "listings": {
    "412345678": {
      "finnkode": "412345678",
      "url": "https://www.finn.no/mobility/item/412345678",
      "model": "kodiaq",            // kodiaq | model-y | model-x | eqb
      "title": "Skoda Kodiaq 2.0 TDI 4x4 L&K 7-seter",
      "fuel": "diesel",             // diesel | bensin | el | plugin-hybrid | hybrid
      "year": 2021,
      "km": 84000,
      "price": 389000,
      "seats": 7,                   // null hvis ukjent
      "seatsSource": "filter",      // filter | unknown
      "location": { "postalCode": "5055", "place": "Bergen", "lat": 60.38, "lon": 5.33 },
      "dealer": true,               // null hvis ukjent
      "status": "active",           // active | sold
      "firstSeen": "2026-10-03",
      "lastSeen": "2026-10-03",
      "soldAt": null,
      "priceHistory": [{ "date": "2026-10-03", "price": 389000 }],
      "searches": ["kodiaq-6plus"]
    }
  }
}
```

`location.lat/lon` er `null` hvis postnummeret ikke finnes i tabellen.
Felter som mangler i Finn-dataene lagres som `null`, ikke utelates.

### `data/runs.json`

```jsonc
[{ "id": "2026-10-03T18:02:11Z", "search": "kodiaq-6plus",
   "totalHits": 57, "captured": 57, "complete": true }]
```

### `inbox/*.json` (importformat, versjonert)

```jsonc
{ "importVersion": 1, "capturedAt": "2026-10-03T18:02:11Z",
  "search": "kodiaq-6plus", "totalHits": 57,
  "listings": [ /* RawListing: finnkode, url, title, price, year, km,
                   fuel, seats, postalCode, place, dealer */ ] }
```

### Merge-regler (`merge.ts`, TDD)

1. **Ny finnkode:** opprettes med `firstSeen = lastSeen = dato`,
   `status: active`, `priceHistory` med ett punkt.
2. **Kjent finnkode:** `lastSeen` oppdateres og felter som har endret seg
   overskrives. Ny pris legger til et punkt i `priceHistory` (lik pris gir
   ikke nytt punkt).
3. **Solgt:** når en import er **komplett** (`captured ≥ totalHits`), settes
   aktive annonser som har søket i `searches` men mangler i importen til
   `sold` med `soldAt = dato`. Ufullstendige importer markerer aldri solgt.
4. **Dukker opp igjen:** `sold` → `active`, `soldAt = null`.
5. **Flere søk:** `searches` er unionen. En annonse markeres solgt bare av et
   komplett søk den tilhører. En annonse som fortsatt er aktiv i et annet
   søk samme dag, forblir aktiv.
6. **`seatsSource`:** blir `filter` hvis annonsen noen gang er sett i et
   `*-6plus`-søk.
7. **Datoer** i Europe/Oslo. Merge er idempotent: samme import to ganger gir
   samme resultat.

## 6. Kostnadsmodell

Alle tall ligger i `config/assumptions.json`. Hver verdi har `value`,
`unit`, `source` og `updated`. Verdiene under er utgangspunkt og verifiseres
mot kilde under implementering.

```
årskostnad = verditap + kapitalkostnad + energi + bompenger + forsikring
           + trafikkforsikringsavgift + dekk + service
verditap   = (pris + omregistrering + [hentekostnad] − restverdi) / 8
kapital    = rente × (pris + restverdi) / 2
```

| Post | Beregning | Utgangspunkt |
|---|---|---|
| Energi, elbil | km/år × kWh/100 km / 100 × (1 + ladetap) × blandet kWh-pris | Model Y 18, Model X 23, EQB 20 kWh/100 km (årsmiddel). Ladetap 10 %. Hytte 1,5 kr/kWh. Offentlig 3,5 kr (Tesla, Supercharger) / 4,5 kr (andre). Andel hytte: glidebryter, standard 25 %. |
| Energi, diesel/bensin | km/år × l/100 km / 100 × literpris | Kodiaq diesel 6,5 l, bensin 8 l |
| Energi, PHEV | elandel × el-formel + resten × bensin-formel | elandel og forbruk i antakelser |
| Bompenger Bergen | passeringer/år × takst(drivlinje) | justerbart antall passeringer |
| Forsikring | per modell | redigerbar |
| Trafikkforsikringsavgift | per drivlinje | dagens satser |
| Dekk, service | per modell per år | redigerbar |
| Omregistrering | engangsbeløp etter drivlinje/alder | dagens satser |
| Kapital | rente | 5 %, kan slås av |
| Hentekostnad | se §8 | av/på-bryter, standard på |

`km/år` (standard 10 000) og eierperiode (fast 8 år) er parametre i
funksjonene. Resultatet er en kostnadsfordeling per post, i tillegg til
summen, i kr/år og kr/km, som lav/middels/høy (fra restverdien).

## 7. Restverdi: kalibrert referansekurve

Restverdi = predikert pris ved **alder + 8 år** og **km + 8 × km/år**.

1. **Form:** en referanseplan `r(alder)` for årlig verditap (bratt først,
   så flatere), én for elbil og én for fossil/PHEV.
2. **Per modell:** `nivå` og tempo `k` tilpasses dataene (minste kvadraters
   metode på log-pris), slik at
   `pris(alder, km) = nivå × Π_{t<alder}(1 − k·r(t)) × (1 − c)^(km/10 000)`.
3. **Kilde til referanseformen:**
   - elbil: Model X (fra 2016) i egne data,
   - fossil/PHEV: Kodiaq (fra 2017) i egne data,
   - for alder utover det dataene dekker (ca. > 10 år): publisert tabell i
     `assumptions.json` med kilde,
   - elbil-tillegg for foreldelse/batteri: ekstra tempo etter en alder,
     justerbart, brukt i «lav»-scenarioet.
4. **Lite data:** under ca. 15 annonser for en modell krympes `k` mot snittet
   for samme drivlinjegruppe, med vekt `n / (n + 15)`. Uten noen annonser
   brukes referansen direkte (`k = 1`).
5. **Km-faktor `c`:** estimeres fra km-variasjon mellom biler med lik alder,
   begrenset til et tak fra antakelsesfila.
6. **Usikkerhet:** restverdi som lav/middels/høy (usikkerhet i `k` ±1
   standardfeil, og elbil-scenarioet for lav). Merket «usikker restverdi»
   vises når alder + 8 er utenfor aldersspennet modellen selv har data for.
   Restverdien er aldri lavere enn et gulv (`assumptions.residualFloor`).
7. **Tilbaketest:** tilpass kun på Model X- og Kodiaq-annonser 0–4 år,
   prediker 8–9 år og sammenlign med faktiske annonser. Middel absolutt
   prosentfeil vises i fanen «Metode». Kjøres i ingest og skrives til
   `data/backtest.json`.

## 8. Geo, kart og hentekostnad

- **Geokoding:** statisk postnummertabell (Geonorge/Kartverket, åpne data)
  i `data/postnummer.json`, oppslag i ingest. Ingen eksterne API-kall.
- **`config/places.json`:** kuratert liste over større norske flyplasser og
  togstasjoner med koordinater. Brukes til hentekostnaden.
- **Hentekostnad** (`pickup.ts`): billigste av (a) fly eller tog fra Bergen
  til nærmeste knutepunkt for bilen, pluss kjøring hjem, eller (b) bare
  kjøring tur/retur. Veiavstand = luftlinje × 1,3. Kjørekostnad = energi
  per km fra kostnadsmodellen + tid (kr/time i antakelser). Billettpris fra
  antakelser. Biler innenfor en radius (standard 60 km) fra Bergen har bare
  kjørekostnad.
- **Kart:** MapLibre GL, OpenFreeMap-kartgrunnlag (ingen nøkkel) og
  AWS Terrain Tiles for 3D-terreng. Flyplasser, togstasjoner og E-/riksveier
  fremheves med stil fra kartdataene. To moduser: prikker (farge = modell,
  størrelse = årskostnad, ring = «godt kjøp») og 3D-søyler per område
  (høyde = antall, farge = laveste årskostnad). Samme filtre som listen.

## 9. Indikatorer (`rank.ts`)

- **Beste kjøp:** laveste middels årskostnad blant de filtrerte bilene,
  totalt og per modell.
- **Godt kjøp:** pris ≥ 10 % under modellens kurve for samme alder/km.
- **Jevnt løp:** årskostnadsintervallene til nr. 1 og nr. 2 overlapper.
- Solgte annonser er med i kurvetilpasningen (med siste pris), men aldri i
  «beste kjøp».

## 10. Frontend

Mobil først, faner nederst, to kolonner på bred skjerm. Kart og diagrammer
lastes først når fanen åpnes.

1. **Biler:** kort (modellfarge, tittel, år, km, pris, årskostnad som
   intervall, kr/km, avstand/hentekostnad, merker, lite prisdiagram).
   Detaljvisning med kostnadsfordeling, prishistorikk og Finn-lenke.
   Filtre: modell, drivlinje, pris, km, år, fylke/maks avstand, aktiv/solgt,
   seter kjent/ukjent. Sortering: årskostnad, pris, km, år, avstand, dager
   på Finn. Filtre og sortering lagres i URL-en.
2. **Sammenlign:** én kolonne per modell (antall, median pris, median
   årskostnad, beste kjøp), stablede kostnadssøyler, alder–pris-punktdiagram
   med kurvene.
3. **Kart:** se §8.
4. **Forutsetninger:** ladefordeling, km/år, rente, priser, bompasseringer,
   hentekostnad på/av, «Tilbakestill». Lagres i `localStorage` (med
   try/catch og standardverdier som fallback).
5. **Oppdater:** sjekkliste per søk med Finn-lenke og status, importsiden,
   engangsoppsett av token og bokmerke.
6. **Metode:** tilbaketest, kilder og forklaringer.

## 11. Testing

- **TDD (Vitest)** for alt i `src/core/`: parse (mot ekte fikstur),
  importPayload (rundtur), merge (alle regler i §5), cost (hver post isolert,
  ladefordeling 0/25/100 %), valuation (syntetiske data med kjent fasit,
  krymping, gulv, usikkerhetsflagg), pickup, rank.
- **Ingest:** integrasjonstest med midlertidig katalog (inbox → data).
- **UI:** typecheck og bygg i CI. Manuell røyktest på iPhone Safari.

## 12. Oppsett brukeren gjør én gang

1. Opprette privat repo `toftoy/syvseterjakten` på GitHub.
2. Opprette Cloudflare-konto, Pages-prosjekt og Access-policy (egen e-post),
   og legge API-token og konto-id som secrets i repoet.
3. Lage fine-grained PAT (kun dette repoet, Contents: read/write) og lime
   den inn i dashbordet.
4. Installere bokmerket i Safari.

README beskriver alt dette steg for steg for mobil, i tillegg til
oppdaterings- og publiseringsflyten.

## 13. Arbeidsform

Små commits, én PR per fase i planen, som brukeren godkjenner fra mobil.
Spesifikasjonen og planen ligger midlertidig på grenen `syvseterjakten-spec`
i `toftoy/factory-hack--tor-t`, og flyttes til det nye repoet i første fase.
