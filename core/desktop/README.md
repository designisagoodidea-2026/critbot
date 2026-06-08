# desktop — Critbot as a Mac menubar + desktop app (Electron)

Packages the whole live experience into one Mac app: a **menubar (Tray)** item *and* a **desktop window**, with the relay running **in-process** (no separate terminal). It reuses `../live/relay.js` (`createRelayServer`) and the shared HTTP layer, and reads your keys from `../live/.env` — same as the CLI relay.

```
menubar Tray ──(Open · Libraries · Roster · Quit)
BrowserWindow ── loads http://127.0.0.1:8787/live/   (the same web app)
in-process relay ── serves the page + bridges mic↔Deepgram + LLM / record / roster APIs
```

## Run it (dev)

```
cd core/desktop
npm install
npm start
```
Requires keys in `core/live/.env` (`DEEPGRAM_API_KEY`, optional `ANTHROPIC_API_KEY`) — the same file the CLI relay uses. The window opens on the live page; the menubar item shows/hides it.

## Build a Mac app (.dmg)

```
npm run dist        # electron-builder --mac
```
Produces a `.dmg` in `dist/`. **This step must run on macOS** (Apple's toolchain + signing) — it can't be produced on Linux/CI. For a signed/notarized build, add your Apple credentials per electron-builder's docs.

## Honesty about verification

This was developed in a Linux sandbox, so the parts that are **cross-platform Node were verified there**: `main.js` syntax, and the in-process relay path `main.js` runs (it served `/live/`, `/live/libraries.html`, `/live/roster.html`, and `/api/events` — all 200). The **Electron GUI itself (window + Tray) and the `.dmg`** could not be booted in the sandbox (the Electron binary won't download there), so those are verified by code review and run for real on your Mac via `npm start` / `npm run dist`.

`npm run smoke` boots headlessly and quits after confirming the relay serves — handy on a machine where the Electron binary is available.

## Packaging note

`package.json` → `build.extraResources` ships `../live`, `../engine`, `../rubric-libraries`, `../relationship-policies` inside the `.app`. If a packaged build can't resolve `../live` at runtime, point `main.js`'s requires at `process.resourcesPath + "/core/live/relay.js"`. Dev (`npm start`) runs from source and needs no path tweaks.

## What this is NOT

The Figma plugin (`../../figma-plugin/`) is a *separate* artifact — the post-crit review sink that reads the exported crit record. It can't host capture (Figma plugins have no mic). Capture lives here; review lives there; they're joined by the crit record.
