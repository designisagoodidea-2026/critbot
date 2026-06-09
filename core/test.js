// test.js — no-dep smoke test + readable demo for the Screen 1 / Screen 2 core.
// Run: node core/test.js   (from repo root, or `node test.js` from core/)
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { otterMeetingToTranscript, parseOtterTranscript } = require("./adapters/otter/otterToTranscript");
const engine = require("./engine/classifyScoreCoach");
const skills = require("./lens/skillLens");
const mcp = require("./lens/mcpLens");
const roles = require("./live/roleAnnotator");
const relationships = require("./engine/relationships");

const here = __dirname;
const load = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));

const library = load("rubric-libraries/ux-product-design.json");
const syntheticTranscript = load("fixtures/synthetic-transcript.json");
const otterMeeting = load("adapters/otter/fixtures/synthetic-otter-meeting.json");

let failures = 0;
function check(name, fn) {
  try { fn(); console.log("  ok   " + name); }
  catch (e) { failures++; console.log("  FAIL " + name + " — " + e.message); }
}

console.log("\n=== Adapter: Otter → Screen 1 transcript ===");
const adapted = otterMeetingToTranscript(otterMeeting);
check("parses all 6 synthetic utterances", () => assert.strictEqual(adapted.utterances.length, 6));
check("preserves speakers", () => assert.strictEqual(adapted.utterances[0].speaker, "Sarah Chen"));
check("converts timestamps to mm:ss", () => assert.strictEqual(adapted.utterances[5].t, "2:03"));
check("leaves classification null (engine's job)", () =>
  assert.strictEqual(adapted.utterances[0].classification, null));
check("multi-line continuation joins", () => {
  const u = parseOtterTranscript("[0:00:01] A: hello\nworld\n[0:00:05] B: hi");
  assert.strictEqual(u.length, 2);
  assert.strictEqual(u[0].text, "hello world");
});

console.log("\n=== Engine: classify + score + coach (UX Product Design lens) ===");
const result = engine.run(syntheticTranscript, library);
check("every utterance classified", () =>
  result.utterances.forEach((u) => assert.ok(engine.TYPES.includes(u.classification))));
check("scorecard has the library's 4 dimensions", () =>
  assert.strictEqual(result.scorecard.length, 4));
check("engagement = met (3 speakers)", () =>
  assert.strictEqual(result.scorecard.find((s) => s.id === "engagement").met, true));
check("emits at least one coaching nudge", () => assert.ok(result.coachingFeed.length >= 1));

console.log("\n--- Live Transcript (classified) ---");
result.utterances.forEach((u) => {
  const nudge = u.aiSuggestion ? "  ⟶ nudge: " + u.aiSuggestion.nudge : "";
  console.log(`  [${u.t}] ${u.speaker} (${u.classification}): ${u.text}${nudge}`);
});

console.log("\n--- Critique Quality scorecard ---");
result.scorecard.forEach((s) => console.log(`  ${s.met ? "✓" : "○"} ${s.label} — ${s.note}`));

console.log("\n--- Coaching feed ---");
result.coachingFeed.forEach((c) => console.log(`  @${c.at} [${c.kind}] ${c.nudge}`));

// ── M9 seam + M11 faculty toggles ───────────────────────────────────────────────
console.log("\n=== Lens model: seam (M9) + faculty toggles (M11) ===");

// The engine now drives a Lens. A rubric library normalizes into a Profile with all
// faculties on, so this path must reproduce the legacy output exactly (parity).
check("seam: library normalizes to a profile (faculties all on)", () => {
  const p = engine.normalizeProfile(library);
  assert.deepStrictEqual(
    p.faculties && {
      classify: p.faculties.classify.enabled, score: p.faculties.score.enabled, coach: p.faculties.coach.enabled,
    },
    { classify: true, score: true, coach: true }
  );
});
check("seam: RubricLens reproduces baseline classifications + scorecard", () => {
  const viaLens = engine.runLens(syntheticTranscript, engine.RubricLens(engine.normalizeProfile(library)));
  assert.deepStrictEqual(viaLens.utterances.map((u) => u.classification), result.utterances.map((u) => u.classification));
  assert.strictEqual(viaLens.scorecard.length, result.scorecard.length);
  assert.strictEqual(viaLens.coachingFeed.length, result.coachingFeed.length);
});

