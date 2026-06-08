// calendar.js — calendar awareness (M6). UMD: Node (relay, tests) + browser.
//
// Detects which calendar events are design crits, computes live vs upcoming,
// and derives the session meta + invited roster from an event. The data SOURCE
// is a pluggable provider (same move as the ASR + relationship layers): the
// synthetic provider here works offline; Google Calendar / Microsoft Graph /
// Recall.ai's calendar plug in behind the same shape later.
//
// Event shape:
//   { id, title, description?, start (ISO), end (ISO), attendees:[{name,email?}], critbot? }

"use strict";

function isCritEvent(e) {
  if (!e) return false;
  if (e.critbot === true) return true;
  const hay = ((e.title || "") + " " + (e.description || "")).toLowerCase();
  if (/\bcrit(ique)?\b/.test(hay) || /design\s*review/.test(hay)) return true;
  return (e.attendees || []).some((a) => /critbot/i.test((a && (a.name || a.email)) || String(a)));
}

function statusOf(e, now) {
  const s = Date.parse(e.start), en = Date.parse(e.end);
  if (now >= s && now <= en) return "live";
  return now < s ? "upcoming" : "past";
}

// Crit events that are live or still upcoming, soonest first (past dropped).
function upcomingCrits(events, now) {
  now = now || Date.now();
  return (events || [])
    .filter(isCritEvent)
    .map((e) => ({ ...e, status: statusOf(e, now), startsInMin: Math.round((Date.parse(e.start) - now) / 60000) }))
    .filter((e) => e.status !== "past")
    .sort((a, b) => (a.status === "live" ? -1 : b.status === "live" ? 1 : Date.parse(a.start) - Date.parse(b.start)));
}

function liveCrit(events, now) {
  now = now || Date.now();
  return (events || []).filter(isCritEvent).find((e) => statusOf(e, now) === "live") || null;
}

// Event → crit-record meta (title + invited roster — the M7 "who's invited" seam).
function eventToMeta(e) {
  return {
    title: e.title || "Critique",
    startedAt: e.start || null,
    invited: (e.attendees || []).map((a) => (a && (a.name || a.email)) || String(a))
  };
}

// --- synthetic provider: events relative to `now` so the demo is always live ---
function syntheticEvents(now) {
  now = now || Date.now();
  const m = 60000;
  const iso = (ms) => new Date(ms).toISOString();
  return [
    { id: "e1", title: "Onboarding Flow v3 — design critique", start: iso(now - 3 * m), end: iso(now + 25 * m),
      attendees: [{ name: "Sarah Chen" }, { name: "Marcus Liu" }, { name: "Priya Sharma" }], critbot: true }, // live now
    { id: "e2", title: "Marketing campaign critique", start: iso(now + 40 * m), end: iso(now + 70 * m),
      attendees: [{ name: "Dev Patel" }, { name: "Lena Ortiz" }] }, // upcoming crit
    { id: "e3", title: "Sprint planning", start: iso(now + 90 * m), end: iso(now + 120 * m),
      attendees: [{ name: "Sarah Chen" }] } // not a crit → filtered out
  ];
}

const api = { isCritEvent, statusOf, upcomingCrits, liveCrit, eventToMeta, syntheticEvents };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.CritbotCalendar = api;
