# Pal Breeder

A small offline web app for planning Palworld breeding on an iPad while you play. Track the Pals that carry passives worth keeping, see what any two of them produce, and find the shortest breeding route to a target species.

## Features

- **My Pals:** add a Pal in a few taps (species search, gender, up to 4 passives, which player owns it). Filter by name or passive.
- **Breed:** pick two owned Pals to see the child species, its gender odds, and the chance (and expected egg count) of getting the passives you want.
- **Planner:** type or dictate a request like "Anubis with Artisan" or "female anubis with swift, legend and runner" into the search bar (names are matched loosely, typos are fine), or pick a target species and, optionally, up to 4 passives. Without passives it gives the fewest-steps species route. With passives it finds the breeding plan with the fewest expected eggs that ends in that species carrying those passives, step by step, with the odds per egg and a "Mark done" toggle per step. Wild catches can be part of the plan (see below). It also lists everything you can breed right now.
- **Settings:** player names, backup export/import (the iPad share sheet saves to Files or AirDrops it to the other player).

Everything is stored on the device in IndexedDB. Nothing is sent anywhere.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` also listens on your local network, so you can open the printed `Network:` address on an iPad on the same Wi-Fi. Installing it to the home screen and using it offline needs HTTPS, so use the hosted version for that.

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Unit tests for the breeding engine |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lint` | Lint with oxlint |
| `npm run data` | Rebuild `src/data/game-data.json` from PalCalc (see below) |
| `npm run icons` | Regenerate the app icons in `public/` |

## Deploy to GitHub Pages

1. Create a repository on GitHub (public, unless you have GitHub Pro) and push this project to its `main` branch.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs the tests, builds, and publishes to `https://<your-username>.github.io/<repo-name>/`.

## Install on the iPad

1. Open the GitHub Pages URL in Safari.
2. Tap **Share > Add to Home Screen**.
3. Launch it from the home screen. It runs full screen and works offline. New versions download automatically the next time you open it with a connection.

Safari can clear storage for sites you rarely use. Export a backup from Settings now and then.

## Game data

`src/data/game-data.json` is generated from [PalCalc](https://github.com/tylercamp/palcalc) (MIT License, see `src/data/PALCALC-LICENSE`), which extracts Pal stats, passive skills, and the full breeding table from the game files. The build script pins a PalCalc commit. When a game patch changes breeding, update `PINNED_COMMIT` in `scripts/build-data.mjs` (or run `node scripts/build-data.mjs main`), then run the tests.

Passive odds follow PalCalc's model: the child inherits 1 to 4 passives from the parents' combined pool, then 0 to 3 random passives are added, up to 4 in total. The chance of a random passive happening to be one you want is ignored, so the odds shown are slightly pessimistic.

## How the passive planner works

`src/engine/solver.ts` describes every Pal, owned or bred, by species, gender, which wanted passives it has, and how many other passives it has. Owned Pals cost 0 eggs. A bred child costs both parents' plans plus 1/p eggs, where p is the chance per egg of that exact outcome, gender included. A best-first search over these states (Knuth's generalisation of Dijkstra, ordered A*-style by the remaining species steps) returns the cheapest plan. It runs in a Web Worker so the app stays responsive.

- **Quick search** (default) only lets intermediate Pals carry wanted passives with no junk, and lets "bridge" Pals carry at most 2 junk passives. In benchmarks this is 3 to 7 times faster and within 0 to 7% of the thorough result.
- **Thorough** search drops those limits. It is slower but finds the true cheapest plan under the model.
- Both stop after a time limit and show the best plan found so far, if any.

**Wild catches** (on by default) let the planner start from Pals you catch instead of breed. A catch costs your "one catch is worth N eggs" setting (default 3) divided by the chance of the gender needed, so a female of a 60% male species costs 3 / 0.4 = 7.5 eggs. Species only qualify if they spawn in the wild at or below your "highest wild level" setting. Legendaries are left out unless you tick "Include legendaries". Passives a species always spawns with come with the catch; otherwise a catch is assumed to have no passives. Plans list what to catch first and mark catch steps with a Catch badge.

Benchmarks: `BENCH=1 npx vitest run src/engine/solver.bench.test.ts --disableConsoleIntercept`.

## Not built yet

- Live sync between two devices.
- Importing Pals from a save file.
