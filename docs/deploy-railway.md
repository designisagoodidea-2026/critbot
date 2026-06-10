# Deploy Critbot to Railway (always-on, password-gated)

Goal: run the relay on Railway so the demo is live **independent of your Mac** — no terminal windows, no tunnel — behind a shared password, with saved crits persisting to GitHub.

---

## One-command deploy (the routine path)

Day to day you don't touch the from-scratch steps below — those were the **one-time setup**. To ship a change, from the repo root:

```
npm run deploy -- "what changed"
```

That's the whole pipeline. `scripts/deploy.sh` is deterministic — same thing every time:

1. **Token** — reads a GitHub PAT from the **macOS Keychain** (item `critbot-deploy`), or `$CRITBOT_DEPLOY_TOKEN` if set.
2. **Clone → temp** — clones the remote into a temp dir. Git is never run inside the working folder (the Cowork mount blocks `unlink`, which corrupts `.git`).
3. **Sync** — `rsync` the working tree into the clone, excluding `node_modules/`, `.env*`, `.corrections.json`, `.roster.json`, crit data, and the deploy token.
4. **Stamp** — writes `core/live/BUILD.json` with a unique `deployId` + timestamp.
5. **Secret scan** — aborts before committing if any secret-shaped content or forbidden file is staged.
6. **Push** — commits and pushes. **Railway auto-redeploys from the push** — no manual Railway step.
7. **Verify** — polls the public `GET /version` endpoint until that exact `deployId` is live, then prints success. "Done" means *provably deployed*, not just pushed.

Preview without shipping:

```
npm run deploy:dry -- "trying something"   # clone + sync + stamp + scan, no commit/push
```

### One-time Keychain setup (once, on your Mac)

```
security add-generic-password -a "$USER" -s critbot-deploy -w
# paste your fine-grained PAT when prompted (Contents: read/write on the repo)
```

This is the **same PAT** Railway already uses as `CRITBOT_GH_TOKEN`, so revoke it only when you tear the deployment down — not between deploys. Nothing is written to disk; the Keychain hands it to the script at deploy time. (No-Keychain fallback: drop the PAT in `scripts/.deploy-token` — gitignored — or `export CRITBOT_DEPLOY_TOKEN=…`.)

### Verify by hand

```
curl -s https://critbot-production.up.railway.app/version
# → {"deployId":"20260609T…","deployedAt":"…","message":"…"}
```

`/version` is intentionally **public** (no password) and carries only a build id + timestamp.

---

## First-time / from-scratch setup

The repo root has the two files Railway needs: `package.json` (`npm start` → `node core/live/relay.js`) and `railway.json` (start command + restart policy). Railway checks out the whole repo, so the relay's `../engine`, `../lens`, rubric libraries, and `fixtures/team-crits` are all present.

> **Push first.** These changes (the password gate, root `package.json`, `railway.json`) must be on GitHub before Railway can build them. Push to `designisagoodidea-2026/critbot`.

## 1 · Create the service

1. Sign in at **railway.app** → **New Project** → **Deploy from GitHub repo** → pick **critbot**.
2. Railway auto-detects Node (Nixpacks), runs `npm install`, then `npm start`. No root-directory setting needed — the root `package.json` points at `core/live/relay.js`.

## 2 · Set environment variables

Service → **Variables** → add:

| Variable | Value | Why |
|---|---|---|
| `DEEPGRAM_API_KEY` | your Deepgram key | live transcription |
| `ANTHROPIC_API_KEY` | your Anthropic key | the LLM brain (classify/score/coach/extract) |
| `CRITBOT_PASSWORD` | a shared password you choose | gates the whole app (page + API + mic socket) |
| `CRITBOT_GH_TOKEN` | a fine-grained PAT (Contents: read/write on the repo) | **persistence** — see below |
| `CRITBOT_GH_READ` | `1` | read shared crits back from GitHub |
| `CRITBOT_GH_REPO` | `designisagoodidea-2026/critbot` | optional (this is the default) |
| `CRITBOT_USER` | your display name | optional — drives the "you attended / didn't" tag in Team Crits |

**Do not set `PORT`** — Railway injects it, and the relay already reads `process.env.PORT`.

## 3 · Get the URL + test

1. Service → **Settings → Networking → Generate Domain** → you get an `https://…up.railway.app` URL.
2. Open it. The browser prompts for credentials — **username: anything, password: your `CRITBOT_PASSWORD`**.
3. Hit **Start**, grant mic, say a couple of lines → confirm the transcript builds (this proves HTTPS + the `wss://` mic socket + the password gate all work together).
4. Open **Team Crits →** → the three seeded crits show; **Save crit** publishes a new one.

## Persistence — why the GitHub token matters here

Railway's filesystem is **ephemeral**: it resets on every redeploy/restart. The local crit store would vanish. With `CRITBOT_GH_TOKEN` set, **Save crit** publishes to `crits/crits.json` in the repo, so crits survive restarts and are browsable by anyone with the URL. Without it, Team Crits resets to just the seeded crits each deploy. So for a hosted demo, the token is effectively required.

## Cost, security, teardown

- **Cost:** Railway is usage-based (small for a demo). It stays warm — no cold-starts. Pause or delete the service when you're not demoing to stop the meter.
- **Security:** the password gates the page, the APIs, and the mic WebSocket. It still fronts your paid API keys, so don't share the URL or password widely, and **revoke** the Deepgram / Anthropic / GitHub credentials if they ever leak.
- **Teardown:** Service → **Settings → Delete Service** (or pause it) fully stops it. Revoke the GitHub PAT when the demo's done.

## Troubleshooting

- **Build fails / "cannot find module ws"** — confirm the root `package.json` is on GitHub (it declares `ws` and the start script). Node resolves `ws` from the repo-root `node_modules`.
- **App crashes on boot** — check Railway **Deploy logs**; usually a missing `DEEPGRAM_API_KEY`. The relay exits with a clear message if it's unset.
- **Browser never asks for a password** — `CRITBOT_PASSWORD` isn't set; the app runs open. Add it and redeploy.
- **Mic won't connect after entering the password** — the WebSocket handshake didn't carry the basic-auth header (rare, browser-dependent). Tell me and I'll switch the gate to a query-token scheme for `/ws`.
- **Team Crits empty after a redeploy** — `CRITBOT_GH_TOKEN` / `CRITBOT_GH_READ` not set, so nothing persisted. Add them.

## Same steps on Render (the free alternative)

Identical, with two differences: set **Build = `npm install`**, **Start = `npm start`**, and expect the free instance to **spin down when idle** (~30–60s cold-start on the next visit) — warm it before a demo.
