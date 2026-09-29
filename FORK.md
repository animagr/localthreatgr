# localthreatgr fork notes

Personal fork of [haggen/localthreat](https://github.com/haggen/localthreat) at `animagr/localthreatgr`, built for use on one PC. The goal is to **stay mergeable with upstream**: fork-only code lives in new files, upstream files get the smallest possible edits, and every edit is tagged `FORK(gr)`.

- Remotes: `origin` = `animagr/localthreatgr`, `upstream` = `haggen/localthreat`
- Forked from upstream `cdf04f3` ("RegExp is stateful, shouldn't be reused", 2026-08-20)
- Find every touch point: `git grep -n "FORK(gr)"`

## Syncing with upstream

```sh
git fetch upstream
git merge upstream/master        # merge, don't rebase
git grep -n "FORK(gr)"           # confirm every divergence below survived
cd api && npm ci && cd ../client && npm ci
npm test                         # in client/: guard tests (needs api/ deps for the parser check)
npm run build:standalone         # fails loudly if a touch point moved
```

If a merge conflicts in a file listed below, keep upstream's version and re-apply the small fork change described here.

## Divergences

| # | Change | Files | Type |
| --- | --- | --- | --- |
| 1 | Standalone single-file build (no server) | `client/src/standalone/*` (new), `client/vite.standalone.config.js` (new), `client/test/standalone.test.ts` (new), `client/src/components/App.tsx`, `client/package.json`, `.gitignore` | Added build |

### 1. Standalone single-file build

Why: upstream needs its Node API server only to store pasted text, and running that server brought Docker, open ports and a dependency on the author's `local.crz.li` DNS. All the lookups (ESI, zKillboard, EVE images) already run in the browser. The standalone build keeps reports in the browser's localStorage and packs the whole app into one HTML file that opens from disk.

Build and use:

```sh
cd client
npm ci
npm run build:standalone         # -> client/dist-standalone/localthreat.html (gitignored)
```

Open `localthreat.html` in Edge or Chrome (double-click, or copy it anywhere; it has no other files). Paste a local member list or chat transcript with Ctrl+V, as on the website. The upstream build (`npm run build`) and `api/` are unchanged and still work.

How it's wired:

- `vite.standalone.config.js` reuses `vite.config.js` and adds a small plugin (no new dependency). The plugin:
  - swaps the entry `src/script.tsx` for `src/standalone/main.tsx`, which wraps the unchanged `App` in a hash router (`localthreat.html#/<id>`);
  - aliases `~/lib/api` to `src/standalone/api.ts`, so `Blank.tsx` and `Report.tsx` call the same `request()` but it reads and writes localStorage (key `localthreatgr:reports`, newest 100 kept);
  - inlines the script, the stylesheet and the SVG icon into the HTML, because browsers won't load module scripts from separate `file://` URLs.
- `src/standalone/parse.ts` is a copy of the server's `Report.parse`. A test runs both on the same inputs, so an upstream parser change fails `npm test`.
- `App.tsx` (2 tagged lines): in the standalone build, **Share** copies the report's pilot names instead of a `file://` link nobody else can open. Paste them into any localthreat to recreate the report.

Guards:

- `npm test` checks parser parity, the store's create/read/append/error behaviour against the server's, and that the three upstream touch points still exist (`index.html` entry, `~/lib/api` imports, the Share line).
- `npm run build:standalone` fails if `index.html` stops loading `/src/script.tsx`, if the alias stops applying (the bundle would contain the server client), or if the output isn't exactly one script plus CSS.

Behaviour to know:

- Reports live only in the browser profile that made them. Another browser, or clearing site data, starts empty.
- Nothing is sent anywhere except the lookups upstream already makes from the browser: `esi.evetech.net`, `zkillboard.com` and `images.evetech.net`.
- During EVE's daily downtime (11:00 UTC) ESI's affiliation route returns 502, so corporation and alliance stay "⋯". Upstream behaves the same; reload after downtime.
