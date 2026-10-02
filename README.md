# Test Generator Agents

A three-agent pipeline that transforms Kiwi TCMS test cases into working Playwright test scripts — complete with self-healing execution.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  AGENT 1        │     │  AGENT 2        │     │  AGENT 3        │
│  Test Enricher  │────▶│  Code Generator │────▶│  Test Runner    │
│                 │     │                 │     │                 │
│ • Fetch from    │     │ • Page object   │     │ • Execute test  │
│   Kiwi TCMS     │     │ • Fixture       │     │ • Analyze error │
│ • Classify &    │     │ • Spec file     │     │ • Fix code      │
│   enrich steps  │     │ • Test data     │     │ • Retry until   │
│ • Add context   │     │ • Follows POM   │     │   green         │
│ • Infer waits   │     │   conventions   │     │ • Max 5 retries │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
  output/enriched/        output/generated/        target repo
   C291.json              pages/fixtures/specs      (PR created)
```

## Project Structure

```
Test-generator-agents/
├── agents/
│   ├── enricher/
│   │   ├── index.js                    ← Kiwi TCMS fetch + LLM enrichment
│   │   └── prompts/
│   │       └── enricher-system.md      ← Enrichment rules & element mapping
│   ├── generator/
│   │   ├── index.js                    ← Enriched JSON → Playwright code
│   │   └── prompts/
│   │       ├── generate-system.md      ← Core generation instructions
│   │       ├── pages-rules.md          ← Page Object conventions
│   │       ├── fixtures-rules.md       ← Fixture conventions
│   │       └── tests-rules.md          ← Test spec conventions
│   └── runner/
│       ├── index.js                    ← Self-healing execution loop
│       └── prompts/
│           └── runner-system.md        ← Error analysis & fix strategy
├── orchestrator/
│   └── pipeline.js                     ← Wires all 3 agents together
├── shared/schemas/
│   └── enriched-case.schema.json       ← Contract between Agent 1 → Agent 2
├── scripts/
│   ├── run-local.sh                    ← Full local pipeline (Claude Code)
│   ├── enrich-local.sh                 ← Stage 1 local
│   ├── generate-local.sh              ← Stage 2 local
│   └── fix-local.sh                    ← Stage 3 local (self-heal)
├── examples/
│   ├── enriched-case.json              ← Sample enriched output
│   └── raw-kiwi-case.json              ← Sample raw Kiwi TCMS input
├── .github/workflows/
│   └── generate-tests.yml              ← CI workflow with PR creation
├── CLAUDE.md                           ← Claude Code project context
├── package.json
├── .env.example
└── .gitignore
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Kiwi TCMS and LLM credentials

# Run the full pipeline for a single case
npm run pipeline -- --case-id C291

# Generate code only (skip test execution)
npm run pipeline:generate-only -- --case-id C291

# Batch multiple cases
npm run pipeline -- --case-id C291,C292,C293

# Run agents individually
npm run enrich -- --case-id C291
npm run generate -- --input output/enriched/C291.json
npm run run-test -- --spec tests/candidates/candidates-ellipsis-actions.spec.js

# Try with the bundled example (no Kiwi TCMS needed)
npm run example:generate
```

## Local Execution with Claude Code CLI

No API key needed — uses your Claude Pro/Max subscription:

```bash
# Install Claude Code CLI
curl -fsSL https://claude.ai/install.sh | bash

# Run full pipeline locally
./scripts/run-local.sh C291

