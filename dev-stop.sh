#!/usr/bin/env bash
cd "$(dirname "$0")"
for name in backend frontend; do
  if [[ -f ".dev/${name}.pid" ]]; then
    kill "$(cat ".dev/${name}.pid")" 2>/dev/null || true
    rm -f ".dev/${name}.pid"
  fi
done
