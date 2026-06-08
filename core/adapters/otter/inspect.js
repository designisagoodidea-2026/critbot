// inspect.js — structural sanity check for a real Otter meeting JSON.
// Prints ONLY structure (counts, speakers, class distribution, scorecard) —
// never transcript verbatim — so it's safe to run against real, sensitive data.
// Usage: node core/adapters/otter/inspect.js <meeting.json> [libraryId]
"use strict";
const fs = require("fs");
const path = require("path");
const { otterMeetingToTranscript } = require("./otterToTranscript");
const engine = require("../../engine/classifyScoreCoach");

const file = process.argv[2];
const libId = process.argv[3] || "ux-product-design";
const meeting = JSON.parse(fs.readFileSync(file, "utf8"));
const library = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../rubric-libraries", libId + ".json"), "utf8")
);

const transcript = otterMeetingToTranscript(meeting);
const result = engine.run(transcript, library);

const dist = {};
result.utterances.forEach((u) => { dist[u.classification] = (dist[u.classification] || 0) + 1; });

console.log("meetingId         :", transcript.meetingId);
console.log("utterances parsed :", transcript.utterances.length);
console.log("distinct speakers :", new Set(transcript.utterances.map((u) => u.speaker)).size);
console.log("avg chars/utter   :", Math.round(
  transcript.utterances.reduce((a, u) => a + u.text.length, 0) / (transcript.utterances.length || 1)));
console.log("class distribution:", JSON.stringify(dist));
console.log("coaching nudges   :", result.coachingFeed.length);
console.log("scorecard (" + library.id + "):");
result.scorecard.forEach((s) => console.log("  " + (s.met ? "✓" : "○") + " " + s.label));
