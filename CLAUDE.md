# CLAUDE.md — Critbot Build Workspace

> **Build rules + routing for Critbot.** Seeded 2026-06-05 from `Critbot-workspace-bootstrap.md` (CoS scoping discussion); **`ROADMAP.md` owns milestone status.** Air-gapped from CoS (see below).
>
> **STATUS: ACTIVE prototype — built through M1–M7 + packaging.** Working today (see `ROADMAP.md`): live mic → Deepgram diarized capture → Screen 1; real LLM classify/score/coach against the rubric libraries; the coaching engine; calendar detection + auto-join; relationship policies; the Electron desktop app; and a Figma plugin that renders exported crit records. **Current thread:** the Screen-2 lens refactor (M8+, see `docs/lens-model.md`) — M8/M9/M11 done, plus **M13 skill lens, M14 MCP/context lens, and live role annotation** (`core/lens/`, `core/live/roleAnnotator.js`). **Genuinely unbuilt near-term:** Recall.ai bot dispatch into remote Zoom/Teams calls, real-calendar OAuth, and Figma frame pinning (M12).

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

See `docs/architecture.md` for the full diagram. In short: a **platform-agnostic capture core** produces a **structured crit record** (interchange object), and every sink — Figma first, then Jira / Asana / Linear — is a thin adapter over that same record. Build the Figma adapter first; the others come close to free. The input side is symmetric: Screen 2 is a **pluggable lens** over the transcript (frozen core / open rim) — the dual of the sinks. See `docs/lens-model.md`.

## Data model

See `docs/data-model.md` for the `ActionItem` / crit-record schema. Key principle: **scope is a first-class field**, and **design-level (whole-design) feedback is primary, not a fallback.**

## Figma plugin (the v1 sink)

The plugin is the **review surface**, not the listener. Designer opens it post-crit, sees the action-item queue, jumps to transcript moments, checks items off. **Built** (`figma-plugin/`): loads an exported crit record and renders the queue with M7 role/weight/decision/protect badges, meta, scorecard, and relationship notes; loads in Figma Desktop. Still to come: **frame pinning** — anchoring items to `targets[]` node IDs (M12, guess-then-confirm). The listening half **cannot** be a Figma plugin (sandboxed, no mic/audio/call access).

## Build slices (suggested sequencing)

1. **Capture spike** — stand up the capture path, get a real transcript out of a test Zoom/Teams crit.
2. **Classify + score** — LLM pass that tags utterances and computes the crit-quality scorecard against one rubric library. (Screen 1 logic.)
3. **Rubric libraries → profiles** — make the lens configurable; 2–3 starter libraries. (Screen 2.) **Now built as `Profile`s over a frozen `Lens` interface, not static rubric JSON — see `docs/lens-model.md`.**
4. **Action-item extraction** — produce the structured crit record from the classified transcript.
5. **Figma review plugin** — the panel that renders the queue, anchors to frames, links to transcript. (Stubbed Screen 3.)
6. **Live coaching** — real-time nudges during the call. (Hardest real-time piece; can trail the others.)

Each slice is demoable on its own. **Don't build sink #2 (Jira/Asana/Linear) until the Figma sink and the crit record are proven.**

> **CURRENT FOCUS: the Screen-2 lens refactor (M8+).** Screens 1 & 2 are built and run live (transcribe → classify → score → coach in `core/live/`, real LLM provider, against the rubric libraries); the Figma plugin is a working review sink. The current thread reshapes Screen 2 into **pluggable lenses** — see `docs/lens-model.md`; M8/M9/M11 plus the M13 skill lens, M14 MCP/context lens, and live role annotation are done in `core/lens/` + `core/profiles/` + `core/live/roleAnnotator.js`, with `node core/test.js` green (offline engine + parity + skill/MCP lenses + role annotation). The original slice list (1–6) is superseded by the M-series in `ROADMAP.md` and the M8+ sequence in `docs/lens-model.md`.

## Reconciled roadmap (post-M7)

**Done — M1–M7:** offline engine (classify / score / coach), static rubric libraries, action-item extraction, crit-record wrapper (M4), calendar/roster data model (M6), social-graph enrichment + packaging (M7) — all against synthetic / Otter corpus.

**Screen 2 is being rebuilt as the lens model** (agreed 2026-06-08): static rubric → pluggable `Profile`s over a frozen `Lens` interface (frozen core / open rim). Full contract + sequencing live in `docs/lens-model.md`. Three strands ahead, interleaved:

