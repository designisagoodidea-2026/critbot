# The lens model — frozen core + pluggable profiles (Screen 2)

> **STATUS: DESIGN ONLY, PARKED.** Seeded 2026-06-08 from a scoping discussion on reframing Screen 2 from static rubric libraries to a pluggable lens. This doc defines a *contract*, not a build. The thing worth locking now is the **core/rim boundary** (below); the marketplace it implies is explicitly out of scope. Couples to `architecture.md` (sinks) and `data-model.md` (the crit record).

---

## What Screen 2 actually is

Not a rubric library. It's the **definition layer** for the whole experience:

- It's the **lens for Screen 1** — what the live critique interface classifies, marks up, scores, and coaches against.
- It's the **sense-making filter for the outputs** — how the transcript, action items, and outcomes get interpreted after the call.
- It decides **whether "how's the crit going" feedback even happens.** Some crits want a live scorecard and coaching; some don't. That's a setting, not a special case.

The static-rubric framing felt muddy because it fused three different jobs into one blob. Splitting them is what lets skills, MCP, and the data model each do the part they're actually good at.

## Three layers, three mechanisms

| Layer | Job | Mechanism |
|---|---|---|
| **Vocabulary + shape** | The slots: what an utterance, a score, an action item *are* | **Data model** (declarative, frozen) |
| **Judgment + perspective** | What gets poured into the slots: what a good crit is, when to nudge, what the nudge says | **Skill** (opinionated, authorable in prose) |
| **Context** | What the judgment needs to reach: design intent, the design system, prior crits, the ticket | **MCP** (live retrieval) |

A static rubric tried to be all three. It's fine at the first, weak at the second, incapable of the third — which is exactly why a presenter wanting to bring *their own* perspective is the strongest version of Screen 2, not a side feature. "State your design intent" is a rubric line; *knowing what the intent was* is an MCP-backed skill.

## Faculties

Screen 1 is not one behavior — it's a set of **faculties**, each independently switchable and definable:

- **classify** — tag each utterance
- **score** — rate the crit against dimensions ("how's it going")
- **annotate** — mark up the transcript / Screen 1 components
- **coach** — surface live nudges
- **extract** — produce action items from the classified transcript

Screen 2 defines, **per faculty, three things**: *is it on*, *what vocabulary it uses*, *what its content is*. "Some crits want feedback, some don't" is just `score.enabled = false`, `coach.enabled = false`. A capture-only crit is classify + extract with everything else off.

So Screen 2 is not a rubric — it's a **profile** that configures the faculties. The rubric library becomes a **library of profiles**.

## The crux: frozen core vs. open rim

The moment a lens can define its own classifications, the interchange object is at risk — every sink and the scorecard would have to handle categories they've never seen. The whole asset (per `architecture.md`) is that capture is decoupled from sinks *because the record is stable*. So draw a hard line:

**Core — frozen. The data model. The slots every sink depends on.**

