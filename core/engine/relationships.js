// relationships.js — the M7 interpretation engine. UMD: Node + browser.
//
// Turns the three separated layers into an *enriched* read of the crit:
//   • who's INVITED        → roster.participants (manual / Graph / Workday later)
//   • who actually SPOKE   → the items' speaker (from diarization)
//   • ROLES + relationships→ participant authority/expertise + who's presenting
//
// A policy (core/relationship-policies/*.json) maps
//   (speaker's relationship to the presenter) × (utterance classification)
// to a treatment: a weight, optional promote-to-decision, and protective flags.
// Design intent (see ROADMAP M7): role-AWARE context, not blunt up-weighting —
// authority weighting is an opt-in template, and `balancing` still protects
// strong junior input from being silently dropped.

"use strict";

function relationshipTo(presenterAuth, auth) {
  if (auth == null || presenterAuth == null) return "unknown";
  return auth > presenterAuth ? "above" : auth < presenterAuth ? "below" : "peer";
}

// match a participant to an item's speaker (by name; ids optional)
function findParticipant(roster, speaker) {
  const ps = (roster && roster.participants) || [];
  return ps.find((p) => p.name === speaker) ||
         ps.find((p) => (p.name || "").toLowerCase() === String(speaker || "").toLowerCase()) || null;
}

function expertiseMatches(participant, item) {
  const tags = (participant && participant.expertise) || [];
  if (!tags.length) return false;
  const hay = ((item.rubricTag || "") + " " + (item.content || item.text || "")).toLowerCase();
  return tags.some((t) => hay.includes(String(t).toLowerCase()));
}

// items: [{ content|text, type|classification, rubricTag?, transcriptAnchor?{speaker} | speaker }]
function enrich({ items, roster, policy }) {
  const ps = (roster && roster.participants) || [];
  const presenter = ps.find((p) => p.id === (roster && roster.presenterId)) || null;
  const presenterAuth = presenter ? presenter.authority : null;
  const w = (policy && policy.weights) || { above: 1, peer: 1, below: 1, unknown: 1 };
  const promote = (policy && policy.promoteToDecision) || [];
  const boost = (policy && policy.expertiseBoost) || 0;
  const balancing = !policy || policy.balancing !== false;

  let promotedCount = 0; const flagged = [];

  const enriched = (items || []).map((item) => {
    const speaker = (item.transcriptAnchor && item.transcriptAnchor.speaker) || item.speaker || "";
    const cls = item.type || item.classification || "statement";
    const p = findParticipant(roster, speaker);
    const rel = relationshipTo(presenterAuth, p ? p.authority : null);

    let weight = w[rel] != null ? w[rel] : 1;
    // expertise boost applies whenever a policy defines one (basis is descriptive)
    const expert = boost > 0 && expertiseMatches(p, item);
    if (expert) weight = +(weight + boost).toFixed(2);

    const isDirective = cls === "suggestion" || cls === "concern";
    const promoted = isDirective && promote.indexOf(rel) !== -1;
    if (promoted) promotedCount++;

    const flags = [];
    // protective: a strong point from someone below the presenter, at risk of being under-weighted
    if (balancing && rel === "below" && isDirective && weight < 1) {
      flags.push("junior-point-protect");
      flagged.push(speaker);
    }
    if (expert) flags.push("expertise-weighted");

    return Object.assign({}, item, {
      provenance: { speaker, role: p ? p.role : null, authority: p ? p.authority : null, relationship: rel },
      weight,
      promotedToDecision: promoted,
      flags
    });
  });

  const summary = {
    presenter: presenter ? presenter.name : null,
    policy: policy ? policy.id : null,
    promotedToDecision: promotedCount,
    protectedJuniorPoints: [...new Set(flagged)].length,
    note: buildNote(presenter, policy, promotedCount, flagged)
  };
  return { items: enriched, summary };
}

function buildNote(presenter, policy, promoted, flagged) {
  if (!presenter || !policy) return "No roster/policy applied — interpretation is rank-neutral.";
  const parts = [`Lens: ${policy.name}. Presenter: ${presenter.name}.`];
  if (promoted) parts.push(`${promoted} directive(s) from above the presenter recorded as decisions.`);
  const n = [...new Set(flagged)].length;
  if (n) parts.push(`${n} point(s) from less-senior voices flagged to ensure they're weighed, not dropped.`);
  return parts.join(" ");
}

const api = { enrich, relationshipTo, findParticipant };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.CritbotRelationships = api;
