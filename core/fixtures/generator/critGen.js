// critGen.js — synthetic critique transcript generator (deterministic, labeled).
//
// Produces crit transcripts that exercise every coaching case AND mimic how
// people actually talk in a crit — so we can develop/score the engine offline
// (ground truth) and demo air-gap-safely (all data synthetic).
//
// Realism layer (seeded, level 0–2):
//   0 = clean sentences (the original baseline)
//   1 = disfluencies: um/uh/like/you know, false starts, pauses, run-ons, trailing off
//   2 = level 1 + meandering tangents / rabbit holes + crosstalk (interruptions, overlap)
//
// Ground-truth invariant: realism transforms NEVER change which case/class an
// utterance represents. Filler + tangent vocabulary is deliberately
// semantically neutral — it carries no rubric signal words (no "research",
// "test", "data", "intent", "contrast", "accessibility", "revenue", etc.) — so
// "um, I just— I don't really like the blue, you know?" is still taste-based.
//
// Each utterance carries hidden ground truth (_case, _expectedClass,
// _expectedTriggers). toTranscript() strips those; expectationsFor() returns them.
//
// Module + CLI:  node critGen.js --scenario poorCrit --speakers 3 --seed 7 --realism 2

"use strict";

// --- seeded PRNG (mulberry32) for reproducible output ---
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- case bank. expectedClass ∈ approval|suggestion|concern|question|statement ---
const BANK = {
  designIntent: {
    expectedClass: "statement", expectedTriggers: [],
    lines: [
      "Let me start with the intent — this is for first-time users setting up their account, and the goal is to cut drop-off in the first session.",
      "Before I show screens: the problem we're solving is that new users abandon onboarding halfway, so everything here is in service of getting them to first value faster."
    ]
  },
  missingIntent: {
    expectedClass: "statement", expectedTriggers: ["no-design-intent-stated"],
    lines: [
      "Okay so here's the new screen. I moved the card up here and changed the button color to teal.",
      "So this is the redesign. New header, new nav, and I swapped the hero image."
    ]
  },
  evidenceBased: {
    expectedClass: "statement", expectedTriggers: [],
    lines: [
      "In last week's usability test, four of five participants missed the secondary action entirely, so I pulled it into the main column.",
      "Our analytics show 38% of users drop on this step, which is why I simplified it to a single field."
    ]
  },
  unsupportedClaim: {
    expectedClass: "statement", expectedTriggers: ["unsupported-claim"],
    lines: [
      "Users will definitely love this layout, it's just better.",
      "Everyone finds this pattern intuitive, so we don't need to check it with anyone."
    ]
  },
  tasteBased: {
    expectedClass: "concern", expectedTriggers: ["taste-based-feedback"],
    lines: [
      "I just don't like the blue here, it feels off to me.",
      "Mm, the whole thing feels a bit cluttered to me, I don't love it."
    ]
  },
  concernWithNextStep: {
    expectedClass: "concern", expectedTriggers: [],
    lines: [
      "The contrast on the secondary buttons fails AA — let's bump it to at least 4.5 to 1.",
      "This call to action is below the fold; we should move it up so it's visible on load."
    ]
  },
  concernNoNextStep: {
    expectedClass: "concern", expectedTriggers: ["concern-without-next-step"],
    lines: [
      "Something about the hierarchy on this page bugs me.",
      "I'm worried about the flow here but I can't quite put my finger on it."
    ]
  },
  actionableSuggestion: {
    expectedClass: "suggestion", expectedTriggers: [],
    lines: [
      "We could try progressive disclosure so the advanced options aren't shown up front.",
      "Let's add an inline error state under the field instead of the top banner."
    ]
  },
  clarifyingQuestion: {
    expectedClass: "question", expectedTriggers: [],
    lines: [
      "How does this compare to the current flow in terms of steps?",
      "What did the people in the study say about the new nav placement?"
    ]
  },
  approval: {
    expectedClass: "approval", expectedTriggers: [],
    lines: [
      "This is a solid direction, the simplification really works.",
      "I like the progressive disclosure approach, it feels much less overwhelming."
    ]
  },
  offRubric: {
    expectedClass: "question", expectedTriggers: ["off-rubric"],
    lines: [
      "What's the revenue impact of this — how does it move the quarterly number?",
      "Have we thought about how this differentiates us from competitors in the market?"
    ]
  }
};

