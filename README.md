# Puolisko

Split-face product testing. Your own face as its own control group.

Before-and-after photos lie: different light, different camera, a different week of sleep.
Puolisko puts product A on one cheek and product B, or nothing, on the other, then takes one
photo a day. Both halves share the same light, camera, sleep and diet, so the only difference
between them is the product. This is how dermatology trials compare treatments.

Entry for the YouCam API Skin AI & eCommerce VTO Hackathon (Perfect Corp, 2026).

## YouCam API used

**AI Skin Analysis** (`/s2s/v2.0/file`, `/s2s/v2.0/task/skin-analysis`), SD, six concerns:
redness, acne, pore, texture, age_spot, oiliness. 12 units per photo.

## The non-obvious part: per-side scores from a whole-face API

The Skin Analysis API scores the whole face. It has no left/right split. It does return, for
each concern, a detection mask aligned with the input photo. Puolisko:

1. sends one photo, gets one mask per concern,
2. splits each mask at the user's facial midline, dropping a strip over the nose where alignment error would leak across,
3. measures the flagged share of two equal-width halves of the face box.

One API call scores both sides under identical conditions. The code is in
[`public/js/split.js`](public/js/split.js).

The fallback from the design notes, a mirrored composite of each half sent as its own
face, is built into the [Lab](public/lab.html) so both methods can be compared on real photos.

## Honest statistics

Light, camera, sleep and diet move both halves together and cancel in the difference A − B.
A product effect shows up as that difference drifting over the days. Puolisko fits a line to it,
reports the drift with an interval, and applies a Bonferroni correction for testing six
concerns. If the interval crosses zero the verdict is "no measurable difference", which is
the most common and a perfectly good result. See [`public/js/stats.js`](public/js/stats.js).

It also reports how much of the day-to-day noise the split removed. That noise is what
makes ordinary before-and-after photos unreliable.

It cannot cancel light from one side, so every photo gets a left/right light-balance check.

## Privacy

- The photo goes through one serverless function to the YouCam API and nowhere else. The function keeps nothing.
- After scoring, the photo and masks are discarded. Only numbers are kept, in the browser's localStorage.
- No accounts, no database, no analytics.
- Only the user's own face, only when they choose to measure it. No identification or face matching, ever.

## Run it

Requirements: Node 18 or newer. No dependencies to install.

```bash
cp .env.example .env      # then put your YouCam API key in .env
node server.js            # http://localhost:3000
npm test                  # unit tests for splitting and statistics
npm run scan              # secret scan of the working tree and the whole git history
```

Phone cameras need HTTPS, so test the camera on the deployed URL. Import works on localhost.

## Deploy (Vercel)

1. Import this repo in Vercel. No build command; output directory is `public` (set in `vercel.json`).
2. Project Settings → Environment Variables: `YOUCAM_API_KEY`, and optionally `ACCESS_CODE`
   so strangers cannot spend the unit budget.
3. Deploy. The `api/` functions hold the key; it never reaches the browser.

## Layout

```
api/            serverless functions: analyze, task (poll), mask (proxy), config
lib/youcam.js   the only code that talks to YouCam
public/         the app: plain HTML, CSS, JS modules, no build step
public/lab.html spike page: mask split vs mirror composite, repeatability
server.js       local dev server with the same routes
scripts/        secret scan
test/           node:test unit tests
```

## License

MIT
