# Critbot roadmap

> Sequencing source of truth for the build. Focus is **Screens 1 & 2** (live critique + rubric libraries); the Figma sink and generated iterations stay parked. Updated 2026-06-05.

## Status snapshot

**Working:** live mic → Deepgram diarized streaming → relay → Screen 1 render (transcript + scorecard + coaching); Screen 2 rubric-library format with 3 starter libraries; Otter adapter (dev corpus).

**The gap that drives the roadmap:** the intelligence is a regex heuristic stub. Classification, scoring, and coaching aren't real yet. M1 fixes that.

## Foundations (supporting tooling)

- **F1 — Synthetic crit transcript generator.** Deterministic, *labeled* generator producing crit transcripts that exercise every coaching case (missing design intent, unsupported claim, taste-based feedback, concern-without-next-step, low engagement, off-rubric drift, plus the good cases). Powers offline dev, ground-truth evals for M1/M2, and air-gap-safe demos. *(In progress alongside M1.)*

## Milestones

### M1 — Make Screen 1 intelligent  ✅ DONE
Replaced the heuristic with a real LLM provider for classify / score / coach, using the active rubric library as the lens. Server-side (key in the relay), same contract; heuristic remains the offline fallback. **Validated** against the F1 generator across realism levels: LLM held **100% on clean + disfluent speech**, **79% under meandering + crosstalk** (53 utterances), vs heuristic 63%/69%/43%. Confirmed the failure mode is fragmented/overlapping speech — which M2 targets.

### M2 — Real-time coaching worth having  ✅ DONE
Coaching *engine* (`core/engine/coach.js`): per-utterance signals → a deduped (one card per issue + ×count), prioritized, severity-accented live feed — not a nudge under every fragment. Run-level cues added: design intent not stated, lagging engagement, off-rubric drift. Inline purple nudges removed; coaching panel restyled for readability. Logic verified by `npm run eval:coach`.

### M3 — Screen 2 as a real screen  ✅ DONE (v1)
`core/live/libraries.html`: library cards (guidelines, scorecard dims, coaching cues), Other Libraries (stubs), side-by-side comparison, and AI Library Analysis of the difference (LLM with data-driven fallback). Backed by `/api/libraries` + `/api/library-analysis`. **Next:** in-app guideline authoring/editing (needs a write endpoint) and "Add Library."

### Local ASR — ready to test
`core/live/relay-local.js` mirrors the Deepgram relay but bridges to a self-hosted **WhisperLiveKit** endpoint (audio never leaves the machine). Shared HTTP layer (`relayHttp.js`) proves the ASR vendor is swappable without touching the page/engine/coach. `npm run start:local`.

### M4 — Crit record output  ✅ DONE
A finished crit produces the required structured output. `core/engine/critRecord.js` assembles a JSON record (meta + classified transcript + scorecard + coaching + **action items**, ActionItem schema per docs/data-model.md) and renders a human-readable Markdown summary. Action items come from `llmProvider.extractActionItems` (LLM, merged/imperative) with a heuristic fallback so export never fails. Served by `/api/crit-record`; the live page's **Export** button downloads `record.json` + `summary.md`. Verified by `npm run eval:record`. The JSON record is the interchange object the (parked) Figma sink and other destinations will read.

### M4.1 — Tag correction + training loop  ✅ DONE
Human-in-the-loop on the classifier. Each comment's auto-tag has an **edit** affordance: the tag sits in a chip with an ✕, an input to type a replacement (+ done), and an optional **rationale** field. Corrections persist server-side (`core/live/.corrections.json`, gitignored — real crit text). `/api/correct` records them; `/api/classify` injects the team's recent corrections as **few-shot examples**, so the classifier adapts to their conventions immediately — no training run. The corpus is also the future fine-tuning dataset; the rationale is what lets it generalize.
- **Loops back to Screen 2 (future):** recurring re-tags surface "your team keeps calling X a Y" → refine the rubric library itself.

### M5 — Capture hardening  ✅ DONE (packaging deferred)
- **AudioWorklet** capture (off-main-thread, modern) replacing the deprecated ScriptProcessor, loaded via a Blob URL (no served file to cache); ScriptProcessor fallback for older browsers.
- **Auto-reconnect**: a dropped relay connection mid-session retries with exponential backoff (distinguishes a real Stop from a blip); the mic keeps running and audio resumes when the socket reopens; transcript preserved.
- **Speaker renaming**: a Speakers bar renames "Speaker 0" → real names; `speakerId` threaded through commits and resolved at render, so a rename updates every comment (and the export).
- **Consent note** in the UI.
- **Packaging — deferred (separate distribution effort):** the capture app and the Figma plugin are *decoupled processes joined by the crit record* — the listener can't be a Figma plugin (sandboxed, no mic), and the plugin needs Figma Desktop only to read the record back. Three non-exclusive shells for the same web app: stay in-browser; wrap in a thin desktop shell (Tauri/Electron); or a native macOS **menu-bar widget** for in-person crits (= the parked local-mic fork). Not built here (needs a desktop toolchain), captured for when distribution matters.

