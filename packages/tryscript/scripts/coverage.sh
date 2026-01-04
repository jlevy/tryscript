#!/usr/bin/env bash
# Combined coverage collection from unit tests and golden tests
# Usage: ./scripts/coverage.sh [--text-only]

set -e

# Create temp directory for V8 coverage data
COVERAGE_TEMP=$(mktemp -d)
export NODE_V8_COVERAGE="$COVERAGE_TEMP"

echo "Collecting V8 coverage to $COVERAGE_TEMP"

# Run unit tests (vitest without --coverage, using raw V8)
echo ""
echo "=== Running unit tests ==="
pnpm vitest run

# Run golden tests
echo ""
echo "=== Running golden tests ==="
node dist/bin.mjs run 'tests/**/*.tryscript.md'

# Determine reporters based on arguments
if [ "$1" = "--text-only" ]; then
  REPORTERS="--reporter text"
else
  REPORTERS="--reporter text --reporter json --reporter json-summary --reporter lcov --reporter html"
fi

# Generate combined coverage report
echo ""
echo "=== Generating combined coverage report ==="
./node_modules/.bin/c8 report \
  --temp-directory "$COVERAGE_TEMP" \
  --reports-dir coverage \
  --src src \
  --all \
  --include 'dist/**' \
  $REPORTERS

# Cleanup temp directory
rm -rf "$COVERAGE_TEMP"

echo ""
echo "Coverage report written to coverage/"
