// relay-local.js — LOCAL / self-hosted ASR variant (no third party).
//
// Same shared HTTP layer as relay.js (relayHttp) — the ONLY difference is the
// ASR bridge: instead of Deepgram, it talks to a locally-running WhisperLiveKit
// (WLK) server, which does real-time streaming transcription + speaker
// diarization on your own machine/GPU. Audio never leaves your infra.
//
//   browser mic ──ws/PCM──►  relay-local  ──ws──►  WhisperLiveKit (local)
//   browser UI  ◄──json(DG-shaped)──  relay-local  ◄──json──  WhisperLiveKit
//
// >>> STATUS: STUB, ready to test. <<<
// The page is unchanged: it still expects Deepgram-shaped Results messages, so
// this relay TRANSLATES WLK output → Deepgram shape (see wlkToDeepgram). WLK's
// exact field names/audio intake vary by version — the two TODOs below are the
// only things to confirm against your running WLK build.
//
// Setup (separate process):
//   pip install whisperlivekit
//   whisperlivekit-server --model base --diarization   # serves ws on :8000
// Then:
//   WLK_URL=ws://localhost:8000/asr node relay-local.js
//   open http://localhost:8788/live/

"use strict";
const http = require("http");
const WebSocket = require("ws");
const relayHttp = require("./relayHttp");

relayHttp.loadEnv();
const PORT = process.env.PORT || 8788;
const WLK_URL = process.env.WLK_URL || "ws://localhost:8000/asr";
const LLM_ON = relayHttp.llmOn();

console.log(LLM_ON
  ? "  • LLM intelligence: ON (Anthropic key found)"
  : "  • LLM intelligence: OFF (no ANTHROPIC_API_KEY) — page falls back to heuristic");

// --- WLK → Deepgram-shaped Results translator ------------------------------
// Deepgram shape the page consumes (see core/adapters/otter/dgToUtterances or
// core/live/dgToUtterances.js):
//   { is_final, channel: { alternatives: [ { words: [ {word, punctuated_word, start, speaker} ] } ] } }
//
// WLK emits committed "lines" (speaker-attributed segments) plus an in-progress
// buffer. We synthesize a words[] from each segment's text, all tagged with the
// segment speaker + start time — which is exactly what the grouping step needs.
function speakerNum(s) {
  if (typeof s === "number") return s;
  const m = String(s == null ? 0 : s).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
function segmentToDg(seg, isFinal) {
  const text = seg.text || seg.transcript || "";
  const start = seg.beg != null ? seg.beg : (seg.start != null ? seg.start : 0);
  const spk = speakerNum(seg.speaker != null ? seg.speaker : seg.spk);
  const words = text.trim().split(/\s+/).filter(Boolean).map((w) => ({
    word: w, punctuated_word: w, start, speaker: spk
  }));
  return { is_final: isFinal, channel: { alternatives: [{ words }] } };
}
// Translate one WLK message into zero or more Deepgram-shaped messages.
function wlkToDeepgram(msg) {
  // TODO(confirm against your WLK build): field names. Common shape is
  //   { lines:[{speaker,text,beg,end}], buffer_transcription:"..." }
  const out = [];
  const finals = msg.lines || msg.segments || [];
  finals.forEach((seg) => out.push(segmentToDg(seg, true)));
  const buf = msg.buffer_transcription || msg.buffer || "";
  if (buf) out.push(segmentToDg({ text: buf, speaker: msg.buffer_speaker != null ? msg.buffer_speaker : 0, beg: 0 }, false));
  return out;
}

const server = http.createServer((req, res) => { relayHttp.handle(req, res); });

const wss = new WebSocket.Server({ server, path: "/ws" });
wss.on("connection", (browser) => {
  console.log("• browser connected — opening WhisperLiveKit stream at " + WLK_URL);
  const wlk = new WebSocket(WLK_URL);

  wlk.on("open", () => browser.send(JSON.stringify({ type: "status", state: "ready", llm: LLM_ON })));
  wlk.on("message", (m) => {
    let parsed; try { parsed = JSON.parse(m.toString()); } catch { return; }
    for (const dg of wlkToDeepgram(parsed)) {
      if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(dg));
    }
  });
  wlk.on("error", (e) => browser.readyState === WebSocket.OPEN &&
    browser.send(JSON.stringify({ type: "status", state: "error", message: "WhisperLiveKit: " + String(e.message || e) })));
  wlk.on("close", () => { if (browser.readyState === WebSocket.OPEN) browser.close(); });

  // browser audio (binary PCM16 @16k) → WLK.
  // TODO(confirm against your WLK build): WLK's bundled front-end streams
  // MediaRecorder webm/opus and WLK decodes via ffmpeg. If your build expects
  // that rather than raw PCM, either start it in a raw-PCM mode or switch the
  // page's capture to MediaRecorder. The relay just forwards bytes.
  browser.on("message", (data, isBinary) => {
    if (isBinary) { if (wlk.readyState === WebSocket.OPEN) wlk.send(data); }
    else if (data.toString() === "stop" && wlk.readyState === WebSocket.OPEN) wlk.close();
  });
  browser.on("close", () => { if (wlk.readyState === WebSocket.OPEN) wlk.close(); });
});

server.listen(PORT, () => {
  console.log(`\n  Critbot live relay running (LOCAL — WhisperLiveKit)`);
  console.log(`  → open  http://localhost:${PORT}/live/`);
  console.log(`  → ASR endpoint: ${WLK_URL} (no audio leaves your machine)\n`);
});