### M6 — Calendar awareness + auto-join  ✅ DONE (live-bot/real-calendar deferred)
`core/engine/calendar.js` detects crit events (title/description/flag), computes live vs upcoming, and derives session meta + **invited roster** from an event. `/api/events` serves them through a **provider abstraction** (synthetic now; Google Calendar / Microsoft Graph / Recall.ai plug in behind the same event shape). The live page shows a strip with the live/next crit and an **auto-join** toggle: when a crit goes live it auto-arms capture and attaches the event's title + attendees to the session — which flow into the crit-record `meta.invited` (the **M7 roster seam**: invited vs. who actually spoke).
- **Deferred (needs accounts):** real calendar OAuth and the Recall.ai **bot dispatch** into a live Zoom/Teams call (documented `/api/join` seam). In the prototype, "join" auto-starts local capture.
- **One Microsoft connector** can later feed both this (Outlook calendar → who's invited) and M7 (Graph → who reports to whom).

### M7 — Social graph + relationship/interpretation policies  ✅ DONE (v1)
Built: `core/relationship-policies/` (schema + 3 templates — hierarchical / peer / expertise-led), the `core/engine/relationships.js` policy engine (relationship-to-presenter × classification → weight, decision-promotion, protective flags + a summary), a persisted manual roster (`/api/roster`, `.roster.json` gitignored) with `/api/policies`, a **Roster screen** (`roster.html`) to set participants/authority/expertise/presenter and pick the policy, and **record enrichment**: exports now carry per-item provenance (role, relationship), weight, decision-promotion, and protective flags, plus a Relationship-notes summary. Verified by `npm run eval:relationships`. **Deferred:** real-time in-call role annotation, and Graph/Workday roster providers (manual is provider #1; documented seam). Below is the design this realizes.

The social/authority dimension is a **second configurable layer**, built like the Screen 2 rubric libraries: user-definable, swappable, with common templates, composable as toolkit components / plugins. (Rubric libraries = "what good critique looks like"; relationship policies = "how a speaker's standing modifies interpretation.")

**Three separated data layers** (each independently useful): who was **invited** (roster — calendar/social graph), who's **actually talking** (diarization — already have it), and **roles + relationships** (who's presenting; authority/expertise edges between people).

**A policy = (speaker's relationship to presenter) × (utterance classification) → a treatment.** Treatment palette (more than weighting):
- **Authority weighting** *(template)* — feedback from someone at/above the presenter's level weighted heavier. Legitimate and expected; ship it — just not hard-coded as the only behavior.
- **Expertise / merit weighting** *(template)* — a domain expert gains weight from knowledge, not rank; decouples credibility from hierarchy.
- **Routing / labeling** — a decision-maker's directive recorded as a *decision* (not a suggestion); action items get owners.
- **Protective / balancing** — flag when a strong evidence-based point from a junior voice is dropped; always capture the presenter's stated intent.
- **Provenance** — the enriched transcript carries who said it + their standing, so weighting stays a downstream policy choice rather than baked into the record.

**Where the relationship data comes from — a provider abstraction** (same swap-the-vendor move as the ASR layer): the relationship model is the interchange object; *sources* that populate it are pluggable.
- **Provider #1 — manual, and persisted.** Define people, roles, and relationships once → stored as a remembered org/team profile, reused across crits. Each crit only adds "who's presenting today." (Re-entering relationships per meeting would kill the feature.)
- **Later providers — Microsoft Graph & Workday.** Graph gives org structure (titles, departments, manager/directReports) and is the *same ecosystem as the Outlook calendar in M6* — one Microsoft connector can feed both "who's invited" (M6) and "who reports to whom" (M7). Workday gives the deeper HR/supervisory hierarchy. Both expose the same shape: people, titles, reporting edges.
- **Design to the documented schema now.** No live access to Workday/Graph needed — model the manual profile to mirror what those APIs expose, so swapping in a real source later is a *population* change, not a redesign. Validate against their docs.
- **Privacy:** user-controlled and per-team, not silently harvested.

## Packaging  ✅ DONE (final platform step on your machine)

- **Mac menubar + desktop app** (`core/desktop/`, Electron): hosts the relay in-process, a desktop window on the live page, and a menubar Tray. Cross-platform parts verified in the sandbox (relay served /live/, /libraries, /roster, /api at 200); the Electron GUI + `.dmg` run on macOS (`npm start` / `npm run dist`) — the Electron binary can't download in the Linux sandbox.
- **Figma review sink** (`figma-plugin/`): v1 now loads an exported crit record and renders the action-item queue with M7 role/weight/decision/protect badges, meta, scorecard, and relationship notes. Loads in Figma Desktop. Verified a real exported record carries every field the plugin renders.

## Parked (later)

- Generated design iterations (Screen 3 Option A/B previews).
- Frame pinning in the Figma sink (needs `targets` node IDs — guess-then-confirm).
- Live in-call role annotation; Graph/Workday roster + real-calendar providers; Recall.ai bot dispatch.

## Demoable checkpoints

Each milestone stands alone in a demo: M1 = "watch it classify and score a real conversation"; M2 = "watch it coach the room live"; M3 = "configure the lens"; M4 = "here's the record it produced"; M4.1 = "correct it and watch it learn your team's language."
