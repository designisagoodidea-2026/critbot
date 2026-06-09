# The lens contract (M8 · Phase 0)

The frozen seam between capture (what produces the transcript) and Screen 2 (what makes sense of it). Full rationale in `../../docs/lens-model.md`; this file is the code-level contract. **Nothing past this line is allowed to redraw the core.**

## Frozen core — the slots every sink + the crit record depend on

```
CritEvent      { speaker, t, tSeconds?, text, role?, authority? }   ← what capture (M10) emits
Classification   type ∈ profile.faculties.classify.vocabulary       ← an utterance always has ONE
Coaching       { trigger, nudge, kind, ear }   ear ∈ shared | presenter-private | role-scoped
ScoreCell      { id, label, met?, value?, note }
Annotation     { target, marker, note }        (reserved; offline provider doesn't emit yet)
```

`role` / `authority` on `CritEvent` are M7's provenance in live form — populated by the capture path, `null`/absent in the offline corpus. They ride the event so a lens can use them without the core changing.

## The Lens interface — every rim implementation satisfies this

```
lens.meta              → { id, label, faculties }
lens.observe(ev, ctx)  → { classification, aiSuggestion?, trigger?, coaching: [] }   per event
lens.finalize(ctx)     → { scorecard: ScoreCell[] }                                   end of stream
```

`ctx = { index, total }`. The lens owns its own accumulation across the stream; the driver (`runLens`) just feeds events in order and collects emissions.

## Open rim — what a profile/lens is free to define

The faculties, each independently switchable (`enabled`) and configurable:

| Faculty | Config the rim supplies | Core guarantee |
|---|---|---|
| `classify` | `vocabulary[]` | every utterance gets exactly one value |
| `score` | `dimensions[] {id,label,definition}` | each cell keeps the `ScoreCell` shape |
| `coach` | `cues[]`, policy, `ear` | each nudge keeps the `Coaching` shape |
| `annotate` | `markers[]` | reserved |
| `extract` | `scopes[]` | reserved (ActionItem lives in `data-model.md`) |

"What counts as a good crit" lives entirely here, not in the core. `score.enabled = false` + `coach.enabled = false` = a capture-only crit. See `../profiles/capture-only.json`.

## Three rim implementations of one interface

- **RubricLens** (`lens.js`) — a profile with no skill/MCP bindings; the deterministic rules that were the M1–M7 engine. ✅ shipped (M9).
- **SkillLens** (`skillLens.js`) — a markdown perspective the engine adopts. ✅ shipped (M13): `parseSkill` + `skillToProfile` normalize prose (JSON frontmatter + body) into a profile; `SkillLens` then runs through the *same* `runLens`. Offline it falls back to the heuristic provider; with an API key the prose `perspective` folds into the prompt (`llmProvider.js`). Carries a `presenter-private` ear so coaching can be addressed to one participant. Example: `../profiles/skills/presenter-onboarding.skill.md`.
- **MCPLens** (`mcpLens.js`) — pulls live context (prior crits, design system, the Figma file) via a `ContextProvider`, folds it into the perspective, runs through the same `runLens`. ✅ shipped (M14): offline uses `inMemoryContextProvider`; production wraps MCP tools. The prior-crits source is open question #3's durable store.

The engine (`runLens`) never knows which it got — proven: the skill and MCP lens results are interchangeable with the rubric one. That is the unlock.

Separately, **live role annotation** (`../live/roleAnnotator.js`) stamps the CritEvent's reserved `role`/`authority` (plus relationship-to-presenter) onto each event as it streams, reusing the M7 logic — the live form of provenance, fed in upstream of any lens.
