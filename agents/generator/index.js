/**
 * Agent 2 — Code Generator
 *
 * Takes an enriched test case JSON and generates Playwright code:
 * - Page Object (.page.js)
 * - Fixture (-fixture.js)
 * - Test Spec (.spec.js)
 * - Test Data (.json)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT_PATH = path.join(__dirname, 'prompts', 'generate-system.md');
const PAGES_RULES_PATH = path.join(__dirname, 'prompts', 'pages-rules.md');
const FIXTURES_RULES_PATH = path.join(__dirname, 'prompts', 'fixtures-rules.md');
const TESTS_RULES_PATH = path.join(__dirname, 'prompts', 'tests-rules.md');

class CodeGenerator {
    constructor(options = {}) {
        this.client = new Anthropic();
        this.model = options.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
        this.outputDir = options.outputDir || path.join(process.cwd(), 'output', 'generated');
        this.debug = options.debug || process.env.DEBUG === 'true';
    }

    /**
     * Load all prompt files and combine into the system message
     */
    loadSystemPrompt() {
        const systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
        const pagesRules = fs.readFileSync(PAGES_RULES_PATH, 'utf-8');
        const fixturesRules = fs.readFileSync(FIXTURES_RULES_PATH, 'utf-8');
        const testsRules = fs.readFileSync(TESTS_RULES_PATH, 'utf-8');

        return [
            systemPrompt,
            '\n\n---\n\n## Reference: Page Object Conventions\n\n',
            pagesRules,
            '\n\n---\n\n## Reference: Fixture Conventions\n\n',
            fixturesRules,
            '\n\n---\n\n## Reference: Test Spec Conventions\n\n',
            testsRules,
        ].join('');
    }

    /**
     * Generate code from an enriched test case
     * @param {object} enrichedCase - The enriched test case JSON
     * @returns {object} Generated files with paths and content
     */
    async generate(enrichedCase) {
        const systemPrompt = this.loadSystemPrompt();

        const userMessage = [
            'Generate Playwright code for the following enriched test case.\n',
            'Return ONLY a valid JSON object with keys: pageObject, fixture, spec, testData.',
            'Each key should have "path" and "content" properties.\n\n',
            '```json\n',
            JSON.stringify(enrichedCase, null, 2),
            '\n```',
        ].join('');

        if (this.debug) {
            console.log('[Generator] Sending request to LLM...');
            console.log('[Generator] Case:', enrichedCase.caseId, '-', enrichedCase.title);
        }

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 8192,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        });

        const content = response.content[0].text;

        if (this.debug) {
            console.log('[Generator] Response received, parsing...');
        }

        return this.parseResponse(content);
    }

    /**
     * Parse the LLM response to extract the JSON output
     */
    parseResponse(text) {
        // Try to extract JSON from the response (may be wrapped in ```json blocks)
        let jsonStr = text;

        const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            // Try to find raw JSON object
            const braceStart = text.indexOf('{');
            const braceEnd = text.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd !== -1) {
                jsonStr = text.substring(braceStart, braceEnd + 1);
            }
        }

        try {
            const result = JSON.parse(jsonStr);

            // Validate expected structure
            const requiredKeys = ['pageObject', 'fixture', 'spec', 'testData'];
            for (const key of requiredKeys) {
                if (!result[key] || !result[key].path || !result[key].content) {
                    throw new Error(`Missing or invalid key: ${key} (needs path and content)`);
                }
            }

            return result;
        } catch (err) {
            throw new Error(`Failed to parse generator output: ${err.message}\n\nRaw output:\n${text.substring(0, 500)}`);
        }
    }

    /**
     * Write generated files to the output directory
     */
    writeOutput(generatedFiles) {
        const written = [];

        for (const [key, file] of Object.entries(generatedFiles)) {
            const fullPath = path.join(this.outputDir, file.path);
            const dir = path.dirname(fullPath);

            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, file.content, 'utf-8');

            written.push(fullPath);
            if (this.debug) {
                console.log(`[Generator] Written: ${file.path}`);
            }
        }

        return written;
    }

    /**
     * Full pipeline: load enriched case → generate → write files
     */
    async run(inputPath) {
        console.log(`[Generator] Reading enriched case from: ${inputPath}`);

        const enrichedCase = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        const generatedFiles = await this.generate(enrichedCase);
        const writtenPaths = this.writeOutput(generatedFiles);

        console.log(`[Generator] ✅ Generated ${writtenPaths.length} files:`);
        writtenPaths.forEach((p) => console.log(`  → ${path.relative(process.cwd(), p)}`));

        return generatedFiles;
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    let inputPath = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputPath = args[i + 1];
            break;
        }
    }

    if (!inputPath) {
        console.error('Usage: node agents/generator/index.js --input <enriched-case.json>');
        process.exit(1);
    }

    const generator = new CodeGenerator();
    generator.run(inputPath).catch((err) => {
        console.error('[Generator] ❌ Error:', err.message);
        process.exit(1);
    });
}

module.exports = CodeGenerator;
