// otterToTranscript.js — Otter → Screen 1 Live Transcript adapter
//
// Turns a real, speaker-diarized Otter meeting into the transcript model that
// Screen 1 (Live Critique) consumes. This REPLACES the synthetic transcript
// with a real transcriber record. It fills only what Otter knows — speaker,
// timestamp, text. Classification + AI nudges are left null; those are produced
// by the classify/score/coach engine (Screen 1 logic), which runs the active
// rubric library over these utterances.
//
// AIR-GAP: real Otter transcripts are sensitive. Hydrate at runtime on Jason's
// machine; never commit adapter output containing real content. The committed
// demo uses the synthetic fixture in ./fixtures/.
//
// Otter transcript lines look like:  [0:34:43] Ben Ramsey: text...
// Speaker may be "Unknown Speaker(s)" or "Speaker 1" when a voice isn't ID'd.

"use strict";

const LINE_RE = /^\[(\d{1,2}:)?(\d{1,2}):(\d{2})\]\s*(.+?):\s*(.*)$/;

function toSeconds(h, m, s) {
  return (h ? parseInt(h, 10) * 3600 : 0) + parseInt(m, 10) * 60 + parseInt(s, 10);
}

function fmt(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
}

// Parse a raw Otter transcript string into utterances. Handles multi-line
// utterances (text continues until the next [timestamp] Speaker: marker) and
// Otter's "\n..." chunk separators.
function parseOtterTranscript(raw) {
  const utterances = [];
  const lines = String(raw).split("\n");
  let current = null;

  for (let line of lines) {
    if (line.trim() === "..." || line.trim() === "") {
      if (current) { current = null; } // chunk boundary ends the current utterance
      continue;
    }
    const m = line.match(LINE_RE);
    if (m) {
      const [, h, mm, ss, speaker, text] = m;
      current = {
        speaker: speaker.trim(),
        t: fmt(toSeconds(h, mm, ss)),
        tSeconds: toSeconds(h, mm, ss),
        text: text.trim(),
        classification: null, // filled by the engine
        aiSuggestion: null    // filled by the engine
      };
      utterances.push(current);
    } else if (current) {
      current.text += " " + line.trim(); // continuation of the previous utterance
    }
  }
  return utterances;
}

// Accept an Otter meeting object and emit the Screen 1 transcript model.
// Handles both shapes observed from the connector:
//   - search result : transcript text lives in `relevant_recording_chunks`,
//                      metadata at top level (start_time, duration)
//   - fetch result  : full transcript in `text`, metadata nested in `metadata`
// `transcript` may also be passed directly as a raw string or parsed array.
function otterMeetingToTranscript(meeting) {
  const meta = meeting.metadata || {};
  const raw =
    meeting.transcript != null ? meeting.transcript
    : meeting.text != null ? meeting.text
    : meeting.relevant_recording_chunks || "";
  const utterances = Array.isArray(raw) ? raw : parseOtterTranscript(raw);
  return {
    source: "otter",
    meetingId: meeting.id || null,
    title: meeting.title || null,
    startTime: meeting.start_time || meta.start_time || null,
    duration: meeting.duration || meta.duration || null,
    utterances
  };
}

module.exports = { parseOtterTranscript, otterMeetingToTranscript, fmt, toSeconds };
