# Critbot — Demo & UAT Runbook (M1–M7 product)

> **Scope.** Validates the **working live product** end-to-end on your Mac: mic → diarized transcript → classify / score / coach → export → Figma review. The **M8–M14 lens work** (skill lens, MCP lens, presenter-private coaching, live role annotation) is **not in this UI yet** — it lives in the offline engine and is validated separately by `node core/test.js`. Don't expect to see it here.
>
> **Air-gap.** All demo data is synthetic. Do not load real CoS data or real meeting transcripts. If you demo to a prospect, keep it synthetic.
>
> **Pre-verified (2026-06-08):** the relay boots, serves `/live/`, `/live/libraries.html`, `/live/roster.html`, and `/api/*` (all HTTP 200), the LLM brain is **ON** (Anthropic key found), and Deepgram is configured. The one thing this UAT exists to confirm is the **live mic → page round trip**, which has never been checked off.

---

## 0 · Pre-flight (~2 min)

Runs on **your Mac** (microphone + Chrome or Safari). The relay and page are local; nothing is deployed.

1. Open Terminal and go to the live folder (full path — `cd core/live` only works from the project root):
   ```
   cd "/Users/jason/Documents/Claude/Projects/Critbot/core/live"
   ```
2. One-time install (safe to re-run):
   ```
   npm install
   ```
3. Confirm the key is present (don't print it): `ls -la .env` should exist. `ANTHROPIC_API_KEY` is optional but already set → the real brain runs.
4. Start the relay:
   ```
   npm start
   ```
   **Expect:** `Critbot live relay running (Deepgram)` · `LLM intelligence: ON` · `→ open http://localhost:8787/live/`.
5. Open **http://localhost:8787/live/** in Chrome.

> **Diarization tip.** Deepgram splits speakers only when it hears more than one voice. To demo the speaker split, have a second person say a line (or play a short clip). Solo works fine — it'll just be one speaker you can rename.

---

## 1 · Screen 1 — live critique (M1 · M2 · M5)

1. Click **● Start**, grant microphone access when prompted.
2. Speak a few critique-style lines — state an intent, raise a concern, suggest a fix. With a second voice, alternate.

**You should see:** the transcript build live; each utterance auto-classified (approval / suggestion / concern / question / statement); the **Critique Quality** scorecard updating; the **Coaching** panel surfacing the occasional nudge (deduped, severity-coloured — not one per line). The header chip reads **AI Enhanced** (LLM on).

3. In the **Speakers** bar, rename "Speaker 0" → a real name; confirm every one of that speaker's lines updates.
4. Switch the **Library** dropdown — the lens (Screen 2) changes live; watch scoring/coaching shift.

---

## 2 · Screen 2 — libraries (M3)

Open **http://localhost:8787/live/libraries.html** (linked in the live header).

**You should see:** each rubric library with its guidelines, scorecard dimensions, and coaching cues; the stub libraries listed; a side-by-side comparison of any two; and an **AI analysis** of how the two lenses differ.

---

## 3 · Roster + relationship policy (M7)

Open **http://localhost:8787/live/roster.html** (linked in the header).

1. Add the people in the room — name, role, **authority** (IC → Director), expertise.
2. Mark the **presenter**.
3. Pick a **relationship policy**: hierarchical / flat-peer / expertise-led.

**You should see:** the roster persists locally (`.roster.json`), and the choice will enrich the exported record (next step) with role/relationship provenance.

---

## 4 · Export the crit record (M4)

Click **Export** in the live header.

**You should get** two downloads: `critbot-record-<time>.json` (the interchange object — classified transcript + scorecard + coaching + **action items**) and `critbot-summary-<time>.md` (readable share, action items as a checklist). With the Anthropic key, action items are LLM-extracted (merged, imperative, rubric-tagged). Open the `.md` and confirm it reads cleanly; if you set a roster, confirm action items carry role/weight and a "Relationship notes" line.

---

## 5 · Correction loop (M4.1) — optional

On any classified comment, click **edit**: remove the suggested tag (✕), type the right one, optionally add a one-line rationale.

**You should see:** the tag updates instantly; it's saved to a local corpus (`.corrections.json`); subsequent classifications start matching your conventions (the model gets your recent corrections as examples).

---

## 6 · Figma review sink

Needs **Figma Desktop**.

1. Plugins → Development → **Import plugin from manifest…** → pick `figma-plugin/manifest.json`.
2. Run the plugin (Plugins → Development → Critbot).
3. In the panel, click **"Load crit record (.json)…"** and choose the `critbot-record-<time>.json` you just exported.

**You should see:** the action-item queue render with type/rubric/scope tags, and — if you set a roster — **role / ×weight / decision / protect** badges and a relationship-notes line. **Focus frame** / **Resolve** buttons work per item. (Frame *pinning* — resolving items to specific nodes — is M12, not built yet; "Focus frame" only does something once targets exist.)

---

## UAT acceptance checklist

| # | Check | Milestone | ✅ Pass when |
|---|---|---|---|
| 1 | Relay starts, page loads | infra | startup log shows "running" + "LLM: ON"; `/live/` opens |
| 2 | Mic captured, transcript builds live | M5 | words appear within ~1–2s of speaking |
| 3 | Speaker diarization | M5 | two voices split into Speaker 0 / 1 (needs 2 voices) |
| 4 | Auto-classification | M1 | each utterance gets a sensible tag; chip = "AI Enhanced" |
| 5 | Crit-quality scorecard | M1 | dimensions flip met/unmet as evidence appears |
| 6 | Live coaching | M2 | nudges appear, deduped + severity-coloured (not one/line) |
| 7 | Library switch changes the lens | M3 | scoring/coaching shift when you change the dropdown |
| 8 | Libraries screen | M3 | comparison + AI analysis render |
| 9 | Roster + policy | M7 | roster saves; presenter + policy selectable |
| 10 | Export | M4 | record.json + summary.md download; summary reads cleanly |
| 11 | Provenance in export | M7 | with a roster set, items carry role/weight/notes |
| 12 | Correction loop | M4.1 | a re-tag sticks and persists |
| 13 | Figma plugin renders the record | sink | loaded record shows the queue with badges |

A milestone "passes UAT" only when its row is green on a **real run**, not just in the offline tests.

---

## Troubleshooting

- **"DEEPGRAM_API_KEY is not set"** — the file must be exactly `.env`, not `.env.txt` (TextEdit/Finder hide the extension). `ls -la`, then `mv .env.txt .env`. Restart `npm start`.
- **Chip says "heuristic," not "AI Enhanced"** — no/!invalid `ANTHROPIC_API_KEY` in `.env`, or a call failed (it falls back silently so the demo never breaks). Add the key, restart.
- **No mic / no transcript** — browser didn't get mic permission, or another app holds the mic. Check the site's mic permission; reload.
- **Speakers don't split** — only one voice was heard. Diarization needs ≥2 distinct voices. Solo is fine for everything else.
- **Port 8787 in use** — an old relay is still running. Find and stop it, or restart Terminal.
- **Plugin won't import** — use Figma **Desktop** (not the browser); import via the `manifest.json` path.

---

## Out of scope for this demo (set expectations)

- **The M8–M14 lens work** — skill lens, MCP/context lens, presenter-private coaching, live role annotation — is **not wired into this UI**. It's validated by `node core/test.js` (31 checks). Surfacing it live is a separate task.
- **Joining a remote Zoom/Teams call** — this demo is **local mic only**. Recall.ai bot dispatch + real-calendar OAuth are unbuilt (account-gated).
- **Frame pinning** (anchoring action items to Figma nodes) — M12, not built; "Focus frame" is inert until targets exist.
