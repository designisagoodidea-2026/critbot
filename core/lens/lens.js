// lens.js — the frozen core + the Lens interface (M8 Phase 0), plus RubricLens (M9 Phase 1).
//
// This is the seam described in docs/lens-model.md. The engine no longer reads a
// rubric JSON directly; it drives a Lens. A static rubric, a skill, or an MCP/agent
// are all just rim implementations of the same interface over a frozen core.
//
// ── FROZEN CORE (the slots every sink + the crit record depend on) ──────────────
//   CritEvent     { speaker, t, tSeconds?, text, role?, authority? }   ← what capture emits
//   Classification  type ∈ profile.faculties.classify.vocabulary       (an utterance always has ONE)
//   Coaching      { trigger, nudge, kind, ear }   ear ∈ shared | presenter-private | role-scoped
//   ScoreCell     { id, label, met?, value?, note }
//   Annotation    { target, marker, note }        (reserved; not emitted by the offline provider yet)
//
// ── THE LENS INTERFACE (any rim implementation satisfies this) ──────────────────
//   lens.meta              → { id, label, faculties }
//   lens.observe(ev, ctx)  → { classification, aiSuggestion?, trigger?, coaching: [] }   per event
//   lens.finalize(ctx)     → { scorecard: ScoreCell[] }                                   end of stream
//
// `role`/`authority` on CritEvent are M7's provenance in live form — populated by the
// capture path (M10), null in the offline corpus. They ride the event so a lens can use
// them without the core changing.

