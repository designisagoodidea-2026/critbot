// roleAnnotator.js — live role annotation (the buildable part of Strand A).
//
// M7 enriches the *record* post-hoc. This stamps the SAME provenance onto each live
// *event* as it streams, so the lens / coach / scorer see who's speaking and their
// standing in real time — the live form of the role/authority the CritEvent contract
// reserves (see ../lens/CONTRACT.md). Reuses the M7 relationship logic; it does not
// reimplement it.
//
// In the live path: the relay maps `makeRoleAnnotator(roster, policy)` over the
// utterances coming out of dgToUtterances once a roster is loaded (.roster.json /
// roster.html). Offline, `annotateTranscript` stamps a whole fixture transcript.

"use strict";

const { findParticipant, relationshipTo } = require("../engine/relationships");

// roster: { participants:[{id,name,role,authority,expertise[]}], presenterId }
// policy: optional relationship policy (weights by relationship); see relationship-policies/
function makeRoleAnnotator(roster, policy) {
  const ps = (roster && roster.participants) || [];
  const presenter = ps.find((p) => p.id === (roster && roster.presenterId)) || null;
  const presenterAuth = presenter ? presenter.authority : null;
  const weights = (policy && policy.weights) || null;

  return function annotate(event) {
    const speaker = (event && event.speaker) ||
      (event && event.transcriptAnchor && event.transcriptAnchor.speaker) || "";
    const p = findParticipant(roster, speaker);
    const relationship = relationshipTo(presenterAuth, p ? p.authority : null);
    const isPresenter = !!(presenter && p && p.id === presenter.id);
    const role = p ? (p.role || null) : null;
    const authority = p && p.authority != null ? p.authority : null;
    const weight = weights && weights[relationship] != null ? weights[relationship]
      : (event && event.weight != null ? event.weight : 1);

    // Stamp the live CritEvent: role / authority ride the event (frozen-core fields).
    return Object.assign({}, event, {
      role, authority, relationship, isPresenter, weight,
      provenance: { speaker, role, authority, relationship, isPresenter },
    });
  };
}

// Convenience: annotate every utterance in a transcript model.
function annotateTranscript(transcript, roster, policy) {
  const annotate = makeRoleAnnotator(roster, policy);
  return Object.assign({}, transcript, {
    utterances: (transcript.utterances || []).map(annotate),
  });
}

const api = { makeRoleAnnotator, annotateTranscript };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.CritbotRoleAnnotator = api;