// A capture-only profile turns score + coach OFF via the faculty switches, and
// inherits its classify vocabulary from ux-product-design via `extends`.
const registry = engine.buildRegistry([
  load("rubric-libraries/ux-product-design.json"),
  load("rubric-libraries/marketing-design.json"),
  load("rubric-libraries/hbr-strategy.json"),
]);
const captureProfile = engine.normalizeProfile(load("profiles/capture-only.json"), registry);
const captureLens = engine.RubricLens(captureProfile);
const captureResult = engine.runLens(syntheticTranscript, captureLens);

check("toggles: utterances still classified (classify stays on)", () =>
  captureResult.utterances.forEach((u) => assert.ok(engine.TYPES.includes(u.classification))));
check("toggles: scorecard empty (score faculty off)", () =>
  assert.strictEqual(captureResult.scorecard.length, 0));
check("toggles: no coaching (coach faculty off)", () =>
  assert.strictEqual(captureResult.coachingFeed.length, 0));
check("composition: inherits the 5-class vocabulary via extends", () =>
  assert.strictEqual(captureProfile.faculties.classify.vocabulary.length, 5));

console.log("\n--- Capture-only profile (extends ux-product-design; score + coach off) ---");
console.log("  faculties:", JSON.stringify(captureLens.meta.faculties));
console.log("  classified utterances:", captureResult.utterances.length,
  "| scorecard:", captureResult.scorecard.length, "| nudges:", captureResult.coachingFeed.length);

// ── M13 skill lens ───────────────────────────────────────────────────────────────
console.log("\n=== Lens model: skill lens (M13) — a prose-authored lens ===");

// A presenter's perspective, authored as markdown, becomes a lens. It runs through
// the SAME engine (runLens) as the rubric path — the proof of the seam.
const skillSrc = fs.readFileSync(path.join(here, "profiles/skills/presenter-onboarding.skill.md"), "utf8");
const skillReg = engine.buildRegistry([load("rubric-libraries/ux-product-design.json")]);
const skillLens = skills.SkillLens(skillSrc, { registry: skillReg });
const skillResult = engine.runLens(syntheticTranscript, skillLens);

check("skill lens: parses + reports it was authored as prose", () =>
  assert.strictEqual(skillLens.meta.kind, "skill"));
check("skill lens: same interface — every utterance classified", () =>
  skillResult.utterances.forEach((u) => assert.ok(engine.TYPES.includes(u.classification))));
check("skill lens: scores the skill's 3 presenter dimensions", () =>
  assert.strictEqual(skillResult.scorecard.length, 3));
check("skill lens: coaching is addressed to the presenter privately (whose-ear)", () => {
  assert.ok(skillResult.coachingFeed.length >= 1);
  skillResult.coachingFeed.forEach((c) => assert.strictEqual(c.ear, "presenter-private"));
});
check("skill lens: inherits the 5-class vocabulary from the library via extends", () =>
  assert.strictEqual(skills.skillToProfile(skills.parseSkill(skillSrc)).extends, "ux-product-design"));
check("skill lens: interchangeable with RubricLens (same runLens, different author)", () =>
  assert.deepStrictEqual(Object.keys(skillResult).sort(), Object.keys(result).sort()));

console.log("\n--- Skill lens (Sarah's presenter perspective; ear = presenter-private) ---");
console.log("  kind:", skillLens.meta.kind, "| audience:", skillLens.meta.audience);
console.log("  perspective:", JSON.stringify(skillLens.meta.perspective));
console.log("  scorecard:", skillResult.scorecard.map((s) => `${s.met ? "✓" : "○"} ${s.id}`).join("  "));
skillResult.coachingFeed.forEach((c) => console.log(`  @${c.at} [${c.ear}] ${c.nudge}`));

// ── M14 MCP / context lens ─────────────────────────────────────────────────────────
console.log("\n=== Lens model: MCP / context lens (M14) — a lens that pulls context ===");

