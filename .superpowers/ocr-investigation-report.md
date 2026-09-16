# gjenglemt OCR accuracy investigation

Branch: `claude/gjenglemt-project-422937`
Scope: `gjenglemt/src/ocr.ts`, `gjenglemt/src/extract.ts`, `gjenglemt/src/main.ts`, `gjenglemt/src/extract.test.ts`

---

## 1. Summary

The app failed to read pre-printed name stickers because **the full-resolution phone
photo was handed to Tesseract unchanged**. At 3000-4000px, a photo's sensor grain,
JPEG artefacts and background texture read as text to Tesseract's binariser, and the
real label gets buried in hundreds of noise "words". The already-shipped
`PSM.SINGLE_BLOCK` change made this strictly worse, because it forces every one of
those noise blobs into a single text block.

The fix is preprocessing before recognition — downscale the photo to ~1280px and
flatten it to grayscale on a canvas — plus `PSM.SPARSE_TEXT` instead of
`SINGLE_BLOCK`, a small ladder of fallback passes, and a rewrite of `extract.ts`
that anchors the name on the phone number instead of taking "the first line".

Measured end to end on a 36-image test set: **phone number correct 35/36 (0 cases
where no number was found at all), name exact 33/36**, against a reproduced
baseline of **0/8 on the same kind of images**. Recognition is also 7-10x faster,
which is what makes the new 5s deadline achievable.

**Architecture conclusion: client-side Tesseract is sufficient. A server-side vision
API is not needed and I did not add one.** Reasoning in section 8.

---

## 2. How I investigated

Tesseract.js runs in Node, so the whole investigation was empirical. Scratch harness
(not committed) lived in
`/tmp/claude-0/-home-user-factory-hack--tor-t/fda15333-f876-590b-8217-1a2737046316/scratchpad/ocrlab/`:

| script | what it does |
| --- | --- |
| `crop.mjs`, `gen*.mjs` | build test images from the uploaded screenshots + synthetic labels |
| `run.mjs` | resolution x PSM sweep |
| `matrix.mjs`, `matrix2.mjs` | preprocessing matrix (scale x grayscale x contrast x PSM) |
| `pipeline.mjs`, `pipeline2.mjs` | end-to-end pass-ladder simulation, confidence thresholds |
| `eval.mjs` | final 36-image evaluation against the real compiled `extract.ts` |

The Norwegian language model had to come from npm (`@tesseract.js-data/nor`) because
`cdn.jsdelivr.net` is blocked by this sandbox's egress policy. That is a sandbox
constraint only — real browsers fetch it from the CDN as before.

### Test images

The uploaded files are screenshots of the phone showing the app, so the note photo in
them is a small recompressed thumbnail, not the photo Tesseract actually received. I
used them as the *content* source and then reconstructed realistic camera conditions
around them:

- `A_note_full` — the real sticker photo cropped out of `b9f6225f-image.jpg`
  (521x874). Ground truth `Anne/Nils Toftøy` / `47239791`.
- `res_*` — the same scene at 521 / 1042 / 1563 / 2084 / 3024px, to isolate resolution.
- `hard_full3to4`, `far_0.5/0.3/0.18` — 3024x4032 frames with the sticker at
  decreasing fractions of the frame (the app's thumbnail is `object-fit: cover`, so
  the real photo is wider than the thumbnail shows).
- `noisy_*` — the above plus simulated sensor noise, in-camera sharpening and 4:2:0
  JPEG. **This is what reproduced the reported bug** (see 3.2).
- `adv_*` — dark, bright, low contrast, defocus blur, 7 deg and 12 deg camera tilt,
  EXIF-orientation-6 portrait, and 90 deg rotated with no EXIF tag.
- `real_B_big` — the second, blurrier real test photo (`2b52c668`) at photo scale.
- `syn_s1..s4 x near/far/blur/skew` — 16 synthetic lappeliten-style stickers with
  four *different* names and numbers (`Kari Nordmann/98765432`,
  `Ida Marie Hauge/91234567`, `Ola/23456789`, `Emil/Sofie Bjørkhaug/47058812`),
  composited small into 3024x4032 noisy frames. These exist purely to check the fix
  is not overfitted to the one real label.

I did **not** get to run the real browser path: `playwright-core install chromium`
is blocked by the egress policy. See section 7 for what that leaves unverified.

---

## 3. What I measured

### 3.1 The cropped thumbnail alone does not reproduce the bug

Running the shipped config (`PSM.SINGLE_BLOCK`, `nor`) on the cropped thumbnails:

```
img/A_note_full.png     conf 47  ">\nps i —\n! Anne/Nils\nToftøy\n47239791\nAA\n; å\n"
img/A_sticker_tight.png conf 60  "É Anne/Nils\nToftøy\npi 47239791\n"
img/B_note_full.png     conf 59  ">\nAnne/Nils\nToftøy\n47239791\n"
```

It works. So resolution/noise, not the label itself, had to be the variable.

### 3.2 Resolution is the variable — and `SINGLE_BLOCK` collapses first

