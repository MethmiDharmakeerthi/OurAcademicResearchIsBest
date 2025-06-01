const assert = require('assert');
const fetch = require('node-fetch');
const WebSocket = require('ws');

class StreamingTestSuite {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.wsUrl = 'ws://localhost:8080';
        this.testResults = [];
    }

    async runAllTests() {
        console.log('🧪 Starting H.266 Streaming Test Suite\n');
        
        const tests = [
            this.testServerHealth,
            this.testVideoEndpoints,
            this.testBandwidthMeasurement,
            this.testWebSocketConnection,
            this.testAdaptiveLogic,
            this.testQualitySwitching
        ];

        for (const test of tests) {
            try {
                await test.call(this);
                this.logSuccess(test.name);
            } catch (error) {
                this.logError(test.name, error);
            }
        }

        this.printResults();
    }

    async testServerHealth() {
        const response = await fetch(`${this.baseUrl}/api/videos`);
        assert(response.ok, 'Server health check failed');
        
        const data = await response.json();
        assert(Array.isArray(data), 'Videos endpoint should return array');
    }

    async testVideoEndpoints() {
        // Test manifest endpoint
        const manifestResponse = await fetch(`${this.baseUrl}/api/manifest/sample`);
        assert(manifestResponse.ok, 'Manifest endpoint failed');
        
        const manifest = await manifestResponse.json();
        assert(manifest.qualities, 'Manifest should have qualities');
        assert(manifest.adaptiveRules, 'Manifest should have adaptive rules');

        // Test video qualities endpoint
        const qualitiesResponse = await fetch(`${this.baseUrl}/api/videos/sample/qualities`);
        assert(qualitiesResponse.ok, 'Qualities endpoint failed');
        
        const qualities = await qualitiesResponse.json();
        assert(Object.keys(qualities).length > 0, 'Should have at least one quality');
    }

    async testBandwidthMeasurement() {
        const sizes = [100, 500, 1000];
        
        for (const size of sizes) {
            const startTime = Date.now();
            const response = await fetch(`${this.baseUrl}/api/bandwidth-test/${size}`);
            const endTime = Date.now();
            
            assert(response.ok, `Bandwidth test failed for ${size}KB`);
            
            const data = await response.arrayBuffer();
            assert(data.byteLength === size * 1024, `Wrong data size for ${size}KB test`);
            
            const duration = (endTime - startTime) / 1000;
            const bandwidth = (data.byteLength * 8) / duration;
            
            console.log(`  📊 ${size}KB test: ${(bandwidth / 1000000).toFixed(2)} Mbps`);
        }
    }

    async testWebSocketConnection() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.wsUrl);
            
            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'test',
                    data: 'connection test'
                }));
                
                setTimeout(() => {
                    ws.close();
                    resolve();
                }, 1000);
            });
            
            ws.on('error', (error) => {
                reject(new Error(`WebSocket connection failed: ${error.message}`));
            });
        });
    }

    async testAdaptiveLogic() {
        // Test quality determination logic
        const QualityManager = require('../client/js/quality-manager.js');
        const manager = new QualityManager(null);
        
        // Mock available qualities
        manager.setAvailableQualities({
            'ultra-low': { bitrate: 400 },
            'low': { bitrate: 800 },
            'medium': { bitrate: 1500 },
            'high': { bitrate: 3000 }
        });
        
        // Test low bandwidth scenario
        let optimal = manager.determineOptimalQuality(300000, 10); // 300 Kbps
        assert(optimal === 'ultra-low', 'Should select ultra-low for very low bandwidth');
        
        // Test high bandwidth scenario
        optimal = manager.determineOptimalQuality(5000000, 15); // 5 Mbps
        assert(optimal === 'high', 'Should select high for high bandwidth');
        
        // Test buffer-constrained scenario
        optimal = manager.determineOptimalQuality(2000000, 2); // Good bandwidth, poor buffer
        assert(['ultra-low', 'low'].includes(optimal), 'Should reduce quality for poor buffer');
    }

    async testQualitySwitching() {
        // This would test actual video quality switching
        // For now, we'll test the logic components
        const BufferManager = require('../client/js/buffer-manager.js');
        
        // Mock video element
        const mockVideo = {
            currentTime: 10,
            buffered: {
                length: 1,
                start: () => 5,
                end: () => 20
            }
        };
        
        const bufferManager = new BufferManager(mockVideo);
        const bufferHealth = bufferManager.getBufferHealth();
        
        assert(bufferHealth === 10, 'Buffer health calculation incorrect');
        assert(bufferManager.getBufferStatus(bufferHealth) === 'good', 'Buffer status incorrect');
    }

    logSuccess(testName) {
        this.testResults.push({ name: testName, status: 'PASS' });
        console.log(`✅ ${testName.replace('test', '')} - PASSED`);
    }

    logError(testName, error) {
        this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
        console.log(`❌ ${testName.replace('test', '')} - FAILED: ${error.message}`);
    }

    printResults() {
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const total = this.testResults.length;
        
        console.log(`\n📊 Test Results: ${passed}/${total} passed`);
        
        if (passed === total) {
            console.log('🎉 All tests passed! Your H.266 streaming system is ready.');
        } else {
            console.log('⚠️  Some tests failed. Please check the implementation.');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const testSuite = new StreamingTestSuite();
    testSuite.runAllTests().catch(console.error);
}

module.exports = StreamingTestSuite;