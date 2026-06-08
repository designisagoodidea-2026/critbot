// eval.js — score the offline heuristic engine against the generator's ground
// truth, swept across realism levels (0 clean → 2 messy). Shows how disfluencies
// and crosstalk erode the heuristic. Run: node core/fixtures/generator/eval.js
"use strict";
const path = require("path");
const fs = require("fs");
const critGen = require("./critGen");
const engine = require("../../engine/classifyScoreCoach");

const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "../../rubric-libraries/ux-product-design.json"), "utf8"));
const SCENARIOS = ["goodCrit", "poorCrit", "mixed", "offRubric", "allCases"];
const LEVELS = [0, 1, 2];

console.log("\n=== Heuristic engine vs generator ground truth (UX Product lens) ===");
console.log("    realism 0 = clean · 1 = disfluencies · 2 = + meander + crosstalk\n");

for (const level of LEVELS) {
  let total = 0, correct = 0;
  for (const scenario of SCENARIOS) {
    const gen = critGen.generate({ scenario, speakers: 3, seed: 42, realism: level });
    const expect = critGen.expectationsFor(gen);
    const result = engine.run(critGen.toTranscript(gen), lib);
    result.utterances.forEach((u, i) => { total++; if (u.classification === expect[i].expectedClass) correct++; });
  }
  const pct = Math.round((correct / total) * 100);
  console.log(`  realism ${level}:  ${String(correct + "/" + total).padEnd(7)} ${pct}%`);
}

// invariant + coverage checks
console.log("");
const all = critGen.generate({ scenario: "allCases", realism: 0 });
const covered = new Set(all.utterances.map((u) => u._case));
const missing = Object.keys(critGen.BANK).filter((c) => !covered.has(c));
if (missing.length) { console.log("  ✗ allCases missing: " + missing.join(", ")); process.exit(1); }
console.log("  ✓ allCases covers every defined case (" + Object.keys(critGen.BANK).length + ")");

// ground-truth invariant: realism must NOT change labels for shared base cases
let invariantOk = true;
for (const scenario of SCENARIOS) {
  const c0 = critGen.expectationsFor(critGen.generate({ scenario, seed: 42, realism: 0 }));
  const c1 = critGen.expectationsFor(critGen.generate({ scenario, seed: 42, realism: 1 }));
  // level 1 adds no crosstalk, so indices align 1:1 and labels must match
  if (c0.length !== c1.length || c0.some((e, i) => e.expectedClass !== c1[i].expectedClass)) invariantOk = false;
}
console.log(invariantOk
  ? "  ✓ realism 0↔1 preserves every ground-truth label (no signal leakage)"
  : "  ✗ realism changed a ground-truth label — disfluency vocab leaked signal");
if (!invariantOk) process.exit(1);

// crosstalk presence at level 2
const lvl2 = critGen.generate({ scenario: "mixed", seed: 42, realism: 2 });
console.log("  ✓ level 2 emits " + lvl2.utterances.filter((u) => u.overlap).length + " overlapping (crosstalk) utterance(s) in 'mixed'\n");
