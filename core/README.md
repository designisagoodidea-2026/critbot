# core — Screen 1 & 2 logic

This is Critbot's center of gravity: the **live critique** engine (Screen 1) and the **rubric libraries** that power it (Screen 2). Platform-agnostic, no UI, no Figma. Runs offline with no API key.

```
node core/test.js
```

## What's here

**`rubric-libraries/` — Screen 2 (the moat).** Each library is the *lens* the classifier, coach, and scorer run through — DesignOps expertise as config. `library.schema.json` defines the format: `guidelines` (what a good crit looks like), `scoring` (the crit-quality scorecard dimensions), and `coachingCues` (real-time nudges). Three active starters match the prototype — UX Product Design, Marketing Design, HBR-Inspired — plus stubs for Motion / Industrial / Editorial / Spatial.

**`engine/classifyScoreCoach.js` — Screen 1 logic.** Takes a transcript + an active library and produces: per-utterance **classification** (approval / suggestion / concern / question / statement), the **crit-quality scorecard**, and a **coaching feed** of nudges. Ships a deterministic `heuristicProvider` so it runs with no API key; swap it for an LLM-backed provider (same `{ classify, signals }` interface) when un-parked — the library guidelines become the prompt's lens.

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