- **A · Capture (go live)** — Recall.ai bot dispatch, calendar detection, live rosters, live role annotation. The slice-1 spike, now near-term; produces the live event stream.
- **B · Lens refactor** — Phases 0–5 (lock contract → seam → faculty toggles → skill lens → MCP lens → multi-lens).
- **C · Figma sink + frame pinning** — review panel + resolve `ActionItem.targets[]` (guess-then-confirm).

**Order (M8+):** M8 Phase 0 (freeze core/rim + live event shape) → M9 Phase 1 (seam: profiles + `RubricLens`, zero behavior change) → M10 capture go-live → M11 Phase 2 (faculty toggles) → M12 Figma sink + frame pinning → M13 Phase 3 (skill lens) → M14 Phase 4 (MCP lens) → v2+ Phase 5 (multi-lens) + generated iterations. Strands A and B are concurrent-safe once M8 locks the event; their order is a priority call. Gates and rationale in `docs/lens-model.md`.

## Capture path — BUILT (local); remote-call admission still open

**Built:** local mic → **Deepgram** diarized streaming → relay (`core/live/`) → Screen 1. A self-hosted **WhisperLiveKit** local-ASR option exists too (`relay-local.js`), and `relayHttp.js` proves the ASR vendor is swappable without touching the page/engine. So Screen 1 already runs on a real, live conversation.

**Still open — getting into a *remote* call.** The built path captures a local mic; it does not yet *join* a Zoom/Teams meeting. Two routes:

- **A. Native Zoom App + Teams app** — clean native consent story; cost is two platform integrations + two app-review gauntlets. Heavy.
- **B. Meeting-bot-as-a-service** (e.g. Recall.ai) — one API dispatches a bot from a calendar event into Zoom/Teams/Meet, streams back audio + transcript. The documented `/api/join` seam (M6) is built for exactly this; in the prototype "join" auto-starts local capture.

**Lean: Route B.** **Verify Recall.ai's current capabilities/pricing before committing.** Consent + bot-admittance is a first-class design problem: some target orgs block external bots.

### Otter — two roles, and what it is NOT (researched 2026-06-05)

Otter comes up because it does great in-app live transcription with voice-fingerprint speaker ID. Verified findings:

- **Otter as the live-capture pipe for Screen 1 → NO.** Otter's developer API (Otter Connect API v2, 2026) is **Enterprise-gated** and is a *retrieval* API — it returns stored conversations, transcripts, action items, insights. OtterPilot auto-joins meetings but isn't documented as programmatically controllable to stream a live transcript into a third-party app mid-call. So Otter can't be Critbot's real-time feed.
- **Otter as a dev-corpus / data source → YES.** The connected Otter MCP wraps that retrieval API (`search` → metadata + speaker-attributed action items; `fetch` → full speaker-labeled transcript). Useful for developing and testing the Screen 1 classify/score/coach engine against *real, diarized conversation* before a live feed exists. This is what `core/adapters/otter/` consumes.
- **Live feed stays Route B (Recall.ai).** Recall.ai is purpose-built for the capture need: one API dispatches a bot from a calendar event into Zoom/Teams/Meet/Webex and **streams real-time transcripts + media**. This reinforces the Route B lean. For higher transcript quality, pipe Recall's audio to a dedicated ASR (Deepgram / AssemblyAI / Whisper) — open question #2.

**Air-gap reminder:** real Otter transcripts are Jason's actual meetings (sensitive). Use them only as a runtime dev corpus on Jason's machine; never commit real transcript content. The committed demo uses `core/fixtures/synthetic-transcript.json`.

## Scope boundaries / non-goals (v2+)

- **Generated design iterations** (Screen 3 Option A/B previews) — cost + credibility-risk center; needs deep Figma *write* access. Likely a **separate module / deliverable, not a build phase** — depends on frame pinning (M12) and a proven Figma sink. **v2.**
- **In-person / co-located crit capture** (no call to join) — separate ingestion pipeline (local-mic desktop widget). **v2 fork.** v1 assumes a call exists.
- **Design-system-aware enrichment** (token/variant/Code Connect context on spoken feedback) — survives as *enrichment inside the Figma sink*, not the core. **v2.**

## Attribution + air-gap posture

