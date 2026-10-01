#!/bin/sh
# Gera os dois tapetes de piano (acordes nos inícios das cenas) e nivela-os a −18 LUFS.
set -e
cd "$(dirname "$0")/.."
gen() { python3 music/piano.py /tmp/caderno-bed.wav "$@"; }
norm() { ffmpeg -hide_banner -loglevel error -y -i /tmp/caderno-bed.wav -af "highpass=f=65,acompressor=threshold=-24dB:ratio=2.5:attack=20:release=400,loudnorm=I=-18:TP=-2:LRA=7" -ar 44100 "$1"; }
gen 42 0 5 12 20 28 35 && norm composition/assets/music/piano-bed.wav
gen 30 0 4 9 14.5 20 25 && norm composition-vertical/assets/music/piano-bed.wav
rm -f /tmp/caderno-bed.wav
