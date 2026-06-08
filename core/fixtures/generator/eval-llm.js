// eval-llm.js — real LLM vs heuristic, scored against the generator's ground
// truth by calling the running relay's /api/classify endpoint.
//
// Prereq: relay running with an Anthropic key.
//   terminal 1:  cd core/live && npm start
//   terminal 2:  cd core/live && npm run eval:llm     (or: node ../fixtures/generator/eval-llm.js)
//
// Override target with BASE=http://localhost:8787
"use strict";
const path = require("path");
const fs = require("fs");
const critGen = require("./critGen");
const engine = require("../../engine/classifyScoreCoach");

const BASE = process.env.BASE || "http://localhost:8787";
const LIB_ID = "ux-product-design";
const lib = JSON.parse(fs.readFileSync(path.join(__dirname, "../../rubric-libraries", LIB_ID + ".json"), "utf8"));
const SCENARIOS = ["goodCrit", "poorCrit", "mixed", "offRubric", "allCases"];

async function classifyViaApi(text, context) {
  const res = await fetch(BASE + "/api/classify", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, context, libraryId: LIB_ID })
  });
  return res.json();
}

async function main() {
  // preflight
  let health;
  try { health = await (await fetch(BASE + "/api/health")).json(); }
  catch { console.error(`\n  ✗ Can't reach the relay at ${BASE}. Start it first: cd core/live && npm start\n`); process.exit(1); }
  if (!health.llm) {
    console.error("\n  ✗ Relay reports LLM OFF — add ANTHROPIC_API_KEY to core/live/.env and restart.\n");
    process.exit(1);
  }

  console.log(`\n=== Real LLM vs heuristic vs ground truth (lens: ${lib.name}, ${BASE}) ===`);
  console.log("    realism 0 = clean · 1 = disfluencies · 2 = + meander + crosstalk\n");
  const LEVELS = [0, 1, 2];
  let llmErr = 0;
  const summary = [];

  for (const level of LEVELS) {
    let llmHit = 0, heurHit = 0, n = 0;
    for (const scenario of SCENARIOS) {
      const gen = critGen.generate({ scenario, speakers: 3, seed: 42, realism: level });
      const expect = critGen.expectationsFor(gen);
      const transcript = critGen.toTranscript(gen);
      const heur = engine.run(transcript, lib);

      for (let i = 0; i < transcript.utterances.length; i++) {
        const u = transcript.utterances[i];
        const ctx = transcript.utterances.slice(Math.max(0, i - 2), i).map((x) => x.speaker + ": " + x.text).join("\n");
        let llmClass = "(err)";
        try {
          const r = await classifyViaApi(u.text, ctx);
          if (r.fallback) { llmErr++; } else { llmClass = r.classification; }
        } catch { llmErr++; }

        const expected = expect[i].expectedClass;
        if (llmClass === expected) { llmHit++; }
        if (heur.utterances[i].classification === expected) { heurHit++; }
        n++;
        process.stdout.write(llmClass === expected ? "·" : "x");
      }
    }
    process.stdout.write("\n");
    summary.push({ level, n, llmHit, heurHit });
  }

  const p = (x, n) => Math.round((x / n) * 100) + "%";
  console.log("\n  realism   LLM            heuristic");
  summary.forEach((s) =>
    console.log(`  ${String(s.level).padEnd(9)} ${String(s.llmHit + "/" + s.n + " (" + p(s.llmHit, s.n) + ")").padEnd(15)}${s.heurHit}/${s.n} (${p(s.heurHit, s.n)})`));
  if (llmErr) console.log(`\n  ⚠ ${llmErr} LLM calls fell back/errored (check key/credits).`);
  console.log("");
}
main();
