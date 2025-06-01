class AdaptivePlayer {
    constructor() {
        this.video = null;
        this.bandwidthDetector = new BandwidthDetector();
        this.bufferManager = null;
        this.qualityManager = null;
        this.websocket = null;
        this.clientId = this.generateClientId();
        
        this.stats = {
            startTime: Date.now(),
            totalSwitches: 0,
            totalBufferEvents: 0,
            averageBandwidth: 0
        };
        
        this.isInitialized = false;
        this.monitoringInterval = null;
    }

    async initialize() {
        try {
            this.video = document.getElementById('adaptive-player');
            if (!this.video) {
                throw new Error('Video element not found');
            }

            this.bufferManager = new BufferManager(this.video);
            this.qualityManager = new QualityManager(this.video);

            await this.loadAvailableVideos();
            this.setupEventListeners();
            this.setupWebSocket();
            this.startMonitoring();

            this.isInitialized = true;
            console.log('🎬 Adaptive Player initialized successfully');
        } catch (error) {
            console.error('Failed to initialize adaptive player:', error);
        }
    }
    async loadAvailableVideos() {
        try {
            const response = await fetch('/api/videos');
            const videos = await response.json();
            
            const videoSelect = document.getElementById('video-select');
            videoSelect.innerHTML = '<option value="">Select a video...</option>';
            
            videos.forEach(video => {
                const option = document.createElement('option');
                option.value = video.name;
                option.textContent = video.name;
                videoSelect.appendChild(option);
            });
            
            if (videos.length > 0) {
                videoSelect.value = videos[0].name;
                await this.loadVideo(videos[0].name);
            }
            
        } catch (error) {
            console.error('Failed to load available videos:', error);
        }
    }

    async loadVideo(videoName) {
        try {
            const response = await fetch(`/api/manifest/${videoName}`);
            const manifest = await response.json();
            
            this.qualityManager.setAvailableQualities(manifest.qualities);
            
            /* Start with medium quality
            const startQuality = manifest.defaultQuality || 'medium';
            if (manifest.qualities[startQuality]) 
                {console.log('🎯 Setting video src to:', manifest.qualities[startQuality].url);
                this.video.src = manifest.qualities[startQuality].url;
                this.qualityManager.currentQuality = startQuality;
                this.updateQualityIndicator(startQuality);
            }
            */

            const availableQualities = Object.keys(manifest.qualities || {});
const fallbackQuality = availableQualities.includes(startQuality) 
    ? startQuality 
    : availableQualities[0]; // fallback to first available quality

if (fallbackQuality) {
    console.log('🎯 Setting video src to:', manifest.qualities[fallbackQuality].url);
    this.video.src = manifest.qualities[fallbackQuality].url;
    this.qualityManager.currentQuality = fallbackQuality;
    this.updateQualityIndicator(fallbackQuality);
} else {
    console.warn('⚠️ No available video qualities found in manifest.');
}
 



            console.log(`📹 Loaded video: ${videoName}`);
            
        } catch (error) {
            console.error('Failed to load video:', error);
        }
    }

    setupEventListeners() {
        // Video events
        this.video.addEventListener('loadstart', () => this.onVideoLoadStart());
        this.video.addEventListener('loadedmetadata', () => this.onVideoMetadataLoaded());
        this.video.addEventListener('canplay', () => this.onVideoCanPlay());
        this.video.addEventListener('waiting', () => this.onVideoWaiting());
        this.video.addEventListener('playing', () => this.onVideoPlaying());
        this.video.addEventListener('error', (e) => this.onVideoError(e));
        
        // Custom events
        this.video.addEventListener('bufferHealthUpdate', (e) => this.onBufferHealthUpdate(e));
        this.video.addEventListener('qualityChanged', (e) => this.onQualityChanged(e));
        
        // UI events
        const videoSelect = document.getElementById('video-select');
        videoSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadVideo(e.target.value);
            }
        });
        
        const qualityMode = document.getElementById('quality-mode');
        qualityMode.addEventListener('change', (e) => {
            if (e.target.value === 'auto') {
                this.qualityManager.setAutoMode(true);
            } else {
                this.qualityManager.setAutoMode(false);
                this.qualityManager.switchQuality(e.target.value, 'manual');
            }
        });
    }

    setupWebSocket() {
        try {
           this.websocket = new WebSocket('ws://localhost:3000');
            
            this.websocket.onopen = () => {
                console.log('📡 WebSocket connected');
            };
            
            this.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            };
            
            this.websocket.onclose = () => {
                console.log('📡 WebSocket disconnected');
                // Attempt to reconnect after 5 seconds
                setTimeout(() => this.setupWebSocket(), 5000);
            };
            
        } catch (error) {
            console.warn('WebSocket connection failed:', error);
        }
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'quality-recommendation':
                if (this.qualityManager.isAutoMode) {
                    const currentIndex = this.qualityManager.qualityOrder.indexOf(this.qualityManager.currentQuality);
                    let targetQuality;
                    
                    if (data.action === 'increase' && currentIndex < this.qualityManager.qualityOrder.length - 1) {
                        targetQuality = this.qualityManager.qualityOrder[currentIndex + 1];
                    } else if (data.action === 'decrease' && currentIndex > 0) {
                        targetQuality = this.qualityManager.qualityOrder[currentIndex - 1];
                    }
                    
                    if (targetQuality) {
                        this.qualityManager.switchQuality(targetQuality, `server-${data.reason}`);
                    }
                }
                break;
        }
    }

    startMonitoring() {
        this.bufferManager.startMonitoring();
        
        this.monitoringInterval = setInterval(async () => {
            await this.performAdaptiveLogic();
            this.updateStatsDisplay();
        }, 3000); // Check every 3 seconds
    }

    async performAdaptiveLogic() {
        if (!this.qualityManager.isAutoMode) return;
        
        try {
            // Measure current bandwidth
            const bandwidth = await this.bandwidthDetector.measureBandwidth();
            const bufferHealth = this.bufferManager.getBufferHealth();
            
            // Determine optimal quality
            const optimalQuality = this.qualityManager.determineOptimalQuality(bandwidth, bufferHealth);
            
            // Switch if needed
            if (optimalQuality !== this.qualityManager.currentQuality) {
                await this.qualityManager.switchQuality(optimalQuality, 'adaptive');
            }
            
            // Send analytics to server
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send(JSON.stringify({
                    type: 'bandwidth-report',
                    bandwidth,
                    clientId: this.clientId
                }));
                
                this.websocket.send(JSON.stringify({
                    type: 'buffer-health',
                    bufferHealth,
                    clientId: this.clientId
                }));
            }
            
        } catch (error) {
            console.warn('Adaptive logic error:', error);
        }
    }

    // Event handlers
    onVideoLoadStart() {
        console.log('📼 Video loading started');
        this.updateResolutionDisplay();
    }

    onVideoMetadataLoaded() {
        console.log('📼 Video metadata loaded');
        this.updateResolutionDisplay();
    }

    onVideoCanPlay() {
        console.log('📼 Video can play');
    }

    onVideoWaiting() {
        console.log('📼 Video waiting (buffering)');
        this.stats.totalBufferEvents++;
    }

    onVideoPlaying() {
        console.log('📼 Video playing');
    }

    onVideoError(event) {
        console.error('📼 Video error:', event);
    }

    onBufferHealthUpdate(event) {
        const { bufferHealth, status } = event.detail;
        this.updateBufferDisplay(bufferHealth, status);
    }

    onQualityChanged(event) {
        const { quality, bitrate } = event.detail;
        this.updateQualityIndicator(quality);
        this.updateBitrateDisplay(bitrate);
        this.stats.totalSwitches++;
    }

    // UI Updates
    updateQualityIndicator(quality) {
        const indicator = document.getElementById('quality-indicator');
        const badge = indicator.querySelector('.quality-badge');
        
        if (badge) {
            badge.textContent = quality.toUpperCase();
            indicator.className = `quality-indicator quality-${quality}`;
        }
        
        const currentQualitySpan = document.getElementById('current-quality');
        if (currentQualitySpan) {
            currentQualitySpan.textContent = quality;
        }
    }

    updateBandwidthDisplay() {
        const bandwidth = this.bandwidthDetector.getAverageBandwidth();
        const display = document.getElementById('bandwidth-display');
        if (display) {
            display.textContent = this.bandwidthDetector.formatBandwidth(bandwidth);
        }
        
        // Update bandwidth chart
        this.updateBandwidthChart();
    }

    updateBufferDisplay(bufferHealth, status) {
        const display = document.getElementById('buffer-health');
        if (display) {
            display.textContent = `${bufferHealth.toFixed(1)}s (${status})`;
        }
    }

    updateResolutionDisplay() {
        const display = document.getElementById('resolution-display');
        if (display && this.video.videoWidth && this.video.videoHeight) {
            display.textContent = `${this.video.videoWidth}x${this.video.videoHeight}`;
        }
    }

    updateBitrateDisplay(bitrate) {
        const display = document.getElementById('bitrate-display');
        if (display && bitrate) {
            display.textContent = `${(bitrate / 1000).toFixed(0)} Kbps`;
        }
    }

    updateStatsDisplay() {
        // Update bandwidth
        this.updateBandwidthDisplay();
        
        // Update quality switches
        const switchesDisplay = document.getElementById('quality-switches');
        if (switchesDisplay) {
            switchesDisplay.textContent = this.stats.totalSwitches;
        }
    }

    updateBandwidthChart() {
        const canvas = document.getElementById('bandwidth-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const history = this.bandwidthDetector.getBandwidthHistory();
        
        if (history.length < 2) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw chart
        const maxBandwidth = Math.max(...history.map(h => h.bandwidth));
        const minBandwidth = Math.min(...history.map(h => h.bandwidth));
        const range = maxBandwidth - minBandwidth || 1;
        
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        history.forEach((point, index) => {
            const x = (index / (history.length - 1)) * canvas.width;
            const y = canvas.height - ((point.bandwidth - minBandwidth) / range) * canvas.height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }

    generateClientId() {
        return 'client-' + Math.random().toString(36).substr(2, 9);
    }

    destroy() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        if (this.bufferManager) {
            this.bufferManager.stopMonitoring();
        }
        
        if (this.websocket) {
            this.websocket.close();
        }
    }
}