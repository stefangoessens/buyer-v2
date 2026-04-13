#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$ROOT/python-workers" ]; then
  echo "Error: source directory not found: $ROOT/python-workers" >&2
  exit 1
fi

if [ ! -d "$ROOT/services/extraction/python-workers-vendored" ]; then
  echo "Error: target directory not found: $ROOT/services/extraction/python-workers-vendored" >&2
  exit 1
fi

command -v rsync >/dev/null || { echo "Error: rsync not found" >&2; exit 1; }

rsync -a --delete \
  --exclude '__pycache__/' --exclude '*.pyc' \
  --exclude '.pytest_cache/' --exclude '.ruff_cache/' --exclude '.mypy_cache/' \
  --exclude '.venv/' --exclude '.env' --exclude 'dist/' --exclude 'build/' --exclude '*.egg-info/' \
  "$ROOT/python-workers/" "$ROOT/services/extraction/python-workers-vendored/"

echo "Vendored workers synced from python-workers/."
