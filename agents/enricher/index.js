/**
 * Agent 1 — Test Case Enricher
 *
 * Fetches raw test cases from Kiwi TCMS and enriches them into
 * detailed, automation-friendly structured JSON.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT_PATH = path.join(__dirname, 'prompts', 'enricher-system.md');

class KiwiTcmsClient {
    constructor() {
        this.baseUrl = process.env.KIWI_URL;
        this.user = process.env.KIWI_USER;
        this.password = process.env.KIWI_PASSWORD;

        if (!this.baseUrl || !this.user || !this.password) {
            throw new Error(
                'Kiwi TCMS configuration missing. Set KIWI_URL, KIWI_USER, KIWI_PASSWORD in .env'
            );
        }

        this.sessionId = null;
    }

    /**
     * Make an XML-RPC request to Kiwi TCMS
     */
    async rpcCall(method, params = []) {
        // Login if needed
        if (!this.sessionId && method !== 'Auth.login') {
            await this.login();
        }

        const body = this.buildXmlRpcRequest(method, params);

        const headers = {
            'Content-Type': 'text/xml',
        };

        if (this.sessionId) {
            headers['Cookie'] = `sessionid=${this.sessionId}`;
        }

        const response = await fetch(`${this.baseUrl}/xml-rpc/`, {
            method: 'POST',
            headers,
            body,
        });

        if (!response.ok) {
            throw new Error(`Kiwi TCMS API error: ${response.status} ${response.statusText}`);
        }

        // Extract session cookie on login
        const setCookie = response.headers.get('set-cookie');
        if (setCookie && setCookie.includes('sessionid=')) {
            const match = setCookie.match(/sessionid=([^;]+)/);
            if (match) this.sessionId = match[1];
        }

        const text = await response.text();
        return this.parseXmlRpcResponse(text);
    }

    /**
     * Build XML-RPC request body
     */
    buildXmlRpcRequest(method, params) {
        const paramXml = params.map((p) => `<param>${this.valueToXml(p)}</param>`).join('');
        return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`;
    }

    /**
     * Convert a JS value to XML-RPC value element
     */
    valueToXml(val) {
        if (typeof val === 'string') return `<value><string>${this.escapeXml(val)}</string></value>`;
        if (typeof val === 'number') return `<value><int>${val}</int></value>`;
        if (typeof val === 'boolean') return `<value><boolean>${val ? 1 : 0}</boolean></value>`;
        if (val === null || val === undefined) return `<value><string></string></value>`;
        if (Array.isArray(val)) {
            const items = val.map((v) => this.valueToXml(v)).join('');
            return `<value><array><data>${items}</data></array></value>`;
        }
        if (typeof val === 'object') {
            const members = Object.entries(val)
                .map(([k, v]) => `<member><name>${k}</name>${this.valueToXml(v)}</member>`)
                .join('');
            return `<value><struct>${members}</struct></value>`;
        }
        return `<value><string>${String(val)}</string></value>`;
    }

    escapeXml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Parse XML-RPC response (simplified — extracts values)
     */
    parseXmlRpcResponse(xml) {
        // Check for fault
        if (xml.includes('<fault>')) {
            const faultMsg = xml.match(/<string>([^<]*)<\/string>/);
            throw new Error(`Kiwi TCMS fault: ${faultMsg ? faultMsg[1] : 'Unknown error'}`);
        }

        // Simple extraction of the response value
        // For complex responses, this extracts the first-level data
        return this.extractValues(xml);
    }

    /**
     * Extract values from XML-RPC response
     */
    extractValues(xml) {
        // This is a simplified parser — handles the common Kiwi TCMS response patterns
        // For production use, consider xmlrpc npm package
        try {
            const values = [];
            const structRegex = /<struct>([\s\S]*?)<\/struct>/g;
            let match;

            while ((match = structRegex.exec(xml)) !== null) {
                const obj = {};
                const memberRegex = /<member>\s*<name>([^<]+)<\/name>\s*<value>(?:<([^>]+)>)?([^<]*)/g;
                let memberMatch;

                while ((memberMatch = memberRegex.exec(match[1])) !== null) {
                    const key = memberMatch[1];
                    const type = memberMatch[2] || 'string';
                    const val = memberMatch[3];

                    if (type === 'int' || type === 'i4') obj[key] = parseInt(val, 10);
                    else if (type === 'boolean') obj[key] = val === '1';
                    else obj[key] = val;
                }

                values.push(obj);
            }

            // If single struct, return it directly
            if (values.length === 1) return values[0];
            if (values.length > 1) return values;

            // Fallback: extract simple string/int value
            const simpleMatch = xml.match(/<value>(?:<([^>]+)>)?([^<]*)<?\//);
            if (simpleMatch) {
                if (simpleMatch[1] === 'int' || simpleMatch[1] === 'i4') return parseInt(simpleMatch[2], 10);
                if (simpleMatch[1] === 'boolean') return simpleMatch[2] === '1';
                return simpleMatch[2];
            }

            return null;
        } catch (err) {
            throw new Error(`Failed to parse Kiwi TCMS response: ${err.message}`);
        }
    }

    /**
     * Authenticate with Kiwi TCMS
     */
    async login() {
        await this.rpcCall('Auth.login', [this.user, this.password]);
    }

    /**
     * Get a single test case by ID
     */
    async getCase(caseId) {
        const id = parseInt(caseId.replace(/^C/i, ''), 10);
        const result = await this.rpcCall('TestCase.filter', [{ id }]);
        if (Array.isArray(result) && result.length > 0) return result[0];
        if (result && result.id) return result;
        throw new Error(`Test case ${caseId} not found in Kiwi TCMS`);
    }

    /**
     * Get category info for context
     */
    async getCategory(categoryId) {
        const result = await this.rpcCall('Category.filter', [{ id: categoryId }]);
        if (Array.isArray(result) && result.length > 0) return result[0];
        return result;
    }

    /**
     * Get test plan info
     */
    async getPlan(planId) {
        const result = await this.rpcCall('TestPlan.filter', [{ id: planId }]);
        if (Array.isArray(result) && result.length > 0) return result[0];
        return result;
    }
}

class TestCaseEnricher {
    constructor(options = {}) {
        this.client = new Anthropic();
        this.model = options.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
        this.outputDir = options.outputDir || path.join(process.cwd(), 'output', 'enriched');
        this.debug = options.debug || process.env.DEBUG === 'true';
        this.kiwi = null;
    }

    /**
     * Initialize Kiwi TCMS client (lazy, so we can run without it for local testing)
     */
    getKiwiClient() {
        if (!this.kiwi) {
            this.kiwi = new KiwiTcmsClient();
        }
        return this.kiwi;
    }

    /**
     * Load the enricher system prompt
     */
    loadSystemPrompt() {
        return fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    }

    /**
     * Fetch a test case from Kiwi TCMS with full context
     */
    async fetchFromKiwi(caseId) {
        const kiwi = this.getKiwiClient();
        const testCase = await kiwi.getCase(caseId);

        // Fetch category context for feature classification
        let categoryName = '';
        if (testCase.category_id || testCase.category) {
            try {
                const catId = testCase.category_id || testCase.category;
                const category = await kiwi.getCategory(catId);
                categoryName = category.name || '';
            } catch {
                // Category context is optional
            }
        }

        return {
            caseId: `C${testCase.id}`,
            title: testCase.summary || testCase.title || '',
            category: categoryName,
            preconditions: testCase.setup || testCase.notes || '',
            steps: testCase.text || testCase.script || '',
            expectedResult: testCase.breakdown || '',
            priority: testCase.priority_id || testCase.priority || null,
            isAutomated: testCase.is_automated || false,
        };
    }

    /**
     * Enrich a raw test case using the LLM
     */
    async enrich(rawCase) {
        const systemPrompt = this.loadSystemPrompt();

        const userMessage = [
            'Enrich the following raw test case into structured automation-friendly JSON.\n',
            'Return ONLY valid JSON matching the EnrichedTestCase schema.\n\n',
            '**Raw Test Case:**\n',
            '```json\n',
            JSON.stringify(rawCase, null, 2),
            '\n```',
        ].join('');

        if (this.debug) {
            console.log('[Enricher] Sending to LLM for enrichment...');
            console.log('[Enricher] Case:', rawCase.caseId, '-', rawCase.title);
        }

        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        });

        return this.parseResponse(response.content[0].text, rawCase.caseId);
    }

    /**
     * Parse the LLM enrichment response
     */
    parseResponse(text, caseId) {
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
            const result = JSON.parse(jsonStr);

            // Validate minimum requirements
            if (!result.caseId || !result.steps || !result.assertions) {
                throw new Error('Missing required fields: caseId, steps, assertions');
            }

            return result;
        } catch (err) {
            throw new Error(
                `Failed to parse enriched output for ${caseId}: ${err.message}\n\nRaw:\n${text.substring(0, 500)}`
            );
        }
    }

    /**
     * Write enriched case to output directory
     */
    writeOutput(enrichedCase) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        const outputPath = path.join(this.outputDir, `${enrichedCase.caseId}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(enrichedCase, null, 2), 'utf-8');

        if (this.debug) {
            console.log(`[Enricher] Written: ${outputPath}`);
        }

        return outputPath;
    }

    /**
     * Full pipeline: fetch from Kiwi TCMS → enrich → write
     */
    async run(caseId) {
        console.log(`[Enricher] Processing case: ${caseId}`);

        const rawCase = await this.fetchFromKiwi(caseId);
        const enrichedCase = await this.enrich(rawCase);
        const outputPath = this.writeOutput(enrichedCase);

        console.log(`[Enricher] ✅ Enriched ${caseId} → ${path.relative(process.cwd(), outputPath)}`);

        return enrichedCase;
    }

    /**
     * Enrich from a local JSON file (bypass Kiwi TCMS, for testing)
     */
    async runFromFile(inputPath) {
        console.log(`[Enricher] Reading raw case from: ${inputPath}`);

        const rawCase = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        const enrichedCase = await this.enrich(rawCase);
        const outputPath = this.writeOutput(enrichedCase);

        console.log(`[Enricher] ✅ Enriched → ${path.relative(process.cwd(), outputPath)}`);

        return enrichedCase;
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    let caseId = null;
    let inputFile = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--case-id' && args[i + 1]) {
            caseId = args[i + 1];
        }
        if (args[i] === '--input' && args[i + 1]) {
            inputFile = args[i + 1];
        }
    }

    if (!caseId && !inputFile) {
        console.error('Usage: node agents/enricher/index.js --case-id <CXXX> | --input <raw-case.json>');
        process.exit(1);
    }

    const enricher = new TestCaseEnricher();

    const task = inputFile ? enricher.runFromFile(inputFile) : enricher.run(caseId);

    task.catch((err) => {
        console.error('[Enricher] ❌ Error:', err.message);
        process.exit(1);
    });
}

module.exports = TestCaseEnricher;
