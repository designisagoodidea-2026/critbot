// llmProvider.js — real classify / score / coach via the Anthropic Messages API.
//
// Runs SERVER-SIDE only (the relay) — the API key must not reach the browser.
// Same conceptual contract as the heuristic provider, but async and smarter:
// the active rubric library is the lens, passed into every prompt.
//
//   classifyUtterance({ text, context, library })  → { classification, trigger?, nudge? }
//   analyzeCrit({ utterances, library })           → { scorecard:[{id,label,met,note}], coaching:[{nudge,kind,at?}] }
//
// No SDK dependency — uses global fetch (Node 18+). Throws on failure so the
// caller can fall back to the heuristic engine.

"use strict";

const API_URL = "https://api.anthropic.com/v1/messages";
const KEY = () => process.env.ANTHROPIC_API_KEY;
const MODEL_FAST = () => process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001";
const MODEL_DEEP = () => process.env.ANTHROPIC_MODEL_DEEP || "claude-sonnet-4-6";

function available() { return !!KEY(); }

async function callAnthropic(model, system, user, maxTokens) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": KEY(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 400,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!res.ok) throw new Error("Anthropic " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || "";
}

// Tolerant JSON extraction (handles ```json fences / stray prose).
function parseJson(text) {
  let t = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

const TYPES = require("./classifyScoreCoach").TYPES; // single source of truth

function guidelineList(library) {
  return (library.guidelines || []).map((x) => "- " + x.label + (x.detail ? ": " + x.detail : "")).join("\n");
}

// Per-utterance classify. Hottest path → kept lean: outputs only {classification,
// trigger} (the coach maps trigger→nudge text from the library, so the model
// doesn't regenerate it). `examples` are the team's past corrections (M4.1),
// injected as few-shot so the classifier adapts to their conventions.
async function classifyUtterance({ text, context, library, examples }) {
  const triggers = (library.coachingCues || []).map((c) => c.trigger).join(", ") || "none";
  const ex = (examples && examples.length)
    ? "\n\nThis team's past corrections — match these conventions:\n" +
      examples.map((e) => `- "${String(e.text).slice(0, 80)}" → ${e.toTag}${e.rationale ? " (" + e.rationale + ")" : ""}`).join("\n")
    : "";
  const system =
    `Critbot live critique classifier. Lens: "${library.name}" (${library.domain}).\n` +
    `Classify ONE utterance as exactly one of: ${TYPES.join(" | ")}.\n` +
    `Optionally flag ONE coaching trigger id from: ${triggers} (else null).\n` +
    `Guidelines:\n${guidelineList(library)}${ex}\n\n` +
    `Reply ONLY JSON: {"classification":"<type>","trigger":<id-or-null>}`;
  const user = (context ? "Context:\n" + context + "\n\n" : "") + 'Utterance:\n"' + text + '"';
  const out = parseJson(await callAnthropic(MODEL_FAST(), system, user, 120));
  if (!TYPES.includes(out.classification)) out.classification = "statement";
  return { classification: out.classification, trigger: out.trigger || null };
}

// Whole-crit scorecard. Returns ONLY scorecard — coaching is produced client-side
// by coach.js, so generating it here was wasted tokens.
async function analyzeCrit({ utterances, library }) {
  const dims = (library.scoring || []).map((d) => `- ${d.id} (${d.label}): ${d.description || ""}`).join("\n");
  const transcript = utterances.map((u) => `[${u.t}] ${u.speaker}: ${u.text}`).join("\n").slice(0, 5000);
  const system =
    `Score this live design critique through the "${library.name}" lens.\n` +
    `For each dimension set met (true/false) with a short evidence note from the transcript:\n${dims}\n\n` +
    `Reply ONLY JSON: {"scorecard":[{"id","label","met":bool,"note"}]}`;
  const out = parseJson(await callAnthropic(MODEL_DEEP(), system, transcript, 500));
  return { scorecard: Array.isArray(out.scorecard) ? out.scorecard : [] };
}

// Compare 2+ rubric libraries and explain when to reach for each (Screen 2).
async function analyzeLibraries({ libraries }) {
  const brief = libraries.map((l) => {
    const g = (l.guidelines || []).map((x) => x.label).join("; ");
    return `## ${l.name} (${l.domain})\n${l.description}\nGuidelines: ${g}`;
  }).join("\n\n");
  const system =
    "You are a DesignOps expert comparing critique rubric libraries for a design team. " +
    "Explain, in 2–4 tight sentences, how these lenses differ and when a team should reach for each. " +
    "Be concrete and practical. Reply with ONLY JSON: {\"analysis\":\"...\"}";
  const out = parseJson(await callAnthropic(MODEL_DEEP(), system, brief, 500));
  return { analysis: out.analysis || "" };
}

// Extract concrete, merged action items from a classified transcript (M4).
async function extractActionItems({ utterances, library }) {
  const transcript = utterances
    .map((u) => `[${u.t}] ${u.speaker} (${u.classification || "?"}): ${u.text}`)
    .join("\n")
    .slice(0, 7000);
  const system =
    `You extract a designer's post-critique action items from a transcript, through the "${library.name}" lens.\n` +
    `Guidelines:\n${guidelineList(library)}\n\n` +
    `Merge duplicates; make each item a concrete, imperative next step. Tag each with the most relevant guideline label as rubricTag, the originating speaker + timestamp as the anchor, and a type (suggestion|concern|decision).\n` +
    `Reply with ONLY JSON: {"actionItems":[{"content","type","rubricTag","anchor":{"t","speaker"}}]}`;
  const out = parseJson(await callAnthropic(MODEL_DEEP(), system, transcript, 900));
  const items = Array.isArray(out.actionItems) ? out.actionItems : [];
  return items.map((a, i) => ({
    id: "ai-" + String(i + 1).padStart(3, "0"),
    content: a.content || "",
    type: TYPES.includes(a.type) ? a.type : "suggestion",
    scope: ["design-level"],
    targets: [],
    transcriptAnchor: { t: (a.anchor && a.anchor.t) || "", speaker: (a.anchor && a.anchor.speaker) || "" },
    rubricTag: a.rubricTag || null,
    status: "open"
  }));
}

module.exports = { available, classifyUtterance, analyzeCrit, analyzeLibraries, extractActionItems, parseJson, TYPES };
