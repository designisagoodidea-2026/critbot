// relayHttp.js — shared HTTP layer for the Critbot relays.
//
// Serves the static app (page + engine + libraries) AND the LLM/library API.
// Both relay.js (Deepgram) and relay-local.js (WhisperLiveKit) use this, so the
// only thing that differs between them is the ASR WebSocket bridge — proof that
// the speech vendor is swappable without touching anything downstream.

"use strict";
const fs = require("fs");
const path = require("path");
const llm = require("../engine/llmProvider");
const critRecord = require("../engine/critRecord");
const calendar = require("../engine/calendar");
const relationships = require("../engine/relationships");

const ROOT = path.join(__dirname, ".."); // core/
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

function loadEnv() {
  try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch (_) {}
}

const llmOn = () => llm.available();

function loadLibrary(id) {
  const safe = String(id || "").replace(/[^a-z0-9-]/g, "");
  return JSON.parse(fs.readFileSync(path.join(ROOT, "rubric-libraries", safe + ".json"), "utf8"));
}
function listLibraries() {
  const dir = path.join(ROOT, "rubric-libraries");
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "library.schema.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}
function readBody(req) {
  return new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b)); });
}

// --- M7 relationship policies (templates) + roster (manual provider, persisted) ---
function listPolicies() {
  const dir = path.join(ROOT, "relationship-policies");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "policy.schema.json")
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}
function loadPolicy(id) {
  const safe = String(id || "").replace(/[^a-z0-9-]/g, "");
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "relationship-policies", safe + ".json"), "utf8")); } catch (_) { return null; }
}
// Manual provider, persisted per-team (gitignored — real org/relationship data).
// Seam: Microsoft Graph / Workday providers would populate the same shape.
const ROSTER_FILE = path.join(__dirname, ".roster.json");
function loadRoster() { try { return JSON.parse(fs.readFileSync(ROSTER_FILE, "utf8")); } catch (_) { return { participants: [], presenterId: null, policyId: null }; } }
function saveRoster(r) { fs.writeFileSync(ROSTER_FILE, JSON.stringify(r, null, 2)); }

// --- M4.1 tag-correction corpus (gitignored — contains real crit text) ---
const CORRECTIONS_FILE = path.join(__dirname, ".corrections.json");
function loadCorrections() {
  try { return JSON.parse(fs.readFileSync(CORRECTIONS_FILE, "utf8")); } catch (_) { return {}; }
}
function addCorrection(c) {
  const all = loadCorrections();
  const key = c.libraryId || "_";
  (all[key] = all[key] || []).push({ text: c.text || "", fromTag: c.fromTag || null, toTag: c.toTag || "", rationale: c.rationale || "", ts: new Date().toISOString() });
  fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(all, null, 2));
}
function recentCorrections(libraryId, n) {
  const all = loadCorrections();
  return (all[libraryId] || all["_"] || []).slice(-(n || 3));
}
function sendJson(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }

