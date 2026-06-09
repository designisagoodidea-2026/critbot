// sessionStore.js — session management + the shared (team) crit store. DEMO-GRADE.
//
// One interface, three sources behind it (the same swappable-provider pattern as
// ASR / calendar / roster):
//   • seed   — bundled synthetic team crits (core/fixtures/team-crits/), so the
//              "Team Crits" view is populated with zero setup, including crits the
//              current user wasn't invited to.
//   • local  — crits this machine captured, persisted in the OS app-data dir.
//   • github — a SHARED store: a single crits.json in a repo, read+written via the
//              GitHub Contents API. This is what lets a leader browse crits across
//              the org. Gated on a token so the demo runs fast and offline without one.
//
// Resolves CLAUDE.md open question #3 (durable multi-crit storage) at demo grade and
// is the real `priorCrits` source the M14 MCP lens can later query. NOT production:
// single-file store, no auth model beyond the repo's own permissions, last-write-wins.

"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const ENV = process.env;
const GH_REPO = ENV.CRITBOT_GH_REPO || "designisagoodidea-2026/critbot";
const GH_PATH = ENV.CRITBOT_GH_PATH || "crits/crits.json";
const GH_TOKEN = ENV.CRITBOT_GH_TOKEN || ENV.GITHUB_TOKEN || "";
const GH_READ = GH_TOKEN || ENV.CRITBOT_GH_READ === "1"; // only hit the network if asked
const GH_API = "https://api.github.com";
// "Current user" for the demo — drives the "you attended / you didn't" distinction.
// Default to a participant in the onboarding seed so the view shows a real mix.
const USER = ENV.CRITBOT_USER || "Sarah Chen";

// ── local app-data store ─────────────────────────────────────────────────────────
function dataDir() {
  if (ENV.CRITBOT_DATA_DIR) { try { fs.mkdirSync(ENV.CRITBOT_DATA_DIR, { recursive: true }); } catch (_) {} return ENV.CRITBOT_DATA_DIR; }
  const base = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Application Support", "Critbot")
    : path.join(os.homedir(), ".critbot");
  const dir = path.join(base, "sessions");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}

function slug(s) { return String(s || "crit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48); }

// Wrap a CritRecord in a session envelope { id, source, record }.
function envelope(record, source) {
  const m = (record && record.meta) || {};
  const id = record.id || m.id || (slug(m.title) + "-" + String(m.startedAt || "").slice(0, 10));
  return { id, source, record: Object.assign({ id }, record) };
}

// Lightweight summary for the list view (no full transcript).
function summary(env) {
  const r = env.record || {}; const m = r.meta || {};
  const people = [...new Set([...(m.invited || []), ...(m.speakers || [])])];
  const sc = r.scorecard || [];
  return {
    id: env.id, source: env.source,
    title: m.title || "Critique", team: m.team || null, lens: m.library || m.profile || null,
    startedAt: m.startedAt || null, endedAt: m.endedAt || null,
    participants: people, invited: m.invited || [], speakers: m.speakers || [],
    quality: sc.length ? { met: sc.filter((s) => s.met).length, of: sc.length } : null,
    actionItems: (r.actionItems || []).length,
    youAttended: people.some((n) => String(n).toLowerCase() === USER.toLowerCase()),
  };
}

// ── seed (bundled synthetic team crits) ──────────────────────────────────────────
function loadSeed() {
  const dir = path.join(__dirname, "..", "fixtures", "team-crits");
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
      .map((f) => envelope(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), "seed"));
  } catch (_) { return []; }
}

// ── local file ops ───────────────────────────────────────────────────────────────
function listLocal() {
  const dir = dataDir();
  try { return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => envelope(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), "local")); }
  catch (_) { return []; }
}
function saveLocal(env) { fs.writeFileSync(path.join(dataDir(), env.id + ".json"), JSON.stringify(env.record, null, 2)); return env; }

// ── GitHub shared store (single crits.json array, Contents API) ───────────────────
function ghHeaders() {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "critbot" };
  if (GH_TOKEN) h.Authorization = "Bearer " + GH_TOKEN;
  return h;
}
async function ghReadRaw() {
  try {
    const res = await fetch(`${GH_API}/repos/${GH_REPO}/contents/${encodeURIComponent(GH_PATH).replace(/%2F/g, "/")}`, { headers: ghHeaders() });
    if (res.status === 404) return { items: [], sha: null };
    if (!res.ok) return null;
    const j = await res.json();
    let items = [];
    try { items = JSON.parse(Buffer.from(j.content || "", "base64").toString("utf8")); } catch (_) { items = []; }
    return { items: Array.isArray(items) ? items : [], sha: j.sha };
  } catch (_) { return null; }
}
async function ghList() {
  if (!GH_READ) return [];
  const r = await ghReadRaw();
  return r ? r.items.map((rec) => envelope(rec, "github")) : [];
}
async function ghPublish(record) {
  if (!GH_TOKEN) return null; // reads can be anonymous; writes need a token
  const cur = await ghReadRaw();
  if (!cur) return null;
  const env = envelope(record, "github");
  const items = cur.items.filter((x) => (x.id || (x.meta && x.meta.id)) !== env.id);
  items.push(env.record);
  const body = { message: `crit: ${env.id}`, content: Buffer.from(JSON.stringify(items, null, 2)).toString("base64") };
  if (cur.sha) body.sha = cur.sha;
  const res = await fetch(`${GH_API}/repos/${GH_REPO}/contents/${encodeURIComponent(GH_PATH).replace(/%2F/g, "/")}`,
    { method: "PUT", headers: Object.assign(ghHeaders(), { "Content-Type": "application/json" }), body: JSON.stringify(body) });
  return res.ok ? env : null;
}

// ── unified interface ─────────────────────────────────────────────────────────────
async function list() {
  const map = new Map();
  for (const env of loadSeed()) map.set(env.id, env);
  for (const env of listLocal()) map.set(env.id, env);
  for (const env of await ghList()) map.set(env.id, env); // shared store wins
  return [...map.values()].map(summary)
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}
async function get(id) {
  for (const env of await ghList()) if (env.id === id) return env.record;
  for (const env of listLocal()) if (env.id === id) return env.record;
  for (const env of loadSeed()) if (env.id === id) return env.record;
  return null;
}
async function publish(record) {
  const gh = await ghPublish(record);
  if (gh) return { id: gh.id, target: "github", repo: GH_REPO };
  const env = saveLocal(envelope(record, "local"));
  return { id: env.id, target: GH_TOKEN ? "local (github write failed)" : "local (no token — set CRITBOT_GH_TOKEN to share)", repo: GH_REPO };
}

function config() { return { repo: GH_REPO, path: GH_PATH, hasToken: !!GH_TOKEN, sharedReads: !!GH_READ, user: USER }; }

const api = { list, get, publish, config, summary, envelope };
if (typeof module !== "undefined" && module.exports) module.exports = api;
