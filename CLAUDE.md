# Test Generator Agents — Claude Code Instructions

You are working in a three-agent pipeline that transforms Kiwi TCMS test cases into Playwright test scripts.

## Project Overview

This pipeline has three stages:
1. **Enricher** — Takes raw/vague test case steps and produces structured automation-friendly JSON
2. **Generator** — Takes enriched JSON and produces Playwright code (page object, fixture, spec, test data)
3. **Runner** — Executes the test, analyzes failures, fixes code, retries until green

## How to Run Locally

Use the shell scripts in `scripts/` to run each stage:

```bash
# Full pipeline (enrich → generate → deploy)
./scripts/run-local.sh C291

# Individual stages
./scripts/enrich-local.sh C291
./scripts/generate-local.sh output/enriched/C291.json
```

Or run interactively by following the prompts in `agents/*/prompts/`.

## Key Files

| File | Purpose |
|------|---------|
| `agents/enricher/prompts/enricher-system.md` | Rules for enriching raw test cases |
| `agents/generator/prompts/generate-system.md` | Rules for generating Playwright code |
| `agents/generator/prompts/pages-rules.md` | Page Object conventions |
| `agents/generator/prompts/fixtures-rules.md` | Fixture conventions |
| `agents/generator/prompts/tests-rules.md` | Test spec conventions |
| `agents/runner/prompts/runner-system.md` | Rules for analyzing and fixing test failures |
| `shared/schemas/enriched-case.schema.json` | Contract between Agent 1 → Agent 2 |
| `examples/enriched-case.json` | Example enriched output |
| `examples/raw-kiwi-case.json` | Example raw Kiwi TCMS input |

## Stage 1: Enriching a Test Case

When asked to enrich a test case:

1. Read `agents/enricher/prompts/enricher-system.md` for the full rules
2. Read `shared/schemas/enriched-case.schema.json` for the output schema
3. **Consult the application help docs** to understand the feature's UI, navigation, and labels:
   - Recruiting: https://recruiting-help.rival-hr.com/WelcometoRecruit.htm
   - Workflow: https://workflow-help.rival-hr.com/topics/WorkflowHome.htm
4. Transform the raw case into structured JSON
5. Save to `output/enriched/{caseId}.json`

**Input:** Raw test case (from Kiwi TCMS or pasted by user)
**Output:** JSON matching the enriched case schema

**Important:** Use the help documentation to determine correct navigation paths, element labels, and expected behaviors. The docs reflect the actual UI.

## Stage 2: Generating Playwright Code

When asked to generate code from an enriched case:

1. Read ALL files in `agents/generator/prompts/` (system prompt + 3 rule files)
2. Generate four files:
   - `pages/{feature}/{name}.page.js` — Page Object extending BasePage
   - `tests/fixtures/{feature}-fixture.js` — Fixture extending base-fixture
   - `tests/{feature}/{name}.spec.js` — Test spec with [CXXX] IDs
   - `test-data/{feature}/{name}.json` — Parameterized test data
3. Save to `output/generated/` AND deploy to `TARGET_REPO_PATH` if set

**Critical rules:**
- Pages extend `BasePage`, locators in constructor, semantic selectors (getByRole > getByLabel > getByText)
- Fixtures extend `base-fixture`, initialize with `basePage.page`, call navigation, then `await use(page)`
- Tests import from fixture (NEVER from `@playwright/test`), use `[CXXX]` in names
- No login logic, no hardcoded URLs, no assertions in page objects
- `waitForLoadState()` patterns, never `waitForTimeout()`

## Stage 3: Running and Fixing Tests

When asked to run/fix a test:

1. Read `agents/runner/prompts/runner-system.md`
2. Execute: `npx playwright test <spec-path> --reporter=line` in the target repo
3. If it fails, analyze the error (usually a wrong locator)
4. Fix the code and retry (up to 5 times)

## Target Repository Structure

Generated code goes into the target Playwright repo:

```
recruiting-playwright-ui-tests/
├── pages/base.page.js                      ← DO NOT MODIFY
├── pages/{feature}/{name}.page.js          ← Generated
├── tests/fixtures/base-fixture.js          ← DO NOT MODIFY
├── tests/fixtures/{feature}-fixture.js     ← Generated
├── tests/{feature}/{name}.spec.js          ← Generated
└── test-data/{feature}/{name}.json         ← Generated
```

## Environment

- Target repo path: set `TARGET_REPO_PATH` in `.env` or defaults to `../recruiting-playwright-ui-tests`
- Kiwi TCMS access: `KIWI_URL`, `KIWI_USER`, `KIWI_PASSWORD` in `.env`
- Node 20+ required
