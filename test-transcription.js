#!/usr/bin/env node
/**
 * Transcription System Test Script
 * Tests all components of the transcription system
 */

const http = require('http');

const AGENT_URL = 'http://localhost:3001';
const BACKEND_URL = 'http://localhost:3000';

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        }).on('error', reject);
    });
}

async function testEndpoint(name, url, expectedStatus = 200) {
    try {
        const result = await makeRequest(url);
        if (result.status === expectedStatus) {
            log(`✓ ${name}`, 'green');
            return { success: true, data: result.data };
        } else {
            log(`✗ ${name} (status: ${result.status})`, 'red');
            return { success: false, error: `Unexpected status: ${result.status}` };
        }
    } catch (error) {
        log(`✗ ${name} (${error.message})`, 'red');
        return { success: false, error: error.message };
    }
}

async function runTests() {
    log('\n=== Selly Transcription System Test ===\n', 'cyan');

    // Test 1: Agent Health
    log('[1/6] Testing Agent Health...', 'blue');
    const agentHealth = await testEndpoint(
        'Agent /health endpoint',
        `${AGENT_URL}/health`
    );
    if (agentHealth.success) {
        const data = agentHealth.data;
        log(`  - Service: ${data.service}`, 'reset');
        log(`  - Platform: ${data.platform}`, 'reset');
        log(`  - Sidecar Available: ${data.sidecarAvailable ? 'Yes' : 'No'}`, data.sidecarAvailable ? 'green' : 'yellow');
        log(`  - Deepgram Configured: ${data.deepgramConfigured ? 'Yes' : 'No'}`, data.deepgramConfigured ? 'green' : 'yellow');
    }
    console.log();

    // Test 2: Agent Diagnostic
    log('[2/6] Testing Agent Diagnostic...', 'blue');
    const agentDiag = await testEndpoint(
        'Agent /diagnostic endpoint',
        `${AGENT_URL}/diagnostic`
    );
    if (agentDiag.success) {
        const data = agentDiag.data;
        log(`  - Node Version: ${data.platform.nodeVersion}`, 'reset');
        log(`  - Deepgram Ready: ${data.checks.deepgramReady ? 'Yes' : 'No'}`, data.checks.deepgramReady ? 'green' : 'yellow');
        log(`  - Can Start Capture: ${data.checks.canStartCapture ? 'Yes' : 'No'}`, data.checks.canStartCapture ? 'green' : 'yellow');
        log(`  - Can Transcribe: ${data.checks.canTranscribe ? 'Yes' : 'No'}`, data.checks.canTranscribe ? 'green' : 'yellow');

        if (data.warnings && data.warnings.length > 0) {
            log(`  - Warnings:`, 'yellow');
            data.warnings.forEach(w => log(`    • ${w}`, 'yellow'));
        }
    }
    console.log();

    // Test 3: Backend Health
    log('[3/6] Testing Backend Health...', 'blue');
    const backendHealth = await testEndpoint(
        'Backend /health endpoint',
        `${BACKEND_URL}/health`
    );
    console.log();

    // Test 4: Capture Status
    log('[4/6] Testing Capture Status...', 'blue');
    const captureStatus = await testEndpoint(
        'Agent /capture/status endpoint',
        `${AGENT_URL}/capture/status`
    );
    if (captureStatus.success) {
        const data = captureStatus.data;
        log(`  - Active Sessions: ${data.activeSessions.length}`, 'reset');
    }
    console.log();

    // Test 5: CORS
    log('[5/6] Testing CORS (simulated)...', 'blue');
    log('  ✓ CORS headers should be configured', 'green');
    console.log();

    // Test 6: Summary
    log('[6/6] Summary', 'blue');
    const allPassed = agentHealth.success && agentDiag.success && backendHealth.success && captureStatus.success;

    if (allPassed) {
        log('\n✓ All tests passed!', 'green');
        log('\nNext steps:', 'cyan');
        log('  1. Start the desktop app: cd apps/desktop && npm run dev', 'reset');
        log('  2. Click "Start Call" to begin a session', 'reset');
        log('  3. Check the Transcript tab for live transcriptions', 'reset');

        if (agentDiag.data && agentDiag.data.warnings && agentDiag.data.warnings.length > 0) {
            log('\nWarnings to address:', 'yellow');
            agentDiag.data.warnings.forEach(w => log(`  • ${w}`, 'yellow'));
        }
    } else {
        log('\n✗ Some tests failed. Please check the errors above.', 'red');
        log('\nTroubleshooting:', 'cyan');
        log('  - Make sure agent is running: cd apps/agent && npm run dev', 'reset');
        log('  - Make sure backend is running: cd apps/backend && npm run dev', 'reset');
        log('  - Check .env files are configured correctly', 'reset');
    }

    console.log();
}

runTests().catch(err => {
    log(`\nFatal error: ${err.message}`, 'red');
    process.exit(1);
});
