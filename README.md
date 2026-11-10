# WM 2026 Tipp-Helfer

Static single-page app for a World Cup 2026 prediction game. Published via GitHub Pages
at https://bitc23.github.io/wm2026-tipphelfer/ (served from `main`, root).

## Status (as of 17.09.2026)

**Dormant.** The tournament is over and the project is not in active use. Both daily
GitHub Actions are paused:

- the `schedule:` triggers were removed from both workflow files (only `workflow_dispatch` remains)
- both workflows were additionally disabled in GitHub (`gh workflow disable`), so even a manual run
  needs `gh workflow enable` first

`results.json` holds the final state: 104 finished matches, all R32 pairings, and the frozen
model tips. `elo.json` holds the eloratings.net ratings as of 17.09.2026.

## How it fits together

| File | Role |
|---|---|
| `index.html` | The whole app (UI, fixtures `const M=[...]`, Elo model, tips in localStorage). Fetches `results.json` and `elo.json` at load. |
| `elo.json` | Team ratings, written by `update-elo.mjs`. |
| `results.json` | Official results, R32 bracket pairings (`ko_pairs`), frozen model tips (`model_tips`, `ko_model_tips`). Written by `update-results.mjs`. |
| `update-elo.mjs` | Fetches `World.tsv` and `en.teams.tsv` from eloratings.net, validates team codes and rating ranges, writes `elo.json`. Falls back to the r.jina.ai proxy when the direct fetch fails, because eloratings.net blocks GitHub runner IPs. |
| `update-results.mjs` | Fetches matches and standings from football-data.org (needs the `FOOTBALL_DATA_TOKEN` secret), maps team names via `ALIASES`, writes `results.json`. Reads the fixture list and model constants (`MU`, `GAMMA`, `MAXG`, `RHO`) out of `index.html` so the frozen model tips match the frontend. |
| `.github/workflows/update-elo.yml` | Ran daily, cron 03:30 UTC (GitHub typically starts it 3 to 6 hours late). Runs `update-elo.mjs`, commits `elo.json` if changed. |
| `.github/workflows/update-results.yml` | Ran daily, cron 04:00 UTC, after the Elo run. Runs `update-results.mjs`, commits `results.json` if changed. |
| `fonts/` | Self-hosted webfonts for the newspaper look. |

Each bot commit to `main` triggers a Pages rebuild, so data changes go live within a minute.

## Why the actions were failing

The failures were sporadic, not systematic. Across the last 200 runs: Elo-Update failed
7 of 51 times, Resultat-Update 1 of 52 times. Two distinct causes:

1. **eloratings.net returns HTTP 200 with a non-TSV body.** All seven Elo failures have the same
   signature: every team code resolves to `undefined`, meaning `en.teams.tsv` parsed to nothing.
   The direct fetch succeeded (no proxy fallback was logged), so the site served a block or
   challenge page with status 200. The script only falls back to the proxy on a non-2xx status
   or a network error, so it never retried. Fix idea: validate that the parsed TSV contains the
   expected codes before trusting it, and fall back to the proxy otherwise.

2. **One `git push` got HTTP 403** (13.09.2026): `Permission to bitc23/wm2026-tipphelfer.git
   denied to github-actions[bot]`. The workflow has `permissions: contents: write` and the same
   step succeeded every other day, so this looks like a transient GitHub-side issue. If it recurs,
   check the repo Actions settings (workflow permissions must allow write) or push with a PAT.

## Known issues to fix before reuse

- **Daily noise commits.** Both scripts write `updated: <today>` into the JSON, so the file always
  differs and the "commit only if changed" guard never triggers. `main` received two bot commits
  per day for two months after the final. Either drop the `updated` field, or compare the payload
  without it before committing.
- **Deprecated action versions.** `actions/checkout@v4` and `actions/setup-node@v4` target Node 20,
  which GitHub is deprecating. Bump both to `@v5`.
- **The proxy fallback is a third party** (r.jina.ai) that sees the request URL. Harmless for
  public TSV files, but worth knowing.
- The `FOOTBALL_DATA_TOKEN` secret was set on 24.06.2026. Verify it is still valid on
  football-data.org before relying on it.

## Picking this up for the next tournament

1. Replace teams, groups, fixtures (`const M`), kickoff times and the bracket (`KO`) in `index.html`.
2. Mirror the team keys in `TEAMS` (`update-elo.mjs`) and in `ALIASES` and `TEAM_GROUP`
   (`update-results.mjs`). Keys must match `index.html` exactly.
3. Point `API_URL` in `update-results.mjs` at the new competition and check the free tier covers it.
4. Reset `results.json` to an empty `results: {}` and refresh `elo.json` locally:
   ```sh
   node update-elo.mjs
   FOOTBALL_DATA_TOKEN=... node update-results.mjs
   ```
5. Fix the known issues above, at least the noise commits and the action versions.
6. Restore the `schedule:` blocks in both workflow files (the previous cron lines are noted in a
   comment there) and re-enable the workflows:
   ```sh
   gh workflow enable Elo-Update
   gh workflow enable Resultat-Update
   ```
7. Trigger both once by hand (`gh workflow run Elo-Update`, `gh workflow run Resultat-Update`) and
   confirm the Pages deploy picks up the new JSON.
