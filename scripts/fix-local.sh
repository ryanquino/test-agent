#!/bin/bash
# Run a test and self-heal using Claude Code CLI
# Usage: ./scripts/fix-local.sh tests/candidates/candidates-ellipsis-actions.spec.js
#
# Runs the test in the target repo, and if it fails,
# asks Claude Code to fix it iteratively.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$1" ]; then
    echo "Usage: ./scripts/fix-local.sh <spec-path-relative-to-target-repo>"
    echo "Example: ./scripts/fix-local.sh tests/candidates/candidates-ellipsis-actions.spec.js"
    exit 1
fi

SPEC_PATH="$1"

# Load .env if present
if [ -f "$PROJECT_DIR/.env" ]; then
    while IFS= read -r line; do
        if [[ $line =~ ^[^#] ]] && [[ $line == *=* ]]; then
            export "$line"
        fi
    done < "$PROJECT_DIR/.env"
fi

TARGET_REPO="${TARGET_REPO_PATH:-../recruiting-playwright-ui-tests}"

if [ ! -d "$TARGET_REPO" ]; then
    echo "Error: Target repo not found at: $TARGET_REPO"
    echo "Set TARGET_REPO_PATH in .env"
    exit 1
fi

MAX_RETRIES="${MAX_RETRIES:-5}"

echo "[Runner] Testing: $SPEC_PATH"
echo "[Runner] Target repo: $TARGET_REPO"
echo "[Runner] Max retries: $MAX_RETRIES"
echo ""

cd "$TARGET_REPO"

for ATTEMPT in $(seq 1 $MAX_RETRIES); do
    echo "─── Attempt $ATTEMPT/$MAX_RETRIES ───"

    # Run the test
    if npx playwright test "$SPEC_PATH" --reporter=line 2>&1; then
        echo ""
        echo "✅ Test PASSED on attempt $ATTEMPT"
        exit 0
    else
        TEST_OUTPUT=$(npx playwright test "$SPEC_PATH" --reporter=line 2>&1 || true)
        echo ""
        echo "❌ Test FAILED on attempt $ATTEMPT"

        if [ "$ATTEMPT" -eq "$MAX_RETRIES" ]; then
            echo "Max retries reached. Giving up."
            exit 1
        fi

        echo "Asking Claude Code to fix..."
        echo ""

        cd "$PROJECT_DIR"
        claude "
You are the Test Runner agent. Follow agents/runner/prompts/runner-system.md.

The test at '$TARGET_REPO/$SPEC_PATH' failed with this output:

$TEST_OUTPUT

Read the relevant test files in '$TARGET_REPO' (the spec, its page object, and fixture).
Analyze the error, determine the fix, and write the corrected file(s) directly.
Only fix generated files — never modify base-fixture.js or base.page.js.
"
        cd "$TARGET_REPO"
    fi
done
