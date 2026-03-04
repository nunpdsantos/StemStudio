# StemStudio — Design Document

**Date:** 2026-03-04
**Status:** Approved

## Overview

StemStudio is a multi-instrument audio source separation app with a pro mixer console UI. It separates any song into 6 stems (vocals, drums, bass, guitar, piano, other) and presents them in an interactive mixer for listening, exploration, and musician practice.

Sibling project to KaraokeStudio (which remains unchanged). KaraokeStudio handles 2-stem vocal/instrumental separation for karaoke; StemStudio handles full 6-stem instrument separation for deeper musical exploration.

## Use Cases

- **Listening/exploration:** Hear how songs are built, adjust instrument levels, isolate harmonic instruments (guitar/piano) to study harmony
- **Musician practice:** Mute your instrument's stem, play along with the rest, loop sections, adjust tempo/pitch

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Web Audio API
- **Backend:** Python 3.11+, FastAPI
- **Audio tools:** `audio-separator` (BS-RoFormer 6s), `demucs` (HTDemucs 6s for ensemble), `yt-dlp`, `ffmpeg`
- **Communication:** REST + SSE for progress streaming

## Project Structure

```
StemStudio/
├── frontend/                    # Next.js 15
│   ├── src/
│   │   ├── app/                 # Pages (search, library, mixer)
│   │   ├── components/
│   │   │   ├── mixer/           # Channel strips, faders, transport
│   │   │   ├── search/          # Search bar, results, upload zone
│   │   │   ├── library/         # Song cards, processing status
│   │   │   └── ui/              # Shared UI primitives
│   │   ├── hooks/               # Web Audio, playback, SSE
│   │   └── lib/                 # API client, audio utils
│   ├── public/
│   ├── package.json
│   └── next.config.js
│
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, static files
│   │   ├── routes/              # search, songs, stems, upload
│   │   ├── services/            # separation, download, library
│   │   ├── models/              # Pydantic schemas
│   │   └── config.py            # Settings, paths, model config
│   ├── requirements.txt
│   └── start.sh
│
├── library/                     # Processed songs
│   ├── library.json
│   └── <song_id>/
│       ├── original.wav
│       ├── vocals.wav
│       ├── drums.wav
│       ├── bass.wav
│       ├── guitar.wav
│       ├── piano.wav
│       └── other.wav
│
├── models/                      # Model weights (gitignored)
└── docs/plans/
```

## Audio Separation Pipeline

### Models

- **Default:** BS-RoFormer 6-stem (~500MB weights, SDR ~9.8 dB)
- **Ensemble (optional):** BS-RoFormer 6s + HTDemucs 6s with per-T-F bin voting

### Pipeline Steps

1. **Download/receive** — yt-dlp or file upload → save as original
2. **Pre-processing** — Convert to 44.1kHz stereo float32 WAV, loudness normalize (-14 LUFS)
3. **Separation** — BS-RoFormer 6s (standard) or ensemble (BS-RoFormer + HTDemucs, per-frequency-bin voting)
4. **Post-processing** — Per-stem loudness normalization (-14 LUFS), save as 32-bit float WAV
5. **Done** — SSE event to frontend, stems ready for mixer

### Processing Times (Apple Silicon M-series)

| Mode | 3-min song | 5-min song |
|---|---|---|
| Standard | ~2-4 min | ~4-7 min |
| Ensemble | ~5-10 min | ~8-15 min |

## Mixer UI — Pro Console

### Layout

Six channel strips with shared transport and master controls.

### Per Channel Strip

- **Vertical fader** (0-100%) — GainNode
- **Pan knob** — StereoPannerNode (-1 to +1)
- **Solo [S]** — exclusive or multi-solo
- **Mute [M]** — silence channel
- **Color-coded:** vocals=blue, drums=red, bass=purple, guitar=orange, piano=green, other=gray

### Web Audio Graph

```
AudioContext
├─ Vocals:  <audio> → MediaElementSource → GainNode → StereoPannerNode ─┐
├─ Drums:   <audio> → MediaElementSource → GainNode → StereoPannerNode ─┤
├─ Bass:    <audio> → MediaElementSource → GainNode → StereoPannerNode ─┤
├─ Guitar:  <audio> → MediaElementSource → GainNode → StereoPannerNode ─├→ Destination
├─ Piano:   <audio> → MediaElementSource → GainNode → StereoPannerNode ─┤
└─ Other:   <audio> → MediaElementSource → GainNode → StereoPannerNode ─┘
```

### Transport & Playback

- Play/Pause/Seek — all 6 audio elements synced
- A→B Loop — set loop points on timeline
- Pitch shift — ±12 semitones
- Tempo — 0.5x to 2.0x
- Combined waveform — click to seek

### Listening Presets

- Full Mix — all at 100%
- No Vocals — vocals muted
- Rhythm Only — drums + bass
- Harmony Only — guitar + piano
- Vocals Only — solo vocals
- Custom — user-saved presets

## Song Sources

### YouTube Search & Download

- yt-dlp search, result cards with thumbnails/duration/quality badges
- Download best audio, convert to WAV
- SSE progress streaming

### Spotify Integration (Metadata Only)

- Spotify Web API for search, album art, track info, BPM, key
- No audio download — metadata enrichment only
- Optional: Spotify search → auto YouTube lookup for same track

### File Upload

- Drag-drop zone + file browser
- Formats: MP3, WAV, FLAC, M4A, OGG, AAC, WMA, OPUS
- Backend converts to 44.1kHz stereo WAV

## Settings

### Processing

- Engine: Standard (BS-RoFormer 6s) / Ensemble
- Output quality: WAV 32-bit (default) / FLAC / MP3 320kbps (exports only)
- GPU: Auto-detect (MPS/CUDA/CPU) with manual override

### Export

- Download individual stems (WAV/FLAC/MP3)
- Download all stems as ZIP
- Download current mix (render fader/pan/mute state to file)

### UI

- Theme: Dark (default) / Light
- Channel colors: customizable per stem

### Keyboard Shortcuts

| Key | Action |
|---|---|
| Space | Play / Pause |
| 1-6 | Toggle solo on stems 1-6 |
| Shift+1-6 | Toggle mute on stems 1-6 |
| [ / ] | Set A/B loop points |
| ← / → | Seek ±5s |
| ↑ / ↓ | Master volume |

## Out of Scope

- Real-time separation during playback (stems are pre-computed)
- Recording/microphone input (KaraokeStudio does this)
- Lyrics extraction (KaraokeStudio does this)
- Standalone player export (KaraokeStudio does this)
- Crowd noise removal / DeepFilterNet (KaraokeStudio does this)
- Chord/key detection (future addition via Spotify metadata or local analysis)
- Mobile responsive (desktop-first, mixer needs screen space)
- User accounts / cloud storage (local app, local library)
