#!/bin/bash

echo "🎬 H.266 Adaptive Streaming - Final Setup"
echo "========================================"

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install from nodejs.org"
    exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is required. Please install from ffmpeg.org"
    exit 1
fi

echo "✅ Prerequisites satisfied"

# Install dependencies
echo "Installing dependencies..."
npm install

# Create directory structure
echo "Creating directories..."
mkdir -p videos/source
mkdir -p encoded/{ultra-low,low,medium,high}
mkdir -p client/assets

# Make scripts executable
chmod +x scripts/*.sh

# Download sample video if none exists
if [ ! "$(ls -A videos/source)" ]; then
    echo "📥 Downloading sample video..."
    # You can replace this with any sample video URL
    curl -o videos/source/sample.mp4 "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4"
fi

# Encode sample video
echo "🎬 Encoding sample video..."
if [ -f "videos/source/sample.mp4" ]; then
    ./scripts/encode-video.sh videos/source/sample.mp4
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the streaming server:"
echo "  npm start"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:3000"
echo ""
echo "To encode additional videos:"
echo "  ./scripts/encode-video.sh path/to/your/video.mp4"