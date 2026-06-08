# Data model — the crit record

The crit record is the **interchange object** every sink adapts. Its atom is the `ActionItem`. Make **scope a first-class field**, not an afterthought.

```
ActionItem {
  id
  content            // the described feedback / fix
  type               // approval | suggestion | concern | question | statement | decision
  scope              // design-level | single-frame | component-set  (multi-select)
  targets[]          // figma node IDs (may be empty for design-level)
  transcriptAnchor   // timestamp + speaker, for "view in transcript"
  rubricTag          // which library guideline it maps to (e.g. Accessibility, Typography)
  status             // open | resolved | skipped
}
```

## Design principles

**Whole-design / generalized feedback is primary, not a fallback.** "What is this page even for?" is the high-leverage senior-crit feedback and cascades into hierarchy, affordances, CTAs, framing. The schema must represent **design-level scope as a first-class citizen** — `targets[]` can legitimately be empty.

**Frame attribution = guess-then-confirm.** Capture loosely during the live call; resolve which node(s) a comment attaches to **post-event in review**. Never interrupt the live crit to disambiguate — that kills the meeting.

**Multi-select targets.** Feedback often spans a small set of components, so `targets[]` and `scope` both support multiple values.

## Field notes

| Field | Notes |
|---|---|
| `type` | Mirrors the live-classification taxonomy (Approval / Suggestion / Concern / Question / Statement), plus `decision` for resolved-in-call outcomes. |
| `scope` | Drives how the Figma sink renders an item (pinned to nodes vs. surfaced as design-level). Multi-select. |
| `targets[]` | Figma node IDs. Empty is valid (design-level feedback). Populated via guess-then-confirm in review. |
| `transcriptAnchor` | Timestamp + speaker — powers "view in transcript" from any action item. |
| `rubricTag` | Links the item back to the rubric-library guideline that surfaced it; the thread connecting capture, scoring, and the moat. |
| `status` | `open` → `resolved` / `skipped`, toggled by the designer in the review panel. |

## The crit record (the exportable wrapper)

`ActionItem`s don't travel alone — a finished crit is exported as a **crit record** that wraps them with context (built by `core/engine/critRecord.js`, M4):

```
CritRecord {
  critbotVersion
  meta            // title, library (lens), source, startedAt, endedAt, speakers[]
  scorecard[]     // { id, label, met, note } — the live crit-quality dimensions
  coaching[]      // { trigger, nudge, kind, severity, count } — what the coach surfaced
  transcript[]    // { speaker, t, text, classification }
  actionItems[]   // ActionItem (above)
}
```

This is the interchange object: exported as JSON (source of truth) and rendered to Markdown for sharing. Every sink — the Figma review panel first, then Jira / Asana / Linear — reads this same record.

### Relationship enrichment (M7)

When a roster + relationship policy are set, each `ActionItem` is enriched and the record gains a `relationshipSummary`:

```
ActionItem += {
  provenance: { speaker, role, authority, relationship }  // relationship ∈ above | peer | below | unknown
  weight              // policy multiplier (authority and/or expertise)
  promotedToDecision  // a directive from above the presenter recorded as a decision
  flags[]             // e.g. "junior-point-protect", "expertise-weighted"
}
CritRecord += { relationshipSummary: { presenter, policy, promotedToDecision, protectedJuniorPoints, note } }
```

`meta.invited` (from the calendar event, M6) vs `meta.speakers` (who actually spoke, from diarization) are the two roster layers the policy reasons over.