"use strict";
// IIFE-wrapped so nothing leaks into the browser's shared script scope (the live
// page loads this as a <script> alongside the engine; top-level consts would collide).
(function () {

const CORE_TYPES = ["approval", "suggestion", "concern", "question", "statement"];
const FACULTIES = ["classify", "score", "annotate", "coach", "extract"];
// Back-compat alias: the engine historically exported TYPES.
const TYPES = CORE_TYPES;

// ── Provider: deterministic heuristic (offline stand-in for the LLM pass) ────────
// Unchanged from the original engine. A skill/MCP lens swaps this for an LLM-backed
// provider with the same { classify, signals } interface.
const heuristicProvider = {
  classify(text) {
    const t = text.toLowerCase().trim();
    if (t.endsWith("?") || /^(could|can|how|what|why|when|would|do you|did)\b/.test(t)) return "question";
    if (/\b(concerned|worried|issue|problem|risk|fails?|breaks?)\b/.test(t)) return "concern";
    if (/\b(could|should|let's|we could|suggest|recommend|try|increase|reduce|add)\b/.test(t)) return "suggestion";
    if (/\b(i like|looks good|great|solid|love|agree|nice|works well|sounds (like a )?solid)\b/.test(t)) return "approval";
    return "statement";
  },
  signals(text) {
    const t = text.toLowerCase();
    const hit = [];
    if (/\b(intent|trying to|goal|the problem|we wanted)\b/.test(t)) hit.push("design-intent-stated");
    if (/\b(research|testing|data|users?|analytics|screen readers?)\b/.test(t)) hit.push("evidence");
    if (/\b(contrast|accessib|wcag|aaa|aria|target size)\b/.test(t)) hit.push("accessibility");
    if (/\b(could|should|increase|reduce|add|test|let's)\b/.test(t)) hit.push("actionable");
    return hit;
  }
};

// ── Profile normalization (the declarative Screen 2 artifact) ────────────────────
// A rubric library IS a profile: its fields map straight onto the rim. `normalizeProfile`
// adds the faculties block (all on by default, matching legacy behavior) and resolves
// `extends` composition (house → team → personal). Pass a registry { id: rawProfile }
// when a profile uses `extends`.
function emptyFaculties() {
  return {
    classify: { enabled: true },
    score:    { enabled: true },
    annotate: { enabled: false },
    coach:    { enabled: true },
    extract:  { enabled: false },
  };
}

function normalizeProfile(input, registry) {
  registry = registry || {};
  if (input && input.__normalized) return input;
  if (!input) throw new Error("normalizeProfile: a profile (or rubric library) is required (the lens).");

  let base = null;
  if (input.extends) {
    const parentRaw = registry[input.extends];
    if (!parentRaw) throw new Error(`profile '${input.id}' extends unknown profile '${input.extends}' (not in registry)`);
    base = normalizeProfile(parentRaw, registry);
  }

  const f = emptyFaculties();
  if (base) for (const k of FACULTIES) f[k] = Object.assign({}, base.faculties[k]);

  // This level's explicit enabled overrides.
  const inF = input.faculties || {};
  for (const k of FACULTIES) {
    if (inF[k] && typeof inF[k].enabled === "boolean") f[k].enabled = inF[k].enabled;
  }

  // Rim config: prefer this level, else inherited, else core defaults.
  const vocab = input.classificationTaxonomy || (base && base.faculties.classify.vocabulary) || CORE_TYPES.slice();
  f.classify.vocabulary = vocab.slice();
  const scoring = input.scoring || (base && base.scoring) || [];
  f.score.dimensions = scoring.map((d) => ({ id: d.id, label: d.label, definition: d.description || d.definition || "" }));
  const cues = input.coachingCues || (base && base.coachingCues) || [];
  f.coach.cues = cues.map((c) => ({ trigger: c.trigger, nudge: c.nudge, kind: c.kind || "suggestion" }));

  return {
    __normalized: true,
    id: input.id,
    label: input.name || input.label || input.id,
    domain: input.domain || (base && base.domain) || "",
    guidelines: input.guidelines || (base && base.guidelines) || [],
    scoring,
    coachingCues: cues,
    faculties: f,
    audience: input.audience || (base && base.audience) || "shared",
    // Prose perspective carried for perspective-aware providers (the skill lens, M13).
    // Empty for rubric libraries; the heuristic provider ignores it.
    perspective: input.perspective || (base && base.perspective) || "",
    // Context bindings the MCP lens (M14) resolves and folds into the perspective.
    context: input.context || (base && base.context) || [],
  };
}

function buildRegistry(rawProfiles) {
  const reg = {};
  (rawProfiles || []).forEach((p) => { if (p && p.id) reg[p.id] = p; });
  return reg;
}

function facultySummary(f) {
  const o = {};
  for (const k of FACULTIES) o[k] = f[k].enabled !== false;
  return o;
}

// ── RubricLens: the first rim implementation (reproduces legacy engine behavior) ──
function RubricLens(profileInput, provider) {
  const profile = (profileInput && profileInput.__normalized) ? profileInput : normalizeProfile(profileInput);
  provider = provider || heuristicProvider;
  const F = profile.faculties;

  // Internal accumulation across the event stream (the lens owns its state).
  const speakers = new Set();
  const signalsSeen = new Set();
  const classified = [];

  const cueBy = (trigger) => {
    const c = (F.coach.cues || []).find((x) => x.trigger === trigger);
    return c ? { trigger: c.trigger, nudge: c.nudge, kind: c.kind || "suggestion" } : null;
  };

  return {
    meta: { id: profile.id, label: profile.label, faculties: facultySummary(F) },

    observe(u, ctx) {
      const out = { coaching: [] };

      // classify (core): an utterance always gets one value, drawn from the profile vocabulary.
      out.classification = F.classify.enabled === false ? null : provider.classify(u.text, profile);
      speakers.add(u.speaker);
      provider.signals(u.text, profile).forEach((s) => signalsSeen.add(s));
      classified.push({ ...u, classification: out.classification });

      // coach (faculty): only if enabled. Order preserved from the legacy loop.
      if (F.coach.enabled !== false) {
        if (ctx.index === 0 && !signalsSeen.has("design-intent-stated")) {
          const cue = cueBy("no-design-intent-stated");
          if (cue) { out.aiSuggestion = cue; out.trigger = cue.trigger; out.coaching.push({ at: u.t, ear: profile.audience, ...cue }); }
        }
        if (out.classification === "concern" && !/\b(could|should|increase|reduce|add|test)\b/i.test(u.text)) {
          const cue = cueBy("concern-without-next-step") || cueBy("unsupported-claim");
          if (cue) { out.aiSuggestion = out.aiSuggestion || cue; out.trigger = out.trigger || cue.trigger; out.coaching.push({ at: u.t, ear: profile.audience, ...cue }); }
        }
      }
      return out;
    },

    finalize() {
      // score (faculty): only if enabled.
      if (F.score.enabled === false) return { scorecard: [] };
      return { scorecard: scoreCard(profile, { utterances: classified, speakers, signalsSeen }) };
    }
  };
}

// ── Driver: feed the event stream to a lens, collect emissions ───────────────────
function runLens(transcript, lens) {
  const utterances = transcript.utterances.map((u) => ({ ...u }));
  const coachingFeed = [];
  const ctx = { index: 0, total: utterances.length };

  utterances.forEach((u, i) => {
    ctx.index = i;
    const out = lens.observe(u, ctx) || {};
    if (out.classification !== undefined) u.classification = out.classification;
    if (out.aiSuggestion) u.aiSuggestion = u.aiSuggestion || out.aiSuggestion;
    if (out.trigger) u.trigger = u.trigger || out.trigger;
    (out.coaching || []).forEach((c) => coachingFeed.push(c));
  });

  const fin = (lens.finalize ? lens.finalize(ctx) : {}) || {};
  return {
    meetingId: transcript.meetingId,
    title: transcript.title,
    profile: lens.meta.id,
    library: lens.meta.id, // back-compat alias (M4 crit record reads `library`)
    utterances,
    scorecard: fin.scorecard || [],
    coachingFeed,
  };
}

// Map evidence from the transcript onto each of the profile's scoring dimensions.
// (Unchanged scoring logic; `profile.scoring` carries the dimensions.)
function scoreCard(profile, ctx) {
  const concerns = ctx.utterances.filter((u) => u.classification === "concern").length;
  const actionable = ctx.utterances.filter((u) => ["suggestion"].includes(u.classification)).length;

  return (profile.scoring || []).map((dim) => {
    let met = false;
    let note = "";
    switch (dim.id) {
      case "design-intent-stated":
      case "intent-stated":
        met = ctx.signalsSeen.has("design-intent-stated");
        note = met ? "Intent framed early" : "No intent framing detected";
        break;
      case "engagement":
        met = ctx.speakers.size >= 3;
        note = `${ctx.speakers.size} participants`;
        break;
      case "evidence-based":
        met = ctx.signalsSeen.has("evidence");
        note = met ? "References to research/testing/data" : "Feedback leans on opinion";
        break;
      case "actionable":
        met = actionable > 0 || ctx.signalsSeen.has("actionable");
        note = `${actionable} actionable suggestions, ${concerns} concerns`;
        break;
      default:
        met = false;
        note = "Not scored by the offline provider";
    }
    return { id: dim.id, label: dim.label, met, note };
  });
}

const Lens = {
  CORE_TYPES, TYPES, FACULTIES,
  heuristicProvider,
  normalizeProfile, buildRegistry, facultySummary,
  RubricLens, runLens, scoreCard,
};
if (typeof module !== "undefined" && module.exports) module.exports = Lens;
if (typeof window !== "undefined") window.CritbotLens = Lens;
})();
