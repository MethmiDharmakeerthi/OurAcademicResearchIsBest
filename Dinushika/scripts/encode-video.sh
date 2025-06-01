#!/bin/bash

VVENC_PATH="/c/Users/DELL/vvenc/bin/debug-static/vvencapp.exe"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <input-video-file>"
  exit 1
fi

INPUT=$1
BASENAME=$(basename "$INPUT" | cut -d. -f1)

# Detect resolution and framerate using ffprobe
read WIDTH HEIGHT <<< $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0:s=x "$INPUT" | awk -Fx '{print $1, $2}')

FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
  -of default=noprint_wrappers=1:nokey=1 "$INPUT" | head -n 1 | awk -F'/' '{printf "%.2f", $1 / $2}')

if [[ -z "$WIDTH" || -z "$HEIGHT" || -z "$FPS" ]]; then
  echo "Failed to detect video resolution or framerate."
  exit 1
fi

echo "Detected resolution: ${WIDTH}x${HEIGHT}, Framerate: ${FPS} fps"

# Convert input to raw YUV
echo "Converting $INPUT to raw YUV..."
ffmpeg -y -i "$INPUT" -pix_fmt yuv420p -f rawvideo "${BASENAME}.yuv"

# Create output directories
mkdir -p encoded/ultra-low encoded/low encoded/medium encoded/high

echo "Encoding ${BASENAME}.yuv at detected resolution..."

"$VVENC_PATH" -i "${BASENAME}.yuv" -s ${WIDTH}x${HEIGHT} --frameRate $FPS -o "encoded/ultra-low/${BASENAME}.vvc" --preset fast --qp 37 &
"$VVENC_PATH" -i "${BASENAME}.yuv" -s ${WIDTH}x${HEIGHT} --frameRate $FPS -o "encoded/low/${BASENAME}.vvc" --preset medium --qp 32 &
"$VVENC_PATH" -i "${BASENAME}.yuv" -s ${WIDTH}x${HEIGHT} --frameRate $FPS -o "encoded/medium/${BASENAME}.vvc" --preset medium --qp 28 &
"$VVENC_PATH" -i "${BASENAME}.yuv" -s ${WIDTH}x${HEIGHT} --frameRate $FPS -o "encoded/high/${BASENAME}.vvc" --preset slow --qp 22 &

wait

echo "All encoding finished."