- **Attributed to Jason.** Critbot is a deliberate prospect-facing artifact, already attributed on Figma Community. The open-source-anonymity rule (which governs Slide Publisher) does **NOT** apply here.
- **Air-gapped from CoS.** No CoS specifics, network, intel, or real transcripts in the plugin or demos. **All demo crit data is synthetic.** If a prospect demo emerges, use the two-version pattern.

## Open questions

1. Capture path: **local capture is BUILT (Deepgram live + WhisperLiveKit option).** Remaining decision: Recall.ai **bot dispatch** into a remote Zoom/Teams call (needs an account; the `/api/join` seam is built) vs. native apps. Verify Recall.ai capabilities/pricing before committing.
2. Transcription source: **Resolved** — Deepgram live, with a self-hosted WhisperLiveKit option; ASR vendor is swappable via `relayHttp.js` without touching the page/engine.
3. Backend + crit-record storage: the `core/live/` relay is the prototype backend; a record exports as `record.json` + `summary.md`. **Durable multi-crit storage is still open** — the MCP lens (M14) would want prior crits queryable.
4. Rubric-library format: *(Resolved 2026-06-08: `Profile`s over a frozen `Lens` interface — frozen core / open rim, faculties model. See `docs/lens-model.md`. Authoring UI explicitly deferred.)*
5. Consent/admittance for enterprise calls that block external bots. **Partial** — a consent note is in the UI (M5); enterprise bot-admission remains open and ties to the Route-B decision in #1.

## Prerequisites

- Figma Desktop (plugin development).
- A meeting-bot service account (Route B) or Zoom/Teams developer accounts (Route A).
- LLM API access for classify / coach / score / extract.
- A test crit recording or a live test call to spike against.

## Workspace map

```
Critbot/
├── CLAUDE.md                        ← this file (build-state rules + routing)
├── ROADMAP.md                       ← milestone status (M1–M7 + packaging DONE; see its "Parked")
├── README.md                        ← quick orientation
├── Critbot-workspace-bootstrap.md   ← original scoping memo (do not edit; historical)
├── core/                            ← Screen 1 & 2 logic + capture (run: node core/test.js)
│   ├── README.md · test.js          ← orientation + no-dep smoke test/demo
│   ├── lens/                        ← the seam (M8–M14): frozen core + Lens interface + lenses
│   │   ├── lens.js                  ← normalizeProfile + RubricLens + runLens
│   │   ├── skillLens.js             ← prose-authored skill lens (M13)
│   │   ├── mcpLens.js               ← MCP/context lens (M14)
│   │   └── CONTRACT.md              ← frozen-core / open-rim contract
│   ├── profiles/                    ← Screen 2 as faculties (M11): schema, capture-only, skills/ (skill lenses)
│   ├── rubric-libraries/            ← Screen 2 lenses (the moat): 3 active + 4 stubs + schema
│   ├── engine/                      ← Screen 1 intelligence + crit record
│   │   ├── classifyScoreCoach.js    ← classify/score/coach — now a shim over lens/ (M9)
│   │   ├── coach.js                 ← live-coaching engine (M2)
│   │   ├── llmProvider.js           ← LLM classify/score/coach/extract (heuristic = offline fallback)
│   │   ├── critRecord.js            ← crit-record wrapper + Markdown export (M4)
│   │   ├── calendar.js              ← crit-event detection + invited roster (M6)
│   │   └── relationships.js         ← relationship-policy engine / social graph (M7)
│   ├── relationship-policies/       ← M7 policies (hierarchical / peer / expertise-led) + schema
│   ├── live/                        ← capture + Screen 1/2 UI: Deepgram relay, rosters, roleAnnotator.js — see live/README
│   ├── desktop/                     ← Electron menubar/desktop shell (M5 packaging) — see desktop/README
│   ├── adapters/otter/              ← real diarized transcript as dev corpus (inspect = structure-only)
│   └── fixtures/                    ← synthetic-transcript.json + generator/ (eval harnesses)
├── docs/
│   ├── architecture.md              ← capture core + pluggable sinks (+ pluggable lenses)
│   ├── data-model.md                ← the crit record / ActionItem schema
│   └── lens-model.md                ← Screen 2 as pluggable lenses + reconciled roadmap (M8+)
└── figma-plugin/                    ← v1 Figma review sink: loads a crit record, renders the queue (M7 badges)
```
