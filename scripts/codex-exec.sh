#!/usr/bin/env bash
# 使用本仓库隔离 CODEX_HOME 调用 codex exec，审核 DLC。
# 密钥优先 DEEPSEEK_API_KEY，否则读 ai-gallery config.json 的 llm deepseek。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export CODEX_HOME="${CODEX_HOME:-$ROOT/codex-home}"

resolve_gallery_config() {
  if [[ -n "${AI_GALLERY_CONFIG:-}" && -f "${AI_GALLERY_CONFIG}" ]]; then
    printf '%s\n' "$AI_GALLERY_CONFIG"
    return
  fi
  if [[ -f /root/ai-gallery/config.json ]]; then
    printf '%s\n' /root/ai-gallery/config.json
    return
  fi
  if [[ -f "$ROOT/../ai-gallery/config.json" ]]; then
    printf '%s\n' "$ROOT/../ai-gallery/config.json"
  fi
}

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  CONFIG="$(resolve_gallery_config || true)"
  if [[ -n "${CONFIG:-}" ]]; then
    DEEPSEEK_API_KEY="$(node -e "
      const c=require(process.argv[1]);
      const list=Array.isArray(c.llm)?c.llm:[c.llm].filter(Boolean);
      const e=list.find(x=>String(x.name||'').toLowerCase()==='deepseek');
      if(!e) process.exit(2);
      process.stdout.write(String(e['api-key']||e.apiKey||e.api_key||''));
    " "$CONFIG")" || true
    export DEEPSEEK_API_KEY
  fi
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY is not set. export it or put deepseek api-key in ai-gallery config.json" >&2
  exit 1
fi

CATALOG="$CODEX_HOME/model-catalog.deepseek.json"

has_cd=false
for arg in "$@"; do
  if [[ "$arg" == "-C" || "$arg" == --cd || "$arg" == --cd=* ]]; then
    has_cd=true
    break
  fi
done

if [[ "$has_cd" == false ]]; then
  EMPTY_WS="${TMPDIR:-/tmp}/poem-dlc-ingest-codex-empty"
  mkdir -p "$EMPTY_WS"
  exec codex exec \
    --ephemeral \
    --skip-git-repo-check \
    --disable plugins \
    -c "model_catalog_json=\"$CATALOG\"" \
    -C "$EMPTY_WS" \
    "$@"
fi

exec codex exec \
  --ephemeral \
  --skip-git-repo-check \
  --disable plugins \
  -c "model_catalog_json=\"$CATALOG\"" \
  "$@"
