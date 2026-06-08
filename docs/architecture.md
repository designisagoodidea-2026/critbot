# Architecture — capture core + pluggable sinks

The design principle: keep the **capture core platform-agnostic** and make the **output an interchange object** (the crit record, see `data-model.md`). Every sink — Figma, Jira, Asana, Linear — is then a thin adapter over the same record. Build the Figma adapter first; the others come close to free.

```
[ Calendar (Gmail / Outlook) ] ── detects crit events
            │
            ▼
[ Capture component ] ── joins Zoom / Teams, captures audio
            │
            ▼
[ Backend ] ── real-time transcription
            │        → LLM (classify + coach + score)
            │        → structured crit record
            │
            ├──► [ Figma plugin ]            ← v1 PRIMARY SINK (review surface)
            └──► [ Jira / Asana / Linear ]   ← later sinks (same structured output)
```

## Component notes

**Calendar detection.** Watches Gmail / Outlook for crit events; the trigger that dispatches the capture component to the right call.

**Capture component.** Joins Zoom / Teams and captures audio. This is the half that **cannot** be a Figma plugin — plugins are sandboxed in the editor with no mic, no system audio, no call access. Two routes (see CLAUDE.md → "Capture path"): native Zoom/Teams apps (Route A) or meeting-bot-as-a-service like Recall.ai (Route B, leaning for v1). Consent + bot-admittance is a first-class design problem here.

**Backend.** Real-time transcription → LLM pass (classify each utterance, coach the crit, score quality against the active rubric library) → emits the structured crit record. Keep infra lightweight first; don't over-build (open question #3).

**Sinks.** Each is an adapter over the crit record. Figma is the v1 review surface because that's where crits happen. Jira / Asana / Linear are later sinks — **do not build sink #2 until the Figma sink and the crit record are proven.**

## Why this shape

The rubric-library system is the moat: DesignOps expertise (frameworks, rituals, cross-team standardization) turned into the lens that the classifier, coach, and scorer all run through. Generic notetakers can't replicate it because they don't model what a crit is. Keeping capture decoupled from the sink means that moat is reusable across every future output surface.
