#!/usr/bin/env bash
set -euo pipefail
mihir_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$mihir_root"
mihir_node="$(command -v node || true)"
if [[ -z "$mihir_node" ]] || ! "$mihir_node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' 2>/dev/null; then
  mihir_node=''
  for mihir_candidate in "$HOME"/.nvm/versions/node/v22.*/bin/node; do
    if [[ -x "$mihir_candidate" ]]; then mihir_node="$mihir_candidate"; fi
  done
fi
if [[ -z "$mihir_node" ]]; then
  printf 'Node.js 22 is required. Select Node 22 in your terminal and try again.\n' >&2
  exit 1
fi
if [[ ! -f node_modules/tsx/dist/cli.mjs ]]; then
  printf 'Install this app’s dependencies first: npm install\n' >&2
  exit 1
fi
export PATH="$(dirname -- "$mihir_node"):$PATH"
exec "$mihir_node" node_modules/tsx/dist/cli.mjs MIHIR/server/localRunner.ts
