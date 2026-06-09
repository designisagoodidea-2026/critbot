// skillLens.js — the SECOND rim implementation of the Lens interface (M13).
//
// A skill lens is a profile authored as *prose*: a markdown perspective (what this
// participant cares about, what good looks like to them, when to nudge them) instead
// of structured rubric JSON. This is the "presenter brings their own perspective"
// capability from docs/lens-model.md — and the proof of the unlock: the engine
// (RubricLens / runLens) drives a completely different authoring model UNCHANGED.
//
// Offline (no API key) it runs through the same heuristic provider as RubricLens, so
// tests stay green. When an LLM provider + key are present, the prose `perspective`
// is folded into the prompt (see engine/llmProvider.js) so the lens actually reasons
// from the participant's stated intent.
//
// Skill format — markdown with a JSON frontmatter block:
//   ---
//   { "id": "...", "label": "...", "audience": "presenter-private",
//     "extends": "<library-or-profile-id>",            // optional composition
//     "faculties": { "score": {"enabled":true}, ... }, // optional toggles
//     "scoring": [...], "coachingCues": [...] }         // optional rim config
//   ---
//   # Perspective
//   ...prose the lens reasons from...

"use strict";

const { normalizeProfile, RubricLens } = require("./lens");

// Split a skill doc into { fm (frontmatter object), perspective (body prose) }.
function parseSkill(src) {
  const text = String(src);
  let fm = {};
  let body = text;
  const m = text.match(/^\uFEFF?---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (m) {
    try { fm = JSON.parse(m[1]); }
    catch (e) { throw new Error("skill frontmatter must be valid JSON: " + e.message); }
    body = m[2];
  }
  if (!fm || !fm.id) throw new Error("skill requires an 'id' in its JSON frontmatter.");
  return { fm, perspective: String(body).trim() };
}

// Map a parsed skill onto a raw profile that normalizeProfile() understands.
function skillToProfile(skill) {
  const fm = skill.fm;
  const firstLine = (skill.perspective.split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) || "presenter perspective").trim();
  return {
    id: fm.id,
    name: fm.label || fm.name || fm.id,
    label: fm.label || fm.id,
    domain: fm.domain || "Presenter",
    description: fm.description || "A participant-authored lens (skill).",
    extends: fm.extends,
    audience: fm.audience || "presenter-private",
    faculties: fm.faculties,
    classificationTaxonomy: fm.classificationTaxonomy,
    scoring: fm.scoring,
    coachingCues: fm.coachingCues,
    guidelines: fm.guidelines || [{ id: "perspective", label: "Participant perspective", detail: firstLine }],
    perspective: skill.perspective,
    context: fm.context,
  };
}

// SkillLens: build the skill-derived profile, then drive it with the SAME engine.
// The returned object satisfies the Lens interface identically to RubricLens —
// only meta.kind tells you it was authored as prose.
function SkillLens(skillInput, opts) {
  opts = opts || {};
  const skill = (typeof skillInput === "string") ? parseSkill(skillInput)
    : (skillInput && skillInput.fm) ? skillInput
    : parseSkill(String(skillInput));
  const profile = normalizeProfile(skillToProfile(skill), opts.registry);
  const lens = RubricLens(profile, opts.provider);
  lens.meta.kind = "skill";
  lens.meta.audience = profile.audience;
  lens.meta.perspective = (profile.perspective || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return lens;
}

// Factory: pick the right rim implementation. Skill if it's markdown/parsed-skill;
// otherwise a rubric library/profile.
function makeLens(input, opts) {
  opts = opts || {};
  const isSkill = (typeof input === "string") || (input && input.fm && typeof input.perspective === "string");
  if (isSkill) return SkillLens(input, opts);
  const profile = (input && input.__normalized) ? input : normalizeProfile(input, opts.registry);
  return RubricLens(profile, opts.provider);
}

module.exports = { parseSkill, skillToProfile, SkillLens, makeLens };
