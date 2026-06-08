// test-parse.js — exercise the Deepgram→utterances grouping + engine with no
// mic, key, or network. Run: node test-parse.js  (or npm test)
"use strict";
const assert = require("assert");
const path = require("path");
const { resultToUtterances } = require("./dgToUtterances");
const engine = require("../engine/classifyScoreCoach");
const fs = require("fs");

const library = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../rubric-libraries/ux-product-design.json"), "utf8")
);

// Synthetic Deepgram diarized result: speaker 0 raises a concern, speaker 1 replies.
const dgMessage = {
  is_final: true,
  speech_final: true,
  channel: { alternatives: [ { words: [
    { word: "im", punctuated_word: "I'm", start: 1.0, speaker: 0 },
    { word: "concerned", punctuated_word: "concerned", start: 1.2, speaker: 0 },
    { word: "about", punctuated_word: "about", start: 1.4, speaker: 0 },
    { word: "the", punctuated_word: "the", start: 1.5, speaker: 0 },
    { word: "contrast", punctuated_word: "contrast.", start: 1.7, speaker: 0 },
    { word: "we", punctuated_word: "We", start: 2.6, speaker: 1 },
    { word: "could", punctuated_word: "could", start: 2.8, speaker: 1 },
    { word: "increase", punctuated_word: "increase", start: 3.0, speaker: 1 },
    { word: "the", punctuated_word: "the", start: 3.1, speaker: 1 },
    { word: "weight", punctuated_word: "weight.", start: 3.3, speaker: 1 }
  ] } ] }
};

let failures = 0;
const check = (name, fn) => { try { fn(); console.log("  ok   " + name); } catch (e) { failures++; console.log("  FAIL " + name + " — " + e.message); } };

const grouped = resultToUtterances(dgMessage, (n) => "Speaker " + n);

console.log("\n=== Deepgram → utterances (diarization grouping) ===");
check("splits into 2 speaker utterances", () => assert.strictEqual(grouped.utterances.length, 2));
check("speaker 0 words merged in order", () =>
  assert.strictEqual(grouped.utterances[0].text, "I'm concerned about the contrast."));
check("speaker 1 is a separate turn", () => {
  assert.strictEqual(grouped.utterances[1].speakerId, 1);
  assert.strictEqual(grouped.utterances[1].text, "We could increase the weight.");
});
check("timestamp formatted from first word", () => assert.strictEqual(grouped.utterances[0].t, "0:01"));
check("flagged final", () => assert.strictEqual(grouped.isFinal, true));

console.log("\n=== engine over the diarized utterances (UX Product lens) ===");
const result = engine.run({ utterances: grouped.utterances }, library);
check("speaker 0 → concern", () => assert.strictEqual(result.utterances[0].classification, "concern"));
check("speaker 1 → suggestion", () => assert.strictEqual(result.utterances[1].classification, "suggestion"));
check("scorecard present", () => assert.ok(result.scorecard.length === 4));

result.utterances.forEach((u) =>
  console.log(`  [${u.t}] ${u.speaker} (${u.classification}): ${u.text}`));

console.log(`\n${failures ? "FAILURES: " + failures : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