# Or individual stages
./scripts/enrich-local.sh C291
./scripts/generate-local.sh output/enriched/C291.json
./scripts/fix-local.sh tests/candidates/feature.spec.js
```

## Agents

### Agent 1 — Test Case Enricher

Fetches raw test cases from Kiwi TCMS and transforms vague manual steps into detailed, automation-friendly structured JSON.

**What it does:**
- Fetches case data + category context from Kiwi TCMS API (XML-RPC)
- Consults application help docs (Rival Recruit) to understand the UI
- Classifies the feature area (candidates, jobs, admin, etc.)
- Infers navigation paths (which menus to click)
- Enriches each step with element type, identifier, expected result, and wait strategy
- Extracts test data into parameterized values
- Maps expected results to explicit assertion types
- Detects serial dependencies between related cases

**Input:** Kiwi TCMS case ID (e.g. `C291`) or local JSON file
**Output:** `output/enriched/C291.json` matching the shared schema

### Agent 2 — Code Generator

Takes the enriched test case and generates four Playwright files following the target framework's Page Object Model conventions.

**What it generates:**
| File | Pattern | Purpose |
|------|---------|---------|
| Page Object | `pages/{feature}/{name}.page.js` | Locators + action methods |
| Fixture | `tests/fixtures/{feature}-fixture.js` | Page init + navigation + data |
| Spec | `tests/{feature}/{name}.spec.js` | Test cases with assertions |
| Test Data | `test-data/{feature}/{name}.json` | Parameterized values |

**Key conventions enforced:**
- Pages extend `BasePage`, locators in constructor, semantic selectors preferred
- Fixtures extend `base-fixture`, provide logged-in page objects
- Tests use `[CXXX]` IDs, import from fixture (never `@playwright/test`)
- No login in tests, no hardcoded URLs, no assertions in page objects
- `waitForLoadState()` patterns instead of hardcoded timeouts

**Input:** Enriched JSON from Agent 1
**Output:** Four files deployed to target repo

### Agent 3 — Test Runner & Fixer

Executes the generated test, and if it fails, analyzes the error, fixes the code, and retries — a self-healing loop.

**How it works:**
1. Runs `npx playwright test` on the generated spec
2. If it passes → done
3. If it fails → sends error + file contents to Claude for analysis
4. Claude categorizes the failure (locator, timing, assertion, navigation)
5. Produces a targeted fix (usually a locator correction)
6. Applies the fix and retries
7. Repeats up to 5 times (configurable via `MAX_RETRIES`)

**Common fixes it applies:**
- Wrong locator → inspects actual DOM, updates selector
- Timing issue → adds/changes `waitForLoadState` call
- Strict mode violation → makes locator more specific
- Assertion mismatch → adjusts expected value

**Input:** Spec file path + generated file manifest
**Output:** Pass/fail report with fix history

## Environment Variables

```env
# Kiwi TCMS Configuration
KIWI_URL=https://your-kiwi-instance.com
KIWI_USER=your-username
KIWI_PASSWORD=your-password

# LLM Configuration
ANTHROPIC_API_KEY=your-anthropic-key
LLM_MODEL=claude-sonnet-4-20250514

# Target App (for Agent 3)
TARGET_BASE_URL=https://your-staging-app.com
TARGET_REPO_PATH=../recruiting-playwright-ui-tests

# Agent Configuration
MAX_RETRIES=5
DEBUG=false
```

## GitHub Actions

The workflow triggers manually or via API and:
1. Checks out both this repo and the target test repo
2. Runs the full pipeline (enrich → generate → run)
3. Creates a PR in the target repo with the generated tests
4. Uploads pipeline reports and generated code as artifacts

### Manual trigger

Go to Actions → "Generate Playwright Tests" → Run workflow → enter case IDs.

### API trigger

```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/silkroadeng/Test-generator-agents/dispatches \
  -d '{"event_type": "generate-tests", "client_payload": {"case_ids": "C291,C292"}}'
```

### Required secrets

| Secret | Purpose |
|--------|---------|
| `KIWI_URL` | Kiwi TCMS instance URL |
| `KIWI_USER` | Kiwi TCMS username |
| `KIWI_PASSWORD` | Kiwi TCMS password |
| `ANTHROPIC_API_KEY` | Claude API key |
| `TARGET_REPO_TOKEN` | PAT with repo access to target test repo |

## Target Framework

Generated code targets this structure in the target repo:

```
recruiting-playwright-ui-tests/
├── pages/
│   ├── base.page.js                    ← BasePage (login, common methods)
│   └── {feature}/
│       └── {name}.page.js              ← Generated page object
├── tests/
│   ├── fixtures/
│   │   ├── base-fixture.js             ← Login + basePage setup
│   │   └── {feature}-fixture.js        ← Generated fixture
│   └── {feature}/
│       └── {name}.spec.js              ← Generated spec
└── test-data/
    └── {feature}/
        └── {name}.json                 ← Generated test data
```

## Development

```bash
# Validate syntax
node --check agents/enricher/index.js
node --check agents/generator/index.js
node --check agents/runner/index.js
node --check orchestrator/pipeline.js

# Test enricher with local file (no Kiwi TCMS needed)
node agents/enricher/index.js --input examples/raw-kiwi-case.json

# Test generator with example enriched case
node agents/generator/index.js --input examples/enriched-case.json

# Run with verbose logging
DEBUG=true npm run pipeline -- --case-id C291
```

## Pipeline Reports

Each pipeline run produces a JSON report in `output/reports/`:

```json
{
  "caseId": "C291",
  "startTime": "2026-08-14T...",
  "status": "passed",
  "elapsedSeconds": 45.2,
  "stages": {
    "enrich": { "status": "success" },
    "generate": { "status": "success", "files": ["pages/...", "tests/..."] },
    "run": { "status": "passed", "attempt": 3, "fixes": [...] }
  }
}
```
