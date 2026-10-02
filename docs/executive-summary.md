# AI-Powered Test Automation Pipeline

## Executive Summary

We have built an AI agent pipeline that automatically converts manual test cases from Kiwi TCMS into fully working Playwright automated test scripts — reducing test authoring time from hours to minutes.

---

## The Problem

| Challenge | Impact |
|-----------|--------|
| Writing Playwright tests manually is time-consuming | 2–4 hours per test case for a skilled SDET |
| Kiwi TCMS has 500+ manual test cases waiting for automation | Growing backlog with limited engineering bandwidth |
| New features ship faster than we can automate regression | Manual testing bottleneck slows release confidence |
| Onboarding new QA engineers to our framework takes weeks | Institutional knowledge locked in existing code patterns |

## The Solution

A three-stage AI pipeline that reads a Kiwi TCMS case, understands the application, and writes production-ready test code following our exact framework conventions.

```
Kiwi TCMS Case → [AI Enricher] → [AI Code Generator] → [AI Test Runner] → Working Test
     ↑                                                         ↓
  Manual input                                          Auto-fixed & validated
  (case ID only)                                        (self-healing loop)
```

### Stage 1 — Test Case Enricher
- Fetches the raw test case from Kiwi TCMS (by case ID)
- Consults our application help documentation to understand the UI
- Transforms vague manual steps into precise, automation-ready specifications
- Identifies navigation paths, UI elements, test data, and expected outcomes

### Stage 2 — Code Generator
- Takes the enriched specification and generates four files:
  - **Page Object** — UI element locators and action methods
  - **Test Fixture** — Test setup and page initialization
  - **Test Spec** — The actual test with assertions
  - **Test Data** — Parameterized values (JSON)
- Follows our established Page Object Model conventions exactly
- Code matches the style and patterns of our existing 100+ test files

### Stage 3 — Test Runner & Self-Healer
- Executes the generated test against our staging environment
- If the test fails (e.g., wrong button label), it analyzes the error
- Fixes the code automatically and retries
- Repeats up to 5 times until the test passes
- Reports the final result with all fixes applied

---

## Key Benefits

| Benefit | Detail |
|---------|--------|
| **Speed** | Minutes instead of hours per test case |
| **Consistency** | Every generated test follows our framework standards exactly |
| **Self-healing** | Tests fix themselves when locators change |
| **Scalability** | Can process batch of cases in parallel via CI |
| **Low barrier** | Anyone with a Kiwi TCMS case ID can trigger generation |
| **Quality** | AI consults our help docs to use correct UI labels and paths |

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Time to automate 1 test case | 2–4 hours | 5–15 minutes |
| Tests automated per sprint | 5–10 | 30–50+ |
| Time to clear Kiwi TCMS backlog (500 cases) | 6–12 months | 4–6 weeks |
| Framework knowledge required | High (weeks to learn) | Minimal (AI handles conventions) |

---

## How It Works — Example

**Input:** Kiwi TCMS Case C291 — "Save Search"

**Raw steps in Kiwi TCMS:**
1. Click ellipsis button
2. Click Save Search
3. Enter name
4. Click Save
5. Verify search is saved

**AI Output:** Four production-ready files totaling ~80 lines of code, following our exact framework patterns, with correct locators derived from the application's help documentation.

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| AI Model | Claude (Anthropic) |
| Test Framework | Playwright + JavaScript |
| Test Management | Kiwi TCMS |
| CI/CD | GitHub Actions |
| Execution | Claude Code CLI (local) or API (CI) |

## Security & Control

- AI only generates code — it doesn't access production data
- All generated code goes through PR review before merging
- The pipeline runs against test environments only
- No customer data is sent to the AI — only test case descriptions and help docs
- API keys are stored in GitHub Secrets / local .env (never committed)

---

## Current Status

| Item | Status |
|------|--------|
| Pipeline architecture | ✅ Complete |
| Agent 1 — Enricher | ✅ Built |
| Agent 2 — Code Generator | ✅ Built |
| Agent 3 — Runner/Fixer | ✅ Built |
| Orchestrator | ✅ Built |
| Local execution (Claude Code) | ✅ Built |
| GitHub Actions CI workflow | ✅ Built |
| Help docs integration | ✅ Integrated |
| First test case run (validation) | 🔄 Next step |
| Batch processing 10 cases | 📋 Planned |
| Full backlog processing | 📋 Planned |

## Next Steps

1. **Validate** — Run the pipeline on 5–10 real Kiwi TCMS cases and measure quality
2. **Tune** — Refine prompts based on first-run success rate
3. **Scale** — Process batches of 20–50 cases per sprint via CI
4. **Monitor** — Track generation success rate and fix frequency over time

---


*Repository: github.com/silkroadeng/Test-generator-agents*
*Team: SilkRoad Engineering — QA Automation*