Same scene, same content, different pixel sizes:

```
psm=3  (AUTO)          res_521   phone=YES   "Anne/Nils | Toftøy | 47239791"
psm=3                  res_2084  phone=YES   "Anne/Nils | Toftøy | 47239791"
psm=3                  res_3024  phone=YES   "A | nne/Nils | Toft | Øy | 47239791 | re"
psm=6  (SINGLE_BLOCK)  res_521   phone=YES   "SS | - si å —= | i Anne/Nils | Toftøy | 47239791 | bh."
psm=6                  res_1563  phone=no    "+ | — | F— | Sy | bade nd — | EAR ANY 0] | 790. 5 hs. bli - | Anne/Nils | % Eg ip | 4) £ påle | ..."
psm=6                  res_2084  phone=no    "4 | pe | NN | TG | > | 4 1an 35% : RE : : | Anne / Nil | 3 su AN f å y | 4! | £ pk | MTRAN GN | ..."
psm=6                  res_3024  phone=no    "- 2 | ø. ) | NN | Wo» | je | - å åå > | sear * $' øm | BE AES AR 84 - > | ... | A /Nil | ..."
psm=11 (SPARSE_TEXT)   res_3024  phone=YES   "gå | LA | NN | å | bo | — | "SE | Li p | ms å | pe | Anne/Nils | Toftøy | 47239791 | gh | Ber | ..."
```

**`PSM.SINGLE_BLOCK` — the fix that was already shipped — is the thing that broke at
real photo resolution.** Note the shape of its output: exactly the "hallucinated
garbage name, no digits anywhere" the user reported.

### 3.3 Adding realistic sensor noise reproduces the original bug too

The upscaled screenshot is smoother than a real camera file. With simulated grain +
sharpening + 4:2:0 JPEG, `PSM.AUTO` (the *original* config) fails as well:

```
psm=3   noisy_hard.jpg     conf 50   1994ms  phone=no  "DN | 3: | - eo | pp | << |"
psm=3   noisy_hard_hi.jpg  conf 79   1517ms  phone=no  "ae |"
psm=6   noisy_hard.jpg     conf 28  14523ms  phone=no  "KE en » | AN | Me | 4 | lan | Ga BE le. RR | ..."
psm=6   noisy_hard_hi.jpg  conf 19  34454ms  phone=no  "> 2 LENE | ; MØ | > PR | NE | 200 RR DR OE Re | ..."
psm=11  noisy_hard.jpg     conf 23   2771ms  phone=no  "ommiener | åre | mm | å | i | - | se | æ | j | pa | at | ..."
```

That is the reported failure, reproduced: garbage name, phone field empty, both with
the original config and with the shipped "fix". Also note **14.5s and 34.5s** — on top
of everything else, `SINGLE_BLOCK` on a noisy full-res photo is far too slow for the
new 5s budget on its own.

### 3.4 Preprocessing matrix — downscaling is the lever

8 images, grayscale on, `user_defined_dpi=300`:

| longest edge | contrast stretch | PSM | phone | name | avg |
| --- | --- | --- | --- | --- | --- |
| original | no | 3 | 6/8 | 6/8 | 1283ms |
| original | no | 11 | 7/8 | 7/8 | 1908ms |
| 2000 | no | 11 | 7/8 | 8/8 | 399ms |
| 1600 | no | 11 | 7/8 | 8/8 | 270ms |
| **1280** | **no** | **11** | **8/8** | **8/8** | **198ms** |
| 1280 | yes | 11 | 8/8 | 8/8 | 192ms |
| 1280 | no | 3 | 6/8 | 6/8 | 154ms |
| 1000 | no | 11 | 6/8 | 6/8 | 129ms |
| 800 | no | 11 | 6/8 | 6/8 | 84ms |

Downscaling improves accuracy **and** is 7-10x faster. Below ~1100px the text loses
too much detail.

### 3.5 Fine matrix on the 17-image adverse set

| config | phone | name | avg |
| --- | --- | --- | --- |
| dim=1280 norm=0 psm=11 | 14/17 | 16/17 | 217ms |
| dim=1440 norm=0 psm=11 | 14/17 | 16/17 | 256ms |
| dim=1100 norm=0 psm=11 | 14/17 | 15/17 | 186ms |
| dim=1280 norm=1 psm=11 | 13/17 | 15/17 | 214ms |
| dim=1600 norm=0 psm=11 | 13/17 | 15/17 | 341ms |
| dim=1280 norm=0 psm=3  | 12/17 | 12/17 | 165ms |
| dim=1600 norm=0 psm=3  | 11/17 | 11/17 | 231ms |

Conclusions taken from this:

- **`PSM.SPARSE_TEXT` > `PSM.AUTO`** consistently (14 vs 12). Sparse-text mode looks
  for text scattered anywhere with no page structure assumed — exactly "a small label
  somewhere in a photo".
- **A global contrast stretch makes things slightly worse** (13 vs 14). On a photo
  with a bright background it mostly amplifies grain. So the shipped code does *not*
  normalise; it only converts to luminance.
