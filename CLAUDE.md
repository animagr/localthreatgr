# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**localthreat** (hosted at localthreat.xyz) — paste an EVE local-chat member list or chat transcript and get a threat report: affiliations plus zKillboard PvP stats per pilot. Personal fork `github.com/animagr/localthreatgr` of `github.com/haggen/localthreat` — see **Fork** below before changing anything. Read `.codemapy/summary.md` for structure.

## Commands

```sh
docker compose up -w          # traefik proxy on :80 + api + client in watch mode
# app: http://localthreat.local.crz.li   api: http://api.localthreat.local.crz.li  (public wildcard -> 127.0.0.1)

# without the proxy: cp compose.override.yml.example compose.override.yml  (api :5174, client :5173)

cd api && npm test            # node --experimental-strip-types --test
cd client && npm run build    # vite
```

## Architecture

- **`api/`** — dependency-light Node server (`node:http` plus `node:sqlite`; TypeScript run directly with `--experimental-strip-types`).
  - `src/index.ts` routes `/v1/reports`: POST creates, GET/PATCH by id.
  - `src/report.ts` parses pasted text into pilot names. `src/db.ts` holds the SQLite `reports` table at `./storage/database.sqlite`. `src/createId.ts` makes 12-char nanoid IDs.
  - The server stores only the raw pasted text; all lookups happen in the browser.
- **`client/`** — React + Vite + Tailwind + wouter.
  - `src/lib/ids.ts` / `names.ts` / `affiliations.ts` call ESI (`/latest/universe/ids/`, `/universe/names/`, `/characters/affiliation/`) directly from the browser.
  - `src/lib/zkillboard.ts` calls `zkillboard.com/api/stats/characterID/<id>/`.
  - `src/components/Report.tsx` is the main view.

## EVE currency (2026-09-27)

Current — active upstream (2026-08). Uses public, unauthenticated ESI routes via the legacy `/latest/` prefix (still served) and the zKillboard stats API. No SSO.

## Security notes

- Pasted chat content is stored server-side, retrievable by anyone holding the report ID (12-char nanoid, not guessable, but shareable). Don't paste private channel transcripts into a public instance.
- SQL uses prepared statements with parameters.
- CORS reflects **any** request `Origin` back (end of `api/src/index.ts`). Harmless here because there are no cookies or auth, but any site can create or read reports through a visitor's browser.
- `getBody()` buffers the request body **without a size limit** — fine locally, a memory-exhaustion DoS if exposed publicly. Add a cap before self-hosting on the internet.
- The dev compose publishes traefik on port 80 on all interfaces and mounts `/var/run/docker.sock` read-only (standard traefik, dev only).

## Fork: animagr/localthreatgr

Personal fork for use on this PC. `origin` = `github.com/animagr/localthreatgr` (commit as `ektoras@gmail.com`), `upstream` = `github.com/haggen/localthreat`, forked from upstream `cdf04f3`. **Read [FORK.md](FORK.md) first**: it lists every divergence. The rest of this file describes upstream's code.

The main divergence (added 2026-09-29) is a **standalone single-file build** that needs no server: `cd client && npm run build:standalone` writes `client/dist-standalone/localthreat.html`, which opens from disk and keeps reports in localStorage. Fork code is in `client/src/standalone/` and `client/vite.standalone.config.js`; guard tests run with `cd client && npm test` (needs `npm ci` in `api/` too). Use this build on this PC; the Docker/API commands above are upstream's hosted setup.

Keep `git merge upstream/master` routine, following the conventions in `../EveLensgr/FORK.md` and `../eve-o-previewgr/FORK.md`:

- Record every divergence in `FORK.md` (file, what, why) and keep it current after each merge.
- Prefer switching a feature off, or deleting whole files that only served it, over rewriting hot upstream files. Put fork-only code in new files.
- Keep edits to shared upstream files small, and tag them `FORK(gr)` where the language allows a comment, so `git grep -n "FORK(gr)"` finds them all.
- Add a guard test for anything a careless merge could silently undo.
- Sync by merging, not rebasing: `git fetch upstream && git merge upstream/master`. Push only to `origin`, never to `upstream`.
