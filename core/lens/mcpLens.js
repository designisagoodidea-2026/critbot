// mcpLens.js — the THIRD rim implementation of the Lens interface (M14).
//
// An MCP / context lens is a skill (or profile) that *pulls live context* before it
// reasons: prior crit records, the design system, the Figma file, a ticket. It
// resolves the profile's `context[]` bindings through a ContextProvider, folds the
// retrieved text into the lens's perspective, then runs through the SAME `runLens`
// as every other lens. This is what lets a presenter's lens actually *know* the
// intent and the history instead of re-deriving them in the room.
//
// ContextProvider interface (sync here for offline testability; an async wrapper
// over real MCP tool calls is the production form):
//   provider.resolve(binding) → { id, source, text }
//   binding = { id, source, query }
//
// In production the provider wraps MCP tools (a prior-crits store, the Figma MCP,
// a design-system MCP). Offline, `inMemoryContextProvider` stands in. The
// prior-crits source is exactly the durable store open question #3 is about.

"use strict";

const { normalizeProfile, RubricLens } = require("./lens");
const { parseSkill, skillToProfile } = require("./skillLens");

// A trivial provider backed by in-memory source functions: { sourceName: (query) => text }.
function inMemoryContextProvider(sources) {
  sources = sources || {};
  return {
    resolve(binding) {
      const fn = sources[binding && binding.source];
      const text = typeof fn === "function" ? fn(binding.query, binding)
        : typeof fn === "string" ? fn : "";
      return { id: (binding && binding.id) || (binding && binding.source) || "context", source: binding && binding.source, text: String(text || "") };
    }
  };
}

// Normalize any accepted input to a raw profile object that carries `context[]`.
function toRawProfile(input) {
  if (typeof input === "string") return skillToProfile(parseSkill(input));
  if (input && input.fm && typeof input.perspective === "string") return skillToProfile(input);
  return input; // a profile / rubric library object (may already carry context[])
}

// MCPLens: resolve context bindings → fold into the perspective → run the engine.
function MCPLens(input, opts) {
  opts = opts || {};
  const raw = toRawProfile(input);
  const bindings = (raw && raw.context) || [];
  const cp = opts.contextProvider;

  let resolved = [];
  if (cp && bindings.length) {
    resolved = bindings.map((b) => cp.resolve(b)).filter((r) => r && r.text);
  }
  const ctxBlock = resolved.length
    ? "\n\n## Retrieved context\n" + resolved.map((r) => `### ${r.id}\n${r.text}`).join("\n\n")
    : "";

  const augmented = Object.assign({}, raw, { perspective: (raw.perspective || "") + ctxBlock });
  const profile = normalizeProfile(augmented, opts.registry);
  const lens = RubricLens(profile, opts.provider);

  lens.meta.kind = "mcp";
  lens.meta.audience = profile.audience;
  lens.meta.context = resolved.map((r) => r.id);
  lens.meta.contextChars = ctxBlock.length;
  lens._resolvedContext = resolved; // exposed for inspection / tests
  return lens;
}

module.exports = { MCPLens, inMemoryContextProvider, toRawProfile };