- `adv_exif6` (portrait photo stored rotated with an orientation tag) passes **only
  because the preprocessing step applies EXIF orientation**. `adv_rot90_noexif` fails
  in every single-pass config — Tesseract cannot read sideways text in sparse-text
  mode, which has no orientation detection.
- 12 deg camera tilt defeats Tesseract's own deskew.

The last two points are why the shipped code has a fallback ladder rather than one pass.

### 3.6 Word confidence filtering — measured and rejected

Tesseract's per-word confidence separates label text from noise very cleanly
(`"Anne/Nils"@90 "Toftøy"@92 "47239791"@96` vs `"|"@26 "LAR"@23 "ae"@22`), so I
tested rebuilding the text from high-confidence words only:

```
minConf=0   phone-correct 35/36  phone-WRONG 0/1  name-exact 33/36
minConf=35  phone-correct 34/36  phone-WRONG 2    name-exact 33/36
```

It did not help once `extract.ts` handled noise properly, and it introduced an extra
wrong number. **Not adopted** — the simpler code measured better.

### 3.7 Final end-to-end evaluation (36 images, shipped pipeline + shipped `extract.ts`)

```
phone-correct 35/36   phone-WRONG 1   phone-missing 0   name-exact 33/36
first-pass-hits 29/36
latency  median 354ms   p90 1140ms   max 2634ms      (Node, 7-pass worst case)
```

Per image:

```
noisy_hard.jpg        pass1 47239791 ok   "Anne/Nils Toftøy"       ok
noisy_hard_hi.jpg     pass1 47239791 ok   "Anne/Nils Toftøy"       ok
noisy_far03.jpg       pass1 47239791 ok   "Anne/Nils Toftøy"       ok
noisy_far018.jpg      pass1 47239791 ok   "Anne/Nils Toftøy"       ok
hard_full3to4.jpg     pass1 47239791 ok   "Anne/Nils Toftøy"       ok
far_0.3.jpg           pass1 47239791 ok   "Anne/Nils Toftøy"       ok
far_0.18.jpg          pass1 47239791 ok   "Anne/Nils Toftøy"       ok
res_3024_q80.jpg      pass1 47239791 ok   "Anne/Nils Toftøy"       ok
adv_dark.jpg          pass1 47239791 ok   "Anne/Nils Toftøy"       ok
adv_bright.jpg        pass1 47239791 ok   "Anne/Nils Toftøy"       ok
adv_lowcontrast.jpg   pass1 47239791 ok   "Anne/Nils Toftøy"       ok
adv_blur.jpg          pass2 47239791 ok   "Anne/Nils Toftøy"       ok
adv_skew7.jpg         pass1 47239791 ok   "Anne/Nils Toftø"        OCR dropped final y
adv_skew12.jpg        pass4 47239791 ok   "Anne/Nils Toftøy"       ok
adv_exif6.jpg         pass1 47239791 ok   "Anne/Nils Toftøy"       ok
adv_rot90_noexif.jpg  pass6 47239791 ok   "Anne/Nils Toftøy"       ok
real_B_big.jpg        pass1 47239791 ok   "Anne/Nils Toftøy"       ok
res_3024.jpg          pass2 47239791 ok   "Anne/Nils Toftøy"       ok
res_2084.jpg          pass1 47239791 ok   "Anne/Nils Toftøy"       ok
res_1563.jpg          pass1 47239791 ok   "Anne/Nils Toftøy"       ok
syn_s1_near.jpg       pass1 98765432 ok   "Kari Nordmann"          ok
syn_s1_far.jpg        pass1 98765432 ok   "Kari Nordmann"          ok
syn_s1_blur.jpg       pass1 98765432 ok   "Kari Nordmann"          ok
syn_s1_skew.jpg       pass5 98765432 ok   "Kari Nordmann"          ok
syn_s2_near.jpg       pass1 91234567 ok   "Ida Marie Hauge"        ok
syn_s2_far.jpg        pass1 91234567 ok   "Ida Marie Hauge"        ok
syn_s2_blur.jpg       pass1 91234567 ok   "Ida Marie Hauge"        ok
syn_s2_skew.jpg       pass1 91234567 ok   "Ida Marie"              OCR read "Hauge" as "auge"
syn_s3_near.jpg       pass1 23456789 ok   "Ola"                    ok
syn_s3_far.jpg        pass2 23456789 ok   "Ola"                    ok
syn_s3_blur.jpg       pass1 23456789 ok   "Ola"                    ok
syn_s3_skew.jpg       pass1 23456789 ok   "Ola"                    ok
syn_s4_near.jpg       pass1 47058812 ok   "Emil/Sofie Bjørkhaug"   ok
syn_s4_far.jpg        pass1 47058812 ok   "Emil/Sofie Bjørkhaug"   ok
syn_s4_blur.jpg       pass1 47058812 ok   "Emil/Sofie Bjørkhaug"   ok
syn_s4_skew.jpg       pass2 47058815 BAD  "Emil/Sofje Bjørkhay"    last digit 2 read as 5
```