// A context provider that, in production, wraps MCP tools (a prior-crits store, a
// design-system MCP). Offline it's in-memory. The lens folds what it retrieves into
// its perspective, then runs through the SAME runLens.
const mcpSkillSrc = fs.readFileSync(path.join(here, "profiles/skills/presenter-onboarding-mcp.skill.md"), "utf8");
const contextProvider = mcp.inMemoryContextProvider({
  priorCrits: () => "Prior onboarding crit (2 wks ago): progressive disclosure tested well, moderated (n=8); drop-off concentrated at step 3.",
  designSystem: () => "Secondary buttons use color/secondary (#6B7280 on #fff ≈ 3.1:1, below AA). Token button/secondary-strong meets AA."
});
const mcpReg = engine.buildRegistry([load("rubric-libraries/ux-product-design.json")]);
const mcpLens = mcp.MCPLens(mcpSkillSrc, { contextProvider, registry: mcpReg });
const mcpResult = engine.runLens(syntheticTranscript, mcpLens);

check("mcp lens: resolves both context bindings", () =>
  assert.strictEqual(mcpLens.meta.context.length, 2));
check("mcp lens: folds retrieved context into the lens (nonzero)", () =>
  assert.ok(mcpLens.meta.contextChars > 0 && /progressive disclosure tested/.test(mcpLens._resolvedContext[0].text)));
check("mcp lens: reports it's context-backed", () =>
  assert.strictEqual(mcpLens.meta.kind, "mcp"));
check("mcp lens: same interface — classifies + interchangeable result", () => {
  mcpResult.utterances.forEach((u) => assert.ok(engine.TYPES.includes(u.classification)));
  assert.deepStrictEqual(Object.keys(mcpResult).sort(), Object.keys(result).sort());
});
check("mcp lens: degrades gracefully with no provider", () =>
  assert.strictEqual(mcp.MCPLens(mcpSkillSrc, { registry: mcpReg }).meta.context.length, 0));

console.log("\n--- MCP lens (skill + retrieved context) ---");
console.log("  kind:", mcpLens.meta.kind, "| context:", mcpLens.meta.context.join(", "), "| chars:", mcpLens.meta.contextChars);

// ── Live role annotation ───────────────────────────────────────────────────────────
console.log("\n=== Live role annotation — provenance on the event stream ===");

const roster = load("fixtures/synthetic-roster.json");
const policy = load("relationship-policies/hierarchical.json");
const annotated = roles.annotateTranscript(syntheticTranscript, roster, policy);

check("role annotation: every event carries a relationship", () =>
  annotated.utterances.forEach((u) => assert.ok(["above", "peer", "below", "unknown"].includes(u.relationship))));
check("role annotation: the presenter is flagged", () =>
  assert.ok(annotated.utterances.some((u) => u.isPresenter)));
check("role annotation: Marcus reads as above the presenter, weighted by policy", () => {
  const m = annotated.utterances.find((u) => u.speaker === "Marcus Liu");
  assert.strictEqual(m.relationship, "above");
  assert.strictEqual(m.weight, 1.5); // hierarchical policy: above
});
check("role annotation: matches the M7 record-path computation (parity)", () => {
  const items = syntheticTranscript.utterances.map((u) => ({ text: u.text, classification: "statement", transcriptAnchor: { speaker: u.speaker } }));
  const enriched = relationships.enrich({ items, roster, policy });
  const live = {}; annotated.utterances.forEach((u) => { live[u.speaker] = u.relationship; });
  enriched.items.forEach((it) => assert.strictEqual(it.provenance.relationship, live[it.provenance.speaker]));
});
check("role annotation: provenance survives runLens into the classified stream", () => {
  const r = engine.runLens(annotated, engine.RubricLens(engine.normalizeProfile(library)));
  assert.strictEqual(r.utterances.find((u) => u.speaker === "Marcus Liu").relationship, "above");
});

console.log("\n--- Annotated event stream (role · relationship · weight) ---");
annotated.utterances.forEach((u) =>
  console.log(`  [${u.t}] ${u.speaker} — ${u.role || "?"} · ${u.relationship}${u.isPresenter ? " (presenter)" : ""} · ×${u.weight}`));

console.log(`\n${failures ? "FAILURES: " + failures : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
