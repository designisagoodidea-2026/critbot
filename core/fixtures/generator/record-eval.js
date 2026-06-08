// record-eval.js — verify the M4 crit-record builder + Markdown on generated
// data (heuristic extractor; no key). Run: node core/fixtures/generator/record-eval.js
"use strict";
const path = require("path");
const fs = require("fs");
const assert = require("assert");
const critGen = require("./critGen");
const engine = require("../../engine/classifyScoreCoach");
const record = require("../../engine/critRecord");

const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "../../rubric-libraries/ux-product-design.json"), "utf8"));

// produce a classified session like the live page would hold
const gen = critGen.generate({ scenario: "mixed", seed: 42, realism: 1 });
const result = engine.run(critGen.toTranscript(gen), lib);
const session = {
  meta: { title: "UX Product Design critique", library: lib.name, source: "synthetic", startedAt: "2026-06-05T10:00:00Z" },
  utterances: result.utterances,
  scorecard: result.scorecard,
  coaching: result.coachingFeed
};

const rec = record.buildRecord(session);
const md = record.toMarkdown(rec);

let failures = 0;
const check = (n, c) => { console.log("  " + (c ? "ok  " : "FAIL ") + n); if (!c) failures++; };

console.log("\n=== M4 crit record (heuristic extraction) ===\n");
check("record has meta with speakers", rec.meta && rec.meta.speakers.length >= 1);
check("transcript carried over", rec.transcript.length === result.utterances.length);
check("scorecard present (4 dims)", rec.scorecard.length === 4);
check("action items extracted from suggestions/concerns", rec.actionItems.length >= 1);
check("every action item has the schema fields", rec.actionItems.every((a) =>
  a.id && a.content && a.type && Array.isArray(a.scope) && a.transcriptAnchor && "rubricTag" in a && a.status === "open"));
check("action items only from actionable classes", rec.actionItems.every((a) => ["suggestion", "concern", "decision"].includes(a.type)));
check("Markdown has the key sections", ["# ", "## Critique quality", "## Action items", "## Transcript"].every((s) => md.includes(s)));
check("Markdown renders action items as checkboxes", md.includes("- [ ] **"));

console.log("\n--- action items extracted ---");
rec.actionItems.forEach((a) => console.log(`  • [${a.type}] ${a.content.slice(0, 70)}${a.rubricTag ? "  (" + a.rubricTag + ")" : ""}`));

console.log("\n--- Markdown preview (first 18 lines) ---");
console.log(md.split("\n").slice(0, 18).map((l) => "  " + l).join("\n"));

console.log(`\n  ${failures ? "FAILURES: " + failures : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