All three name misses and the one wrong number are **character-level OCR errors**, not
extraction-logic errors. There are no remaining cases of "found nothing at all".

---

## 4. Root cause

**Primary:** the raw camera `File` went straight into `Tesseract.recognize()` with no
preprocessing. At 3000-4000px the photo's high-frequency content — sensor noise, JPEG
artefacts, leather/fabric texture, blurred background — is indistinguishable from text
to Tesseract's binariser and page-layout analysis, so the actual label, which occupies
a few percent of the frame, is lost among the noise. Evidence: section 3.2 and 3.3 —
identical scene content succeeds at 500-2000px and fails at 3000px+ once realistic
grain is present.

**Aggravating (the previous fix):** `PSM.SINGLE_BLOCK` tells Tesseract the entire image
is one uniform block of text, which forces all of that noise into the same block and
destroys line segmentation completely. It measured strictly worse than the original
`PSM.AUTO` and 5-20x slower. This is why the previous deploy did not help.

**Secondary (independent, and it would have bitten even with perfect OCR):**
`extractNameAndPhone` took "the first non-phone line" as the name. In sparse photo OCR
the first line is almost always a background noise fragment. The reported name value
`"pass"` is exactly this — a noise line picked ahead of the correctly-read label.

---

## 5. What changed

### `gjenglemt/src/ocr.ts` — rewritten

1. **Canvas preprocessing before recognition.** The `File` is decoded through an
   `<img>` element (which is what applies the photo's EXIF orientation tag — required,
   see 3.5), downscaled towards a target longest edge, and converted to grayscale
   by hand with a luminance loop.
2. **Progressive halving on the way down.** One `drawImage` from 3024px to 1280px asks
   the browser for a 2.4x reduction in a single filter step and the quality of that
   varies by engine; halving at most 2x per step keeps every step inside what canvas
   filtering handles well. (Defensive — I could not measure browser filtering directly.)
3. **`PSM.SPARSE_TEXT` replaces `PSM.SINGLE_BLOCK`**, plus `user_defined_dpi: '300'`
   (Tesseract's own DPI guess swung between 256 and 416 across the test set, which
   changes its internal text scaling).
4. **A fallback pass ladder**, tried in order, stopping at the first pass the caller
   accepts: `1280 upright` (the measured best single config, so the normal case is one
   pass), then `1600`, `1000`, `+12 deg`, `-12 deg`, `+90 deg`, `+270 deg`. Each entry
   targets a specific measured failure — different photos fail at different scales;
   Tesseract's deskew gives up past ~10 deg; sparse-text mode cannot read sideways text
   at all if the EXIF orientation tag is missing or wrong.
5. **The worker is now a module-level singleton with `warmUpOcr()`**, instead of being
   created and terminated per call. First use costs a ~2.5MB language model plus a
   ~2.9MB WASM core download; previously that was paid *inside the critical path*, after
   the user tapped through. See section 6.
6. Per-pass `try`/`catch`, so one failing pass does not discard the passes that worked.

`runOcr(file, { accept })` — `accept` is supplied by the caller so that `ocr.ts` stays
ignorant of names and phone numbers, preserving the module boundary.

### `gjenglemt/src/extract.ts` — rewritten

Sanity-checking it against real OCR output showed it was not fit for sparse photo text,
so the heuristics were rebuilt around the phone number as the anchor:

- **Phone is found first and used to locate the name.** The number is the only thing in
  the text with a hard checkable shape, so it is the reliable anchor. The name is then
  read off the lines adjacent to the phone line — on a printed name sticker the name
  sits directly above (or below) the number. This is what kills the `"pass"` failure.
- **Two-line names are joined** (`Anne/Nils` + `Toftøy` -> `Anne/Nils Toftøy`), which
  the real label needs and the old code could never produce.
- **Name and number on one recognised line are split** (`Anne/Nils Toftøy 47239791`).
- **Speckle lines are dropped up front** — a line with fewer than 3 letters and no
  digits. Measured: a stray `.` or `oe` lands *between* the two name lines often enough
  to split them and cost half the name (fixing this took name-exact from 29/36 to 33/36).
- **Name-likeness is shape-based** (capitalised word, >=3 letters, high letter ratio, no
  digits) rather than dictionary-based, so any name works — but it rejects the lowercase
  fragments sparse mode invents.
- **Phone parsing hardened:** `.`/`-`/`/` and non-breaking space separators as well as
  spaces; `+47` and `0047` prefixes; a bare 8-digit number starting `47` is *not*
  treated as a country code (the real test label is `47239791` — the old code got this
  right and it needed to stay right); numbers starting 2-9 are preferred over
  implausible runs like a date; and a conservative digit-lookalike repair pass
  (`O`->`0`, `I`->`1`, `S`->`5`, `B`->`8` ...) that only fires when nothing was found and
  only inside tokens that are already >=60% digits, so it cannot turn a word into a
  number.

`extract.test.ts` grew from 5 to 18 tests, including the real sparse-OCR noise pattern
captured from the harness.

