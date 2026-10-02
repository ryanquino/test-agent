#!/bin/bash
# Generate Playwright code from an enriched test case using Claude Code CLI
# Usage: ./scripts/generate-local.sh output/enriched/C291.json
#
# Reads the enriched JSON and generates 4 files:
# - Page Object
# - Fixture
# - Spec
# - Test Data

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/output/generated"

if [ -z "$1" ]; then
    echo "Usage: ./scripts/generate-local.sh <enriched-case.json>"
    echo "Example: ./scripts/generate-local.sh output/enriched/C291.json"
    exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: File not found: $INPUT_FILE"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
cd "$PROJECT_DIR"

echo "[Generator] Generating Playwright code from: $INPUT_FILE"

claude --print "
You are the Code Generator agent. Follow the rules in these files EXACTLY:
- agents/generator/prompts/generate-system.md (main instructions)
- agents/generator/prompts/pages-rules.md (page object conventions)
- agents/generator/prompts/fixtures-rules.md (fixture conventions)
- agents/generator/prompts/tests-rules.md (test spec conventions)

Read the enriched test case from: '$INPUT_FILE'

Generate the four Playwright files and write them to these paths under output/generated/:
1. pages/{feature}/{name}.page.js
2. tests/fixtures/{feature}-fixture.js
3. tests/{feature}/{name}.spec.js
4. test-data/{feature}/{name}.json

Use the file writing tools to create the actual files. Do not just print them.
After writing all files, print a summary of what was created.
"

echo "[Generator] Done. Files in: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/ 2>/dev/null || echo "(check subdirectories)"
