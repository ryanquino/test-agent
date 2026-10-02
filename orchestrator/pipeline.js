/**
 * Orchestrator Pipeline
 *
 * Wires the three agents together:
 * 1. Enricher: Kiwi TCMS → Enriched JSON
 * 2. Generator: Enriched JSON → Playwright code
 * 3. Runner: Execute → Fix → Retry until green
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TestCaseEnricher = require('../agents/enricher/index');
const CodeGenerator = require('../agents/generator/index');
const TestRunner = require('../agents/runner/index');

class Pipeline {
    constructor(options = {}) {
        this.debug = options.debug || process.env.DEBUG === 'true';
        this.targetRepoPath = options.targetRepoPath || process.env.TARGET_REPO_PATH;
        this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
        this.skipEnrich = options.skipEnrich || false;
        this.skipRun = options.skipRun || false;

        this.enricher = new TestCaseEnricher({
            debug: this.debug,
            outputDir: path.join(this.outputDir, 'enriched'),
        });

        this.generator = new CodeGenerator({
            debug: this.debug,
            outputDir: path.join(this.outputDir, 'generated'),
        });

        this.runner = new TestRunner({
            debug: this.debug,
            targetRepoPath: this.targetRepoPath,
        });
    }

    /**
     * Run the full pipeline for a single test case
     */
    async runCase(caseId) {
        const startTime = Date.now();
        const report = {
            caseId,
            startTime: new Date().toISOString(),
            stages: {},
            status: 'unknown',
        };

        console.log('═══════════════════════════════════════════════════');
        console.log(`  Pipeline: ${caseId}`);
        console.log('═══════════════════════════════════════════════════\n');

        // ─── Stage 1: Enrich ───
        let enrichedCase;
        try {
            console.log('┌─── Stage 1: Enricher ───────────────────────────');
            enrichedCase = await this.enricher.run(caseId);
            report.stages.enrich = { status: 'success', caseId: enrichedCase.caseId };
            console.log('└─── ✅ Enrichment complete ────────────────────────\n');
        } catch (err) {
            report.stages.enrich = { status: 'failed', error: err.message };
            report.status = 'failed_at_enrich';
            console.error('└─── ❌ Enrichment failed:', err.message);
            return report;
        }

        // ─── Stage 2: Generate ───
        let generatedFiles;
        try {
            console.log('┌─── Stage 2: Generator ──────────────────────────');
            generatedFiles = await this.generator.generate(enrichedCase);

            // Write generated files to target repo
            this.deployToTargetRepo(generatedFiles);

            report.stages.generate = {
                status: 'success',
                files: Object.entries(generatedFiles).map(([k, v]) => v.path),
            };
            console.log('└─── ✅ Generation complete ────────────────────────\n');
        } catch (err) {
            report.stages.generate = { status: 'failed', error: err.message };
            report.status = 'failed_at_generate';
            console.error('└─── ❌ Generation failed:', err.message);
            return report;
        }

        // ─── Stage 3: Run & Fix ───
        if (this.skipRun) {
            console.log('┌─── Stage 3: Runner (SKIPPED) ───────────────────');
            report.stages.run = { status: 'skipped' };
            report.status = 'generated';
            console.log('└─── ⏭️  Skipped (--skip-run) ────────────────────\n');
        } else {
            try {
                console.log('┌─── Stage 3: Runner ─────────────────────────────');
                const specPath = generatedFiles.spec.path;
                const runResult = await this.runner.run(specPath, generatedFiles);
                report.stages.run = runResult;
                report.status = runResult.status === 'passed' ? 'passed' : 'failed_at_run';
                console.log(`└─── ${runResult.status === 'passed' ? '✅' : '❌'} Runner: ${runResult.status} ─────────────────\n`);
            } catch (err) {
                report.stages.run = { status: 'error', error: err.message };
                report.status = 'failed_at_run';
                console.error('└─── ❌ Runner error:', err.message);
            }
        }

        // ─── Summary ───
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        report.elapsedSeconds = parseFloat(elapsed);

        console.log('═══════════════════════════════════════════════════');
        console.log(`  Result: ${report.status.toUpperCase()} (${elapsed}s)`);
        console.log('═══════════════════════════════════════════════════\n');

        // Save report
        this.saveReport(report);

        return report;
    }

    /**
     * Deploy generated files to the target Playwright repo
     */
    deployToTargetRepo(generatedFiles) {
        if (!this.targetRepoPath) {
            console.log('[Pipeline] No TARGET_REPO_PATH set, saving to output dir only.');
            // Write to local output instead
            for (const [key, file] of Object.entries(generatedFiles)) {
                const localPath = path.join(this.outputDir, 'generated', file.path);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, file.content, 'utf-8');
                console.log(`  → ${file.path}`);
            }
            return;
        }

        for (const [key, file] of Object.entries(generatedFiles)) {
            const targetPath = path.resolve(this.targetRepoPath, file.path);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, file.content, 'utf-8');
            console.log(`  → ${path.relative(this.targetRepoPath, targetPath)}`);
        }
    }

    /**
     * Save the pipeline report to output
     */
    saveReport(report) {
        const reportsDir = path.join(this.outputDir, 'reports');
        fs.mkdirSync(reportsDir, { recursive: true });
        const reportPath = path.join(reportsDir, `${report.caseId}-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

        if (this.debug) {
            console.log(`[Pipeline] Report saved: ${reportPath}`);
        }
    }

    /**
     * Run pipeline for multiple cases
     */
    async runBatch(caseIds) {
        const results = [];

        for (const caseId of caseIds) {
            const result = await this.runCase(caseId);
            results.push(result);
        }

        // Batch summary
        const passed = results.filter((r) => r.status === 'passed').length;
        const failed = results.filter((r) => r.status.startsWith('failed')).length;
        const generated = results.filter((r) => r.status === 'generated').length;

        console.log('\n╔═══════════════════════════════════════════════════╗');
        console.log('║  BATCH SUMMARY                                    ║');
        console.log('╠═══════════════════════════════════════════════════╣');
        console.log(`║  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}  |  Generated: ${generated}  ║`);
        console.log('╚═══════════════════════════════════════════════════╝\n');

        return results;
    }
}

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    let caseIds = [];
    let skipRun = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--case-id' && args[i + 1]) {
            // Support comma-separated: --case-id C291,C292,C293
            caseIds = args[i + 1].split(',').map((id) => id.trim());
        }
        if (args[i] === '--skip-run') {
            skipRun = true;
        }
    }

    if (caseIds.length === 0) {
        console.error('Usage: node orchestrator/pipeline.js --case-id <C291[,C292,C293]> [--skip-run]');
        process.exit(1);
    }

    const pipeline = new Pipeline({ skipRun });

    const task = caseIds.length === 1
        ? pipeline.runCase(caseIds[0])
        : pipeline.runBatch(caseIds);

    task.then((result) => {
        const allPassed = Array.isArray(result)
            ? result.every((r) => r.status === 'passed' || r.status === 'generated')
            : result.status === 'passed' || result.status === 'generated';
        process.exit(allPassed ? 0 : 1);
    }).catch((err) => {
        console.error('[Pipeline] ❌ Fatal error:', err.message);
        process.exit(1);
    });
}

module.exports = Pipeline;
