#!/bin/sh
set -eu

input=/fixture/input.mp4
output=/fixture/output.mp4

ffmpeg -hide_banner -loglevel error \
  -f lavfi -i color=c=blue:s=320x180:r=24 \
  -t 1 -pix_fmt yuv420p -c:v libx264 -movflags +faststart "$input"

ffmpeg -hide_banner -loglevel error \
  -i "$input" -vf scale=160:90 -c:v libx264 -pix_fmt yuv420p \
  -movflags +faststart "$output"

printf 'FFMPEG=%s\n' "$(ffmpeg -version | sed -n '1p')"
printf 'FFPROBE=%s\n' "$(ffprobe -version | sed -n '1p')"
printf 'INPUT_PROBE='
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,width,height -of json "$input" | tr -d '\n'
printf '\nOUTPUT_PROBE='
ffprobe -v error -show_entries format=format_name,duration -show_entries stream=codec_name,width,height -of json "$output" | tr -d '\n'
printf '\n'

sha256sum "$input" "$output"
