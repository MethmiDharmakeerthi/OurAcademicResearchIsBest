class VideoPreloader {
    constructor(qualityManager, bufferManager) {
        this.qualityManager = qualityManager;
        this.bufferManager = bufferManager;
        this.preloadedSegments = new Map();
        this.maxPreloadSize = 50 * 1024 * 1024; // 50MB max preload
        this.currentPreloadSize = 0;
    }

    async preloadNextQuality(currentTime, duration) {
        const bufferHealth = this.bufferManager.getBufferHealth();
        
        // Only preload if buffer is healthy
        if (bufferHealth < 10) return;
        
        const nextQuality = this.determineNextLikelyQuality();
        if (!nextQuality || nextQuality === this.qualityManager.currentQuality) return;
        
        // Calculate segment to preload (next 30 seconds)
        const preloadStart = currentTime + bufferHealth;
        const preloadEnd = Math.min(preloadStart + 30, duration);
        
        if (preloadEnd <= preloadStart) return;
        
        await this.preloadVideoSegment(nextQuality, preloadStart, preloadEnd);
    }

    determineNextLikelyQuality() {
        const currentIndex = this.qualityManager.qualityOrder.indexOf(this.qualityManager.currentQuality);
        
        // Most likely to need next quality up or down
        const bufferHealth = this.bufferManager.getBufferHealth();
        
        if (bufferHealth > 15 && currentIndex < this.qualityManager.qualityOrder.length - 1) {
            return this.qualityManager.qualityOrder[currentIndex + 1];
        } else if (bufferHealth < 8 && currentIndex > 0) {
            return this.qualityManager.qualityOrder[currentIndex - 1];
        }
        
        return null;
    }

    async preloadVideoSegment(quality, startTime, endTime) {
        const segmentKey = `${quality}-${startTime}-${endTime}`;
        
        if (this.preloadedSegments.has(segmentKey)) return;
        if (this.currentPreloadSize > this.maxPreloadSize) {
            this.cleanupOldSegments();
        }
        
        try {
            const videoUrl = this.qualityManager.availableQualities[quality].url;
            const response = await fetch(videoUrl, {
                headers: {
                    'Range': `bytes=${this.timeToByteRange(startTime, endTime)}`
                }
            });
            
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                this.preloadedSegments.set(segmentKey, {
                    data: arrayBuffer,
                    timestamp: Date.now(),
                    size: arrayBuffer.byteLength
                });
                
                this.currentPreloadSize += arrayBuffer.byteLength;
                console.log(`Preloaded ${quality} segment ${startTime}-${endTime}s`);
            }
        } catch (error) {
            console.warn('Preload failed:', error);
        }
    }

    timeToByteRange(startTime, endTime) {
        // Rough estimation - in production you'd use proper segment information
        const avgBitrate = 1000000; // 1 Mbps average
        const startByte = Math.floor(startTime * avgBitrate / 8);
        const endByte = Math.floor(endTime * avgBitrate / 8);
        return `${startByte}-${endByte}`;
    }

    cleanupOldSegments() {
        const cutoffTime = Date.now() - 300000; // 5 minutes old
        
        for (const [key, segment] of this.preloadedSegments.entries()) {
            if (segment.timestamp < cutoffTime) {
                this.currentPreloadSize -= segment.size;
                this.preloadedSegments.delete(key);
            }
        }
    }

    hasPreloadedSegment(quality, time) {
        for (const [key, segment] of this.preloadedSegments.entries()) {
            const [segQuality, startTime, endTime] = key.split('-');
            if (segQuality === quality && 
                time >= parseFloat(startTime) && 
                time <= parseFloat(endTime)) {
                return segment;
            }
        }
        return null;
    }
}