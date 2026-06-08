// relay.js — local Deepgram relay for Critbot live capture.
//
// Serves the app via the shared HTTP layer (relayHttp) and bridges the browser
// mic stream to Deepgram's streaming API, holding the API key server-side.
//
//   browser mic ──ws/PCM──►  relay  ──ws/PCM──►  Deepgram (diarize=true)
//   browser UI  ◄──json────  relay  ◄──json────  Deepgram (words + speakers)
//
// Run as a CLI:  DEEPGRAM_API_KEY=xxx node relay.js   → http://localhost:8787/live/
// Or embed in-process:  const { createRelayServer } = require("./relay")  (Electron).
// Local-ASR variant: relay-local.js (WhisperLiveKit). Shared HTTP: relayHttp.js.

"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const relayHttp = require("./relayHttp");

const DG_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&diarize=true&interim_results=true" +
  "&punctuate=true&smart_format=true&encoding=linear16&sample_rate=16000&channels=1";

// Build the HTTP server + Deepgram WS bridge (not yet listening). Embeddable.
function createRelayServer(opts) {
  opts = opts || {};
  const KEY = opts.deepgramKey || process.env.DEEPGRAM_API_KEY;
  const LLM_ON = relayHttp.llmOn();
  const server = http.createServer((req, res) => { relayHttp.handle(req, res); });
  const wss = new WebSocket.Server({ server, path: "/ws" });

  wss.on("connection", (browser) => {
    console.log("• browser connected — opening Deepgram stream");
    const dg = new WebSocket(DG_URL, { headers: { Authorization: "Token " + KEY } });
    const keepAlive = setInterval(() => {
      if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "KeepAlive" }));
    }, 8000);
    let audioFrames = 0, dgResults = 0;

    dg.on("open", () => { console.log("  → Deepgram stream OPEN"); browser.send(JSON.stringify({ type: "status", state: "ready", llm: LLM_ON })); });
    dg.on("message", (m) => {
      if (browser.readyState === WebSocket.OPEN) browser.send(m.toString());
      try {
        const j = JSON.parse(m.toString());
        if (j.channel) {
          dgResults++;
          const alt = j.channel.alternatives && j.channel.alternatives[0];
          if (j.is_final || dgResults <= 3 || dgResults % 25 === 0) console.log(`  <- Deepgram result #${dgResults} ${j.is_final ? "(final)" : "(interim)"}: "${((alt && alt.transcript) || "").slice(0, 80)}"`);
        }
      } catch (_) {}
    });
    dg.on("error", (e) => { console.error("  x Deepgram ERROR:", String(e.message || e)); if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify({ type: "status", state: "error", message: String(e.message || e) })); });
    dg.on("close", (code, reason) => {
      console.log(`  ! Deepgram CLOSED: code=${code} reason="${reason ? reason.toString() : ""}" (audioFrames=${audioFrames}, results=${dgResults})`);
      if (code === 1008 || code === 4001 || code === 4008) console.log("    -> that close code usually means an invalid or over-quota Deepgram key.");
      clearInterval(keepAlive); if (browser.readyState === WebSocket.OPEN) browser.close();
    });

    browser.on("message", (data, isBinary) => {
      if (isBinary) {
        if (dg.readyState === WebSocket.OPEN) {
          dg.send(data);
          if (++audioFrames === 1) console.log(`  ^ first audio frame forwarded to Deepgram (${data.length || data.byteLength} bytes)`);
          else if (audioFrames % 100 === 0) console.log(`  ^ ${audioFrames} audio frames forwarded...`);
        }
      } else if (data.toString() === "stop" && dg.readyState === WebSocket.OPEN) {
        console.log("  . stop received"); dg.send(JSON.stringify({ type: "CloseStream" }));
      }
    });
    browser.on("close", () => { clearInterval(keepAlive); if (dg.readyState === WebSocket.OPEN) dg.close(); });
  });

  return { server, wss, hasKey: !!KEY, llmOn: LLM_ON };
}

module.exports = { createRelayServer, DG_URL };

// --- CLI ---
if (require.main === module) {
  relayHttp.loadEnv();
  const KEY = process.env.DEEPGRAM_API_KEY;
  const PORT = process.env.PORT || 8787;
  if (!KEY) {
    console.error("\n  ✗ DEEPGRAM_API_KEY is not set.");
    const stray = [".env.txt", ".env.rtf", "env", ".env "].find((n) => fs.existsSync(path.join(__dirname, n)));
    if (stray) { console.error(`    Found a file named "${stray}" — it should be exactly ".env".`); console.error(`    Rename it:  mv "${stray}" .env\n`); }
    else { console.error("    Set it in core/live/.env (see .env.example) or pass it inline:"); console.error("    DEEPGRAM_API_KEY=xxxxx node relay.js\n"); }
    process.exit(1);
  }
  const { server, llmOn } = createRelayServer();
  console.log(llmOn ? "  • LLM intelligence: ON (Anthropic key found)" : "  • LLM intelligence: OFF (no ANTHROPIC_API_KEY) — page falls back to heuristic");
  server.listen(PORT, () => {
    console.log(`\n  Critbot live relay running (Deepgram)`);
    console.log(`  → open  http://localhost:${PORT}/live/`);
    console.log(`  → Deepgram key loaded (${KEY.slice(0, 4)}…), diarize=true, model=nova-3\n`);
  });
}