- an utterance has a `speaker`, a `t`, and *a* `classification` (some value)
- a score signal has a `dimension` id, a `value` in 0..1, and an `evidence` pointer
- a coaching event has a `nudge` and an `ear` (who it's addressed to)
- an `ActionItem` has `scope` + `transcriptAnchor` (see `data-model.md`)
- the `CritRecord` wrapper shape is fixed

**Rim — open. Skill + MCP. What a lens is free to define.**

- *which* classification values exist (the `type` vocabulary)
- *which* score dimensions exist and what each one means
- whether each faculty runs at all
- nudge content + coaching policy + who hears it
- which annotation markers appear on Screen 1
- **what "going well" means**

Get this line right and a static rubric, a presenter's skill, and a full agent are all just **rim implementations over a frozen core** — sinks never break no matter what plugs in. Get it wrong (let the rim redefine the core) and the interchange object dissolves.

### "Going well" lives in the rim — on purpose

"What counts as a good crit" is a value judgment. An early-exploration crit and a ship-readiness review don't share a definition, and different design cultures weight evidence, intent, and engagement differently. The **core must not encode a theory of a good crit.** It provides the slots — here's a dimension, here's a 0..1, here's where the evidence is — and the **lens supplies the meaning.** Bake a definition into the engine and you've quietly picked a side for everyone.

## The contract

### Profile — the Screen 2 artifact (declarative)

What a profile author (or a UI) produces. A static rubric library is just a profile with no skill/MCP bindings.

```
Profile {
  id
  label
  extends?              // inheritance: house → team → personal
  audience              // default ear: shared | presenter-private | role-scoped
  faculties {
    classify  { enabled, vocabulary[] }            // values default to the core types
    score     { enabled, dimensions[ {id,label,definition} ] }
    annotate  { enabled, markers[] }               // what gets marked up on Screen 1
    coach     { enabled, policy, ear }             // when to nudge, addressed to whom
    extract   { enabled, scopes[] }                // action-item extraction rules
  }
  context[]             // skill / MCP bindings the lens may pull from (design system,
                        //   prior crit records, the Figma file, the ticket)
}
```

### Lens — the runtime interface (behavioral)

The thing a static profile, a skill, and a full agent all implement. It observes the transcript stream and emits into the frozen slots:

```
Lens.observe(event) → 0+ of:
  Classification { utteranceId, type }          // type ∈ profile.classify.vocabulary
  ScoreSignal    { dimension, value: 0..1, evidence }
  Annotation     { target, marker, note }
  Coaching       { nudge, kind, severity, ear }
  ActionItem     { ...core ActionItem }          // scope + transcriptAnchor required
```

Three rim implementations of the same interface:

- **Rubric lens** — a profile with no bindings; deterministic rules over the taxonomy. ✅ shipped (M9).
- **Skill lens** — a markdown perspective the engine adopts: judgment and nudge content in prose, no execution risk. ✅ shipped (M13) — `core/lens/skillLens.js`, prose authored as JSON-frontmatter markdown, runs through the same `runLens`, carries a `presenter-private` ear.
- **MCP / context lens** — resolves `context[]` bindings via a ContextProvider and folds the retrieved context into the perspective. ✅ shipped (M14) — `core/lens/mcpLens.js`; offline `inMemoryContextProvider`, production wraps MCP tools.

The engine doesn't care which it got. That's the unlock.

### Whose ear — output addressing

Once lenses are per-participant, *who hears an output* becomes a first-class field, not an afterthought. The presenter's personal lens likely coaches the **presenter privately** ("you haven't answered Dana's empty-state concern"), while the house profile scores the crit **shared**. Hence `ear` on every coaching/annotation emission and `audience` as a profile default. Multiple lenses on one transcript is, honestly, just what a good crit *is* — multiple perspectives — but it forces a **merge/conflict model** for divergent scores and overlapping action items. That model is out of scope here; the contract just has to leave room for it (lenses emit independently; nothing assumes a single author).

## What this changes in the existing model

Surprisingly little — the crit record already calls `meta.library` "the lens," already carries `scorecard[]`, `coaching[]`, and per-utterance `classification`. The reframe mostly **renames and generalizes** what's there:

- `meta.library` → `meta.profile` (a profile, possibly composed via `extends`, not a single static library).
- `coaching[]` entries gain an `ear`; the record may carry outputs from **more than one lens**.
- `scorecard[]` dimensions become **profile-defined** rather than fixed — but each entry keeps its frozen shape (`{ id, label, met/value, note }`), so the Figma sink is unaffected.
- `classification` values become **profile-defined**, drawn from `faculties.classify.vocabulary`, defaulting to the current core types so nothing breaks on day one.

No sink has to change. That's the test that the core/rim line is drawn correctly.

## Scope discipline — what to lock now

**Lock:** the core/rim boundary and the two contracts above. They cost almost nothing today and keep the platform option fully open.

**Do not build:** the profile-authoring UI, the multi-lens merge model, or anything resembling a plugin marketplace. Per `CLAUDE.md`, Critbot is PARKED and the moat only deepens into a platform if Critbot *owns this contract and ships the best first-party profiles* — open the interface without owning or seeding it and it's just scope creep.

**Next concrete step when un-parked:** make `core/`'s rubric format a `Profile`, and refactor `classifyScoreCoach.js` to consume a `Lens` rather than a rubric JSON. Static-rubric-as-lens first; skill and MCP lenses are then additive, not a rewrite. This also resolves open question #4 (rubric-library format) in `CLAUDE.md`.

## Roadmap — reconciled with the build state

**Done (M1–M7 + packaging).** Not just an offline engine — a working live prototype: real LLM classify/score/coach against the rubric libraries (M1), the coaching engine (M2), Screen 2 as a real screen (M3), the crit-record wrapper + export (M4), a tag-correction training loop (M4.1), capture hardening (M5), **live mic → Deepgram diarized capture** plus calendar detection/auto-join (M5–M6), social-graph relationship policies (M7), and packaging (Electron app + a Figma plugin that renders records). All of it reads the *current* rubric/record contract — which is why the seam (Phase 1) is now **more** urgent than when first sketched: seven milestones of code already lean on the un-refactored contract, and the cost only rises.

**Three strands ahead.** The lens phases don't run alone; they interleave with two near-term workstreams:

- **A · Capture — mostly BUILT; remote-call piece remains.** Local mic → Deepgram diarized capture, calendar detection/auto-join, and manual + diarized rosters already work and feed Screen 1. The genuinely unbuilt remainder is narrower: **Recall.ai bot dispatch** into a remote Zoom/Teams call, **real-calendar OAuth** (Google / Graph behind the existing event seam), and **live in-call role annotation** — now built as an offline core (`core/live/roleAnnotator.js`: stamps role / authority / relationship onto each event, reusing the M7 logic); what remains is wiring it into the running relay.
- **B · Lens (Screen 2 refactor).** Phases 0–5 above.
- **C · Figma sink + frame pinning.** The review panel (slice 5) renders the crit record; **frame pinning** resolves `ActionItem.targets[]` via guess-then-confirm (see `data-model.md`). Gated on real Figma *read* access.

**The seam that ties A and B together.** Phase 0 doesn't only lock the lens core/rim — it locks the **event** that capture (A) emits and the lens (B) consumes: an utterance carrying `speaker`, `t`, `text`, and now `role` / `authority` (M7's live form). Lock it once and the strands proceed independently — capture builds the stream, the lens consumes it, neither blocks the other.

