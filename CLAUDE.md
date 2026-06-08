# CLAUDE.md — Critbot Build Workspace

> **Source of truth for Critbot build state.** Seeded 2026-06-05 from `Critbot-workspace-bootstrap.md` (CoS scoping discussion). The bootstrap doc is the original scoping memo; this file owns build state going forward.
>
> **STATUS: PARKED.** Critbot sits behind `translation-engine` and `slide-publisher`. This workspace is *seeded*, not *un-parked*. Un-parking is a deliberate prioritization call — see `cos_poc_critbot_plugin.md` (CoS memory) for the triggers.

---

## What Critbot is

A **crit-aware meeting-capture agent for design teams.** It joins a design critique call, transcribes and structures the conversation live, coaches the crit as it happens, and hands the designer a queue of action items to work through next time they sit down to iterate.

This is a **product/code workspace**, not a Chief of Staff function. It couples back to CoS (attribution + air-gap, see below) but is air-gapped from CoS intel, network, and transcripts.

## Your role here

Build partner for Critbot v1: part product engineer, part design-tooling architect, part DesignOps thinker. Favor practical, shippable slices over completeness. Translate technical choices into plain operational language — Jason is the architect and decision-maker, not a traditional SWE. Surface tradeoffs and recommend; don't bury decisions.

## Product definition — v1 (locked)

A crit-aware meeting agent that:

- **Joins the call** (Zoom / Microsoft Teams) via an invited agent, aware of the calendar event (Gmail or Outlook).
- **Transcribes live** and **auto-classifies** each utterance: Approval / Suggestion / Concern / Question / Statement.
- **Coaches the crit in real time** — nudges like "remind presenter to state design intent" or "ask a clarifying question about user testing."
- **Scores critique quality** live against a configurable rubric (design intent stated, engagement, evidence-based, actionable).
- **Runs against configurable critique rubric libraries** (UX Product / Marketing / HBR-Strategy / Motion / Industrial / Editorial / Spatial) — the lens the classifier, coach, and scorer use.
- **Outputs a queue** of described, transcript-traced, frame-anchored action items the designer reviews post-crit. **The output is required** — without it Critbot is just a better transcript.

**Center of gravity is capture.** Figma is the v1 output surface because that's where crits happen, but the capture engine is platform-agnostic and the output is portable to other sinks later.

## Scope — the three screens

The Figma Make prototype is the scope source of truth: published at https://glade-invert-73458930.figma.site (the `figma.com/make` editor link is org-blocked and client-rendered — use the published site or a screenshot).

| Screen | What it is | v1? |
|---|---|---|
| **1 — Live Critique** | Live transcript + auto-classification + real-time coaching + crit-quality scorecard | ✅ v1 (headline) |
| **2 — Best Practices / Libraries** | Configurable critique rubric libraries; the lens for classify/coach/score | ✅ v1 (the moat) |
| **3 — Action Queue** | *Generated design iterations* (Option A/B previews) traced to transcript | ⛔ de-scoped → v2. v1 keeps only a **lightweight described-action-item queue** (no generated variants) |

The rubric-library system (Screen 2) is the defensible differentiator — DesignOps expertise turned into product. Generic notetakers (Otter, Granola) structurally can't replicate it because they don't know what a crit is.

## Architecture

See `docs/architecture.md` for the full diagram. In short: a **platform-agnostic capture core** produces a **structured crit record** (interchange object), and every sink — Figma first, then Jira / Asana / Linear — is a thin adapter over that same record. Build the Figma adapter first; the others come close to free.

## Data model

See `docs/data-model.md` for the `ActionItem` / crit-record schema. Key principle: **scope is a first-class field**, and **design-level (whole-design) feedback is primary, not a fallback.**

## Figma plugin (the v1 sink)

The plugin is the **review surface**, not the listener. Designer opens it post-crit, sees the action-item queue anchored to frames, jumps to transcript moments, checks items off. Skeleton lives in `figma-plugin/` — see its README. The listening half **cannot** be a Figma plugin (sandboxed, no mic/audio/call access).

## Build slices (suggested sequencing)

1. **Capture spike** — stand up the capture path, get a real transcript out of a test Zoom/Teams crit.
2. **Classify + score** — LLM pass that tags utterances and computes the crit-quality scorecard against one rubric library. (Screen 1 logic.)
3. **Rubric libraries** — make the lens configurable; 2–3 starter libraries. (Screen 2.)
4. **Action-item extraction** — produce the structured crit record from the classified transcript.
5. **Figma review plugin** — the panel that renders the queue, anchors to frames, links to transcript. (Stubbed Screen 3.)
6. **Live coaching** — real-time nudges during the call. (Hardest real-time piece; can trail the others.)

Each slice is demoable on its own. **Don't build sink #2 (Jira/Asana/Linear) until the Figma sink and the crit record are proven.**

> **CURRENT FOCUS: Screens 1 & 2** — the live critique experience (transcribe → classify → score → coach) and the rubric libraries that power it. That's slices 2, 3, and 6. The **Figma plugin (slice 5) is the eventual sink, NOT the current target** — `figma-plugin/` is a parked skeleton; don't center it. First working code lives in `core/` (see `core/README.md`): the rubric-library format + starter libraries (Screen 2), an Otter→live-transcript adapter, and an offline-runnable classify/score/coach engine (Screen 1). Run `node core/test.js`.

## Capture path — first big decision (OPEN)

