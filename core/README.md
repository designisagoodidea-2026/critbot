# core — Screen 1 & 2 logic

This is Critbot's center of gravity: the **live critique** engine (Screen 1) and the **rubric libraries** that power it (Screen 2). Platform-agnostic, no UI, no Figma. Runs offline with no API key.

```
node core/test.js
```

## What's here

**`rubric-libraries/` — Screen 2 (the moat).** Each library is the *lens* the classifier, coach, and scorer run through — DesignOps expertise as config. `library.schema.json` defines the format: `guidelines` (what a good crit looks like), `scoring` (the crit-quality scorecard dimensions), and `coachingCues` (real-time nudges). Three active starters match the prototype — UX Product Design, Marketing Design, HBR-Inspired — plus stubs for Motion / Industrial / Editorial / Spatial.

**`lens/` — the seam (M8–M9).** `lens.js` defines the **frozen core** (the slots every sink depends on) and the **`Lens` interface** every rim implementation satisfies, plus `RubricLens` — the first implementation, which reproduces the legacy engine behavior exactly. `normalizeProfile()` turns any rubric library into a **Profile** (faculties all on by default) and resolves `extends` composition. `CONTRACT.md` is the code-level contract; rationale is in `../docs/lens-model.md`. `skillLens.js` is the **skill lens** (M13) — a prose-authored perspective (`profiles/skills/*.skill.md`) over the same interface, with a `presenter-private` ear. `mcpLens.js` is the **MCP/context lens** (M14) — resolves `context[]` bindings via a ContextProvider and folds retrieved context into the perspective (offline: an in-memory stub). Both are additive — same `runLens`, no engine rewrite. Separately, `../live/roleAnnotator.js` stamps role/authority/relationship onto each live event (M7 in real time).

**`profiles/` — Screen 2 as faculties.** A profile configures the five faculties (`classify` / `score` / `annotate` / `coach` / `extract`), each independently switchable. `capture-only.json` shows the payoff: it `extends` ux-product-design but turns `score` and `coach` off — transcribe-and-classify only, for crits that don't want to be graded. `profile.schema.json` is the format; a rubric library is just a profile with everything on.

**`engine/classifyScoreCoach.js` — Screen 1 logic (now a shim).** Public API unchanged — `run(transcript, library)` → per-utterance **classification**, the **crit-quality scorecard**, and a **coaching feed** — but as of M9 it just normalizes the library to a Profile, wraps it in a `RubricLens`, and drives it through `lens/`. Still ships the deterministic `heuristicProvider` so it runs with no API key; an LLM-backed provider (same `{ classify, signals }` interface) is the skill/MCP-lens path.

**`adapters/otter/` — real transcript as dev corpus.** `otterToTranscript.js` maps an Otter meeting (search or fetch shape) onto the Screen 1 transcript model — speaker, timestamp, text — leaving classification to the engine. This is how you replace the synthetic transcript with a *real, diarized* one. `inspect.js` runs the adapter + engine and prints **structure only** (counts, distribution, scorecard), so it's safe to point at real, sensitive meetings.

**`fixtures/` — committed synthetic demo data.** `synthetic-transcript.json` is the Screen 1 demo transcript. All committed data is synthetic.

## Data flow

```
Otter meeting (real, runtime only)        synthetic-transcript.json (committed demo)
            │                                          │
            ▼                                          │
  otterToTranscript.js  ──────────►  transcript model ◄┘
                                          │
                       active rubric library (the lens)
                                          │
                                          ▼
                          classifyScoreCoach.js
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                            ▼                           ▼
   classified utterances        crit-quality scorecard          coaching feed
        (Screen 1 transcript)     (Screen 1 scorecard)         (Screen 1 nudges)
```

## Air-gap

Real Otter transcripts are Jason's actual meetings — sensitive. Hydrate them at runtime on his machine for development/testing; **never commit real transcript content**. `inspect.js` deliberately prints structure only. The committed demo is synthetic.

## Not here (on purpose)

The live capture/transcription feed (Route B / Recall.ai) and the Figma sink. The engine consumes a transcript model; *how* that transcript is produced live is the capture decision (see `../CLAUDE.md` → "Capture path" and "Otter — two roles").
