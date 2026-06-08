# Critbot — Workspace Bootstrap

*Use this to spin up a dedicated Critbot workspace (a new Claude Project and/or a code project folder at `/Documents/Claude/Projects/Critbot/`). Paste the relevant sections into the new workspace's `CLAUDE.md`. Drafted 2026-06-05 from the CoS scoping discussion. Critbot is still **PARKED** behind translation-engine and slide-publisher — this seeds the workspace; it doesn't un-park the build.*

---

## 1. What this workspace is

The build workspace for **Critbot** — a crit-aware meeting-capture agent for design teams. It joins a design critique call, transcribes and structures the conversation live, coaches the crit as it happens, and hands the designer a queue of action items to work through the next time they sit down to iterate.

This is a **product/code workspace**, not a Chief of Staff function. It couples back to CoS (see §12) but is air-gapped from CoS intel, network, and transcripts.

## 2. Role for a Claude working here

You are the build partner for Critbot v1: part product engineer, part design-tooling architect, part DesignOps thinker. Favor practical, shippable slices over completeness. Translate technical choices into plain operational language — Jason is the architect and decision-maker, not a traditional SWE. Surface tradeoffs and recommend; don't bury decisions.

## 3. Product definition — v1 (locked)

A crit-aware meeting agent that:

- **Joins the call** (Zoom / Microsoft Teams) via an invited agent, aware of the calendar event (Gmail or Outlook).
- **Transcribes live** and **auto-classifies** each utterance: Approval / Suggestion / Concern / Question / Statement.
- **Coaches the crit in real time** — nudges like "remind presenter to state design intent" or "ask a clarifying question about user testing."
- **Scores critique quality** live against a configurable rubric (design intent stated, engagement, evidence-based, actionable).
- **Runs against configurable critique rubric libraries** (UX Product / Marketing / HBR-Strategy / Motion / Industrial / Editorial / Spatial), which define the lens the classifier, coach, and scorer use.
- **Outputs a queue** of described, transcript-traced, frame-anchored action items the designer reviews post-crit. The output is **required** — without it Critbot is just a better transcript.

The **center of gravity is capture.** Figma is the v1 output surface because that's where crits happen — but the capture engine is platform-agnostic and the output is portable to other sinks later.

## 4. Prototype screen map (source of truth for scope)

Reference: Figma Make prototype, published at https://glade-invert-73458930.figma.site (the `figma.com/make` editor link is org-blocked and client-rendered — use the published site or a screenshot).

| Screen | What it is | v1? |
|---|---|---|
| **1 — Live Critique** | Live transcript + auto-classification + real-time coaching + crit-quality scorecard | ✅ v1 (headline) |
| **2 — Best Practices / Libraries** | Configurable critique rubric libraries; the lens for classify/coach/score | ✅ v1 (the moat) |
| **3 — Action Queue** | *Generated design iterations* (Option A/B previews) traced to transcript | ⛔ de-scoped → v2. v1 keeps only a **lightweight described-action-item queue** (no generated variants) |

The rubric-library system (Screen 2) is the defensible differentiator — DesignOps expertise (frameworks, rituals, cross-team standardization) turned into product. Generic notetakers (Otter, Granola) structurally can't replicate it because they don't know what a crit is.

## 5. Architecture — capture core + pluggable sinks

```
[ Calendar (Gmail / Outlook) ] → detects crit events
            │
            ▼
[ Capture component ] ── joins Zoom/Teams, captures audio
            │
            ▼
[ Backend ] ── real-time transcription → LLM (classify + coach + score) → structured crit record
            │
            ├──► [ Figma plugin ]  ← v1 PRIMARY SINK (review surface)
            └──► [ Jira / Asana / Linear ]  ← later sinks (same structured output)
```

Keep the **capture core platform-agnostic** and the **output an interchange object** (see §7). Then every sink — Figma, Jira, Asana, Linear — is a thin adapter over the same record. Build the Figma adapter first; the others come free-ish.

## 6. Capture path — the first big decision (open)

The listening/joining half **cannot be a Figma plugin** (plugins are sandboxed in the editor — no mic, no system audio, no call access). Two routes:

- **A. Native Zoom App + Teams app.** Inherits each platform's native consent/recording prompts (clean consent story). Cost: two separate platform integrations, each with its own SDK and app-review gauntlet. Heavy.
- **B. Meeting-bot-as-a-service** (e.g. Recall.ai). One API joins Zoom / Teams / Meet, dispatches a bot from a calendar event, and streams back audio + real-time transcript. Fast to prototype. Cost: you're one step removed from native consent UI, so consent/notification becomes your responsibility.

**Lean for v1 prototype: Route B** (fastest path to a working capture demo). Revisit native apps if/when consent or enterprise-bot-blocking becomes the constraint. **Verify current Recall.ai capabilities/pricing before committing** — confirm at kickoff, don't assume.

**Consent is a real gate.** Some enterprises block external bots from calls — exactly the design-tooling orgs in the target list. Treat consent + bot-admittance as a first-class design problem, not a footnote.

## 7. Data model — the crit record

Make **scope a first-class field**, not an afterthought:

