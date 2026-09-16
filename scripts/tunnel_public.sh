#!/usr/bin/env bash
# Expose the local app (must already listen on PORT, default 5001) via a random trycloudflare URL.
# Demo only — no auth, tunnel stops when this script exits.
set -euo pipefail
PORT="${1:-5001}"
if ! curl -sf "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
  echo "Nothing healthy on http://127.0.0.1:${PORT} — start scripts/start_h100.sh first." >&2
  exit 1
fi
echo ">> Public URL will appear below (Cloudflare quick tunnel). Ctrl+C stops the tunnel only."
exec npx --yes cloudflared@latest tunnel --url "http://127.0.0.1:${PORT}"