- **A. Native Zoom App + Teams app** — clean native consent story; cost is two platform integrations + two app-review gauntlets. Heavy.
- **B. Meeting-bot-as-a-service** (e.g. Recall.ai) — one API joins Zoom/Teams/Meet from a calendar event, streams back audio + transcript. Fast to prototype; consent/notification becomes your responsibility.

**Lean for v1 prototype: Route B.** Revisit native if consent or enterprise-bot-blocking becomes the constraint. **Verify Recall.ai's current capabilities/pricing before committing — confirm at kickoff, don't assume.** Consent + bot-admittance is a first-class design problem, not a footnote: some target orgs block external bots.

### Otter — two roles, and what it is NOT (researched 2026-06-05)

Otter comes up because it does great in-app live transcription with voice-fingerprint speaker ID. Verified findings:

- **Otter as the live-capture pipe for Screen 1 → NO.** Otter's developer API (Otter Connect API v2, 2026) is **Enterprise-gated** and is a *retrieval* API — it returns stored conversations, transcripts, action items, insights. OtterPilot auto-joins meetings but isn't documented as programmatically controllable to stream a live transcript into a third-party app mid-call. So Otter can't be Critbot's real-time feed.
- **Otter as a dev-corpus / data source → YES.** The connected Otter MCP wraps that retrieval API (`search` → metadata + speaker-attributed action items; `fetch` → full speaker-labeled transcript). Useful for developing and testing the Screen 1 classify/score/coach engine against *real, diarized conversation* before a live feed exists. This is what `core/adapters/otter/` consumes.
- **Live feed stays Route B (Recall.ai).** Recall.ai is purpose-built for the capture need: one API dispatches a bot from a calendar event into Zoom/Teams/Meet/Webex and **streams real-time transcripts + media**. This reinforces the Route B lean. For higher transcript quality, pipe Recall's audio to a dedicated ASR (Deepgram / AssemblyAI / Whisper) — open question #2.

**Air-gap reminder:** real Otter transcripts are Jason's actual meetings (sensitive). Use them only as a runtime dev corpus on Jason's machine; never commit real transcript content. The committed demo uses `core/fixtures/synthetic-transcript.json`.

## Scope boundaries / non-goals (v2+)

- **Generated design iterations** (Screen 3 Option A/B previews) — cost + credibility-risk center; needs deep Figma *write* access. **v2.**
- **In-person / co-located crit capture** (no call to join) — separate ingestion pipeline (local-mic desktop widget). **v2 fork.** v1 assumes a call exists.
- **Design-system-aware enrichment** (token/variant/Code Connect context on spoken feedback) — survives as *enrichment inside the Figma sink*, not the core. **v2.**

## Attribution + air-gap posture

- **Attributed to Jason.** Critbot is a deliberate prospect-facing artifact, already attributed on Figma Community. The open-source-anonymity rule (which governs Slide Publisher) does **NOT** apply here.
- **Air-gapped from CoS.** No CoS specifics, network, intel, or real transcripts in the plugin or demos. **All demo crit data is synthetic.** If a prospect demo emerges, use the two-version pattern.

## Open questions to resolve at kickoff

1. Capture path: confirm Route B (Recall.ai) is current and viable, or commit to native apps. *(Researched 2026-06-05: Recall.ai still the Route B answer — calendar-dispatched bot + real-time transcript stream. Otter ruled out as the live pipe; see "Otter — two roles" above.)*
2. Transcription source: rely on the bot-service's transcript, or pipe audio to a dedicated ASR (Deepgram / AssemblyAI / Whisper) for quality? *(Recall streams a real-time transcript out of the box; ASR upgrade is a quality call, not a blocker.)*
3. Where does the backend live + where is the crit record stored? (Lightweight first — don't over-build infra.)
4. Rubric-library format: how are libraries authored/edited (config file, simple UI)?
5. Consent/admittance design for enterprise calls that block external bots.

## Prerequisites

- Figma Desktop (plugin development).
- A meeting-bot service account (Route B) or Zoom/Teams developer accounts (Route A).
- LLM API access for classify / coach / score / extract.
- A test crit recording or a live test call to spike against.

## Workspace map

```
Critbot/
├── CLAUDE.md                        ← this file (build-state source of truth)
├── README.md                        ← quick orientation
├── Critbot-workspace-bootstrap.md   ← original scoping memo (do not edit; historical)
├── core/                            ← CURRENT FOCUS — Screen 1 & 2 logic (run: node core/test.js)
│   ├── README.md
│   ├── test.js                      ← no-dep smoke test + readable demo
│   ├── rubric-libraries/            ← Screen 2: the lens (the moat)
│   │   ├── library.schema.json
│   │   ├── ux-product-design.json   ← active starter library
│   │   ├── marketing-design.json    ← active starter library
│   │   ├── hbr-strategy.json        ← active starter library
│   │   └── {motion,industrial,editorial,spatial}-design.json  ← stubs
│   ├── engine/
│   │   └── classifyScoreCoach.js    ← Screen 1: classify + score + coach (offline stub provider)
│   ├── adapters/otter/              ← real, diarized transcript as dev corpus
│   │   ├── otterToTranscript.js
│   │   ├── inspect.js               ← structure-only check (safe on real data)
│   │   └── fixtures/synthetic-otter-meeting.json
│   └── fixtures/synthetic-transcript.json   ← committed demo Screen 1 transcript
├── docs/
│   ├── architecture.md              ← capture core + pluggable sinks
│   └── data-model.md                ← the crit record / ActionItem schema
└── figma-plugin/                    ← eventual v1 sink skeleton (NOT current focus)
    ├── manifest.json · code.js · ui.html · package.json · README.md
```