### `gjenglemt/src/main.ts` — early kickoff and the 5s deadline

Section 6.

---

## 6. Early-kickoff timing design and expected latency

**Before:** nothing started until the user tapped "Gå videre" after both photos. On a
cold cache that meant a ~5.5MB download (WASM core + Norwegian model) *plus* 2-35s of
recognition, all after the last shutter.

**Now:**

- `warmUpOcr()` is called at app start, on first paint. The worker and its model
  download while the user is still on the capture screen. (Tesseract.js caches the
  model in IndexedDB, so only the first ever session pays this.)
- OCR starts the moment the note photo lands in `state.photos`, from the file input's
  `change` handler — so it overlaps the user taking the *second* photo.
- The location lookup got the same treatment: it starts when the garment photo lands.
- `state.lastCaptureAt` records the most recent shutter, whichever photo it was — so
  this is robust to ordering and to the optional third "extra" photo (which gets no OCR).
- `analyze()` no longer starts any work. It picks up the already-running promises and
  gives them only `5000ms - (now - lastCaptureAt)` more. Both OCR and location share
  that one budget, so **the confirm screen appears at most 5s after the last shutter**.
  (Capping location was necessary: it was previously 15s and gated the same
  `Promise.all`, so leaving it alone would have broken the requirement.)
- If the deadline cuts the pass ladder short, `analyze()` falls back to the best text
  from the passes that *did* finish (`PendingOcr.partial()`), rather than to nothing.

Screen flow (capture -> analyzing -> confirm), the mandatory confirm step, and all UI
text are unchanged.

**Expected latency.** Node measurements: median 354ms, p90 1140ms, max 2634ms.
Browser WASM on a phone is typically 1.5-3x slower than Node on this hardware, so
expect roughly **0.5-1.5s typical and 4-8s for the rare full 7-pass ladder**. Since OCR
starts at the note shutter and the user then spends time framing and taking the garment
photo, the work in flight at the last shutter is usually already finished. 29 of 36 test
images answered on the first pass.

I want to be explicit that the browser-side latency figure is an extrapolation, not a
measurement — see below.

---

## 7. Verification

```
$ npm run build
> tsc && vite build
vite v8.3.0 building client environment for production...
transforming...
✓ 35 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.59 kB │ gzip:  0.33 kB
dist/assets/index-yQmJz8Nf.css    0.74 kB │ gzip:  0.39 kB
dist/assets/index-C-oiPqDS.js   104.62 kB │ gzip: 38.17 kB
✓ built in 100ms

$ npx vitest run
 RUN  v5.0.1 /home/user/factory-hack--tor-t/gjenglemt
 Test Files  5 passed (5)
      Tests  42 passed (42)
   Start at  22:41:11
   Duration  2.34s

$ node eval.mjs      # 36 images, shipped pass ladder + compiled extract.ts
phone-correct 35/36   phone-WRONG 1   phone-missing 0   name-exact 33/36
first-pass-hits 29/36
latency median 354ms   p90 1140ms   max 2634ms
```

`tsc --noEmit` clean. No changes to `location.ts`, `share.ts`, `template.ts`,
`capture.ts`, or the confirm/capture UI beyond the OCR wiring.

### What is NOT verified

- **The browser code path was never executed.** `playwright-core install chromium` is
  blocked by this sandbox's egress policy, so there is no headless browser here. The
  Node harness models the pipeline with `sharp` (EXIF rotate -> resize -> greyscale)
  rather than with real canvas calls. The algorithm and all parameter choices are
  measured; the specific canvas/`<img>` code that implements them in the browser is
  reviewed and typechecked but not run. **This is the single biggest thing worth
  checking on the real device first.** If something is wrong there it will most likely
  show up as OCR returning nothing at all rather than as degraded accuracy.
- Downscale filtering differs between `sharp` (lanczos3) and canvas. Progressive
  halving was added specifically to narrow that gap, but it is insurance, not a
  measurement.
- Real-device latency, as above.

---

## 8. Architecture decision: staying client-side

The constraint was lifted and a server-side vision API was explicitly allowed. I
still recommend against it, on the evidence:

- Client-side now reaches **35/36 phone, 0 "found nothing", 33/36 exact name** across
  noise, distance, blur, under/over-exposure, low contrast, tilt, rotation and four
  different labels. That is not "barely working" — the remaining errors are single
  characters on deliberately degraded images.
- It stays free, private (photos never leave the phone), needs no secret, no backend,
  no serverless account, and keeps GitHub Pages as the whole deployment.
- A vision LLM would very likely be more robust on the long tail (glare on laminated
  stickers, heavy motion blur, extreme angles). But it needs a serverless proxy to hold
  the API key, which **I cannot provision from here** — it would require a Cloudflare /
  Vercel / Netlify account the operator owns. Shipping a half-wired API path would add
  an untested failure surface against my own evidence.
- Latency would also need care: a 3MB photo over mobile data plus inference is
  realistically 3-8s, so the image would have to be downscaled client-side first
  anyway — i.e. the preprocessing in this change is a prerequisite for that route too,
  not an alternative to it.

