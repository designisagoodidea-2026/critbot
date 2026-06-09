// classifyScoreCoach.js — Screen 1 engine (Live Critique logic)
//
// AS OF M9 (the lens seam): this file is a thin, backward-compatible shim. The
// classify / score / coach logic moved into ../lens/lens.js, where it is the first
// rim implementation (RubricLens) of a frozen Lens interface. The public API here
// is unchanged — `run(transcript, library, provider)`, `TYPES`, `heuristicProvider`
// — so existing callers (test.js, adapters/otter/inspect.js, the M4 crit record)
// keep working with zero behavior change. See ../lens/CONTRACT.md and
// ../../docs/lens-model.md.
//
// Why a shim and not a delete: "static-rubric-as-lens first." A rubric library is
// just a Profile with no skill/MCP bindings; running it through the lens proves the
// seam without changing a single output. Skill (M13) and MCP (M14) lenses are then
// additive — no rewrite of the engine.

"use strict";
// IIFE-wrapped so its top-level names don't collide with lens.js in the browser's
// shared script scope (both load as <script> on the live page).
(function () {

// Browser-safe import: the live page loads this as a <script>, where `require`
// doesn't exist — so prefer the global `window.CritbotLens` (lens.js must load
// first), and only fall back to require() under Node (tests, relay, Electron main).
const Lens = (typeof window !== "undefined" && window.CritbotLens)
  ? window.CritbotLens
  : require("../lens/lens");
const {
  runLens, RubricLens, normalizeProfile, buildRegistry,
  heuristicProvider, scoreCard, TYPES,
} = Lens;

// Legacy entry point: a transcript + an active rubric library (the lens).
// Now: normalize the library to a Profile, wrap it in a RubricLens, drive it.
function run(transcript, library, provider) {
  if (!library) throw new Error("classifyScoreCoach: an active rubric library is required (the lens).");
  const lens = RubricLens(normalizeProfile(library), provider);
  return runLens(transcript, lens);
}

// UMD-style export: works under Node (CommonJS) and in the browser (global).
// Re-exports the lens primitives so callers can build profiles/lenses directly.
const CritbotEngine = {
  run, heuristicProvider, TYPES, scoreCard,
  RubricLens, normalizeProfile, buildRegistry, runLens,
};
if (typeof module !== "undefined" && module.exports) module.exports = CritbotEngine;
if (typeof window !== "undefined") window.CritbotEngine = CritbotEngine;
})();
