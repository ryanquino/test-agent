#!/bin/bash
# Full local pipeline: enrich → generate → deploy
# Usage: ./scripts/run-local.sh C291 [C292 C293...]
#
# This script uses Claude Code CLI to run each stage.
# Requires: claude CLI installed and authenticated.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/output"

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/run-local.sh <case-id> [case-id...]"
    echo "Example: ./scripts/run-local.sh C291"
    echo "Example: ./scripts/run-local.sh C291 C292 C293"
    exit 1
fi

# Load .env if present
if [ -f "$PROJECT_DIR/.env" ]; then
    while IFS= read -r line; do
        if [[ $line =~ ^[^#] ]] && [[ $line == *=* ]]; then
            export "$line"
        fi
    done < "$PROJECT_DIR/.env"
fi

TARGET_REPO="${TARGET_REPO_PATH:-../recruiting-playwright-ui-tests}"

echo "═══════════════════════════════════════════════════"
echo "  Test Generator Pipeline (Local / Claude Code)"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Cases: $@"
echo "  Target repo: $TARGET_REPO"
echo ""

for CASE_ID in "$@"; do
    echo "┌─── Processing: $CASE_ID ───────────────────────────"
    echo "│"

    # Stage 1: Enrich
    echo "│  Stage 1: Enriching..."
    "$SCRIPT_DIR/enrich-local.sh" "$CASE_ID"
    echo "│  ✅ Enriched → output/enriched/$CASE_ID.json"
    echo "│"

    # Stage 2: Generate
    echo "│  Stage 2: Generating..."
    "$SCRIPT_DIR/generate-local.sh" "$OUTPUT_DIR/enriched/$CASE_ID.json"
    echo "│  ✅ Generated → output/generated/"
    echo "│"

    # Stage 3: Deploy to target repo (if exists)
    if [ -d "$TARGET_REPO" ]; then
        echo "│  Stage 3: Deploying to target repo..."
        cp -r "$OUTPUT_DIR/generated/pages/" "$TARGET_REPO/pages/" 2>/dev/null || true
        cp -r "$OUTPUT_DIR/generated/tests/" "$TARGET_REPO/tests/" 2>/dev/null || true
        cp -r "$OUTPUT_DIR/generated/test-data/" "$TARGET_REPO/test-data/" 2>/dev/null || true
        echo "│  ✅ Deployed to $TARGET_REPO"
    else
        echo "│  ⏭️  Target repo not found, skipping deploy"
    fi

    echo "│"
    echo "└─── Done: $CASE_ID ─────────────────────────────────"
    echo ""
done

echo "═══════════════════════════════════════════════════"
echo "  Pipeline complete for $# case(s)"
echo "═══════════════════════════════════════════════════"
