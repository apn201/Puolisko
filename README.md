# Puolisko

One half of your face beautiful. The other half monstrous. The skin AI judges both.
The bigger the gap, the better. Halloween edition.

Entry for the YouCam API Skin AI & eCommerce VTO Hackathon (Perfect Corp, 2026).

## How it plays

1. **Bare face scan.** Puolisko measures your natural left/right difference and subtracts it later, so nobody wins on genetics.
2. **Coin flip.** The app picks your Beauty side and your Beast side.
3. **Makeup bag.** Concealer and highlighter on one half. Eyeliner wrinkles, red lipstick blotches, dark circles on the other. Makeup only.
4. **Final scan.** The AI sees everything you did. The face is split down the middle.
5. **Score.** Beauty score, Beast score, and the gap in big numbers, with a heatmap of what the AI saw on each half.
6. **Share.** A card rendered on your phone, sent with the native share sheet. The platforms are the leaderboard.

## YouCam API used

**YouCam AI Skin Analysis** (`/s2s/v2.0/file`, `/s2s/v2.0/task/skin-analysis`), SD, four concerns that makeup can move:
wrinkle, redness, dark_circle_v2, age_spot. 9 units per scan.

## The non-obvious part

The Skin Analysis API is built to flatter and it scores the whole face. It has no left and right.
Puolisko turns it into a referee for a game it was never designed for:

- Each concern comes back with a detection mask aligned to the photo.
- MediaPipe Face Landmarker, running in the browser, finds the facial midline (a fitted, tilted line, not the image centre) and the face outline.
- Each mask is cut along the midline, inside the face outline only. A half's score comes from the flagged area, weighted by intensity.
- Gap = (Beauty half − Beast half) now − (Beauty half − Beast half) on the bare face.

Code: [`public/js/split.js`](public/js/split.js), [`public/js/game.js`](public/js/game.js).
The [Lab](public/lab.html) is the spike tool: bare photo first, made-up photos after, per-half numbers and heatmaps.

## Privacy

Stated on screen before the first scan:

- Your photo goes to the YouCam API for scoring and nowhere else.
- We do not store it. Only the numbers stay, and only on your phone.
- YouCam keeps the result for up to 24 hours on their side.
- Sharing is your decision. We never post anything.

No accounts, no database, no analytics. Only the player's own face, only by their action. No identification or face matching.

## Run it

Node 18 or newer, no dependencies.

```bash
cp .env.example .env      # put your YouCam API key in .env
node server.js            # http://localhost:3000
npm test                  # splitting and game rules
npm run scan              # secret scan of the working tree and the whole git history
```

Phone cameras need HTTPS, so test the camera on the deployed URL. "Use a photo" works anywhere.

## Deploy

### Apache + PHP (how the entry is hosted)

1. Copy the contents of `public/` to a folder on the server (root or subfolder, both work).
   `public/.htaccess` maps `api/analyze` to `api/analyze.php` and so on; needs mod_rewrite, PHP 7.4+ with curl.
2. Put the key in a file **outside** the web root, one level above DOCUMENT_ROOT:
   ```php
   <?php return ['YOUCAM_API_KEY' => '...', 'ACCESS_CODE' => '...'];
   ```
   named `puolisko-config.php`, or point `SetEnv PUOLISKO_CONFIG /path/to/file.php` at it, or `SetEnv YOUCAM_API_KEY` in the vhost.
3. HTTPS is required for the camera.

### Vercel (alternative)

Import the repo, set `YOUCAM_API_KEY` and `ACCESS_CODE` as environment variables. `api/*.js` run as functions.

## Layout

```
api/              Node functions (local server, Vercel): analyze, task, mask, config
public/api/       the same four endpoints in PHP, for Apache
lib/youcam.js     the only Node code that talks to YouCam
public/js/        app: scan, split, game rules, heatmap, share card, landmarks
public/lab.html   spike page: does the AI see makeup, per half
server.js         local dev server with the same routes
scripts/          secret scan
test/             node:test unit tests
```

## License

MIT
