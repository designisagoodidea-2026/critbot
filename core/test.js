// test.js — no-dep smoke test + readable demo for the Screen 1 / Screen 2 core.
// Run: node core/test.js   (from repo root, or `node test.js` from core/)
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { otterMeetingToTranscript, parseOtterTranscript } = require("./adapters/otter/otterToTranscript");
const engine = require("./engine/classifyScoreCoach");

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

console.log(`\n${failures ? "FAILURES: " + failures : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
