#!/bin/bash
# Enrich a test case using Claude Code CLI
# Usage: ./scripts/enrich-local.sh C291
#
# If KIWI_PASSWORD is set, fetches from Kiwi TCMS first.
# Otherwise, prompts you to provide the raw test case.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/output/enriched"

if [ -z "$1" ]; then
    echo "Usage: ./scripts/enrich-local.sh <case-id>"
    echo "Example: ./scripts/enrich-local.sh C291"
    exit 1
fi

CASE_ID="$1"
mkdir -p "$OUTPUT_DIR"

# Load .env if present
if [ -f "$PROJECT_DIR/.env" ]; then
    while IFS= read -r line; do
        if [[ $line =~ ^[^#] ]] && [[ $line == *=* ]]; then
            export "$line"
        fi
    done < "$PROJECT_DIR/.env"
fi

cd "$PROJECT_DIR"

# Check if we have Kiwi TCMS credentials
if [ -n "$KIWI_PASSWORD" ] && [ -n "$KIWI_URL" ]; then
    echo "[Enricher] Fetching $CASE_ID from Kiwi TCMS and enriching..."
    claude --print "
You are the Test Enricher agent. Follow the rules in agents/enricher/prompts/enricher-system.md exactly.

Fetch test case '$CASE_ID' from Kiwi TCMS at '$KIWI_URL' (user: '$KIWI_USER') and enrich it.

IMPORTANT: Consult the application help documentation to understand the feature being tested:
- Recruiting Help: https://recruiting-help.rival-hr.com/WelcometoRecruit.htm
- Workflow Help: https://workflow-help.rival-hr.com/topics/WorkflowHome.htm
Use these to determine correct navigation paths, UI element labels, and expected behaviors.

Output ONLY the enriched JSON (no explanation, no markdown fences) matching the schema in shared/schemas/enriched-case.schema.json.
" > "$OUTPUT_DIR/$CASE_ID.json"
else
    echo "[Enricher] No Kiwi TCMS credentials. Using Claude Code to enrich from description..."
    echo "[Enricher] Tip: Set KIWI_URL, KIWI_USER, KIWI_PASSWORD in .env for auto-fetch"
    echo ""

    claude --print "
You are the Test Enricher agent. Follow the rules in agents/enricher/prompts/enricher-system.md exactly.

Ask the user to describe or paste the raw test case for '$CASE_ID', then enrich it into structured JSON matching the schema in shared/schemas/enriched-case.schema.json.

IMPORTANT: Consult the application help documentation to understand the feature being tested:
- Recruiting Help: https://recruiting-help.rival-hr.com/WelcometoRecruit.htm
- Workflow Help: https://workflow-help.rival-hr.com/topics/WorkflowHome.htm
Use these to determine correct navigation paths, UI element labels, and expected behaviors.

Output ONLY the enriched JSON (no explanation, no markdown fences).
" > "$OUTPUT_DIR/$CASE_ID.json"
fi

echo "[Enricher] Output: $OUTPUT_DIR/$CASE_ID.json"
