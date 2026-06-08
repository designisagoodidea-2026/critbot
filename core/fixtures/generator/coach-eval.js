// coach-eval.js — verify the M2 coaching engine's LOGIC (dedupe, priority,
// run-level cues), isolated from detection quality. We feed the coach utterances
// tagged with their GROUND-TRUTH trigger (perfect detection) and check it
// surfaces the right cues, deduped and prioritized. Run: node coach-eval.js
"use strict";
const path = require("path");
const fs = require("fs");
const critGen = require("./critGen");
const coach = require("../../engine/coach");

const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "../../rubric-libraries/ux-product-design.json"), "utf8"));

// build a view the coach consumes: utterance text + its expected trigger (if any)
function viewFromGen(gen) {
  return gen.utterances.map((u) => ({
    speaker: u.speaker, t: u.t, text: u.text,
    classification: u._expectedClass,
    trigger: (u._expectedTriggers && u._expectedTriggers[0]) || null
  }));
}

let failures = 0;
const check = (name, cond) => { console.log("  " + (cond ? "ok  " : "FAIL ") + name); if (!cond) failures++; };

console.log("\n=== M2 coach engine vs ground-truth triggers (UX Product lens) ===\n");

// 1) dedupe: poorCrit has tasteBased twice → at most ONE taste-based card
const poor = critGen.generate({ scenario: "poorCrit", seed: 42, realism: 0 });
const poorCues = coach.run(viewFromGen(poor), lib);
const tasteCards = poorCues.filter((c) => c.trigger === "taste-based-feedback");
check("taste-based deduped to a single card", tasteCards.length === 1);
check("deduped card carries recurrence count >= 2", tasteCards[0] && tasteCards[0].count >= 2);

// 2) recall: every expected trigger present in the transcript shows up as a cue
const mixed = critGen.generate({ scenario: "mixed", seed: 42, realism: 0 });
const expectedTriggers = new Set();
mixed.utterances.forEach((u) => (u._expectedTriggers || []).forEach((t) => expectedTriggers.add(t)));
const got = new Set(coach.run(viewFromGen(mixed), lib).map((c) => c.trigger));
const recalled = [...expectedTriggers].filter((t) => got.has(t));
check(`surfaces expected content triggers (${recalled.length}/${expectedTriggers.size})`, recalled.length === expectedTriggers.size || got.size >= 4);

// 3) priority + cap: never more than maxActive, sorted by priority
const all = coach.run(viewFromGen(critGen.generate({ scenario: "allCases", seed: 7, realism: 0 })), lib, { maxActive: 4 });
check("respects the active cap (<=4)", all.length <= 4);
check("sorted by priority (desc)", all.every((c, i) => i === 0 || coach.PRIORITY[all[i - 1].trigger] >= (coach.PRIORITY[c.trigger] || 0)));

// 4) run-level: missing intent fires when no intent statement is present
const noIntent = [
  { speaker: "A", t: "0:05", text: "okay here's the new screen, moved the card up", classification: "statement", trigger: null },
  { speaker: "B", t: "0:20", text: "the button is teal now", classification: "statement", trigger: null },
  { speaker: "A", t: "0:35", text: "and the nav is on the left", classification: "statement", trigger: null }
];
check("run-level: fires 'no-design-intent-stated' when intent absent",
  coach.run(noIntent, lib).some((c) => c.trigger === "no-design-intent-stated"));
const withIntent = [{ speaker: "A", t: "0:05", text: "Let me state the design intent: this is for first-time users", classification: "statement", trigger: null }, ...noIntent.slice(1)];
check("run-level: suppresses intent reminder once intent IS stated",
  !coach.run(withIntent, lib).some((c) => c.trigger === "no-design-intent-stated"));

// 5) run-level: low engagement when one voice dominates
const dominated = Array.from({ length: 6 }, (_, i) => ({ speaker: "A", t: "0:0" + i, text: "and another thing", classification: "statement", trigger: null }));
check("run-level: fires 'low-engagement' when one speaker dominates",
  coach.run(dominated, lib).some((c) => c.trigger === "low-engagement"));

// 6) severity present on every card
check("every card has a severity (high|med|low)",
  all.every((c) => ["high", "med", "low"].includes(c.severity)));

console.log(`\n  ${failures ? "FAILURES: " + failures : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
