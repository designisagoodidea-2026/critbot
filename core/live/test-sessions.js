// test-sessions.js — offline test for the shared session store (no key, no network).
// Isolates the local store to a temp dir and disables GitHub (no token).
"use strict";
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "critbot-sessions-"));
process.env.CRITBOT_DATA_DIR = tmp;
delete process.env.CRITBOT_GH_TOKEN; delete process.env.GITHUB_TOKEN; delete process.env.CRITBOT_GH_READ;
process.env.CRITBOT_USER = "Sarah Chen";

const store = require("../engine/sessionStore");

let fails = 0;
const check = (n, fn) => { try { fn(); console.log("  ok   " + n); } catch (e) { fails++; console.log("  FAIL " + n + " — " + e.message); } };

(async () => {
  console.log("\n=== Session store: seed (shared team crits) ===");
  let list = await store.list();
  check("seed loads the 3 synthetic team crits", () => assert.ok(list.length >= 3));
  check("a crit the user attended is flagged youAttended", () =>
    assert.ok(list.some((s) => s.id === "onboarding-flow-v3" && s.youAttended)));
  check("crits the user was NOT in are still browsable (the leader case)", () => {
    const notMine = list.filter((s) => !s.youAttended).map((s) => s.id);
    assert.ok(notMine.includes("checkout-redesign") && notMine.includes("marketing-banner-q3"));
  });
  check("summaries carry team + lens + quality", () => {
    const o = list.find((s) => s.id === "onboarding-flow-v3");
    assert.strictEqual(o.team, "Design Systems");
    assert.ok(o.quality && o.quality.of === 4);
  });

  console.log("\n=== Session store: get + publish (local fallback, no token) ===");
  const full = await store.get("checkout-redesign");
  check("get returns the full record (transcript + action items)", () =>
    assert.ok(full && full.transcript.length >= 1 && full.actionItems.length >= 1));

  const rec = {
    id: "live-demo-001",
    meta: { title: "Live demo crit", team: "Design Systems", library: "UX Product Design", startedAt: "2026-06-08T12:00:00Z", invited: ["Sarah Chen"], speakers: ["Sarah Chen"] },
    scorecard: [{ id: "engagement", label: "High engagement", met: true, note: "" }],
    actionItems: [{ id: "ai-1", content: "Tighten the empty state", type: "suggestion" }]
  };
  const out = await store.publish(rec);
  check("publish with no token falls back to local", () => assert.ok(/local/.test(out.target)));
  list = await store.list();
  check("the published crit appears in the team list", () => assert.ok(list.some((s) => s.id === "live-demo-001")));
  const got = await store.get("live-demo-001");
  check("the published crit round-trips via get", () => assert.ok(got && got.meta.title === "Live demo crit"));

  console.log("\n--- Team Crits view (as Sarah Chen) ---");
  (await store.list()).forEach((s) =>
    console.log(`  ${s.youAttended ? "•" : "·"} ${s.title} — ${s.team || "?"} · ${s.participants.join(", ")}${s.youAttended ? "" : "  (didn't attend)"}`));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n${fails ? "FAILURES: " + fails : "ALL CHECKS PASSED"}\n`);
  process.exit(fails ? 1 : 0);
})();