// Short interjections injected as crosstalk (each labeled, overlap:true).
const INTERJECTIONS = {
  crosstalkAgree:   { expectedClass: "approval", lines: ["yeah— yeah totally", "mm, right, exactly", "oh for sure, yeah"] },
  crosstalkClarify: { expectedClass: "question", lines: ["wait, sorry — what do you mean by that?", "hold on, can I just — what was that?"] },
  crosstalkHedge:   { expectedClass: "concern",  lines: ["mmm, I don't know about that—", "eh, I'm not totally sure—"] }
};

const SPEAKERS = ["Priya Sharma", "Sarah Chen", "Marcus Liu", "Dev Patel", "Lena Ortiz"];

const SCENARIOS = {
  goodCrit: ["designIntent", "clarifyingQuestion", "evidenceBased", "concernWithNextStep", "actionableSuggestion", "approval"],
  poorCrit: ["missingIntent", "tasteBased", "unsupportedClaim", "concernNoNextStep", "tasteBased", "approval"],
  mixed: ["designIntent", "tasteBased", "evidenceBased", "concernNoNextStep", "actionableSuggestion", "unsupportedClaim", "clarifyingQuestion", "approval"],
  lowEngagement: ["missingIntent", "unsupportedClaim", "unsupportedClaim"],
  offRubric: ["designIntent", "offRubric", "offRubric", "concernWithNextStep"],
  allCases: Object.keys(BANK)
};

// cases where trailing-off / incompleteness is realistic AND label-safe
const TRAILABLE = new Set(["missingIntent", "tasteBased", "concernNoNextStep", "unsupportedClaim"]);

const FILLERS = ["um", "uh", "like", "you know", "I mean", "sort of", "honestly", "right"];
// neutral tangents — NO rubric signal words
const TANGENTS = [
  "which, side note, kind of reminds me of that thing from last week, but anyway",
  "and — sorry, where was I — um",
  "you know, like, I had a whole thought here and it's gone, anyway",
  "which is a whole other conversation, but, um, never mind that for now"
];
const RUNON_TAILS = [
  " — and yeah, anyway, that's sort of where my head's at",
  " …, but, you know, whatever, moving on",
  " and, um, yeah, I'll stop there"
];

function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }
function chance(rand, p) { return rand() < p; }
function mmss(sec) { return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }

