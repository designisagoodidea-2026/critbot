#!/usr/bin/env bash
#
# deploy.sh — one-command, deterministic deploy: local → GitHub → Railway.
#
#   Critbot/scripts/deploy.sh ["commit message"]
#   npm run deploy -- "commit message"          (from repo root)
#
# What it does, every time, identically:
#   1. Resolve the GitHub token (macOS Keychain, or CRITBOT_DEPLOY_TOKEN env).
#   2. Clone the remote into a temp dir  (git-in-the-Cowork-mount is broken — see
#      the README note — so we never run git inside the working folder).
#   3. rsync the working tree in, excluding node_modules, secrets, real crit data.
#   4. Stamp core/live/BUILD.json with a unique deployId + timestamp.
#   5. Scan the staged diff for secrets; ABORT if anything sensitive appears.
#   6. Commit + push.  Railway auto-redeploys from the push.
#   7. Poll the live /version endpoint until that deployId is serving — so "done"
#      means provably live, not just pushed.
#
# Flags:
#   --dry-run   do everything except commit/push/poll (clone, rsync, stamp, scan).
#   -h|--help   show this header.
#
# Exit codes: 0 ok · 1 usage/precondition · 2 secret scan tripped · 3 verify timed out.

set -euo pipefail

# ---------------------------------------------------------------- config
REPO_SLUG="designisagoodidea-2026/critbot"
LIVE_URL="https://critbot-production.up.railway.app"
KEYCHAIN_SERVICE="critbot-deploy"          # security add-generic-password -s critbot-deploy
VERIFY_TIMEOUT=210                          # seconds to wait for Railway to go live
VERIFY_INTERVAL=6

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=0
MSG=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) MSG="$a" ;;
  esac
done
[ -n "$MSG" ] || MSG="deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

say()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit "${2:-1}"; }

# ---------------------------------------------------------------- 1. token
resolve_token() {
  if [ -n "${CRITBOT_DEPLOY_TOKEN:-}" ]; then printf '%s' "$CRITBOT_DEPLOY_TOKEN"; return; fi
  if command -v security >/dev/null 2>&1; then
    security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null && return
  fi
  if [ -f "$REPO_ROOT/scripts/.deploy-token" ]; then
    tr -d '\r\n' < "$REPO_ROOT/scripts/.deploy-token"; return
  fi
  return 1
}
TOKEN="$(resolve_token)" || die "No GitHub token. On your Mac, store one once:
    security add-generic-password -a \"\$USER\" -s $KEYCHAIN_SERVICE -w <PAT>
  or export CRITBOT_DEPLOY_TOKEN=<PAT> for this shell." 1
[ -n "$TOKEN" ] || die "Token resolved empty — check the Keychain item / env var." 1

# Redact the token from everything we print, defensively.
redact() { sed "s/${TOKEN//\//\\/}/***REDACTED***/g"; }

# ---------------------------------------------------------------- 2. clone
TMP="$(mktemp -d "${TMPDIR:-/tmp}/critbot-deploy.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
AUTH_URL="https://x-access-token:${TOKEN}@github.com/${REPO_SLUG}.git"

say "Cloning ${REPO_SLUG} …"
git clone --quiet --depth 1 "$AUTH_URL" "$TMP/repo" 2> >(redact >&2) || die "clone failed" 1
cd "$TMP/repo"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git config user.email "deploy@critbot.local"
git config user.name  "critbot-deploy"
ok "cloned (branch: $BRANCH)"

# ---------------------------------------------------------------- 3. sync tree
say "Syncing working tree → clone …"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.DS_Store' \
  --exclude='.env' --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='.corrections.json' \
  --exclude='.roster.json' \
  --exclude='crit-records/' --exclude='*.transcript' \
  --exclude='scripts/.deploy-token' \
  --exclude='core/live/BUILD.json' \
  "$REPO_ROOT/" "$TMP/repo/"
# keep the committable template even though .env.* is excluded above
[ -f "$REPO_ROOT/core/live/.env.example" ] && cp "$REPO_ROOT/core/live/.env.example" "$TMP/repo/core/live/.env.example" 2>/dev/null || true

# ---------------------------------------------------------------- 4. stamp
DEPLOY_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 3)"
cat > "$TMP/repo/core/live/BUILD.json" <<JSON
{
  "deployId": "$DEPLOY_ID",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "message": $(printf '%s' "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk '{print "\""$0"\""}')
}
JSON
ok "stamped deployId $DEPLOY_ID"

# ---------------------------------------------------------------- 5. secret scan
say "Scanning staged tree for secrets …"
git add -A
STAGED="$(git diff --cached --name-only)"
if [ -z "$STAGED" ]; then ok "no changes to deploy — already up to date."; exit 0; fi

# (a) filenames that must never be committed
echo "$STAGED" | grep -E '(^|/)\.env$|(^|/)\.env\.[^x]|\.corrections\.json$|\.roster\.json$|scripts/\.deploy-token$' \
  && die "staged a forbidden file (see list above) — aborting." 2 || true
# (b) secret-shaped content in ADDED lines only. A deleted line (e.g. removing a
#     "DEEPGRAM_API_KEY=xxxxx" placeholder from help text) is NOT being committed,
#     so it must not block. Real keys are long, so a value-length floor keeps
#     template placeholders (xxxxx, your-key) from tripping it.
ADDED="$(git diff --cached --unified=0 | grep -E '^\+' | grep -vE '^\+\+\+' || true)"
if printf '%s' "$ADDED" | grep -aE 'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-ant-[A-Za-z0-9-]{30,}|(DEEPGRAM_API_KEY|ANTHROPIC_API_KEY)[[:space:]]*=[[:space:]]*[A-Za-z0-9]{16,}' >/dev/null; then
  die "secret-shaped content found in newly-added lines — aborting before commit." 2
fi
ok "clean — $(echo "$STAGED" | wc -l | tr -d ' ') file(s) changed"

if [ "$DRY_RUN" = "1" ]; then
  printf '\033[33m— dry run: not committing or pushing —\033[0m\n'
  git --no-pager diff --cached --stat
  exit 0
fi

# ---------------------------------------------------------------- 6. commit + push
git commit --quiet -m "$MSG" -m "deployId: $DEPLOY_ID"
SHA="$(git rev-parse --short HEAD)"
say "Pushing $SHA → $BRANCH …"
git push --quiet origin "$BRANCH" 2> >(redact >&2) || die "push failed" 1
ok "pushed $SHA — Railway is now redeploying"

# ---------------------------------------------------------------- 7. verify live
say "Waiting for Railway to serve $DEPLOY_ID (up to ${VERIFY_TIMEOUT}s) …"
deadline=$(( $(date +%s) + VERIFY_TIMEOUT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  live="$(curl -fsS --max-time 8 "$LIVE_URL/version" 2>/dev/null | tr -d ' \n' || true)"
  if printf '%s' "$live" | grep -q "\"deployId\":\"$DEPLOY_ID\""; then
    ok "live: $DEPLOY_ID ($SHA) is serving at $LIVE_URL"
    exit 0
  fi
  sleep "$VERIFY_INTERVAL"
done
die "pushed $SHA, but $DEPLOY_ID was not live within ${VERIFY_TIMEOUT}s.
  Railway may still be building — check the dashboard, or re-run to re-verify." 3