**Recommended order (M8+).**

| Milestone | Strand | What | Gate / note |
|---|---|---|---|
| **M8** | B | **Phase 0** — freeze core/rim + the live event shape | Paper. Gates everything. |
| **M9** | B | **Phase 1** — seam refactor: profiles + `RubricLens`; `test.js` green, zero behavior change | Cheapest now; cost rises each milestone |
| **M10** | A | **Remote-call capture + live role annotation** — local capture/calendar/rosters already built; remaining: Recall.ai bot dispatch, real-calendar OAuth, role/authority onto the live event | Recall.ai + OAuth are account-gated; live role annotation is buildable now |
| **M11** | B | **Phase 2** — faculty toggles + profile composition | "Some crits want feedback, some don't" becomes real once live crits exist |
| **M12** | C | **Figma sink + frame pinning** — render crit record, resolve `targets[]` | Gated on Figma read access |
| **M13** | B | **Phase 3** — skill lens ✅ **DONE**: prose-authored lens over the same `runLens`, presenter-private ear (`core/lens/skillLens.js`) | Was unblocked by the existing LLM provider |
| **M14** | B | **Phase 4** — MCP / context lens ✅ **DONE**: `context[]` resolved via a ContextProvider, folded into the perspective (`core/lens/mcpLens.js`) | Live sources (prior-crits store, Figma MCP) wrap the same interface; durable store = OQ#3 |
| **v2+** | B / — | **Phase 5** (multi-lens + "whose ear") and the **Generated Design Iterations** module | Separate deliverable; needs Figma *write* |

**Strand A is now mostly done, so B leads.** Local capture, calendar, and rosters already ship, and M8/M9/M11 (the seam + faculty toggles) are done. What's left in A splits by gate: **live in-call role annotation is buildable now** (the roster + relationships engine exist — it's wiring provenance onto the live event), while **Recall.ai dispatch + real-calendar OAuth are account-gated** and wait on those decisions. B's **skill lens (M13), the MCP/context lens (M14), and live role annotation are now built** (offline cores; `node core/test.js` green). What remains: **frame pinning (M12)** (needs a Figma file for the confirm loop), wiring **role annotation into the running relay**, and the account-gated capture pieces (Recall.ai dispatch, real-calendar OAuth).

**Generated design iterations — a separate module, not a phase.** Per the scope call: its own deliverable. Needs Figma *write* access, depends on frame pinning (M12) to anchor a generated variant, and carries the cost + credibility risk. Keep it off the main sequence as a downstream module gated on a proven Figma sink.
