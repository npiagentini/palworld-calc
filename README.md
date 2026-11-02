# Pal Breeder

A small offline web app for planning Palworld breeding on an iPad while you play. Track the Pals that carry passives worth keeping, see what any two of them produce, and find the shortest breeding route to a target species.

## Features

- **My Pals:** add a Pal in a few taps (species search, gender, up to 4 passives, which player owns it). Filter by name or passive.
- **Breed:** pick two owned Pals to see the child species, its gender odds, and the chance (and expected egg count) of getting the passives you want.
- **Planner:** pick a target species to get the fewest-steps breeding route from the Pals you own, including unique and gender-specific combos. It also lists everything you can breed right now.
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

## Not built yet

- A full solver that plans species and passives together (e.g. "Anubis with Swift, Legend, Runner, Nimble") across several generations. Right now the Planner routes species only, and the Breed tab gives passive odds for one pairing at a time.
- Live sync between two devices.
- Importing Pals from a save file.
