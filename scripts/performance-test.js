#!/usr/bin/env node

/**
 * DevPulse Performance Testing Script
 * Benchmarks API endpoints and generates performance report
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || 'test-key';
const NUM_REQUESTS = parseInt(process.env.NUM_REQUESTS || '1000', 10);
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS || '50', 10);

const endpoints = [
    { path: '/api/endpoints', method: 'GET', name: 'List Endpoints' },
    { path: '/api/endpoints/1/risks', method: 'GET', name: 'Get Endpoint Risks' },
    { path: '/api/detect-shadow-apis', method: 'POST', name: 'Detect Shadow APIs', body: { endpoint_ids: [1, 2, 3] } },
    { path: '/api/compliance/violations', method: 'GET', name: 'Get Compliance Violations' },
    { path: '/api/analytics/dashboard', method: 'GET', name: 'Get Dashboard Analytics' },
];

class PerformanceTester {
    constructor() {
        this.results = {};
        this.inFlightRequests = 0;
    }

    async makeRequest(endpoint) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(endpoint.path, API_URL);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: endpoint.method,
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            };

            const startTime = Date.now();

            const req = protocol.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const elapsed = Date.now() - startTime;
                    resolve({
                        status: res.statusCode,
                        time: elapsed,
                        success: res.statusCode >= 200 && res.statusCode < 300,
                    });
                });
            });

            req.on('error', (err) => {
                const elapsed = Date.now() - startTime;
                resolve({
                    status: 0,
                    time: elapsed,
                    success: false,
                    error: err.message,
                });
            });

            req.on('timeout', () => {
                req.destroy();
                const elapsed = Date.now() - startTime;
                resolve({
                    status: 0,
                    time: elapsed,
                    success: false,
                    error: 'timeout',
                });
            });

            if (endpoint.body) {
                req.write(JSON.stringify(endpoint.body));
            }

            req.end();
        });
    }

    async testEndpoint(endpoint, numRequests) {
        console.log(`\nTesting: ${endpoint.name} (${endpoint.method} ${endpoint.path})`);
        console.log(`Sending ${numRequests} requests with ${CONCURRENT_REQUESTS} concurrent...`);

        const times = [];
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < numRequests; i += CONCURRENT_REQUESTS) {
            const batchSize = Math.min(CONCURRENT_REQUESTS, numRequests - i);
            const promises = [];

            for (let j = 0; j < batchSize; j++) {
                promises.push(this.makeRequest(endpoint));
            }

            const batchResults = await Promise.all(promises);

            for (const result of batchResults) {
                times.push(result.time);
                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                }
            }

            // Progress indicator
            process.stdout.write(`\rProgress: ${Math.min(i + batchSize, numRequests)}/${numRequests}`);
        }

        console.log('\n');

        // Calculate statistics
        const sorted = times.sort((a, b) => a - b);
        const stats = {
            name: endpoint.name,
            method: endpoint.method,
            path: endpoint.path,
            total_requests: numRequests,
            successful: successCount,
            failed: failureCount,
            success_rate: ((successCount / numRequests) * 100).toFixed(2) + '%',
            min_ms: sorted[0],
            max_ms: sorted[sorted.length - 1],
            avg_ms: (sorted.reduce((a, b) => a + b) / sorted.length).toFixed(2),
            p50_ms: sorted[Math.floor(sorted.length * 0.50)],
            p95_ms: sorted[Math.floor(sorted.length * 0.95)],
            p99_ms: sorted[Math.floor(sorted.length * 0.99)],
            requests_per_sec: (numRequests / (sorted[sorted.length - 1] / 1000)).toFixed(2),
        };

        this.results[endpoint.name] = stats;
        return stats;
    }

    printResults() {
        console.log('\n' + '='.repeat(100));
        console.log('PERFORMANCE TEST RESULTS');
        console.log('='.repeat(100));

        for (const [name, stats] of Object.entries(this.results)) {
            console.log(`\n${name}`);
            console.log('-'.repeat(100));
            console.log(`  Requests:        ${stats.total_requests}`);
            console.log(`  Successful:      ${stats.successful} (${stats.success_rate})`);
            console.log(`  Failed:          ${stats.failed}`);
            console.log(`  Min/Max:         ${stats.min_ms}ms / ${stats.max_ms}ms`);
            console.log(`  Average (Mean):  ${stats.avg_ms}ms`);
            console.log(`  P50 (Median):    ${stats.p50_ms}ms`);
            console.log(`  P95:             ${stats.p95_ms}ms`);
            console.log(`  P99:             ${stats.p99_ms}ms`);
            console.log(`  Requests/sec:    ${stats.requests_per_sec}`);
        }

        console.log('\n' + '='.repeat(100));
        this.saveReport();
    }

    saveReport() {
        const reportPath = path.join(__dirname, '../performance-report.json');
        const report = {
            timestamp: new Date().toISOString(),
            configuration: {
                api_url: API_URL,
                num_requests: NUM_REQUESTS,
                concurrent_requests: CONCURRENT_REQUESTS,
            },
            results: this.results,
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\nReport saved to: ${reportPath}`);
    }

    async run() {
        console.log(`DevPulse Performance Testing`);
        console.log(`API URL: ${API_URL}`);
        console.log(`Total Requests: ${NUM_REQUESTS}`);
        console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}`);
        console.log(`Endpoints to test: ${endpoints.length}\n`);

        for (const endpoint of endpoints) {
            const stats = await this.testEndpoint(endpoint, NUM_REQUESTS);
            
            // Check performance targets
            if (parseInt(stats.p95_ms) > 500) {
                console.warn(`⚠️  P95 latency exceeds target (${stats.p95_ms}ms > 500ms)`);
            }
            if (parseFloat(stats.success_rate) < 99.9) {
                console.warn(`⚠️  Success rate below target (${stats.success_rate} < 99.9%)`);
            }
        }

        this.printResults();
    }
}

// Run tests
const tester = new PerformanceTester();
tester.run().catch(err => {
    console.error('Error running performance tests:', err);
    process.exit(1);
});
