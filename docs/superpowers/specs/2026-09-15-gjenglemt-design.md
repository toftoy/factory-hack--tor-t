# gjenglemt — design spec

Date: 2026-09-15
Status: approved by user, ready for implementation planning

## Problem

When a customer forgets a piece of clothing (e.g. at a hotel, gym, or
similar), staff often find a note left with it giving a name and phone
number. Today, contacting the owner means manually reading the note and
typing out a text message with photos attached. This is fiddly and easy
to get wrong (mistyped numbers, forgotten photos).

`gjenglemt` ("left behind") is a small mobile-web tool that speeds this
up: take a photo of the note and a photo of the garment, let the app
guess the name/phone from the note and the location from the photo, let
the staff member review and correct the guess, then hand off to the
phone's native Messages app with the photos and text pre-attached.

## Non-goals

- No accounts, no server-side storage, no database. Every session is
  ephemeral — nothing persists once the tab closes.
- No attempt to actually send the SMS programmatically (not possible
  from a web page) — the app prepares everything and hands off to the
  OS share sheet / Messages app, where the human sends it.
- No address extracted from the note itself — an address written on the
  note is the *owner's* home address, not where the item was found, and
  is not useful here.
- Not going for perfect OCR/geocoding accuracy — both are best-effort
  guesses that a human always reviews and can freely edit before
  sending. The tool optimizes the common case, not every edge case.

## Platform & architecture

Static, client-side-only Vite + TypeScript single-page app (no UI
framework — the app is a handful of linear screens, not worth a
framework's overhead). Lives in its own top-level folder `gjenglemt/`,
following the same repo convention as `rubiks-kube-solver/`: a
self-contained project with its own `package.json`, unrelated to the
hackathon content elsewhere in the repo.

Deploys as static files (e.g. GitHub Pages) — no backend, no server
component, no API keys to manage.

A minimal `manifest.json` + icon lets it be added to the home screen on
iOS/Android, echoing the original "shortcut" feel even though it's a
web app.

## Flow

### 1. Capture (sequential, single primary action)

The screen shows one prominent capture button at a time, labeled with
what it wants next:

1. "Ta bilde av lappen" (photo of the note) — required
2. "Ta bilde av plagget" (photo of the garment) — required
3. "Legg til et bilde til" (add another photo) — optional, appears
   after step 2, lets the user add a third photo (e.g. another angle of
   the garment) before moving on
4. "Gå videre" — becomes active once at least the two required photos
   exist

Each capture uses `<input type="file" accept="image/*"
capture="environment">`, which opens the native camera directly on both
iOS Safari and Android Chrome. The app tracks photos by role (note vs.
garment vs. extra) based on which step captured them — no manual
tagging by the user.

Known constraint: iOS Safari generally requires a real user gesture to
open the camera each time, so the app cannot auto-reopen the camera
without a tap. What *is* automatic is the app choosing which photo is
next and advancing the screen the instant a photo lands — the user
never has to say "this one is the note" — only the shutter action
itself needs a tap per photo.

### 2. Analyze (automatic, on advancing)

Runs entirely in the browser, no network calls except reverse geocoding
(see below):

- **OCR:** Tesseract.js (Norwegian language pack) runs on the note photo
  in a Web Worker.
- **Phone guess:** regex over the OCR text for an 8-digit Norwegian
  number, optionally prefixed with `+47` and/or containing spaces.
- **Name guess:** the first line of OCR text that isn't the matched
  phone number.
- **Location guess:** try EXIF GPS tags on the garment photo first (via
  a lightweight EXIF-reading library) — most phones embed this if
  location services were on for the camera. If no EXIF GPS is present,
  fall back to a live `navigator.geolocation` request. Either way, the
  resulting lat/lng is reverse-geocoded to a human-readable address via
  a single fetch to OpenStreetMap's Nominatim API — the only network
  call the app makes, and it only ever sends coordinates, never photos.

If any guess fails (no phone found, no location available at all), the
corresponding field is simply left blank for the user to fill in
manually — this never blocks the flow.

### 3. Confirm & edit (mandatory review)

A form, pre-filled with the guesses, shown before anything is shared:

- Navn (text)
- Telefon (tel, used as the share-sheet recipient hint where supported)
- Sted (text, the reverse-geocoded address or blank)
- Melding (textarea, pre-filled with the template below, fully
  editable)
- Thumbnails of all captured photos for a final visual check

Default message template:

```
Hei. Vi fant et gjenglemt plagg. Sted: [sted]. Navn: [Navn]
```

with `[sted]` and `[Navn]` substituted from the fields above as they're
edited (live preview).

This step is mandatory and cannot be skipped — OCR and geocoding are
guesses, and a human must confirm before anything is sent to a real
phone number.

### 4. Share

Primary path: `navigator.share({ files: [notePhoto, garmentPhoto, ...],
text })`, feature-detected via `navigator.canShare`. This opens the
native OS share sheet with the photos and message text pre-attached;
the user picks Messages (or WhatsApp, email, etc.) themselves — the app
never sends anything on its own.

Fallback (older/unsupported browsers, desktop): an `sms:`-link
pre-filled with the message text (no attachment support in this path),
plus explicit on-screen instructions and download buttons for each
photo so the user can attach them by hand.

## Privacy

Everything — photo capture, OCR, EXIF parsing — happens on-device.
Photos never leave the phone until the user explicitly shares them via
the OS share sheet. The one exception is reverse geocoding: only raw
lat/lng coordinates are sent to Nominatim, never photos, and only when
a location was actually found (EXIF or live GPS).

## Testing approach

This sandbox has no phone/browser to fully exercise camera capture, EXIF
reading on real photos, live geolocation, or `navigator.share` — those
need to be verified on an actual device after deployment, and the
implementation plan should say so explicitly rather than claim they're
verified.

What *can* be verified here:
- The app builds and the dev server serves it (Vite build/dev checks).
- The pure-logic pieces — phone/name extraction from OCR text, message
  template substitution, `sms:` link construction — are plain functions
  and get unit tests.
- Basic rendering of the app's screens can be smoke-tested headlessly
  (e.g. via Playwright against Chromium) for obvious breakage, while
  acknowledging camera/share/geolocation interactions themselves are
  out of reach in this environment.

## Repo layout

```
gjenglemt/
  README.md          — what it is, how to run/build/deploy, device caveats
  package.json
  vite.config.ts
  index.html
  public/
    manifest.json
    icon-*.png
  src/
    main.ts           — screen flow/state machine
    capture.ts         — sequential photo capture logic
    ocr.ts              — Tesseract.js wrapper
    extract.ts          — phone/name regex extraction (unit-tested)
    location.ts         — EXIF read + geolocation fallback + Nominatim call
    share.ts            — navigator.share + sms: fallback (unit-tested where pure)
    template.ts          — message template substitution (unit-tested)
    styles.css
  src/*.test.ts        — unit tests for extract/template/share-link logic
```
