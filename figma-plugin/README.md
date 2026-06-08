# Critbot Figma plugin — v1 sink (skeleton)

The **review surface**, not the listener. A designer opens this post-crit, sees the action-item queue anchored to frames, jumps to transcript moments, and checks items off. The listening/joining half lives outside Figma (see `../docs/architecture.md`) — plugins are sandboxed and have no mic/audio/call access.

> **Status: v1 — reads a real exported crit record.** Click **"Load crit record (.json)…"** and pick a `critbot-record-*.json` exported by the live app. The panel renders the action-item queue with type / rubric tag / scope, the transcript anchor, and — when the export was run with a roster + relationship policy (M7) — the role/relationship, weight (×), "decision" promotion, and "protect" flags. It also shows the crit title, lens, invited-vs-spoke counts, the quality summary, and the relationship notes. Falls back to a sample queue until a record is loaded. (Frame pinning works when an item carries `targets` node IDs; v1 records leave those empty — resolved later via guess-then-confirm.)

## The two-context model (the thing that trips everyone up)

A Figma plugin runs in **two isolated contexts** that share no memory and talk only via `postMessage`:

| Context | File | Has | Doesn't have |
|---|---|---|---|
| **Sandbox / main thread** | `code.js` | the `figma` API (read/write the document) | the DOM |
| **UI / iframe** | `ui.html` | normal HTML/CSS/JS, the DOM | the `figma` API |

Messaging: `figma.ui.postMessage(msg)` → `window.onmessage`, and `parent.postMessage({ pluginMessage: msg }, "*")` → `figma.ui.onmessage`.

## Files

- `manifest.json` — plugin manifest (entry points, editor type, network access).
- `code.js` — sandbox logic: ships the synthetic queue to the UI, focuses anchored nodes, handles status changes.
- `ui.html` — the panel: renders the queue, "Focus frame" + "Resolve/Reopen" per item.
- `package.json` — metadata + `npm run lint:manifest` to sanity-check the manifest JSON.

## Run it

1. Install **Figma Desktop** (plugin dev requires the desktop app).
2. Open any file → right-click → **Plugins → Development → Import plugin from manifest…**
3. Select `figma-plugin/manifest.json`.
4. Run **Critbot — Crit Review** from the Plugins → Development menu.

You'll see the synthetic action-item queue. "Resolve" toggles status in the panel; "Focus frame" is wired to select + zoom to a node's targets (the synthetic items carry empty `targets`, so it reports "design-level / not found" — populate `targets` with real node IDs from your test file to see it jump).

## Going beyond Hello World

This is intentionally plain JS so it runs with **no build step**. When the plugin grows past a skeleton, upgrade to the setup Figma's "With UI & browser APIs" template uses:

```
npm i -D typescript @figma/plugin-typings esbuild
```

Then write `code.ts`, bundle with esbuild to `code.js`, and keep `manifest.main` pointed at the bundle. The plugin-scaffolding script Jason wants would spin up exactly this skeleton on demand.

## Next wiring steps (when un-parked)

1. Replace `SYNTHETIC_QUEUE` with a fetch of the real crit record from the backend (add the domain to `manifest.networkAccess.allowedDomains`).
2. Resolve `targets[]` via the guess-then-confirm flow (`docs/data-model.md`) so "Focus frame" lands on real nodes.
3. Add the "view in transcript" jump from `transcriptAnchor`.
4. Persist `status-change` back to the crit record instead of only the UI.
