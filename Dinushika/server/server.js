const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process'); // ✅ Needed for ffmpeg execution
const VideoEncoder = require('./encoder');
const BandwidthMonitor = require('./bandwidth-monitor');

class StreamingServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.encoder = new VideoEncoder();
        this.bandwidthMonitor = new BandwidthMonitor();

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('client'));

        this.app.use('/videos', express.static('encoded', {
            setHeaders: (res, path) => {
                res.set({
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600',
                    'Content-Type': 'video/mp4'
                });
            }
        }));
    }

    setupRoutes() {
        this.app.get('/api/videos', (req, res) => {
            const videos = this.getAvailableVideos();
            res.json(videos);
        });

        this.app.get('/api/videos/:name/qualities', (req, res) => {
            const { name } = req.params;
            const qualities = this.getVideoQualities(name);
            res.json(qualities);
        });

        this.app.get('/api/bandwidth-test/:size', (req, res) => {
            const size = parseInt(req.params.size) || 1024;
            const data = Buffer.alloc(size * 1024, 'A');

            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Length': data.length,
                'Cache-Control': 'no-cache'
            });

            res.send(data);
        });

        this.app.get('/api/manifest/:name', (req, res) => {
            const { name } = req.params;
            const manifest = this.generateManifest(name);
            res.json(manifest);
        });

        this.app.post('/api/analytics', (req, res) => {
            const { event, data } = req.body;
            this.logAnalytics(event, data);
            res.json({ success: true });
        });

        // ✅ Encode endpoint with .mp4 to .yuv conversion
        this.app.post('/api/encode', async (req, res) => {
         try {
            const { inputName, outputName } = req.body;
            const videoDir = path.join(__dirname, '..', 'videos', 'source');
            const inputMp4 = path.join(videoDir, inputName);
            const inputYuv = path.join(videoDir, inputName.replace(/\.mp4$/, '.yuv'));

            if (!fs.existsSync(inputMp4)) {
                return res.status(404).json({ error: 'Input .mp4 video not found' });
            }
            
            const cmdProbe = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${inputMp4}"`;
            let width = 1280;
            let height = 720;

            try {
            const output = await new Promise((resolve, reject) => {
                exec(cmdProbe, (err, stdout) => {
                if (err) return reject(err);
                resolve(stdout.trim());
                });
            });

            const [w, h] = output.split('x').map(Number);
            width = w;
            height = h;
            console.log(`📏 Detected resolution: ${width}x${height}`);
            } catch (probeError) {
            console.warn('⚠️ Resolution detection failed. Using default 1280x720');
            }



            // Step 2: Convert if needed
            if (!fs.existsSync(inputYuv)) {
            console.log(`🎞️ Converting ${inputMp4} → ${inputYuv}`);
            const cmd = `ffmpeg -i "${inputMp4}" -pix_fmt yuv420p -vsync 0 "${inputYuv}"`;
            await new Promise((resolve, reject) => {
                exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    console.error(`❌ FFmpeg failed: ${stderr}`);
                    return reject(err);
                }
                console.log(`✅ YUV conversion complete`);
                resolve();
                });
            });
            }

                // Step 3: Start encoding (this may crash if encoder.js is broken)
                console.log(`🚀 Starting encoding for sample @ ${width}x${height}`);
                this.encoder.addToQueue(inputYuv, outputName, { width, height });

                // ✅ Must respond to client
                res.json({
                message: 'Encoding started',
                input: inputName,
                resolution: `${width}x${height}`
                });
                                
            }catch (err) {  
                    console.error('❌ Encoding route crashed:', err);
                    return res.status(500).json({ error: 'Failed to convert .mp4 to .yuv' });
                }
            });

          
            
    }

    handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'bandwidth-report':
                this.bandwidthMonitor.recordBandwidth(data.bandwidth, data.clientId);
                break;
            case 'quality-change':
                console.log(`Quality changed to ${data.quality} for client ${data.clientId}`);
                break;
            case 'buffer-health':
                this.handleBufferHealth(ws, data);
                break;
        }
    }

    handleBufferHealth(ws, data) {
        if (data.bufferHealth < 3) {
            ws.send(JSON.stringify({
                type: 'quality-recommendation',
                action: 'decrease',
                reason: 'low-buffer'
            }));
        } else if (data.bufferHealth > 15) {
            ws.send(JSON.stringify({
                type: 'quality-recommendation',
                action: 'increase',
                reason: 'high-buffer'
            }));
        }
    }

    getAvailableVideos() {
        const videos = [];
        const qualities = ['ultra-low', 'low', 'medium', 'high'];
        qualities.forEach(quality => {
            const dir = `encoded/${quality}`;
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter(file => file.endsWith('.mp4'));
                files.forEach(file => {
                    const name = file.replace('.mp4', '');
                    let video = videos.find(v => v.name === name);
                    if (!video) {
                        video = { name, qualities: [] };
                        videos.push(video);
                    }
                    video.qualities.push(quality);
                });
            }
        });
        return videos;
    }

    getVideoQualities(name) {
        const qualities = {};
        const levels = ['ultra-low', 'low', 'medium', 'high'];
        levels.forEach(level => {
            const filePath = `encoded/${level}/${name}.mp4`;
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                qualities[level] = {
                    url: `/videos/${level}/${name}.mp4`,
                    size: stats.size,
                    bitrate: this.estimateBitrate(level)
                };
            }
        });
        return qualities;
    }

    estimateBitrate(quality) {
        const bitrates = {
            'ultra-low': 400,
            'low': 800,
            'medium': 1500,
            'high': 3000
        };
        return bitrates[quality] || 1000;
    }

    generateManifest(name) {
        const qualities = this.getVideoQualities(name);
        return {
            name,
            qualities,
            defaultQuality: 'medium',
            adaptiveRules: {
                minBandwidth: {
                    'ultra-low': 0,
                    'low': 500,
                    'medium': 1000,
                    'high': 2000
                },
                bufferThresholds: {
                    decrease: 3,
                    increase: 10
                }
            }
        };
    }

    logAnalytics(event, data) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, event, data };
        console.log('📊 Analytics:', logEntry);
    }

    start() {
        const server = http.createServer(this.app);

        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws) => {
            console.log('📱 Client connected via WebSocket');
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            });
            ws.on('close', () => {
                console.log('📱 Client disconnected');
            });
        });

        server.listen(this.port, () => {
            console.log(`🚀 Streaming + WebSocket server running on http://localhost:${this.port}`);
        });
    }
}

// ✅ Correct placement of instantiation code
const server = new StreamingServer();
server.start();

module.exports = StreamingServer;
