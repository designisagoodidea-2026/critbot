// classifyScoreCoach.js — Screen 1 engine (Live Critique logic)
//
// Input:  a transcript model (utterances[]) + an active rubric library.
// Output: { utterances (now classified + nudged), scorecard, coachingFeed }.
//
// Three jobs, all run through the library's lens:
//   1. classify  — tag each utterance: approval | suggestion | concern | question | statement
//   2. score     — compute the crit-quality scorecard (the library's scoring dims)
//   3. coach     — surface real-time nudges from the library's coachingCues
//
// PROVIDER MODEL: production runs an LLM (the lens = library guidelines in the
// prompt). For a parked skeleton that runs offline with no API key, we ship a
// deterministic heuristic provider. Swap `heuristicProvider` for an LLM-backed
// provider with the same interface when un-parked (see ./README.md).

"use strict";

const TYPES = ["approval", "suggestion", "concern", "question", "statement"];

// ---- Provider: deterministic heuristic (offline stand-in for the LLM pass) ----
const heuristicProvider = {
  classify(text) {
    const t = text.toLowerCase().trim();
    if (t.endsWith("?") || /^(could|can|how|what|why|when|would|do you|did)\b/.test(t)) return "question";
    if (/\b(concerned|worried|issue|problem|risk|fails?|breaks?)\b/.test(t)) return "concern";
    if (/\b(could|should|let's|we could|suggest|recommend|try|increase|reduce|add)\b/.test(t)) return "suggestion";
    if (/\b(i like|looks good|great|solid|love|agree|nice|works well|sounds (like a )?solid)\b/.test(t)) return "approval";
    return "statement";
  },
  // Detect which library guidelines an utterance touches (by keyword overlap with labels/detail).
  signals(text, library) {
    const t = text.toLowerCase();
    const hit = [];
    if (/\b(intent|trying to|goal|the problem|we wanted)\b/.test(t)) hit.push("design-intent-stated");
    if (/\b(research|testing|data|users?|analytics|screen readers?)\b/.test(t)) hit.push("evidence");
    if (/\b(contrast|accessib|wcag|aaa|aria|target size)\b/.test(t)) hit.push("accessibility");
    if (/\b(could|should|increase|reduce|add|test|let's)\b/.test(t)) hit.push("actionable");
    return hit;
  }
};

// ---- Engine ----
function run(transcript, library, provider = heuristicProvider) {
  if (!library) throw new Error("classifyScoreCoach: an active rubric library is required (the lens).");

  const utterances = transcript.utterances.map((u) => ({ ...u }));
  const coachingFeed = [];
  const speakers = new Set();
  const signalsSeen = new Set();

  utterances.forEach((u, i) => {
    u.classification = provider.classify(u.text, library);
    speakers.add(u.speaker);
    provider.signals(u.text, library).forEach((s) => signalsSeen.add(s));

    // Coaching: first utterance with no stated intent → remind.
    if (i === 0 && !signalsSeen.has("design-intent-stated")) {
      const cue = pickCue(library, "no-design-intent-stated");
      if (cue) { u.aiSuggestion = cue; u.trigger = u.trigger || cue.trigger; coachingFeed.push({ at: u.t, ...cue }); }
    }
    // Concern with no nearby actionable step → nudge.
    if (u.classification === "concern" && !/\b(could|should|increase|reduce|add|test)\b/i.test(u.text)) {
      const cue = pickCue(library, "concern-without-next-step") || pickCue(library, "unsupported-claim");
      if (cue) { u.aiSuggestion = u.aiSuggestion || cue; u.trigger = u.trigger || cue.trigger; coachingFeed.push({ at: u.t, ...cue }); }
    }
  });

  const scorecard = scoreCard(library, { utterances, speakers, signalsSeen });
  return { meetingId: transcript.meetingId, title: transcript.title, library: library.id, utterances, scorecard, coachingFeed };
}

function pickCue(library, trigger) {
  const c = (library.coachingCues || []).find((x) => x.trigger === trigger);
  return c ? { trigger: c.trigger, nudge: c.nudge, kind: c.kind || "suggestion" } : null;
}

// Map evidence from the transcript onto each of the library's scoring dimensions.
function scoreCard(library, ctx) {
  const total = ctx.utterances.length || 1;
  const concerns = ctx.utterances.filter((u) => u.classification === "concern").length;
  const actionable = ctx.utterances.filter((u) =>
    ["suggestion"].includes(u.classification)).length;

  return (library.scoring || []).map((dim) => {
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

// UMD-style export: works under Node (CommonJS) and in the browser (global).
const CritbotEngine = { run, heuristicProvider, TYPES };
if (typeof module !== "undefined" && module.exports) module.exports = CritbotEngine;
if (typeof window !== "undefined") window.CritbotEngine = CritbotEngine;