// Apply disfluencies to a line without changing its meaning/label.
function messify(text, rand, level, caseName) {
  if (level <= 0) return text;
  const pFill = level >= 2 ? 0.8 : 0.55;
  let out = text;

  // false start: duplicate/cut the first word
  if (chance(rand, level >= 2 ? 0.5 : 0.3)) {
    const m = out.match(/^(\w+)(\b.*)$/s);
    if (m) out = m[1] + "— " + m[1].toLowerCase() + m[2];
  }
  // leading filler
  if (chance(rand, pFill)) out = cap(pick(FILLERS, rand)) + ", " + lower(out);
  // mid filler / pause at the first comma
  if (chance(rand, pFill) && out.includes(", ")) {
    out = out.replace(", ", chance(rand, 0.5) ? ", " + pick(FILLERS, rand) + ", " : " … ");
  }
  // meander / rabbit hole (level 2): splice a neutral tangent mid-sentence
  if (level >= 2 && chance(rand, 0.4) && out.includes(" ")) {
    const words = out.split(" ");
    const at = Math.min(words.length - 1, 4 + Math.floor(rand() * 4));
    words.splice(at, 0, "— " + pick(TANGENTS, rand) + " —");
    out = words.join(" ");
  }
  // trailing off / incomplete (label-safe cases only)
  if (TRAILABLE.has(caseName) && chance(rand, level >= 2 ? 0.45 : 0.3)) {
    const words = out.split(" ");
    const keep = Math.max(4, Math.floor(words.length * (0.6 + rand() * 0.2)));
    out = words.slice(0, keep).join(" ").replace(/[.,;:]+$/, "") + (chance(rand, 0.5) ? " …" : " — I don't know.");
    return out; // a trailed-off line shouldn't also get a run-on tail
  }
  // run-on tail
  if (chance(rand, level >= 2 ? 0.4 : 0.25)) out = out.replace(/[.?]?\s*$/, "") + pick(RUNON_TAILS, rand);
  return out;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

// Generate a labeled crit. options: scenario | cases[], speakers, seed, realism, startSec, gapSec
function generate(options = {}) {
  const opts = Object.assign(
    { scenario: "mixed", speakers: 3, seed: 1, realism: 1, startSec: 8, gapSec: 14 }, options);
  const rand = rng(opts.seed);
  const cases = opts.cases || SCENARIOS[opts.scenario];
  if (!cases) throw new Error("unknown scenario: " + opts.scenario);

  const nSpk = opts.scenario === "lowEngagement" ? Math.min(2, opts.speakers) : opts.speakers;
  const roster = SPEAKERS.slice(0, Math.max(1, Math.min(nSpk, SPEAKERS.length)));

  let t = opts.startSec;
  const utterances = [];

  cases.forEach((caseName, i) => {
    const entry = BANK[caseName];
    if (!entry) throw new Error("unknown case: " + caseName);
    const speaker = roster[i % roster.length];
    let text = messify(pick(entry.lines, rand), rand, opts.realism, caseName);

    // crosstalk (level 2): a different speaker interrupts ~ a third of the time
    const interrupted = opts.realism >= 2 && roster.length > 1 && chance(rand, 0.33);
    if (interrupted) text = text.replace(/[.?…]?\s*$/, "") + " —";

    utterances.push({
      speaker, t: mmss(t), tSeconds: t, text, overlap: false,
      classification: null, aiSuggestion: null,
      _case: caseName, _expectedClass: entry.expectedClass, _expectedTriggers: entry.expectedTriggers.slice()
    });

    if (interrupted) {
      const types = Object.keys(INTERJECTIONS);
      const type = types[Math.floor(rand() * types.length)];
      const ij = INTERJECTIONS[type];
      const other = roster[(i + 1 + Math.floor(rand() * (roster.length - 1))) % roster.length];
      utterances.push({
        speaker: other, t: mmss(t), tSeconds: t, text: pick(ij.lines, rand), overlap: true,
        classification: null, aiSuggestion: null,
        _case: type, _expectedClass: ij.expectedClass, _expectedTriggers: []
      });
    }

    t += opts.gapSec + Math.floor(rand() * 6);
  });

  return {
    source: "synthetic-generated", scenario: opts.scenario, seed: opts.seed, realism: opts.realism,
    title: "Synthetic crit — " + (opts.scenario || "custom") + " (realism " + opts.realism + ")",
    speakers: roster, utterances
  };
}

// Clean Screen 1 transcript (ground-truth fields stripped; overlap kept).
function toTranscript(gen) {
  return {
    source: gen.source, title: gen.title, scenario: gen.scenario, realism: gen.realism, speakers: gen.speakers,
    utterances: gen.utterances.map(({ _case, _expectedClass, _expectedTriggers, ...u }) => u)
  };
}

function expectationsFor(gen) {
  return gen.utterances.map((u, i) => ({
    index: i, case: u._case, expectedClass: u._expectedClass, expectedTriggers: u._expectedTriggers, overlap: u.overlap
  }));
}

const api = { generate, toTranscript, expectationsFor, messify, SCENARIOS, BANK, INTERJECTIONS };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.critGen = api;

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const gen = generate({
    scenario: get("--scenario", "mixed"),
    speakers: parseInt(get("--speakers", "3"), 10),
    seed: parseInt(get("--seed", "1"), 10),
    realism: parseInt(get("--realism", "2"), 10)
  });
  console.log(JSON.stringify(args.includes("--truth") ? gen : toTranscript(gen), null, 2));
}