**If the operator does want the vision-API route later**, the shape is:
a Cloudflare Worker (or equivalent) that accepts a POSTed JPEG, calls a vision model
with a "return JSON {name, phone}" prompt, and returns the JSON; the client reads the
endpoint from a build-time `VITE_OCR_API_URL` and falls back to the existing Tesseract
path when it is unset or the call fails. The manual step that blocks it is provisioning
the account and the API key. The `runOcr(file, { accept })` boundary is already the
right seam to slot it into.

---

## 9. Honest assessment of remaining risk

- **The browser path is unexecuted** (section 7). Highest-priority real-device check.
- **My test set is reconstructed, not collected.** The noise, blur and tilt are
  simulated; 16 of the 36 images are synthetic labels rendered in Liberation Sans, not
  photographs of real lappeliten stickers. The one real sticker appears in many
  variants, so the *real*-photo sample size is genuinely 2. I would not claim the 97%
  number transfers verbatim to real use — treat it as "this class of failure is fixed",
  not as a calibrated accuracy estimate.
- **Untested real-world conditions:** specular glare on glossy laminated labels, a label
  on curved or wrinkled fabric, heavy motion blur combined with low light, partial
  occlusion, and handwritten rather than printed labels (this fix does nothing for
  handwriting).
- **Wrong numbers are still possible**, and the pipeline stops at the first pass that
  produces any valid 8-digit number, so a confidently-wrong digit is not cross-checked.
  One occurred in evaluation (`47058812` read as `47058815`). The mandatory confirm
  screen is the mitigation, and it remains genuinely load-bearing — this fix makes the
  fields usually right, it does not make them trustworthy without review.
- **Worst-case latency is an extrapolation.** If real-device recognition is slower than
  the 1.5-3x assumed, the 7-pass ladder could hit the 5s deadline; the partial-result
  fallback degrades that to "the best pass so far" rather than to empty, but it is a
  degradation. If the operator sees this, the cheap lever is shortening `PASSES`.
- The worker now lives for the session instead of being terminated per call, which
  holds WASM memory (tens of MB) for the life of the page. On a single-use flow like
  this that is a good trade for not re-downloading the model, but it is a change.

---
---

# Round 2 — sideways label on a bottle (still broken after the first fix)

The round-1 fix went live and the operator retested on their iPhone. Still broken:
Name `"— - Be År oi"`, Phone empty. New evidence image: a lappeliten sticker stuck on
a **curved translucent bottle/tube, with the text running vertically in the frame**.

## 10. What actually went wrong — two real bugs, and it was not the timeout

The working hypothesis handed to me was that the 5s deadline truncated the pass
ladder before it reached the `[90, 270]` rotation fallbacks at positions 6 and 7.
That is a reasonable reading, and the ladder ordering was genuinely bad, but it is
**not** what produced this output. Running the shipped ladder against the new image
shows both real causes directly:

```
img/C_bottle.png   (shipped round-1 ladder, per pass)
dim=1280 rot=   0  conf= 91  "||"
dim=1600 rot=   0  conf= 24  "pb.|||"
dim=1000 rot=   0  conf= 42  "mm å|"
dim=1280 rot=  12  conf= 48  "||> nå|NÆR|ot|Ka|"
dim=1280 rot= -12  conf= 30  "3|ÆR SNE|—&|"
dim=1280 rot=  90  conf= 82  "Anne/Nils|Toftøy|— —|"      <-- correct orientation
dim=1280 rot= 270  conf= 47  "— ——|RØøyol|SjIN/auuy|"
```

### Bug A — the fallback tie-break actively selected the worst pass

When no pass satisfies `accept`, round-1 `runOcr` returned **the longest text**.
Look at the two candidates: the correct rot=90 pass produced 22 characters of clean
text, and the mirrored garbage rot=270 pass produced 23. **The garbage wins by one
character.** Even when every pass ran, the user was shown noise while a perfectly
good `"Anne/Nils Toftøy"` sat in the discarded candidates. `"— - Be År oi"` is that
tie-break, not a timeout.

Tesseract's own word confidences separate these cleanly:

```
dim=1280 rot=  90  SCORE=15  kept=[Anne/Nils@90 Toftøy@91]
every other pass  SCORE= 0  kept=[]
```

So passes are now ranked by **summed length of confident (>=60), substantial (>=3
char) words**, not by text length.

### Bug B — the number was lost to low contrast, not to orientation

Note that even at the correct orientation the digit row came back as `"— —"`. These
labels are dark grey on pale mint, here on a white translucent bottle; the bold name
survives and the thinner digits do not. A fixed contrast boost recovers them at
every scale tried:

