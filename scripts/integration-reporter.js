const fs = require('fs');
const path = require('path');

/**
 * Custom Vitest reporter that outputs JSON results for integration tests
 * Writes to test-results/integration-{ISO-timestamp}.json
 */
class IntegrationReporter {
  constructor(options = {}) {
    this.options = options;
  }

  onTestRunEnd(results) {
    // Import the test utilities to get recorded results
    // Note: We can't import ESM modules directly from CommonJS in Node < 16
    // Instead, we'll parse the vitest results object
    const output = {
      run_at: new Date().toISOString(),
      sdk_version: this.readPackageVersion(),
      api_base_url: process.env.PRUNA_BASE_URL || 'https://api.pruna.ai',
      prunatree_models_found: this.extractModelIds(results),
      summary: {
        total: results.numTotalTests,
        passed: results.numPassedTests,
        failed: results.numFailedTests,
        skipped: results.numSkipped + results.numTodo,
        duration_ms: results.testResults.reduce((sum, t) => sum + (t.duration || 0), 0),
      },
      tests: this.formatTestResults(results),
    };

    // Ensure test-results directory exists
    const resultsDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    // Write JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('-').slice(0, -1).join('-');
    const fileName = `integration-${timestamp}.json`;
    const filePath = path.join(resultsDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
    console.log(`\n✅ Integration test results written to ${filePath}`);
  }

  readPackageVersion() {
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  extractModelIds(results) {
    const modelIds = new Set();
    for (const testFile of results.testResults) {
      for (const testCase of testFile.assertionResults || []) {
        // Parse model ID from test name like "p-image: generates successfully"
        const match = testCase.fullName.match(/^Integration Tests.*?(p-image\S+|z-image\S+)/);
        if (match && match[1]) {
          modelIds.add(match[1]);
        }
      }
    }
    return Array.from(modelIds).sort();
  }

  formatTestResults(results) {
    const formatted = [];

    for (const testFile of results.testResults) {
      for (const testCase of testFile.assertionResults || []) {
        const modelMatch = testCase.fullName.match(/^\S+ — ([p-z]-image\S+)/);
        const modelId = modelMatch ? modelMatch[1] : 'unknown';

        formatted.push({
          name: testCase.title || testCase.fullName,
          modelId,
          status: testCase.status === 'passed' ? 'passed' : testCase.status === 'failed' ? 'failed' : 'skipped',
          duration_ms: testCase.duration || 0,
          error: testCase.failureMessage ? testCase.failureMessage.split('\n')[0] : null,
        });
      }
    }

    return formatted;
  }
}

module.exports = IntegrationReporter;
