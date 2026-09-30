# Environment

Tooling is not in default locations. Do not assume C:\ or %APPDATA%.

- Project root: F:\Dropbox\Dropbox (Personal)\APN201\Apps\Puolisko\Puolisko
- Spec: F:\Dropbox\Dropbox (Personal)\APN201\Apps\Puolisko\puolisko.md
- Node / npm: C:\Program Files\nodejs (Node 24)
- Python: D:\Program Files\pypy\pypy3.11-v7.3.19-win64 (not needed by this project)
- Git: D:\Program Files\Git\mingw64\bin\git.exe
- GitHub CLI: C:\Program Files\GitHub CLI\gh.exe (logged in as apn201)
- Android Studio: D:\Program Files\Android\Android Studio (not used: the app is mobile web)

Always use absolute paths. If a tool is not found, check here before
concluding it is not installed - it is installed.

API keys live in .env, which is gitignored. Never print a key,
never commit one, never paste one into a file that is tracked.

# Project

- Mobile web, plain HTML/CSS/JS in `public/`. No framework, no build step.
- `api/*.js` are Vercel serverless functions. They hold the YouCam key and proxy calls.
- `lib/youcam.js` is the only code that talks to YouCam.
- `server.js` runs the same thing locally: `node server.js` then open http://localhost:3000
- `public/lab.html` (the Lab) answers the per-side scoring question on real photos. Costs units.
- `npm run scan` checks tree and full git history for secrets. Runs as a pre-push hook.
- Budget: 1,000 units. One SD analysis with 5-8 concerns = 12 units.
- Photos are never stored. Only numbers go to localStorage.
- Never add identification, face matching or third-party faces. See spec, "Rules that bite".