```
psm=11 dim= 800 plain  conf=78  "Anne/Nils|Toftøy|— —|"
psm=11 dim= 800 gamma  conf=84  "å Anne/Nils|Toftøy|47239791|"
psm=11 dim=1280 plain  conf=54  "hø|Anne/Nils|Toftøy|rå|— ——|—|"
psm=11 dim=1280 gamma  conf=81  "Anne/Nils|Toftøy|47239791|"
psm=11 dim=1800 gamma  conf=81  "Anne/Nils|Toftøy|47239791|"
psm=11 dim=2400 gamma  conf=80  "Anne/Nils|Toftøy|47239791|"
```

(`gamma` = fixed gain 1.8, bias -60. This is *not* the `normalise()` histogram
stretch measured and rejected in round 1 — that is driven by outliers and mostly
amplifies grain. Different operation, opposite result.)

**So this photo would have failed even with an unlimited time budget.** Reaching
pass 6 would have produced the right name and still no number.

## 11. Contrast: measured as a default, rejected as a default

Tempting to just apply the boost everywhere. Measured over 34 images, single pass at
1280px:

| preprocessing | phone correct | wrong | none | avg |
| --- | --- | --- | --- | --- |
| plain | 29/34 | 0 | 5 | 369ms |
| gain 1.4 / bias -35 | **31/34** | 0 | 3 | 368ms |
| gain 1.8 / bias -60 | 25/34 | 1 | 8 | 362ms |
| gain 2.2 / bias -90 | 22/34 | 1 | 11 | 353ms |
| CLAHE (local adaptive) | 26/34 | 2 | 6 | 800ms |

The gentle 1.4 gain looked like a free win on phone numbers — but running the whole
pipeline with it showed it eating the first letter of names (`"ari Nordmann"`,
`"nne/Nils Toftøy"`), dropping name-exact from 33 to 32 and doubling wrong numbers.
The strong 1.8 gain that the bottle needs blows out normally-exposed photos.

So the boost is **one fallback pass**, never the default. It can then only ever add
recoveries. CLAHE was rejected outright: worse *and* 2.2x slower.

## 12. Orientation: a cheap probe instead of brute force

Sideways labels are evidently a real case, not an edge case — the sticker is wrapped
around a bottle. But full passes at 90 and 270 are expensive, and in round 1 they sat
at positions 6 and 7 where the budget may never reach them.

Recognition cost scales with pixel count, so a **640px probe is ~4x cheaper than a
full pass** and only has to answer "which way up?", not read the label. Scoring the
probes with the same confident-word measure picks the orientation reliably.

Ordering matters as much as the probe. Probing first costs every ordinary upright
photo three recognitions before any real work. Running the single best configuration
first instead, and only probing when it fails, makes the common case one recognition:

| pipeline | phone correct | wrong | missing | name exact | median recognitions | one-shot |
| --- | --- | --- | --- | --- | --- | --- |
| round-1 shipped ladder | 35/36 old set, **0/2 bottle** | 1 | 0 | 33/36 | 1 | 29/36 |
| probe-first, gain 1.4 default | 38/42 | 2 | 2 | 32/42 | 4 | — |
| probe-first, plain + boost fallback + score gate | 41/42 | 1 | 0 | 36/42 | 4 | — |
| **primary pass first, then probe** | **41/42** | **1** | **0** | **37/42** | **1** | **28/42** |

## 13. Wrong numbers: a score gate

The probe-first variant produced two *wrong* phone numbers (`16165824`, `47259751`)
on passes that had read nothing but background. A wrong number is the worst failure
mode here — it looks plausible and invites the user to accept it.

A pass's result is now only taken if its confident-word score clears 8. A pass that
genuinely read the number scores at least the number's own 8 characters, while pure
noise scores 0, so this rejects fabricated numbers without rejecting real reads. It
removed both wrong numbers.

## 14. Final pipeline and results

```
1. primary    1280px, upright, plain          <- 28/42 stop here
2. probe       640px, +90                     } only if 1 failed
3. probe       640px, -90 (270)               }
4..8 refine at the winning orientation:
     1600px plain | 1280px contrast-boosted | 1000px plain | +12 deg | -12 deg
result = first accepted pass, else the highest-scoring pass
```

42 images (round-1 set + 2 bottle crops + 4 high-resolution sideways cases):

```
phone-correct 41/42   WRONG 1   missing 0   name-exact 37/42
recognitions: median 1   p90 4   max 8   one-shot 28/42
time (Node): median 368ms   p90 1360ms   max 3018ms
```

Both bottle cases now resolve to `47239791` / `Anne/Nils Toftøy` (6 recognitions,
orientation 90). All four sideways cases resolve. `adv_skew12`, which regressed in
an intermediate variant, is correct again. The single remaining wrong number
(`syn_s4_skew`, last digit 2 read as 5) is a pre-existing character-level misread on
a deliberately skewed synthetic.

## 15. The 5s budget, honestly

I still cannot measure browser WASM latency — `playwright-core install chromium` is
blocked by this sandbox's egress policy, as in round 1. So rather than guess a
multiplier, here is what is known and what is not:

- **Known:** the common case is now **one recognition** rather than up to seven, and
  the work that used to be needed at pass 6 now happens at pass 2-3. Whatever the
  mobile multiplier turns out to be, the budget buys several times more coverage
  than it did.
