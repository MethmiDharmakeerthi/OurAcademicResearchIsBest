const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class VideoEncoder {
  constructor() {
    this.encodingQueue = [];
    this.isProcessing = false;
  }

  // Define your bitrate profiles and output folders
  getProfiles(inputPath, outputBase) {
    return {
      'ultra-low': {
        output: path.join('encoded', 'ultra-low', `${outputBase}.mp4`),
        bitrate: '300k',
      },
      'low': {
        output: path.join('encoded', 'low', `${outputBase}.mp4`),
        bitrate: '600k',
      },
      'medium': {
        output: path.join('encoded', 'medium', `${outputBase}.mp4`),
        bitrate: '1200k',
      },
      'high': {
        output: path.join('encoded', 'high', `${outputBase}.mp4`),
        bitrate: '2500k',
      },
    };
  }

  // Use ffprobe to get width and height of input video
  getResolution(inputPath) {
    return new Promise((resolve, reject) => {
      const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${inputPath}"`;
      exec(cmd, (err, stdout) => {
        if (err) {
          return reject(`Failed to get resolution: ${err}`);
        }
        const [width, height] = stdout.trim().split('x').map(Number);
        resolve({ width, height });
      });
    });
  }

  // Main encode function
 async encode(inputPath, outputName, resolutionOverride) {
    const profiles = this.getProfiles(inputPath, outputName);

    // Get actual video resolution
   const { width, height } = resolutionOverride || await this.getResolution(inputPath);


const promises = Object.entries(profiles).map(([quality, profile]) => {
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(profile.output);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const rawOutput = profile.output.replace('.mp4', '.266');

    const vvencCmd = `vvencapp --input "${inputPath}" --size ${width}x${height} --framerate 30 --bitrate ${profile.bitrate.replace('k', '')} --preset medium --output "${rawOutput}"`;


    console.log(`🔧 Running VVC encode for ${quality}: ${vvencCmd}`);

    exec(vvencCmd, (err1, stdout1, stderr1) => {
      if (err1) {
        console.error(`❌ Error encoding ${quality} with vvencapp:`, stderr1);
        return reject(err1);
      }

      const wrapCmd = `ffmpeg -framerate 30 -i "${rawOutput}" -c copy -f mp4 "${profile.output}"`;

      console.log(`📦 Wrapping .266 into .mp4 for ${quality}: ${wrapCmd}`);

      exec(wrapCmd, (err2, stdout2, stderr2) => {
        if (err2) {
          console.error(`❌ Error wrapping ${quality} .266 to .mp4:`, stderr2);
          return reject(err2);
        }

        console.log(`✅ ${quality} wrapped and saved as ${profile.output}`);
        resolve({ quality, output: profile.output });
      });
    });
  });
});

return Promise.all(promises);
  }

  // Add encode job to queue
  async addToQueue(inputPath, outputName, resolution) {
    this.encodingQueue.push({ inputPath, outputName, resolution });
    if (!this.isProcessing) {
      this.processQueue();
    }
}


  // Process queue jobs one by one
  async processQueue() {
    if (this.encodingQueue.length === 0) {
      this.isProcessing = false;
      return;
    }
    this.isProcessing = true;
    const { inputPath, outputName, resolution } = this.encodingQueue.shift();

    try {
      const results = await this.encode(inputPath, outputName, resolution);
      console.log('Encoding results:', results);
    } catch (err) {
      console.error('Encoding failed:', err);
    }
    setTimeout(() => this.processQueue(), 1000);
  }
}

module.exports = VideoEncoder;
