class QualityManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.currentQuality = 'medium';
        this.availableQualities = {};
        this.qualityOrder = ['ultra-low', 'low', 'medium', 'high'];
        this.isAutoMode = true;
        this.lastQualityChange = 0;
        this.minSwitchInterval = 5000; // 5 seconds between switches
        this.qualitySwitchCount = 0;
        
        this.qualityRules = {
            'ultra-low': { minBandwidth: 0, maxBandwidth: 500000 },
            'low': { minBandwidth: 400000, maxBandwidth: 1000000 },
            'medium': { minBandwidth: 800000, maxBandwidth: 2000000 },
            'high': { minBandwidth: 1500000, maxBandwidth: Infinity }
        };
    }

    setAvailableQualities(qualities) {
        this.availableQualities = qualities;
        console.log('Available qualities set:', Object.keys(qualities));
    }

    setAutoMode(enabled) {
        this.isAutoMode = enabled;
        console.log(`Auto quality mode: ${enabled ? 'enabled' : 'disabled'}`);
    }

    getCurrentQuality() {
        return this.currentQuality;
    }

    async switchQuality(targetQuality, reason = 'manual') {
        // Prevent frequent quality switches
        if (Date.now() - this.lastQualityChange < this.minSwitchInterval) {
            console.log('Quality switch throttled');
            return false;
        }

        if (!this.availableQualities[targetQuality]) {
            console.warn(`Quality ${targetQuality} not available`);
            return false;
        }

        if (targetQuality === this.currentQuality) {
            return false;
        }

        const currentTime = this.video.currentTime;
        const wasPlaying = !this.video.paused;
        
        try {
            // Show loading indicator
            this.showLoadingIndicator();
            
            // Switch video source
            this.video.src = this.availableQualities[targetQuality].url;
            
            // Restore playback position
            await new Promise((resolve, reject) => {
                const onLoadedData = () => {
                    this.video.currentTime = currentTime;
                    this.video.removeEventListener('loadeddata', onLoadedData);
                    this.video.removeEventListener('error', onError);
                    resolve();
                };
                
                const onError = (error) => {
                    this.video.removeEventListener('loadeddata', onLoadedData);
                    this.video.removeEventListener('error', onError);
                    reject(error);
                };
                
                this.video.addEventListener('loadeddata', onLoadedData);
                this.video.addEventListener('error', onError);
                
                this.video.load();
            });

            // Resume playback if it was playing
            if (wasPlaying) {
                await this.video.play();
            }

            this.currentQuality = targetQuality;
            this.lastQualityChange = Date.now();
            this.qualitySwitchCount++;
            
            console.log(`Quality switched to ${targetQuality} (${reason})`);
            
            // Emit quality change event
            const event = new CustomEvent('qualityChanged', {
                detail: {
                    quality: targetQuality,
                    reason,
                    bitrate: this.availableQualities[targetQuality].bitrate
                }
            });
            this.video.dispatchEvent(event);
            
            return true;
        } catch (error) {
            console.error('Quality switch failed:', error);
            return false;
        } finally {
            this.hideLoadingIndicator();
        }
    }

    determineOptimalQuality(bandwidth, bufferHealth) {
        if (!this.isAutoMode) return this.currentQuality;

        let targetQuality = this.currentQuality;
        const currentIndex = this.qualityOrder.indexOf(this.currentQuality);
        
        // Buffer-based adjustments (priority)
        if (bufferHealth <= 3) { // Critical buffer
            const lowerIndex = Math.max(0, currentIndex - 1);
            targetQuality = this.qualityOrder[lowerIndex];
            console.log(`Buffer critical (${bufferHealth}s), reducing quality`);
        } else if (bufferHealth >= 15) { // Excellent buffer
            // Only increase if bandwidth allows
            const higherIndex = Math.min(this.qualityOrder.length - 1, currentIndex + 1);
            const potentialQuality = this.qualityOrder[higherIndex];
            
            if (bandwidth >= this.qualityRules[potentialQuality].minBandwidth * 1.2) { // 20% headroom
                targetQuality = potentialQuality;
                console.log(`Buffer excellent (${bufferHealth}s) and bandwidth sufficient, increasing quality`);
            }
        }
        
        // Bandwidth-based adjustments
        const currentRule = this.qualityRules[this.currentQuality];
        if (bandwidth < currentRule.minBandwidth * 0.8) { // 20% safety margin
            // Need to reduce quality
            for (let i = currentIndex - 1; i >= 0; i--) {
                const quality = this.qualityOrder[i];
                if (bandwidth >= this.qualityRules[quality].minBandwidth * 0.8) {
                    targetQuality = quality;
                    break;
                }
            }
            console.log(`Bandwidth too low (${bandwidth}bps), reducing to ${targetQuality}`);
        } else if (bandwidth > this.qualityRules[this.currentQuality].maxBandwidth && bufferHealth > 8) {
            // Can increase quality
            for (let i = currentIndex + 1; i < this.qualityOrder.length; i++) {
                const quality = this.qualityOrder[i];
                if (bandwidth >= this.qualityRules[quality].minBandwidth * 1.2) { // 20% headroom
                    targetQuality = quality;
                } else {
                    break;
                }
            }
            console.log(`Bandwidth high (${bandwidth}bps), increasing to ${targetQuality}`);
        }

        return targetQuality;
    }

    showLoadingIndicator() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'block';
        }
    }

    hideLoadingIndicator() {
        const spinner = document.getElementById('loading-spinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }

    getQualityStats() {
        return {
            current: this.currentQuality,
            available: Object.keys(this.availableQualities),
            switchCount: this.qualitySwitchCount,
            isAutoMode: this.isAutoMode,
            rules: this.qualityRules
        };
    }
}