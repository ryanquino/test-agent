/**
 * Agent 3 — Test Runner & Fixer (Self-Healing Loop)
 *
 * Executes generated Playwright tests, analyzes failures,
 * fixes code, and retries until green or max retries reached.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT_PATH = path.join(__dirname, 'prompts', 'runner-system.md');

class TestRunner {
    constructor(options = {}) {
        this.client = new Anthropic();
        this.model = options.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
        this.maxRetries = options.maxRetries || parseInt(process.env.MAX_RETRIES, 10) || 5;
        this.targetRepoPath = options.targetRepoPath || process.env.TARGET_REPO_PATH;
        this.debug = options.debug || process.env.DEBUG === 'true';
        this.attempts = [];
    }

    /**
     * Load the runner system prompt
     */
    loadSystemPrompt() {
        return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    }

    /**
     * Execute a Playwright test and capture the result
     * @param {string} specPath - Path to the spec file (relative to target repo)
     * @returns {object} { passed, output, error }
     */
    executeTest(specPath) {
        const fullSpecPath = path.resolve(this.targetRepoPath, specPath);

        if (!fs.existsSync(fullSpecPath)) {
            return {
                passed: false,
                output: '',
                error: `Spec file not found: ${fullSpecPath}`,
            };
        }

        try {
            const output = execSync(
                `npx playwright test "${specPath}" --reporter=line`,
                {
                    cwd: this.targetRepoPath,
                    encoding: 'utf-8',
                    timeout: 120000, // 2 min timeout per test run
                    stdio: ['pipe', 'pipe', 'pipe'],
                }
            );

            return { passed: true, output, error: null };
        } catch (err) {
            // Playwright exits with non-zero on test failure
            const output = (err.stdout || '') + '\n' + (err.stderr || '');
            return { passed: false, output, error: output };
        }
    }

    /**
     * Ask the LLM to analyze a failure and produce a fix
     * @param {object} context - Current state (error, files, previous attempts)
     * @returns {object} Fix instructions
     */
    async analyzeFix(context) {
        const systemPrompt = this.loadSystemPrompt();

        const userMessage = [
            `## Test Failure — Attempt ${context.attempt} of ${this.maxRetries}\n\n`,
            `**Spec file:** ${context.specPath}\n`,
            `**Error output:**\n\`\`\`\n${context.error.substring(0, 3000)}\n\`\`\`\n\n`,
            context.previousFixes.length > 0
                ? `**Previous fixes attempted:**\n${JSON.stringify(context.previousFixes, null, 2)}\n\n`
                : '',
            `**Current file contents:**\n`,
            ...context.files.map(
                (f) => `\n### ${f.path}\n\`\`\`javascript\n${f.content}\n\`\`\`\n`
            ),
            '\n\nAnalyze the error and provide a fix. Return JSON with:\n',
            '- "file": which file to fix\n',
            '- "description": what you\'re changing and why\n',
            '- "updatedContent": the full corrected file content\n',
            '- "giveUp": true if this is unfixable (with "reason")\n',
        ].join('');

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        });

        return this.parseFixResponse(response.content[0].text);
    }

    /**
     * Parse the LLM fix response
     */
    parseFixResponse(text) {
        let jsonStr = text;

        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            const braceStart = text.indexOf('{');
            const braceEnd = text.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd !== -1) {
                jsonStr = text.substring(braceStart, braceEnd + 1);
            }
        }

        try {
            return JSON.parse(jsonStr);
        } catch (err) {
            throw new Error(`Failed to parse fix response: ${err.message}`);
        }
    }

    /**
     * Apply a fix by writing the updated file content
     */
    applyFix(fix) {
        const fullPath = path.resolve(this.targetRepoPath, fix.file);
        fs.writeFileSync(fullPath, fix.updatedContent, 'utf-8');

        if (this.debug) {
            console.log(`[Runner] Applied fix to: ${fix.file}`);
            console.log(`[Runner] Description: ${fix.description}`);
        }
    }

    /**
     * Read the generated files relevant to the test
     * @param {string} specPath - The spec file path
     * @param {object} generatedFiles - The generation output (from Agent 2)
     */
    loadTestFiles(generatedFiles) {
        const files = [];

        for (const [key, file] of Object.entries(generatedFiles)) {
            const fullPath = path.resolve(this.targetRepoPath, file.path);
            if (fs.existsSync(fullPath)) {
                files.push({
                    path: file.path,
                    content: fs.readFileSync(fullPath, 'utf-8'),
                });
            }
        }

        return files;
    }

    /**
     * Main self-healing loop
     * @param {string} specPath - Path to the spec file (relative to target repo)
     * @param {object} generatedFiles - The generated file manifest from Agent 2
     */
    async run(specPath, generatedFiles) {
        console.log(`[Runner] Starting test execution: ${specPath}`);
        console.log(`[Runner] Max retries: ${this.maxRetries}`);

        const previousFixes = [];

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            console.log(`\n[Runner] ─── Attempt ${attempt}/${this.maxRetries} ───`);

            const result = this.executeTest(specPath);

            if (result.passed) {
                console.log(`[Runner] ✅ Test PASSED on attempt ${attempt}`);

                const summary = {
                    status: 'passed',
                    attempt,
                    totalAttempts: attempt,
                    fixes: previousFixes,
                };

                this.attempts.push({ attempt, status: 'passed' });
                return summary;
            }

            console.log(`[Runner] ❌ Test FAILED on attempt ${attempt}`);

            if (attempt === this.maxRetries) {
                console.log('[Runner] Max retries reached. Giving up.');
                return {
                    status: 'failed',
                    attempt,
                    totalAttempts: attempt,
                    lastError: result.error.substring(0, 1000),
                    fixes: previousFixes,
                };
            }

            // Analyze and fix
            const files = this.loadTestFiles(generatedFiles);
            const fix = await this.analyzeFix({
                attempt,
                specPath,
                error: result.error,
                files,
                previousFixes,
            });

            if (fix.giveUp) {
                console.log(`[Runner] 🛑 Giving up: ${fix.reason}`);
                return {
                    status: 'gave_up',
                    attempt,
                    totalAttempts: attempt,
                    reason: fix.reason,
                    fixes: previousFixes,
                };
            }

            // Apply the fix
            this.applyFix(fix);
            previousFixes.push({
                attempt,
                file: fix.file,
                description: fix.description,
            });

            this.attempts.push({
                attempt,
                status: 'failed',
                fix: fix.description,
            });
        }
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    let specPath = null;
    let manifestPath = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--spec' && args[i + 1]) {
            specPath = args[i + 1];
        }
        if (args[i] === '--manifest' && args[i + 1]) {
            manifestPath = args[i + 1];
        }
    }

    if (!specPath) {
        console.error('Usage: node agents/runner/index.js --spec <spec-path> [--manifest <generated-manifest.json>]');
        process.exit(1);
    }

    // Load manifest if provided, otherwise construct from spec path
    let generatedFiles = {};
    if (manifestPath && fs.existsSync(manifestPath)) {
        generatedFiles = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }

    const runner = new TestRunner();
    runner.run(specPath, generatedFiles).then((result) => {
        console.log('\n[Runner] Final result:', JSON.stringify(result, null, 2));
        process.exit(result.status === 'passed' ? 0 : 1);
    }).catch((err) => {
        console.error('[Runner] ❌ Fatal error:', err.message);
        process.exit(1);
    });
}

module.exports = TestRunner;
