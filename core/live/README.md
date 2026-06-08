# live — local mic → diarized transcript → Screen 1

Turn on your laptop microphone and watch Critbot transcribe, **diarize** (split by speaker), classify, score, and coach — live. This is the real Otter-equivalent capture path for prototyping: browser mic → local relay → **Deepgram streaming** (`diarize=true`, Nova-3) → the same Screen 1 engine in `../engine`.

```
browser mic ──ws/PCM──►  relay.js  ──ws/PCM──►  Deepgram (diarize=true)
browser UI  ◄──json────  relay.js  ◄──json────  Deepgram (words + speaker #)
                              │
                  index.html groups words → utterances → CritbotEngine.run()
                              │
                live transcript · crit-quality scorecard · coaching feed
```

## Setup progress

Tracked live as we step through it together:

- [x] 1. Deepgram API key obtained
- [x] 2. `npm install` (dependency `ws` installed)
- [x] 3. `.env` created with the key — *gotcha hit & fixed: editor saved it as `.env.txt`; renamed to `.env` (key now loads, 40 chars)*
- [ ] 4. Relay running (`npm start`)
- [ ] 5. Page open, mic granted, live diarized transcript confirmed

> **Troubleshooting — "DEEPGRAM_API_KEY is not set" even though you made the file:**
> The file must be named exactly `.env`, not `.env.txt`. macOS editors (TextEdit)
> often append `.txt` and Finder may hide it. Check with `ls -la` and rename:
> `mv .env.txt .env`. The relay now detects this and tells you.

## Setup (one time)

All commands assume you're in the live folder. Get there from anywhere with the full path:

```
cd "/Users/jason/Documents/Claude/Projects/Critbot/core/live"
```

> Note: `cd core/live` only works if you're already in the project root
> (`/Users/jason/Documents/Claude/Projects/Critbot`). From your home folder it
> fails with "No such file or directory" — use the full path above.

1. Get a Deepgram API key — https://console.deepgram.com (free credit to start).
2. Install the one dependency (from the live folder):
   ```
   npm install
   ```
3. Add your key:
   ```
   cp .env.example .env        # then edit .env and paste your key
   ```

## Run

From the same live folder:

```
npm start                      # = node relay.js
```

Open **http://localhost:8787/live/**, press **● Start**, and grant microphone access when the browser asks. Speak — you'll see the diarized transcript build in real time, each utterance auto-classified, the Critique Quality scorecard updating, and coaching nudges appearing. Switch the **Library** dropdown to change the lens (Screen 2) live.

## Turning on real intelligence (M1)

By default the page runs the **offline heuristic** brain (regex rules) and the Live Transcript header shows a `heuristic` chip. Add an Anthropic key to switch on the real LLM brain — per-utterance classification, library-aware scoring, and coaching — and the chip flips to **AI Enhanced**:

```
ANTHROPIC_API_KEY=...   # add to core/live/.env, then restart: npm start
```

The key stays in the relay (server-side); the page calls `/api/classify` and `/api/analyze`. If the key is absent or a call fails, it silently falls back to the heuristic — the demo never breaks.

## Coaching (M2)

The **Coaching** panel is deliberately quiet. Instead of a nudge under every utterance, a coaching engine (`../engine/coach.js`) dedupes signals (one card per issue, with a recurrence ×count), prioritizes by severity, caps the active set, and adds run-level cues you can't get per-utterance — design intent never stated, lagging engagement, off-rubric drift. Cards are severity-accented (amber = high, blue = medium, green = low). Verify the logic offline with `npm run eval:coach`.

## Libraries screen (M3)

`http://localhost:8787/live/libraries.html` (linked from the live page header). View every rubric library — guidelines, scorecard dimensions, coaching cues — plus stubs, a side-by-side comparison of any two, and an AI analysis of how the lenses differ (LLM when a key is present, data-driven summary otherwise).

## Local / self-hosted ASR (no third party)

`npm run start:local` runs `relay-local.js` — identical app, but the speech leg points at a local **WhisperLiveKit** server instead of Deepgram, so audio never leaves your machine. It's a ready-to-test stub: start WhisperLiveKit (`pip install whisperlivekit` → `whisperlivekit-server --model base --diarization`), set `WLK_URL=ws://localhost:8000/asr`, then `npm run start:local` and open http://localhost:8788/live/. Two TODOs in the file flag the only things to confirm against your WLK build (its JSON field names and audio intake format). The shared `relayHttp.js` is why the swap touches nothing downstream.

