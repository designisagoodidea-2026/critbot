// relationship-eval.js — verify the M7 policy engine: authority weighting,
// decision promotion, protective flags, expertise boost. No key needed.
// Run: node core/fixtures/generator/relationship-eval.js
"use strict";
const path = require("path");
const fs = require("fs");
const rel = require("../../engine/relationships");

const pol = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, "../../relationship-policies", id + ".json"), "utf8"));

// roster: Dana is a Director (4), Sam a Senior IC (2), Pat an IC (1) and the presenter.
const roster = {
  presenterId: "pat",
  participants: [
    { id: "dana", name: "Dana Lee", role: "Director", authority: 4, expertise: ["accessibility"] },
    { id: "sam", name: "Sam Ortiz", role: "Senior Designer", authority: 2, expertise: [] },
    { id: "pat", name: "Pat Kim", role: "Designer", authority: 1, expertise: [] }
  ]
};
const items = [
  { content: "Make the CTA the primary color.", type: "suggestion", rubricTag: "Hierarchy", transcriptAnchor: { speaker: "Dana Lee" } },     // above presenter
  { content: "Contrast fails AA on the secondary button.", type: "concern", rubricTag: "Accessibility", transcriptAnchor: { speaker: "Dana Lee" } }, // above + expertise
  { content: "We could simplify the empty state.", type: "suggestion", rubricTag: "Hierarchy", transcriptAnchor: { speaker: "Pat Kim" } }    // below presenter? Pat IS presenter (peer→self)
];

let failures = 0;
const check = (n, c) => { console.log("  " + (c ? "ok  " : "FAIL ") + n); if (!c) failures++; };

console.log("\n=== M7 policy engine ===\n");

console.log("hierarchical:");
const h = rel.enrich({ items, roster, policy: pol("hierarchical") });
const dana1 = h.items[0], dana2 = h.items[1];
check("Director (above presenter) weighted > 1", dana1.weight > 1);
check("Director directive promoted to decision", dana1.promotedToDecision === true);
check("expertise match adds boost (accessibility)", dana2.weight > dana1.weight);
check("summary counts promoted decisions", h.summary.promotedToDecision >= 1);
console.log("   note:", h.summary.note);

console.log("\nflat/peer (a junior voice should be protected, none promoted):");
const rosterJunior = { presenterId: "dana", participants: roster.participants }; // Dana presents; Pat(1) is below
const itemsJunior = [{ content: "The flow has a dead end on step 3.", type: "concern", rubricTag: "Flow", transcriptAnchor: { speaker: "Pat Kim" } }];
const peer = rel.enrich({ items: itemsJunior, policy: pol("peer"), roster: rosterJunior });
check("peer policy promotes nothing", peer.summary.promotedToDecision === 0);
const hier = rel.enrich({ items: itemsJunior, policy: pol("hierarchical"), roster: rosterJunior });
check("hierarchical flags the junior point (protect, not drop)", hier.items[0].flags.includes("junior-point-protect"));
check("hierarchical down-weights below-presenter (<1)", hier.items[0].weight < 1);
check("note mentions protected junior point", /flagged|weighed/.test(hier.summary.note));

console.log("\nexpertise-led:");
const ex = rel.enrich({ items, roster, policy: pol("expertise-led") });
check("accessibility expert's a11y point gets expertise-weighted flag", ex.items[1].flags.includes("expertise-weighted"));
check("expertise boost makes the a11y item heaviest", ex.items[1].weight >= Math.max(ex.items[0].weight, ex.items[2].weight));

console.log("\nno roster/policy → rank-neutral:");
const none = rel.enrich({ items, roster: null, policy: null });
check("weights default to 1 (unknown relationship)", none.items.every((i) => i.weight === 1));
check("note says rank-neutral", /rank-neutral/.test(none.summary.note));

console.log(`\n  ${failures ? "FAILURES: " + failures : "ALL CHECKS PASSED"}\n`);
process.exit(failures ? 1 : 0);
