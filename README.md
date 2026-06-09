# Critbot

A **crit-aware meeting-capture agent for design teams.** It joins a design critique call, transcribes and structures the conversation live, coaches the crit as it happens, and hands the designer a queue of transcript-traced, frame-anchored action items to work through next time they iterate.

Capture is the center of gravity; the **rubric-library system** is the differentiator; the **action-item output is required** (without it, Critbot is just a better transcript). Figma is the v1 output surface.

> **▶ Live demo:** **[critbot-production.up.railway.app](https://critbot-production.up.railway.app/)** — password-protected; request access from the maintainer.

## Orientation

- **`docs/architecture.md`** — the capture core and its pluggable sinks.
- **`docs/data-model.md`** — the crit record / `ActionItem` schema.
- **`core/`** — the Screen 1 & 2 logic: rubric libraries, transcript adapter, and an offline-runnable classify/score/coach engine. Run `node core/test.js`.
- **`figma-plugin/`** — the v1 sink: a post-crit review surface that runs in Figma Desktop. See its README.

All demo crit data in this repo is synthetic.

## Try the plugin skeleton

Figma Desktop → Plugins → Development → Import plugin from manifest… → `figma-plugin/manifest.json`. See `figma-plugin/README.md`.
