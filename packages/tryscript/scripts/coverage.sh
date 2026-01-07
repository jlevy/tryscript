#!/usr/bin/env bash
# Combined coverage collection from unit tests and golden tests.
#
# This script demonstrates using tryscript's `coverage` command to merge
# coverage from multiple sources (vitest unit tests + tryscript CLI tests).
#
# Usage: ./scripts/coverage.sh [--text-only]

set -e

# Determine reporters based on arguments
if [ "$1" = "--text-only" ]; then
  REPORTERS="text"
else
  REPORTERS="text,json,json-summary,lcov,html"
fi

# Use tryscript's coverage command to merge vitest + golden tests
node dist/bin.mjs coverage \
  --monocart \
  --reporters "$REPORTERS" \
  "pnpm vitest run" \
  "node dist/bin.mjs run tests/**/*.tryscript.md"
