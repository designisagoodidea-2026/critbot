# Critbot

A **crit-aware meeting-capture agent for design teams.** It joins a design critique call, transcribes and structures the conversation live, coaches the crit as it happens, and hands the designer a queue of transcript-traced, frame-anchored action items to work through next time they iterate.

> **Status: PARKED** behind `translation-engine` and `slide-publisher`. This workspace is *seeded*, not building. Un-parking is a deliberate call.

## Orientation

- **`CLAUDE.md`** — build-state source of truth: role, locked v1 product definition, scope, slices, open questions. **Start here.**
- **`Critbot-workspace-bootstrap.md`** — the original scoping memo (historical; don't edit).
- **`docs/architecture.md`** — capture core + pluggable sinks.
- **`docs/data-model.md`** — the crit record / `ActionItem` schema.
- **`figma-plugin/`** — the v1 sink skeleton (post-crit review surface). Runs in Figma Desktop on synthetic data; see its README.

## v1 in one line

Capture is the center of gravity; the **rubric-library system** is the moat; the **action-item output is required** (without it, Critbot is just a better transcript). Figma is the v1 output surface.

## Posture

Attributed to Jason (prospect-facing artifact). **Air-gapped from CoS** — no CoS intel, network, or real transcripts; all demo data is synthetic.

## Try the plugin skeleton

Figma Desktop → Plugins → Development → Import plugin from manifest… → `figma-plugin/manifest.json`. See `figma-plugin/README.md`.
