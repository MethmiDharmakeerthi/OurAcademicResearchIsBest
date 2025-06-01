class BufferManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.bufferHistory = [];
        this.isMonitoring = false;
        
        this.thresholds = {
            critical: 2,    // Less than 2 seconds
            low: 5,         // Less than 5 seconds
            good: 10,       // More than 10 seconds
            excellent: 20   // More than 20 seconds
        };
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.monitorInterval = setInterval(() => {
            this.updateBufferHealth();
        }, 1000);
    }

    stopMonitoring() {
        this.isMonitoring = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
    }

    updateBufferHealth() {
        const bufferHealth = this.getBufferHealth();
        this.recordBufferHealth(bufferHealth);
        
        // Emit buffer health events
        const event = new CustomEvent('bufferHealthUpdate', {
            detail: {
                bufferHealth,
                status: this.getBufferStatus(bufferHealth)
            }
        });
        
        this.video.dispatchEvent(event);
    }

    getBufferHealth() {
        if (!this.video || this.video.readyState < 2) return 0;
        
        try {
            const currentTime = this.video.currentTime;
            const buffered = this.video.buffered;
            
            if (buffered.length === 0) return 0;
            
            // Find the buffer range that contains current time
            for (let i = 0; i < buffered.length; i++) {
                const start = buffered.start(i);
                const end = buffered.end(i);
                
                if (currentTime >= start && currentTime <= end) {
                    return end - currentTime;
                }
            }
            
            // If current time is not in any buffer range, return 0
            return 0;
        } catch (error) {
            console.warn('Error calculating buffer health:', error);
            return 0;
        }
    }

    getBufferStatus(bufferHealth) {
        if (bufferHealth <= this.thresholds.critical) return 'critical';
        if (bufferHealth <= this.thresholds.low) return 'low';
        if (bufferHealth >= this.thresholds.excellent) return 'excellent';
        if (bufferHealth >= this.thresholds.good) return 'good';
        return 'medium';
    }

    recordBufferHealth(bufferHealth) {
        this.bufferHistory.push({
            bufferHealth,
            timestamp: Date.now()
        });

        // Keep only last 60 measurements (1 minute)
        if (this.bufferHistory.length > 60) {
            this.bufferHistory.shift();
        }
    }

    shouldReduceQuality() {
        const bufferHealth = this.getBufferHealth();
        return bufferHealth <= this.thresholds.low;
    }

    canIncreaseQuality() {
        const bufferHealth = this.getBufferHealth();
        
        // Check if buffer has been consistently good
        const recentHistory = this.bufferHistory.slice(-10);
        const averageBuffer = recentHistory.length > 0 
            ? recentHistory.reduce((sum, h) => sum + h.bufferHealth, 0) / recentHistory.length 
            : bufferHealth;

        return averageBuffer >= this.thresholds.good;
    }

    getBufferStats() {
        const bufferHealth = this.getBufferHealth();
        const status = this.getBufferStatus(bufferHealth);
        
        return {
            current: bufferHealth,
            status,
            history: this.bufferHistory.slice(),
            thresholds: this.thresholds
        };
    }
}