## Exporting a crit (M4)

After (or during) a session, click **Export** in the header. Critbot builds the structured crit record and downloads two files: `critbot-record-<time>.json` (the interchange object — classified transcript + scorecard + coaching + extracted **action items**, the source of truth other tools read) and `critbot-summary-<time>.md` (a readable share with the action items as a checklist). With an Anthropic key, action items are LLM-extracted (merged, imperative, rubric-tagged); without one, a heuristic extractor runs so export still works. Verify offline with `npm run eval:record`.

## Correcting tags (M4.1)

Every classified comment has an **edit** link. Click it to remove the suggested tag (the ✕ on the chip), type the right one, and optionally add a one-line rationale. The correction is applied instantly and saved to a local corpus (`.corrections.json`, gitignored). From then on, `/api/classify` feeds your team's recent corrections to the model as examples, so it starts matching your conventions — a lightweight "training" loop with no fine-tuning. The rationale is the valuable part: it's what lets the system generalize rather than memorize.

## Capture hardening (M5)

- **AudioWorklet** captures the mic off the main thread (modern, glitch-resistant), loaded from a Blob URL so there's no separate file to cache; falls back to ScriptProcessor on older browsers.
- **Auto-reconnect:** if the relay connection drops mid-session, the page retries with backoff and resumes streaming when it's back — your transcript is preserved. A real Stop doesn't trigger a reconnect.
- **Speaker renaming:** the **Speakers** bar above the transcript lets you rename "Speaker 0" → "Sarah"; every one of that speaker's comments (and the export) updates.
- A consent reminder is shown in the header.

> **Packaging** (desktop app / menu-bar widget) is deferred — the capture app is decoupled from the Figma plugin (they're joined by the crit record), so the same web app can later be wrapped in Tauri/Electron or shipped as a native widget without changing this code.

## Calendar awareness (M6)

A strip above Critique Quality shows the **live or next crit** from your calendar and an **auto-join** toggle. Turn it on and Critbot auto-starts capture when a crit goes live, attaching that event's title and **invited attendees** to the session (they land in the exported record's `meta.invited` — the roster the M7 relationship layer will use). Events come from `/api/events` via a provider abstraction: synthetic for now, with documented seams for Google Calendar / Microsoft Graph / Recall.ai. The productized "dispatch a bot into the Zoom/Teams call" path is the `/api/join` seam (needs a Recall.ai account); in the prototype, joining = auto-starting local capture.

## Roster & relationship policy (M7)

The **Roster** screen (`/live/roster.html`, linked from the header) is the second lens. Define who's in the room — name, role, **authority** (IC → Director), expertise — mark the **presenter**, and pick a **relationship policy**: *hierarchical* (authority-weighted, promotes a senior's directive to a decision), *flat/peer* (everyone equal, protective), or *expertise-led* (merit over rank). On export, the record's action items gain provenance (role + relationship to the presenter), a weight, decision-promotion, and protective flags — plus a "Relationship notes" summary. Authority-weighting is a real, expected dynamic; the policies still flag strong junior points so seniority can't silently drown them out. Roster data stays on your machine (`.roster.json`, gitignored); a Microsoft Graph / Workday provider can populate it later. Verify the engine with `npm run eval:relationships`.

## What's honest about it

- **The key stays server-side.** Deepgram's streaming socket needs a credential; `relay.js` holds it and proxies audio, so it never ships to the browser. That's why there's a relay and not just a static page.
- **Speakers come back numbered** ("Speaker 0 / Speaker 1"), not named — that's how live diarization works. Renaming/voice-enrollment (Otter's named-fingerprint polish) is a later step; the UI already keys off a `speakerNames` map ready to hold real names.
- **Classification/scoring is still the offline heuristic provider** by default (same engine as the rest of `core/`). Swap in the LLM provider for production-grade tagging — the live path doesn't change.
- **Audio path** uses `ScriptProcessorNode` (deprecated but universally supported) to keep it dependency-free; `AudioWorklet` is the eventual upgrade.

## Test without a mic or key

```
npm test                       # node test-parse.js
```

Feeds a synthetic Deepgram message through the grouping + engine and asserts the diarized utterances and classifications — no key, no mic, no network.

## Where this fits

This is the **local-mic capture** front door (great for prototype demos and the eventual in-person/co-located crit fork). The productized "join the Zoom/Teams call" front door is the Recall.ai bot path (see `../../CLAUDE.md` → Capture path). Both produce the same transcript model and feed the same engine.
