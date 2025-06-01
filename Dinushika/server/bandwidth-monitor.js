class BandwidthMonitor {
    constructor() {
        this.bandwidthHistory = new Map();
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Cleanup every minute
    }

    recordBandwidth(bandwidth, clientId) {
        if (!this.bandwidthHistory.has(clientId)) {
            this.bandwidthHistory.set(clientId, []);
        }
        
        const history = this.bandwidthHistory.get(clientId);
        history.push({
            bandwidth,
            timestamp: Date.now()
        });``
        
        // Keep only last 10 measurements
        if (history.length > 10) {
            history.shift();
        }
    }

    getAverageBandwidth(clientId, windowMs = 30000) {
        if (!this.bandwidthHistory.has(clientId)) {
            return null;
        }
        
        const history = this.bandwidthHistory.get(clientId);
        const cutoff = Date.now() - windowMs;
        const recentMeasurements = history.filter(m => m.timestamp > cutoff);
        
        if (recentMeasurements.length === 0) {
            return null;
        }
        
        const sum = recentMeasurements.reduce((acc, m) => acc + m.bandwidth, 0);
        return sum / recentMeasurements.length;
    }

    cleanup() {
        const cutoff = Date.now() - 300000; // 5 minutes
        
        for (const [clientId, history] of this.bandwidthHistory.entries()) {
            const filtered = history.filter(m => m.timestamp > cutoff);
            if (filtered.length === 0) {
                this.bandwidthHistory.delete(clientId);
            } else {
                this.bandwidthHistory.set(clientId, filtered);
            }
        }
    }
}

module.exports = BandwidthMonitor;