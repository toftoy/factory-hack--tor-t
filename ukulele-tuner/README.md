# Ukulele-stemmer

Et stemmeapparat for ukulele som kjører i nettleseren og bruker mikrofonen på telefonen.
Det hører hvilken tone som spilles, viser avviket i cent på en viser og sier om strengen må
strammes (for lav) eller slakkes (for høy).

Stemninger: standard GCEA (høy G), lav G, D-stemning (ADF#B), baryton (DGBE),
slack key (GCEG) og B-stemning (F#BD#G#).

## Bruk på telefonen

Mikrofonen virker bare over **https**. Enklest er GitHub Pages:

1. Gå til repoet på GitHub og åpne **Settings → Pages**.
2. Under *Build and deployment* velger du **Deploy from a branch** og så branchen med
   denne mappen (f.eks. `main`), mappe `/ (root)`.
3. Åpne `https://<bruker>.github.io/<repo>/ukulele-tuner/` på telefonen og trykk **Start mikrofon**.

## Filer

- `index.html` – appen (grensesnitt, mikrofon, referansetone)
- `pitch.js` – tonehøydedeteksjon (YIN-algoritmen) og notehjelpere
- `pitch.test.js` – tester: `node ukulele-tuner/pitch.test.js`
