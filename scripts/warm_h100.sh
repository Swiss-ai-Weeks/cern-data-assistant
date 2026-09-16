#!/usr/bin/env bash
# Keep qwen2.5:32b + the embed model loaded on the H100 so the first
# judge question is not a cold GPU load.
set -euo pipefail
MODEL="${OLLAMA_MODEL:-qwen2.5:32b}"
EMBED="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
echo "warming $MODEL + $EMBED ..."
curl -sS -m 180 http://127.0.0.1:11434/api/chat \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"keep_alive\":-1}" \
  >/dev/null
curl -sS -m 60 http://127.0.0.1:11434/api/embed \
  -d "{\"model\":\"$EMBED\",\"input\":\"warm\",\"keep_alive\":-1}" \
  >/dev/null || curl -sS -m 60 http://127.0.0.1:11434/api/embeddings \
  -d "{\"model\":\"$EMBED\",\"prompt\":\"warm\"}" \
  >/dev/null
# Prime the exact original-challenge catalog path as well. The explicit query
# uses deterministic planning/ranking, but the first CERN portal request can
# still take several seconds; warming keeps the live judge path predictable.
curl -sS -m 60 http://127.0.0.1:5001/api/agent \
  -H 'Content-Type: application/json' \
  -d '{"query":"I need proton-proton collisions at 13 TeV with muons"}' \
  >/dev/null || true
echo "warm."