```
ActionItem {
  id
  content            // the described feedback / fix
  type               // approval | suggestion | concern | question | statement | decision
  scope              // design-level | single-frame | component-set (multi-select)
  targets[]          // figma node IDs (may be empty for design-level)
  transcriptAnchor   // timestamp + speaker, for "view in transcript"
  rubricTag          // which library guideline it maps to (e.g. Accessibility, Typography)
  status             // open | resolved | skipped
}
```

Notes that fell out of the discussion:

- **Whole-design / generalized feedback is primary, not a fallback.** "What is this page even for?" is the high-leverage senior-crit feedback and cascades into hierarchy, affordances, CTAs, framing. The schema must represent design-level scope as a first-class citizen.
- **Frame attribution = guess-then-confirm.** Capture loosely during the live call; resolve which node(s) a comment attaches to **post-event in review**. Never interrupt the live crit to disambiguate — that kills the meeting.
- Support **multi-select** targets (feedback often spans a small set of components).

## 8. Figma plugin (the v1 sink)

The plugin is the **review surface**, not the listener. Designer opens it post-crit, sees the action-item queue anchored to frames, jumps to transcript moments, and checks items off.

Key concept to internalize (trips up everyone new to Figma plugins): a plugin runs in **two isolated contexts** —

- **Sandbox (main thread):** has the `figma` API (read/write the document), no DOM. → `code.js`.
- **UI (iframe):** normal HTML/CSS/JS, renders your panel, no `figma` API. → `ui.html`.
- They communicate only via `postMessage` (`figma.ui.postMessage` ↔ `figma.ui.onmessage`).

Minimal scaffold = `manifest.json` + `code.js` (`figma.showUI(__html__)`) + `ui.html`. Beyond Hello World, use TypeScript + `@figma/plugin-typings` + a bundler (esbuild) — Figma's "With UI & browser APIs" template sets this up. Development requires **Figma Desktop**. (The plugin-scaffolding script Jason wants is a sensible warm-up here — it spins up this skeleton on demand.)

## 9. Build slices (suggested sequencing)

1. **Capture spike** — stand up Route B, get a real transcript out of a test Zoom/Teams crit.
2. **Classify + score** — LLM pass that tags utterances and computes the crit-quality scorecard against one rubric library. (Screen 1 logic.)
3. **Rubric libraries** — make the lens configurable; 2–3 starter libraries. (Screen 2.)
4. **Action-item extraction** — produce the structured crit record (§7) from the classified transcript.
5. **Figma review plugin** — the panel that renders the queue, anchors to frames, links to transcript. (Stubbed Screen 3.)
6. **Live coaching** — real-time nudges during the call. (Hardest real-time piece; can trail the others.)

Each slice is demoable on its own. Don't build sink #2 (Jira/Asana/Linear) until the Figma sink and the crit record are proven.

## 10. Scope boundaries / non-goals (v2 and beyond)

- **Generated design iterations** (Screen 3 Option A/B with previews) — the cost + credibility-risk center; needs deep Figma *write* access. **v2.**
- **In-person / co-located crit capture** (no call to join) — a separate ingestion pipeline (local-mic desktop widget). **v2 fork.** v1 assumes a call exists, which holds for the product's whole life cycle.
- **Design-system-aware enrichment** (attach token/variant/Code Connect context to spoken feedback) — the original Critbot idea; survives as *enrichment inside the Figma sink*, not the core. **v2.**

## 11. Attribution + air-gap posture

- **Attributed to Jason.** Critbot is a deliberate prospect-facing artifact, already attributed on Figma Community. The open-source-anonymity rule (which governs Slide Publisher) does **NOT** apply here.
- **Air-gapped from CoS.** No CoS specifics, network, intel, or real transcripts in the plugin or demos. **All demo crit data is synthetic.** If a prospect demo emerges, use the two-version pattern.

## 12. Coupling back to Chief of Staff

When this workspace is created, add a CoS coupling memory (`cos_critbot_coupling.md`) mirroring the Slide Publisher / Translation Engine coupling pointers: names the Critbot project path, the air-gap rule, and the attribution posture. The canonical scoping lives in CoS memory at `cos_poc_critbot_plugin.md` until this workspace takes ownership — then this workspace's `CLAUDE.md` becomes source of truth for build state and the CoS memory becomes the pointer.

## 13. Open questions to resolve at kickoff

1. Capture path: confirm Route B (Recall.ai) is current and viable, or commit to native apps.
2. Transcription source: rely on the bot-service's transcript, or pipe audio to a dedicated ASR (Deepgram / AssemblyAI / Whisper) for quality?
3. Where does the backend live + where is the crit record stored? (Lightweight first — don't over-build infra.)
4. Rubric-library format: how are libraries authored/edited (config file, simple UI)?
5. Consent/admittance design for enterprise calls that block external bots.

## 14. Prerequisites

- Figma Desktop (plugin development).
- A meeting-bot service account (if Route B) or Zoom/Teams developer accounts (if Route A).
- LLM API access for classify / coach / score / extract.
- A test crit recording or a live test call to spike against.

---

*Sequencing reminder: Critbot stays parked behind translation-engine and slide-publisher. Un-parking is a deliberate prioritization call — see `cos_poc_critbot_plugin.md` for the triggers that would justify it.*
