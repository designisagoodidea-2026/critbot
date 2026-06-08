// coach.js — real-time coaching engine (M2). UMD: Node + browser.
//
// Turns a stream of classified utterances into a SMALL, deduped, prioritized
// feed of live nudges — the opposite of a purple suggestion under every
// fragment. Two sources of cues:
//   1. per-utterance triggers   (u.trigger, set by the LLM classify or the
//      heuristic provider; mapped to library.coachingCues for nudge text)
//   2. run-level timing cues     (computed here from the transcript shape):
//        - design intent not stated within the intro window
//        - lagging engagement (one voice dominating / too few speakers)
//        - off-rubric drift (recurring off-lens trigger)
//
// Dedupe: one active card per trigger, carrying a recurrence `count` and the
// latest timestamp. Priority + a cap keep the panel readable.

"use strict";

// higher = surfaced first; also drives severity
const PRIORITY = {
  "no-design-intent-stated": 100,
  "unsupported-claim": 90,
  "concern-without-next-step": 80,
  "off-rubric": 70,
  "low-engagement": 65,
  "taste-based-feedback": 60
};
const SEVERITY = (trigger) => (PRIORITY[trigger] >= 80 ? "high" : PRIORITY[trigger] >= 65 ? "med" : "low");

// built-in nudge text for run-level cues a library may not define
const BUILTIN = {
  "low-engagement": { nudge: "Engagement is thin — invite a quieter participant in.", kind: "reminder" },
  "no-design-intent-stated": { nudge: "Design intent hasn't been stated — prompt the presenter to frame it.", kind: "reminder" },
  "off-rubric": { nudge: "Discussion is drifting off the active lens — steer it back.", kind: "suggestion" }
};

function cueText(trigger, library) {
  const fromLib = (library.coachingCues || []).find((c) => c.trigger === trigger);
  if (fromLib) return { nudge: fromLib.nudge, kind: fromLib.kind || "suggestion" };
  return BUILTIN[trigger] || { nudge: trigger, kind: "suggestion" };
}

// utterances: [{ speaker, t, text, classification, trigger? }]
// opts: { introWindow=3, engagementWindow=6, maxActive=4 }
function run(utterances, library, opts = {}) {
  const introWindow = opts.introWindow || 3;
  const engagementWindow = opts.engagementWindow || 6;
  const maxActive = opts.maxActive || 4;

  const cues = new Map(); // trigger -> { trigger, nudge, kind, severity, at, count }
  const note = (trigger, at) => {
    if (!trigger) return;
    const prev = cues.get(trigger);
    if (prev) { prev.count++; prev.at = at || prev.at; return; }
    const { nudge, kind } = cueText(trigger, library);
    cues.set(trigger, { trigger, nudge, kind, severity: SEVERITY(trigger), at: at || "", count: 1 });
  };

  // 1) per-utterance triggers
  let intentStated = false;
  utterances.forEach((u) => {
    if (u.trigger) note(u.trigger, u.t);
    if (isIntentStatement(u)) intentStated = true;
  });

  // 2) run-level: intent not stated within the intro window
  if (!intentStated && utterances.length >= introWindow && hasCue(library, "no-design-intent-stated")) {
    note("no-design-intent-stated", utterances[Math.min(introWindow, utterances.length) - 1].t);
  }

  // 3) run-level: lagging engagement over the trailing window
  if (utterances.length >= engagementWindow) {
    const recent = utterances.slice(-engagementWindow);
    const speakers = {};
    recent.forEach((u) => (speakers[u.speaker] = (speakers[u.speaker] || 0) + 1));
    const distinct = Object.keys(speakers).length;
    const topShare = Math.max(...Object.values(speakers)) / recent.length;
    if (distinct < 2 || topShare > 0.7) note("low-engagement", recent[recent.length - 1].t);
  }

  return [...cues.values()]
    .sort((a, b) => (PRIORITY[b.trigger] || 0) - (PRIORITY[a.trigger] || 0))
    .slice(0, maxActive);
}

function hasCue(library, trigger) {
  return (library.coachingCues || []).some((c) => c.trigger === trigger) || !!BUILTIN[trigger];
}
// a "design intent" statement: explicit intent framing (used to suppress the reminder)
function isIntentStatement(u) {
  return /\b(the intent|design intent|the problem we'?re solving|the goal is|this is for)\b/i.test(u.text || "");
}

const api = { run, PRIORITY, SEVERITY };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.CritbotCoach = api;