// Handle one HTTP request: API routes + static. Returns true if handled.
async function handle(req, res) {
  const url = req.url.split("?")[0];

  if (url === "/api/health") return sendJson(res, 200, { llm: llmOn() }), true;

  if (url === "/api/libraries") return sendJson(res, 200, { libraries: listLibraries() }), true;

  // M6: calendar awareness. Provider abstraction — synthetic now; Google Calendar /
  // Microsoft Graph / Recall.ai calendar plug in here behind the same event shape.
  if (url === "/api/events") {
    const provider = process.env.CALENDAR_PROVIDER || "synthetic";
    const events = calendar.syntheticEvents(Date.now()); // TODO: swap by provider when a real source is connected
    return sendJson(res, 200, { provider, crits: calendar.upcomingCrits(events, Date.now()) }), true;
  }

  // M6: productized auto-join seam (Recall.ai dispatches a bot from a calendar event
  // into Zoom/Teams). Not built — needs a Recall.ai account, like the local-ASR stub.
  if (url === "/api/join") {
    return sendJson(res, 200, { dispatched: false, reason: "bot dispatch not configured — set RECALL_API_KEY (see relay-local.js for the same stub pattern). In the prototype, the page auto-starts local capture instead." }), true;
  }

  // M7: relationship policies (templates) + roster (manual, persisted)
  if (url === "/api/policies") return sendJson(res, 200, { policies: listPolicies() }), true;
  if (url === "/api/roster") {
    if (req.method === "POST") {
      try { saveRoster(JSON.parse((await readBody(req)) || "{}")); return sendJson(res, 200, { ok: true }), true; }
      catch (e) { return sendJson(res, 200, { ok: false, error: String(e.message || e) }), true; }
    }
    return sendJson(res, 200, { roster: loadRoster() }), true;
  }

  // M4.1: record a tag correction (always works, no key needed — it's the training signal).
  if (url === "/api/correct") {
    try { addCorrection(JSON.parse((await readBody(req)) || "{}")); return sendJson(res, 200, { ok: true }), true; }
    catch (e) { return sendJson(res, 200, { ok: false, error: String(e.message || e) }), true; }
  }

  // Build the exportable crit record (M4). LLM extracts action items when a key
  // is present; otherwise critRecord's heuristic extractor runs. Always returns
  // a record + Markdown so export never fails.
  if (url === "/api/crit-record") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const session = {
        meta: body.meta || {},
        utterances: body.utterances || [],
        scorecard: body.scorecard || [],
        coaching: body.coaching || []
      };
      if (llmOn() && body.libraryId) {
        try { session.actionItems = await llm.extractActionItems({ utterances: session.utterances, library: loadLibrary(body.libraryId) }); }
        catch (_) { /* fall through to heuristic */ }
      }
      const record = critRecord.buildRecord(session);
      // M7: if a roster + policy are set, enrich items with role-aware provenance/weight/flags
      const roster = loadRoster();
      const policy = roster && roster.policyId ? loadPolicy(roster.policyId) : null;
      if (roster && (roster.participants || []).length && roster.presenterId && policy) {
        const en = relationships.enrich({ items: record.actionItems, roster, policy });
        record.actionItems = en.items;
        record.relationshipSummary = en.summary;
      }
      return sendJson(res, 200, { record, markdown: critRecord.toMarkdown(record) }), true;
    } catch (e) {
      return sendJson(res, 500, { error: String(e.message || e) }), true;
    }
  }

  if (url === "/api/classify" || url === "/api/analyze" || url === "/api/library-analysis") {
    if (!llmOn()) return sendJson(res, 200, { fallback: true }), true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (url === "/api/classify") {
        // M4.1: bias the classifier with the team's recent corrections (few-shot).
        return sendJson(res, 200, await llm.classifyUtterance({
          text: body.text, context: body.context, library: loadLibrary(body.libraryId),
          examples: recentCorrections(body.libraryId, 3)
        })), true;
      }
      if (url === "/api/analyze") {
        return sendJson(res, 200, await llm.analyzeCrit({ utterances: body.utterances || [], library: loadLibrary(body.libraryId) })), true;
      }
      // /api/library-analysis
      const libs = (body.ids || []).map(loadLibrary);
      return sendJson(res, 200, await llm.analyzeLibraries({ libraries: libs })), true;
    } catch (e) {
      return sendJson(res, 200, { fallback: true, error: String(e.message || e) }), true;
    }
  }

  // static
  let rel = decodeURIComponent(url);
  if (rel === "/" || rel === "/live" || rel === "/live/") rel = "/live/index.html";
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return true; }
  await new Promise((resolve) => fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); }
    else {
      // no-store: during active development the browser must never serve a stale
      // page/script. (This is what caused dgToUtterances.js to load an old copy.)
      res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    }
    resolve();
  }));
  return true;
}

module.exports = { loadEnv, handle, llmOn, ROOT };