- **Known:** a deadline hit no longer means empty fields. The partial fallback picks
  the best-scoring completed pass, and that ranking is the round-2 fix — so a
  truncated ladder now yields the best real reading so far instead of the noisiest.
- **Not known:** actual per-pass wall-clock on the device. If a 1280px pass costs
  ~2s on the phone, the one-shot case comfortably fits 5s and the 8-pass worst case
  does not — it would rely on the early kickoff overlap plus the partial fallback.
- **Not changed:** I have deliberately **not** moved the 5s number. Changing a budget
  on the strength of another extrapolation is the mistake that produced this round.
  The instrumentation below is there to replace the extrapolation with a measurement,
  and if it shows 5s is not achievable, that is a decision to take with real numbers
  and the operator's sign-off.

## 16. TEMPORARY on-device diagnostics (`?debug=1`)

**This is a temporary diagnostic aid, to be removed once the on-device bottleneck is
understood.** It is marked `TEMPORARY DIAGNOSTIC` at every site:

- `src/ocr.ts` — `OcrPassReport`, the `onPass` option, and the `stage` field.
- `src/main.ts` — the `DEBUG` flag, the `diagnostics` state, `renderDebugPanel()`,
  and its one call site on the confirm screen.
- `src/styles.css` — the `.debug-panel` rules.

Visiting <https://toftoy.github.io/factory-hack--tor-t/?debug=1> and completing the
normal flow adds a collapsed **Debug** panel at the bottom of the confirm screen,
with a "Kopier debug" button. Without `?debug=1` nothing changes. It reports:

```
deadlineHit=<bool>  budget=<ms>  waited=<ms>
passes=<n>  ocrTime=<ms>  noteShutter->ocrDone=<ms>  noteShutter->lastShutter=<ms>
ua=<user agent>

1. pass  dim=1280 rot=0  <ms> score=<n> conf=<n> ok=<bool> :: "<first 120 chars>"
2. probe dim=640  rot=90 <ms> score=<n> conf=<n> ok=<bool> :: "..."
...
```

That is exactly the missing evidence: whether the deadline truncated anything, real
per-pass milliseconds on the device, which orientation the probe chose, and what each
pass actually read.

## 17. Curvature — how hard is this case, really?

The brief asked whether "label on a curved bottle" is fundamentally harder than
"flat sticker on fabric". From this image: **the curvature is not what broke it.**
Rotated upright, the label in this photo is flat enough that the text is not
noticeably warped — the whole string sits on the flat-facing part of the tube, and
both the name and the number read correctly once orientation and contrast are handled.
What broke it was orientation plus low contrast, both of which are now addressed.

That said, genuine cylindrical warp is a real limit worth stating plainly: if a label
wraps far enough around a narrow object that characters are compressed and curved
along the edge, no amount of 2D rotation retrying fixes it. Tesseract has no
dewarping for that; it needs either a flattening transform (which needs the label's
outline detected first) or a model that tolerates warp. **This photo is not that
case, but a sticker wrapped around, say, a pencil or a thin bottle neck would be, and
this fix should not be expected to handle it.**

The translucency of the object is a smaller but real factor: it lowers label contrast
and is what made the contrast-boost pass necessary.

## 18. Verification (round 2)

```
$ npx tsc --noEmit        # clean

$ npm run build
✓ 35 modules transformed.
dist/index.html                   0.59 kB │ gzip:  0.33 kB
dist/assets/index-Ba6cZMhp.css    0.95 kB │ gzip:  0.46 kB
dist/assets/index-BRJH_npQ.js   107.27 kB │ gzip: 39.22 kB
✓ built in 114ms

$ npx vitest run
 Test Files  5 passed (5)
      Tests  42 passed (42)

$ node final3.mjs         # 42 images, shipped pipeline + compiled extract.ts
phone-correct 41/42   WRONG 1   missing 0   name-exact 37/42
recognitions: median 1   p90 4   max 8   one-shot 28/42
time: median 368ms   p90 1360ms   max 3018ms
```

`extract.ts` was re-checked against the round-2 OCR output and needed no changes: it
handled the sideways and contrast-boosted text correctly, including the two-line
name. Its tests are unchanged at 18.

## 19. Remaining risk (round 2)

- **The browser path is still unexecuted.** Same sandbox limitation as round 1. This
  is now the dominant unknown, and `?debug=1` exists specifically to close it.
- **The bottle proxy is a screenshot thumbnail**, roughly 5 pixels per digit. That the
  pipeline reads it at all is encouraging, but the real photo has far more detail, so
  on-device behaviour could differ in either direction.
- **Four of the six new cases are synthetic** sideways composites, not photographs of
  a real sideways label.
- **One wrong number remains** in evaluation, and the score gate reduces but does not
  eliminate that class. The mandatory confirm screen stays load-bearing.
- **Worst case is now 8 recognitions**, one more than round 1's 7. The common case is
  much cheaper, but the tail is slightly longer; the partial fallback covers it.
- **Genuine cylindrical warp is out of scope** — see section 17.
