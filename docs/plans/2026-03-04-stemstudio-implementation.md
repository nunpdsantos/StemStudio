# StemStudio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-instrument separation app with a pro mixer console UI that separates songs into 6 stems and lets users interactively mix them.

**Architecture:** Next.js 15 frontend communicates with a FastAPI backend via REST + SSE. The backend uses `demucs.api` (HTDemucs 6s model) for 6-stem separation and `yt-dlp` for YouTube downloads. The frontend uses Web Audio API with `AudioBufferSourceNode` for sample-accurate multi-stem playback. Spotify Web API provides metadata enrichment.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind CSS), FastAPI (Python 3.11+), demucs, yt-dlp, ffmpeg, Web Audio API

**Design Doc:** `docs/plans/2026-03-04-stemstudio-design.md`

---

## Task 1: Backend — Project Scaffold & Configuration

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/requirements.txt`
- Create: `backend/start.sh`

**Step 1: Create requirements.txt**

```
fastapi>=0.135.0
uvicorn[standard]>=0.34.0
demucs>=4.0.1
torch>=2.0.0
torchaudio>=2.0.0
yt-dlp>=2024.0.0
pydantic>=2.0.0
python-multipart>=0.0.9
aiofiles>=24.0.0
soundfile>=0.12.0
numpy>=1.24.0
httpx>=0.27.0
```

**Step 2: Create config.py**

```python
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "StemStudio"
    host: str = "0.0.0.0"
    port: int = 5222
    library_dir: Path = Path(__file__).parent.parent.parent / "library"
    models_dir: Path = Path(__file__).parent.parent.parent / "models"
    default_model: str = "htdemucs_6s"
    stems: list[str] = ["vocals", "drums", "bass", "guitar", "piano", "other"]
    supported_formats: list[str] = [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma", ".opus"]
    spotify_client_id: str = ""
    spotify_client_secret: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
```

**Step 3: Create main.py**

```python
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    settings.library_dir.mkdir(parents=True, exist_ok=True)
    settings.models_dir.mkdir(parents=True, exist_ok=True)
    library_json = settings.library_dir / "library.json"
    if not library_json.exists():
        library_json.write_text("[]")

app.mount("/library", StaticFiles(directory=str(settings.library_dir)), name="library")

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
```

**Step 4: Create start.sh**

```bash
#!/bin/bash
cd "$(dirname "$0")"
source ../venv/bin/activate 2>/dev/null || true
uvicorn app.main:app --host 0.0.0.0 --port 5222 --reload
```

**Step 5: Create __init__.py**

Empty file.

**Step 6: Test manually**

Run: `cd backend && pip install -r requirements.txt && python -m uvicorn app.main:app --port 5222`
Expected: Server starts, `GET http://localhost:5222/api/health` returns `{"status":"ok","app":"StemStudio"}`

**Step 7: Commit**

```bash
git add backend/
git commit -m "feat: backend scaffold with FastAPI, config, and health endpoint"
```

---

## Task 2: Backend — Library Service

**Files:**
- Create: `backend/app/models/schemas.py`
- Create: `backend/app/services/library.py`
- Create: `backend/app/routes/songs.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Create schemas.py**

```python
from pydantic import BaseModel
from enum import Enum

class ProcessingStatus(str, Enum):
    pending = "pending"
    downloading = "downloading"
    separating = "separating"
    done = "done"
    error = "error"

class SongBase(BaseModel):
    title: str
    artist: str = ""
    source: str = ""  # "youtube", "upload", "spotify"
    source_url: str = ""
    duration: float = 0.0
    thumbnail: str = ""
    bpm: float | None = None
    key: str | None = None

class Song(SongBase):
    id: str
    status: ProcessingStatus = ProcessingStatus.pending
    model: str = "htdemucs_6s"
    stems: list[str] = []
    error_message: str = ""

class SongCreate(BaseModel):
    url: str

class SearchResult(BaseModel):
    title: str
    url: str
    thumbnail: str
    duration: float
    channel: str
    quality: str = ""
```

**Step 2: Create library.py**

```python
import json
import uuid
from pathlib import Path
from app.config import settings
from app.models.schemas import Song, ProcessingStatus

class LibraryService:
    def __init__(self):
        self.library_file = settings.library_dir / "library.json"

    def _read(self) -> list[dict]:
        if not self.library_file.exists():
            return []
        return json.loads(self.library_file.read_text())

    def _write(self, songs: list[dict]):
        self.library_file.write_text(json.dumps(songs, indent=2))

    def list_songs(self) -> list[Song]:
        return [Song(**s) for s in self._read()]

    def get_song(self, song_id: str) -> Song | None:
        for s in self._read():
            if s["id"] == song_id:
                return Song(**s)
        return None

    def add_song(self, title: str, artist: str = "", source: str = "", source_url: str = "",
                 duration: float = 0.0, thumbnail: str = "") -> Song:
        song_id = uuid.uuid4().hex[:12]
        song = Song(
            id=song_id, title=title, artist=artist, source=source,
            source_url=source_url, duration=duration, thumbnail=thumbnail,
        )
        song_dir = settings.library_dir / song_id
        song_dir.mkdir(parents=True, exist_ok=True)
        songs = self._read()
        songs.append(song.model_dump())
        self._write(songs)
        return song

    def update_song(self, song_id: str, **kwargs):
        songs = self._read()
        for s in songs:
            if s["id"] == song_id:
                s.update(kwargs)
                break
        self._write(songs)

    def delete_song(self, song_id: str):
        import shutil
        songs = [s for s in self._read() if s["id"] != song_id]
        self._write(songs)
        song_dir = settings.library_dir / song_id
        if song_dir.exists():
            shutil.rmtree(song_dir)

library_service = LibraryService()
```

**Step 3: Create routes/songs.py**

```python
from fastapi import APIRouter, HTTPException
from app.services.library import library_service
from app.models.schemas import Song

router = APIRouter(prefix="/api/songs", tags=["songs"])

@router.get("/", response_model=list[Song])
async def list_songs():
    return library_service.list_songs()

@router.get("/{song_id}", response_model=Song)
async def get_song(song_id: str):
    song = library_service.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song

@router.delete("/{song_id}")
async def delete_song(song_id: str):
    song = library_service.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    library_service.delete_song(song_id)
    return {"status": "deleted"}
```

**Step 4: Register router in main.py**

Add to `main.py`:
```python
from app.routes.songs import router as songs_router
app.include_router(songs_router)
```

**Step 5: Test manually**

Run: `curl http://localhost:5222/api/songs/`
Expected: `[]`

**Step 6: Commit**

```bash
git add backend/app/models/ backend/app/services/library.py backend/app/routes/songs.py backend/app/main.py
git commit -m "feat: library service with song CRUD and Pydantic schemas"
```

---

## Task 3: Backend — YouTube Search & Download

**Files:**
- Create: `backend/app/services/download.py`
- Create: `backend/app/routes/search.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Create download.py**

```python
import subprocess
import json
import re
from pathlib import Path
from app.config import settings

class DownloadService:
    def search_youtube(self, query: str, max_results: int = 10) -> list[dict]:
        cmd = [
            "yt-dlp", f"ytsearch{max_results}:{query}",
            "--dump-json", "--no-download", "--flat-playlist",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        results = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            try:
                data = json.loads(line)
                results.append({
                    "title": data.get("title", ""),
                    "url": data.get("url", data.get("webpage_url", "")),
                    "thumbnail": data.get("thumbnail", ""),
                    "duration": data.get("duration", 0) or 0,
                    "channel": data.get("channel", data.get("uploader", "")),
                    "quality": self._quality_label(data.get("abr", 0)),
                })
            except json.JSONDecodeError:
                continue
        return results

    def download_audio(self, url: str, output_dir: Path, progress_callback=None) -> Path:
        output_path = output_dir / "original.%(ext)s"
        cmd = [
            "yt-dlp", url,
            "-x", "--audio-format", "wav",
            "--audio-quality", "0",
            "-o", str(output_path),
            "--no-playlist",
            "--progress",
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            if progress_callback and "%" in line:
                match = re.search(r"(\d+\.?\d*)%", line)
                if match:
                    progress_callback(float(match.group(1)))
        process.wait()
        if process.returncode != 0:
            raise RuntimeError(f"yt-dlp failed with code {process.returncode}")
        # Find the output file
        for f in output_dir.glob("original.*"):
            return f
        raise FileNotFoundError("Downloaded file not found")

    def _quality_label(self, abr) -> str:
        if not abr:
            return ""
        abr = float(abr)
        if abr >= 256:
            return "HQ"
        if abr >= 128:
            return "Good"
        return "Low"

download_service = DownloadService()
```

**Step 2: Create routes/search.py**

```python
from fastapi import APIRouter, Query
from app.services.download import download_service
from app.models.schemas import SearchResult

router = APIRouter(prefix="/api", tags=["search"])

@router.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(..., min_length=1)):
    results = download_service.search_youtube(q)
    return [SearchResult(**r) for r in results]
```

**Step 3: Register router in main.py**

```python
from app.routes.search import router as search_router
app.include_router(search_router)
```

**Step 4: Test manually**

Run: `curl "http://localhost:5222/api/search?q=bohemian+rhapsody"`
Expected: JSON array of YouTube results with title, url, thumbnail, duration, channel

**Step 5: Commit**

```bash
git add backend/app/services/download.py backend/app/routes/search.py backend/app/main.py
git commit -m "feat: YouTube search and download service via yt-dlp"
```

---

## Task 4: Backend — 6-Stem Separation Service

**Files:**
- Create: `backend/app/services/separation.py`

**Step 1: Create separation.py**

```python
import torch
import demucs.api
import soundfile as sf
import numpy as np
from pathlib import Path
from app.config import settings
import threading

# GPU lock — only one separation at a time
gpu_lock = threading.Lock()

class SeparationService:
    def __init__(self):
        self._separator = None

    def _get_separator(self) -> demucs.api.Separator:
        if self._separator is None:
            device = self._detect_device()
            self._separator = demucs.api.Separator(
                model=settings.default_model,
                device=device,
            )
        return self._separator

    def _detect_device(self) -> str:
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def separate(self, audio_path: Path, output_dir: Path,
                 progress_callback=None) -> dict[str, Path]:
        with gpu_lock:
            separator = self._get_separator()

            if progress_callback:
                progress_callback(0, "Loading audio")

            origin, separated = separator.separate_audio_file(str(audio_path))

            stem_paths = {}
            total_stems = len(separated)

            for i, (stem_name, audio_tensor) in enumerate(separated.items()):
                if progress_callback:
                    pct = ((i + 1) / total_stems) * 100
                    progress_callback(pct, f"Saving {stem_name}")

                output_path = output_dir / f"{stem_name}.wav"
                demucs.api.save_audio(
                    audio_tensor,
                    str(output_path),
                    samplerate=separator.samplerate,
                )
                stem_paths[stem_name] = output_path

            return stem_paths

    def get_available_stems(self) -> list[str]:
        return settings.stems

separation_service = SeparationService()
```

**Step 2: Test manually**

```python
from app.services.separation import separation_service
from pathlib import Path
result = separation_service.separate(Path("test.wav"), Path("output/"))
print(result)  # Should print dict of stem_name -> Path for 6 stems
```

**Step 3: Commit**

```bash
git add backend/app/services/separation.py
git commit -m "feat: 6-stem separation service using demucs htdemucs_6s"
```

---

## Task 5: Backend — Processing Pipeline with SSE Progress

**Files:**
- Create: `backend/app/services/pipeline.py`
- Create: `backend/app/routes/process.py`
- Modify: `backend/app/main.py` (add router)

**Step 1: Create pipeline.py**

```python
import asyncio
import subprocess
from pathlib import Path
from collections.abc import AsyncGenerator
from app.config import settings
from app.services.library import library_service
from app.services.download import download_service
from app.services.separation import separation_service

class PipelineEvent:
    def __init__(self, phase: str, progress: float, message: str = ""):
        self.phase = phase
        self.progress = progress
        self.message = message

    def to_dict(self):
        return {"phase": self.phase, "progress": self.progress, "message": self.message}

async def process_song(song_id: str, url: str | None = None,
                       file_path: Path | None = None) -> AsyncGenerator[PipelineEvent, None]:
    song_dir = settings.library_dir / song_id
    song_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Phase 1: Download or copy
        if url:
            yield PipelineEvent("downloading", 0, "Starting download")
            library_service.update_song(song_id, status="downloading")

            def dl_progress(pct):
                pass  # SSE yields happen in the outer loop

            loop = asyncio.get_event_loop()
            audio_path = await loop.run_in_executor(
                None, lambda: download_service.download_audio(url, song_dir)
            )
            yield PipelineEvent("downloading", 100, "Download complete")
        elif file_path:
            audio_path = file_path
            yield PipelineEvent("downloading", 100, "File received")
        else:
            raise ValueError("No URL or file provided")

        # Phase 2: Normalize to WAV
        yield PipelineEvent("preprocessing", 0, "Normalizing audio")
        normalized_path = song_dir / "original.wav"
        if audio_path.suffix != ".wav" or audio_path != normalized_path:
            subprocess.run([
                "ffmpeg", "-y", "-i", str(audio_path),
                "-ar", "44100", "-ac", "2", "-sample_fmt", "s16",
                "-filter:a", "loudnorm=I=-14:TP=-1:LRA=11",
                str(normalized_path),
            ], capture_output=True, check=True)
            if audio_path != normalized_path:
                audio_path.unlink(missing_ok=True)
        yield PipelineEvent("preprocessing", 100, "Audio normalized")

        # Phase 3: Separate
        yield PipelineEvent("separating", 0, "Starting separation")
        library_service.update_song(song_id, status="separating")

        loop = asyncio.get_event_loop()

        def sep_progress(pct, msg):
            pass  # Progress from separation service

        stem_paths = await loop.run_in_executor(
            None, lambda: separation_service.separate(normalized_path, song_dir, sep_progress)
        )
        yield PipelineEvent("separating", 100, "Separation complete")

        # Phase 4: Done
        stems = list(stem_paths.keys())
        library_service.update_song(song_id, status="done", stems=stems)
        yield PipelineEvent("done", 100, "Processing complete")

    except Exception as e:
        library_service.update_song(song_id, status="error", error_message=str(e))
        yield PipelineEvent("error", 0, str(e))
```

**Step 2: Create routes/process.py**

```python
import shutil
from pathlib import Path
from collections.abc import AsyncIterable
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.sse import EventSourceResponse, ServerSentEvent
from app.models.schemas import SongCreate, Song
from app.services.library import library_service
from app.services.pipeline import process_song
from app.config import settings
import json

router = APIRouter(prefix="/api", tags=["process"])

@router.post("/songs", response_model=Song)
async def add_song(body: SongCreate):
    song = library_service.add_song(
        title="Processing...", source="youtube", source_url=body.url,
    )
    return song

@router.post("/upload", response_model=Song)
async def upload_song(file: UploadFile = File(...)):
    title = Path(file.filename).stem if file.filename else "Uploaded"
    song = library_service.add_song(title=title, source="upload")
    song_dir = settings.library_dir / song.id
    song_dir.mkdir(parents=True, exist_ok=True)
    dest = song_dir / f"upload{Path(file.filename).suffix}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return song

@router.get("/songs/{song_id}/events", response_class=EventSourceResponse)
async def song_events(song_id: str) -> AsyncIterable[ServerSentEvent]:
    song = library_service.get_song(song_id)
    if not song:
        yield ServerSentEvent(data=json.dumps({"phase": "error", "message": "Song not found"}), event="error")
        return

    source = song.source_url if song.source == "youtube" else None
    file_path = None
    if song.source == "upload":
        song_dir = settings.library_dir / song_id
        for f in song_dir.iterdir():
            if f.stem == "upload":
                file_path = f
                break

    async for event in process_song(song_id, url=source, file_path=file_path):
        yield ServerSentEvent(
            data=json.dumps(event.to_dict()),
            event=event.phase,
        )
```

**Step 3: Register router in main.py**

```python
from app.routes.process import router as process_router
app.include_router(process_router)
```

**Step 4: Test manually**

```bash
# Add a song
curl -X POST http://localhost:5222/api/songs -H "Content-Type: application/json" -d '{"url":"https://www.youtube.com/watch?v=..."}'
# Stream events
curl -N http://localhost:5222/api/songs/<id>/events
```
Expected: SSE events streaming download → preprocessing → separating → done

**Step 5: Commit**

```bash
git add backend/app/services/pipeline.py backend/app/routes/process.py backend/app/main.py
git commit -m "feat: processing pipeline with SSE progress streaming"
```

---

## Task 6: Backend — Spotify Metadata Service

**Files:**
- Create: `backend/app/services/spotify.py`
- Modify: `backend/app/routes/search.py` (add Spotify search endpoint)
- Create: `backend/.env.example`

**Step 1: Create .env.example**

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

**Step 2: Create spotify.py**

```python
import httpx
import base64
from app.config import settings

class SpotifyService:
    TOKEN_URL = "https://accounts.spotify.com/api/token"
    API_BASE = "https://api.spotify.com/v1"

    def __init__(self):
        self._token: str | None = None

    async def _get_token(self) -> str:
        if self._token:
            return self._token
        if not settings.spotify_client_id or not settings.spotify_client_secret:
            raise ValueError("Spotify credentials not configured")
        credentials = base64.b64encode(
            f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()
        ).decode()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.TOKEN_URL,
                headers={"Authorization": f"Basic {credentials}"},
                data={"grant_type": "client_credentials"},
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            return self._token

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        try:
            token = await self._get_token()
        except ValueError:
            return []
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.API_BASE}/search",
                params={"q": query, "type": "track", "limit": limit},
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401:
                self._token = None
                token = await self._get_token()
                resp = await client.get(
                    f"{self.API_BASE}/search",
                    params={"q": query, "type": "track", "limit": limit},
                    headers={"Authorization": f"Bearer {token}"},
                )
            resp.raise_for_status()
            tracks = resp.json().get("tracks", {}).get("items", [])
            return [
                {
                    "title": t["name"],
                    "artist": ", ".join(a["name"] for a in t["artists"]),
                    "album": t["album"]["name"],
                    "thumbnail": t["album"]["images"][0]["url"] if t["album"]["images"] else "",
                    "duration": t["duration_ms"] / 1000,
                    "spotify_id": t["id"],
                    "preview_url": t.get("preview_url", ""),
                }
                for t in tracks
            ]

spotify_service = SpotifyService()
```

**Step 3: Add Spotify search to routes/search.py**

```python
from app.services.spotify import spotify_service

@router.get("/search/spotify")
async def search_spotify(q: str = Query(..., min_length=1)):
    return await spotify_service.search(q)
```

**Step 4: Commit**

```bash
git add backend/app/services/spotify.py backend/app/routes/search.py backend/.env.example
git commit -m "feat: Spotify metadata search via client credentials flow"
```

---

## Task 7: Frontend — Project Scaffold

**Files:**
- Create: `frontend/` (via create-next-app)
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/lib/api.ts`

**Step 1: Create Next.js project**

```bash
cd /Users/nunosantos/Desktop/studio/projects/StemStudio
npx create-next-app@latest frontend --app --turbopack --ts --tailwind --eslint --src-dir --import-alias "@/*" --yes
```

**Step 2: Create API client lib/api.ts**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5222";

export interface Song {
  id: string;
  title: string;
  artist: string;
  source: string;
  source_url: string;
  duration: number;
  thumbnail: string;
  status: "pending" | "downloading" | "separating" | "done" | "error";
  model: string;
  stems: string[];
  error_message: string;
  bpm: number | null;
  key: string | null;
}

export interface SearchResult {
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  channel: string;
  quality: string;
}

export interface SpotifyResult {
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
  spotify_id: string;
  preview_url: string;
}

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function searchSpotify(query: string): Promise<SpotifyResult[]> {
  const res = await fetch(`${API_BASE}/api/search/spotify?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function listSongs(): Promise<Song[]> {
  const res = await fetch(`${API_BASE}/api/songs/`);
  return res.json();
}

export async function addSong(url: string): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}

export async function uploadSong(file: File): Promise<Song> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
  return res.json();
}

export async function deleteSong(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/songs/${id}`, { method: "DELETE" });
}

export function streamSongEvents(songId: string, onEvent: (data: { phase: string; progress: number; message: string }) => void): EventSource {
  const es = new EventSource(`${API_BASE}/api/songs/${songId}/events`);
  for (const event of ["downloading", "preprocessing", "separating", "done", "error"]) {
    es.addEventListener(event, (e) => {
      onEvent(JSON.parse((e as MessageEvent).data));
    });
  }
  return es;
}

export function stemUrl(songId: string, stem: string): string {
  return `${API_BASE}/library/${songId}/${stem}.wav`;
}
```

**Step 3: Update layout.tsx with dark theme and app shell**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StemStudio",
  description: "Multi-instrument audio separation studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
```

**Step 4: Update page.tsx with tab navigation placeholder**

```tsx
"use client";

import { useState } from "react";

type Tab = "search" | "library";

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight">StemStudio</h1>
        <nav className="flex gap-1">
          {(["search", "library"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {tab === "search" && <div>Search tab placeholder</div>}
        {tab === "library" && <div>Library tab placeholder</div>}
      </main>
    </div>
  );
}
```

**Step 5: Test**

Run: `cd frontend && npm run dev`
Expected: App loads at http://localhost:3000 with dark theme, header with tabs

**Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: Next.js frontend scaffold with API client and tab navigation"
```

---

## Task 8: Frontend — Search Tab (YouTube + Spotify + Upload)

**Files:**
- Create: `frontend/src/components/search/SearchBar.tsx`
- Create: `frontend/src/components/search/SearchResults.tsx`
- Create: `frontend/src/components/search/UploadZone.tsx`
- Modify: `frontend/src/app/page.tsx`

**Step 1: Create SearchBar.tsx**

```tsx
"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a song..."
        className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
      />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
```

**Step 2: Create SearchResults.tsx**

```tsx
"use client";

import type { SearchResult, SpotifyResult } from "@/lib/api";

interface SearchResultsProps {
  youtubeResults: SearchResult[];
  spotifyResults: SpotifyResult[];
  onAddSong: (url: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SearchResults({ youtubeResults, spotifyResults, onAddSong }: SearchResultsProps) {
  if (youtubeResults.length === 0 && spotifyResults.length === 0) return null;

  return (
    <div className="space-y-6">
      {youtubeResults.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">YouTube</h3>
          <div className="space-y-2">
            {youtubeResults.map((r, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors group">
                {r.thumbnail && (
                  <img src={r.thumbnail} alt="" className="w-16 h-12 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500">{r.channel} · {formatDuration(r.duration)}</p>
                </div>
                {r.quality && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.quality === "HQ" ? "bg-green-900 text-green-300" : "bg-zinc-700 text-zinc-300"
                  }`}>
                    {r.quality}
                  </span>
                )}
                <button
                  onClick={() => onAddSong(r.url)}
                  className="px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Separate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {spotifyResults.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Spotify (metadata)</h3>
          <div className="space-y-2">
            {spotifyResults.map((r, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-900">
                {r.thumbnail && (
                  <img src={r.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500">{r.artist} · {r.album} · {formatDuration(r.duration)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create UploadZone.tsx**

```tsx
"use client";

import { useState, useCallback } from "react";

interface UploadZoneProps {
  onUpload: (file: File) => void;
}

export function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  }, [onUpload]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
        isDragging ? "border-white bg-zinc-800" : "border-zinc-700 hover:border-zinc-500"
      }`}
    >
      <input
        type="file"
        accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,.wma,.opus"
        onChange={handleChange}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <p className="text-zinc-400 text-sm">
          {isDragging ? "Drop your audio file here" : "Drag & drop an audio file, or click to browse"}
        </p>
        <p className="text-zinc-600 text-xs mt-1">MP3, WAV, FLAC, M4A, OGG, AAC, WMA, OPUS</p>
      </label>
    </div>
  );
}
```

**Step 4: Wire up in page.tsx**

Replace the search tab placeholder with:
```tsx
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { UploadZone } from "@/components/search/UploadZone";
import { searchYouTube, searchSpotify, addSong, uploadSong } from "@/lib/api";
import type { SearchResult, SpotifyResult, Song } from "@/lib/api";

// Add state and handlers inside Home component:
const [ytResults, setYtResults] = useState<SearchResult[]>([]);
const [spResults, setSpResults] = useState<SpotifyResult[]>([]);
const [isSearching, setIsSearching] = useState(false);

const handleSearch = async (query: string) => {
  setIsSearching(true);
  const [yt, sp] = await Promise.all([searchYouTube(query), searchSpotify(query)]);
  setYtResults(yt);
  setSpResults(sp);
  setIsSearching(false);
};

const handleAddSong = async (url: string) => {
  const song = await addSong(url);
  // TODO: navigate to library or open mixer
};

const handleUpload = async (file: File) => {
  const song = await uploadSong(file);
  // TODO: navigate to library or open mixer
};

// In JSX:
{tab === "search" && (
  <div className="max-w-3xl mx-auto space-y-6">
    <SearchBar onSearch={handleSearch} isLoading={isSearching} />
    <UploadZone onUpload={handleUpload} />
    <SearchResults youtubeResults={ytResults} spotifyResults={spResults} onAddSong={handleAddSong} />
  </div>
)}
```

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: search tab with YouTube, Spotify, and file upload"
```

---

## Task 9: Frontend — Library Tab

**Files:**
- Create: `frontend/src/components/library/SongCard.tsx`
- Create: `frontend/src/components/library/ProcessingProgress.tsx`
- Modify: `frontend/src/app/page.tsx`

**Step 1: Create ProcessingProgress.tsx**

```tsx
"use client";

interface ProcessingProgressProps {
  phase: string;
  progress: number;
  message: string;
}

const phaseLabels: Record<string, string> = {
  pending: "Queued",
  downloading: "Downloading",
  preprocessing: "Preparing",
  separating: "Separating instruments",
  done: "Ready",
  error: "Error",
};

const phaseColors: Record<string, string> = {
  downloading: "bg-blue-500",
  preprocessing: "bg-yellow-500",
  separating: "bg-purple-500",
  done: "bg-green-500",
  error: "bg-red-500",
};

export function ProcessingProgress({ phase, progress, message }: ProcessingProgressProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{phaseLabels[phase] || phase}</span>
        <span className="text-zinc-500">{Math.round(progress)}%</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${phaseColors[phase] || "bg-zinc-600"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {message && <p className="text-xs text-zinc-500">{message}</p>}
    </div>
  );
}
```

**Step 2: Create SongCard.tsx**

```tsx
"use client";

import type { Song } from "@/lib/api";

interface SongCardProps {
  song: Song;
  onOpen: (song: Song) => void;
  onDelete: (id: string) => void;
  processingState?: { phase: string; progress: number; message: string };
}

export function SongCard({ song, onOpen, onDelete, processingState }: SongCardProps) {
  const isReady = song.status === "done";

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors">
      {song.thumbnail ? (
        <img src={song.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover" />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 text-lg">
          ♪
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{song.title}</p>
        {song.artist && <p className="text-xs text-zinc-500">{song.artist}</p>}
        {processingState && song.status !== "done" && (
          <div className="mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">{processingState.phase}</span>
              <span className="text-zinc-500">{Math.round(processingState.progress)}%</span>
            </div>
            <div className="h-1 mt-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: `${processingState.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {isReady && (
          <button
            onClick={() => onOpen(song)}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Open Mixer
          </button>
        )}
        <button
          onClick={() => onDelete(song.id)}
          className="px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 text-sm transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Wire into page.tsx**

Add library state and rendering for the library tab.

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "feat: library tab with song cards and processing progress"
```

---

## Task 10: Frontend — Mixer Page (Core)

**Files:**
- Create: `frontend/src/app/mixer/[id]/page.tsx`
- Create: `frontend/src/hooks/useAudioEngine.ts`
- Create: `frontend/src/components/mixer/ChannelStrip.tsx`
- Create: `frontend/src/components/mixer/Transport.tsx`
- Create: `frontend/src/components/mixer/MixerConsole.tsx`

**Step 1: Create useAudioEngine.ts**

This is the critical piece — sample-accurate sync using AudioBufferSourceNode.

```typescript
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { stemUrl } from "@/lib/api";

export interface StemChannel {
  name: string;
  gain: number;     // 0-1
  pan: number;      // -1 to 1
  muted: boolean;
  soloed: boolean;
  color: string;
}

const STEM_COLORS: Record<string, string> = {
  vocals: "#3b82f6",  // blue
  drums: "#ef4444",   // red
  bass: "#a855f7",    // purple
  guitar: "#f97316",  // orange
  piano: "#22c55e",   // green
  other: "#71717a",   // gray
};

const STEMS = ["vocals", "drums", "bass", "guitar", "piano", "other"];

export function useAudioEngine(songId: string | null) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const sourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainsRef = useRef<Map<string, GainNode>>(new Map());
  const pannersRef = useRef<Map<string, StereoPannerNode>>(new Map());

  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef(0);   // audioCtx.currentTime when playback started
  const offsetRef = useRef(0);       // offset into the buffer when playback started

  const [channels, setChannels] = useState<StemChannel[]>(
    STEMS.map((name) => ({
      name,
      gain: 1,
      pan: 0,
      muted: false,
      soloed: false,
      color: STEM_COLORS[name],
    }))
  );

  // Load all stems
  const load = useCallback(async () => {
    if (!songId) return;
    const ctx = new AudioContext({ sampleRate: 44100 });
    audioCtxRef.current = ctx;

    const loadBuffer = async (stem: string): Promise<[string, AudioBuffer]> => {
      const url = stemUrl(songId, stem);
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      return [stem, audioBuf];
    };

    const results = await Promise.all(STEMS.map(loadBuffer));
    for (const [name, buf] of results) {
      buffersRef.current.set(name, buf);
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      gain.connect(panner);
      panner.connect(ctx.destination);
      gainsRef.current.set(name, gain);
      pannersRef.current.set(name, panner);
    }

    const firstBuf = results[0][1];
    setDuration(firstBuf.duration);
    setIsLoaded(true);
  }, [songId]);

  // Start / resume playback
  const play = useCallback((fromOffset?: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !isLoaded) return;

    // Stop existing sources
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();

    const offset = fromOffset ?? offsetRef.current;
    const startTime = ctx.currentTime;
    startTimeRef.current = startTime;
    offsetRef.current = offset;

    for (const stem of STEMS) {
      const buf = buffersRef.current.get(stem);
      const gain = gainsRef.current.get(stem);
      if (!buf || !gain) continue;

      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(gain);
      source.start(startTime, offset);
      sourcesRef.current.set(stem, source);
    }

    setIsPlaying(true);
  }, [isLoaded]);

  // Pause
  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - startTimeRef.current;
    offsetRef.current += elapsed;
    sourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    sourcesRef.current.clear();
    setIsPlaying(false);
  }, []);

  // Seek
  const seek = useCallback((time: number) => {
    offsetRef.current = time;
    setCurrentTime(time);
    if (isPlaying) {
      play(time);
    }
  }, [isPlaying, play]);

  // Update gain/pan/mute
  const updateChannel = useCallback((index: number, updates: Partial<StemChannel>) => {
    setChannels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      // Apply solo logic
      const anySoloed = next.some((c) => c.soloed);

      for (let i = 0; i < next.length; i++) {
        const ch = next[i];
        const gain = gainsRef.current.get(ch.name);
        const panner = pannersRef.current.get(ch.name);
        if (gain) {
          const audible = anySoloed ? ch.soloed : !ch.muted;
          gain.gain.value = audible ? ch.gain : 0;
        }
        if (panner) {
          panner.pan.value = ch.pan;
        }
      }

      return next;
    });
  }, []);

  // Time update loop
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (isPlaying && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
        const time = offsetRef.current + elapsed;
        setCurrentTime(time);
        if (time >= duration && duration > 0) {
          pause();
          offsetRef.current = 0;
          setCurrentTime(0);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration, pause]);

  // Cleanup
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
      audioCtxRef.current?.close();
    };
  }, []);

  return {
    isLoaded, isPlaying, currentTime, duration, channels,
    load, play, pause, seek, updateChannel,
  };
}
```

**Step 2: Create ChannelStrip.tsx**

```tsx
"use client";

import type { StemChannel } from "@/hooks/useAudioEngine";

interface ChannelStripProps {
  channel: StemChannel;
  index: number;
  onUpdate: (index: number, updates: Partial<StemChannel>) => void;
}

export function ChannelStrip({ channel, index, onUpdate }: ChannelStripProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-zinc-900 w-28">
      <span
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: channel.color }}
      >
        {channel.name}
      </span>

      {/* Vertical fader */}
      <div className="relative h-48 w-6 flex items-center justify-center">
        <input
          type="range"
          min={0}
          max={100}
          value={channel.gain * 100}
          onChange={(e) => onUpdate(index, { gain: Number(e.target.value) / 100 })}
          className="absolute h-48 w-6 appearance-none cursor-pointer"
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",
            accentColor: channel.color,
          }}
        />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums">
        {Math.round(channel.gain * 100)}%
      </span>

      {/* Pan knob */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-zinc-600">L</span>
        <input
          type="range"
          min={-100}
          max={100}
          value={channel.pan * 100}
          onChange={(e) => onUpdate(index, { pan: Number(e.target.value) / 100 })}
          className="w-16 h-1 appearance-none cursor-pointer rounded-full bg-zinc-700"
          style={{ accentColor: channel.color }}
        />
        <span className="text-[10px] text-zinc-600">R</span>
      </div>

      {/* Solo / Mute */}
      <div className="flex gap-1">
        <button
          onClick={() => onUpdate(index, { soloed: !channel.soloed })}
          className={`w-8 h-7 rounded text-xs font-bold transition-colors ${
            channel.soloed ? "bg-yellow-500 text-black" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          S
        </button>
        <button
          onClick={() => onUpdate(index, { muted: !channel.muted })}
          className={`w-8 h-7 rounded text-xs font-bold transition-colors ${
            channel.muted ? "bg-red-500 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          M
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Create Transport.tsx**

```tsx
"use client";

interface TransportProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Transport({ isPlaying, currentTime, duration, onPlay, onPause, onSeek }: TransportProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onSeek(Math.max(0, currentTime - 5))}
        className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm transition-colors"
      >
        -5s
      </button>

      <button
        onClick={isPlaying ? onPause : onPlay}
        className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center text-lg font-bold hover:bg-zinc-200 transition-colors"
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      <button
        onClick={() => onSeek(Math.min(duration, currentTime + 5))}
        className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm transition-colors"
      >
        +5s
      </button>

      <div className="flex-1 flex items-center gap-3">
        <span className="text-xs text-zinc-500 tabular-nums w-10 text-right">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration * 1000}
          value={currentTime * 1000}
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          className="flex-1 h-1 appearance-none cursor-pointer rounded-full bg-zinc-700 accent-white"
        />
        <span className="text-xs text-zinc-500 tabular-nums w-10">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
```

**Step 4: Create MixerConsole.tsx**

```tsx
"use client";

import { ChannelStrip } from "./ChannelStrip";
import { Transport } from "./Transport";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { useEffect } from "react";

interface MixerConsoleProps {
  songId: string;
  songTitle: string;
}

const PRESETS: { label: string; config: Record<string, { gain: number; muted: boolean }> }[] = [
  { label: "Full Mix", config: { vocals: { gain: 1, muted: false }, drums: { gain: 1, muted: false }, bass: { gain: 1, muted: false }, guitar: { gain: 1, muted: false }, piano: { gain: 1, muted: false }, other: { gain: 1, muted: false } } },
  { label: "No Vocals", config: { vocals: { gain: 0, muted: true }, drums: { gain: 1, muted: false }, bass: { gain: 1, muted: false }, guitar: { gain: 1, muted: false }, piano: { gain: 1, muted: false }, other: { gain: 1, muted: false } } },
  { label: "Rhythm", config: { vocals: { gain: 0, muted: true }, drums: { gain: 1, muted: false }, bass: { gain: 1, muted: false }, guitar: { gain: 0, muted: true }, piano: { gain: 0, muted: true }, other: { gain: 0, muted: true } } },
  { label: "Harmony", config: { vocals: { gain: 0, muted: true }, drums: { gain: 0, muted: true }, bass: { gain: 0, muted: true }, guitar: { gain: 1, muted: false }, piano: { gain: 1, muted: false }, other: { gain: 0, muted: true } } },
  { label: "Vocals Only", config: { vocals: { gain: 1, muted: false }, drums: { gain: 0, muted: true }, bass: { gain: 0, muted: true }, guitar: { gain: 0, muted: true }, piano: { gain: 0, muted: true }, other: { gain: 0, muted: true } } },
];

export function MixerConsole({ songId, songTitle }: MixerConsoleProps) {
  const engine = useAudioEngine(songId);

  useEffect(() => {
    engine.load();
  }, [songId]);

  const applyPreset = (preset: typeof PRESETS[number]) => {
    engine.channels.forEach((ch, i) => {
      const cfg = preset.config[ch.name];
      if (cfg) engine.updateChannel(i, { gain: cfg.gain, muted: cfg.muted, soloed: false });
    });
  };

  if (!engine.isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading stems...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{songTitle}</h2>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-medium hover:text-white hover:bg-zinc-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Transport
        isPlaying={engine.isPlaying}
        currentTime={engine.currentTime}
        duration={engine.duration}
        onPlay={() => engine.play()}
        onPause={() => engine.pause()}
        onSeek={(t) => engine.seek(t)}
      />

      <div className="flex gap-3 justify-center">
        {engine.channels.map((ch, i) => (
          <ChannelStrip
            key={ch.name}
            channel={ch}
            index={i}
            onUpdate={engine.updateChannel}
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 5: Create mixer page**

```tsx
// frontend/src/app/mixer/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MixerConsole } from "@/components/mixer/MixerConsole";
import type { Song } from "@/lib/api";

export default function MixerPage() {
  const params = useParams();
  const songId = params.id as string;
  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    fetch(`http://localhost:5222/api/songs/${songId}`)
      .then((r) => r.json())
      .then(setSong);
  }, [songId]);

  if (!song) return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800">
        <a href="/" className="text-zinc-500 hover:text-white text-sm">Back</a>
        <h1 className="text-xl font-bold tracking-tight">StemStudio</h1>
      </header>
      <main className="p-6 max-w-5xl mx-auto">
        <MixerConsole songId={songId} songTitle={song.title} />
      </main>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: mixer page with 6-channel console, transport, presets, and Web Audio engine"
```

---

## Task 11: Frontend — Keyboard Shortcuts

**Files:**
- Create: `frontend/src/hooks/useKeyboardShortcuts.ts`
- Modify: `frontend/src/components/mixer/MixerConsole.tsx`

**Step 1: Create useKeyboardShortcuts.ts**

```typescript
"use client";

import { useEffect } from "react";

interface ShortcutActions {
  togglePlay: () => void;
  seekBack: () => void;
  seekForward: () => void;
  toggleSolo: (index: number) => void;
  toggleMute: (index: number) => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          actions.togglePlay();
          break;
        case "ArrowLeft":
          actions.seekBack();
          break;
        case "ArrowRight":
          actions.seekForward();
          break;
        case "Digit1": case "Digit2": case "Digit3":
        case "Digit4": case "Digit5": case "Digit6":
          const idx = parseInt(e.code.replace("Digit", "")) - 1;
          if (e.shiftKey) actions.toggleMute(idx);
          else actions.toggleSolo(idx);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
```

**Step 2: Wire into MixerConsole**

Add the hook call inside MixerConsole component, connecting to the engine methods.

**Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: keyboard shortcuts for mixer (space, 1-6, shift+1-6, arrows)"
```

---

## Task 12: Backend — Export/Download Endpoints

**Files:**
- Create: `backend/app/routes/export.py`
- Modify: `backend/app/main.py`

**Step 1: Create export.py**

```python
import io
import zipfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from app.config import settings
from app.services.library import library_service

router = APIRouter(prefix="/api/songs", tags=["export"])

@router.get("/{song_id}/stems/{stem}")
async def download_stem(song_id: str, stem: str, format: str = Query("wav")):
    song = library_service.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    wav_path = settings.library_dir / song_id / f"{stem}.wav"
    if not wav_path.exists():
        raise HTTPException(status_code=404, detail="Stem not found")

    if format == "wav":
        return FileResponse(wav_path, filename=f"{song.title} - {stem}.wav")

    # Convert to requested format
    out_path = settings.library_dir / song_id / f"{stem}.{format}"
    if not out_path.exists():
        cmd = ["ffmpeg", "-y", "-i", str(wav_path)]
        if format == "mp3":
            cmd += ["-codec:a", "libmp3lame", "-b:a", "320k"]
        elif format == "flac":
            cmd += ["-codec:a", "flac"]
        cmd.append(str(out_path))
        subprocess.run(cmd, capture_output=True, check=True)

    return FileResponse(out_path, filename=f"{song.title} - {stem}.{format}")

@router.get("/{song_id}/download-all")
async def download_all_stems(song_id: str, format: str = Query("wav")):
    song = library_service.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem in settings.stems:
            stem_path = settings.library_dir / song_id / f"{stem}.wav"
            if stem_path.exists():
                zf.write(stem_path, f"{song.title}/{stem}.wav")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{song.title} - stems.zip"'},
    )
```

**Step 2: Register router, commit**

```bash
git add backend/app/routes/export.py backend/app/main.py
git commit -m "feat: stem download and ZIP export endpoints"
```

---

## Task 13: Integration Testing & Polish

**Files:**
- Modify: various files for bug fixes discovered during testing

**Step 1: Start both servers**

```bash
# Terminal 1
cd backend && python -m uvicorn app.main:app --port 5222 --reload

# Terminal 2
cd frontend && npm run dev
```

**Step 2: End-to-end test flow**

1. Open http://localhost:3000
2. Search for a song → verify YouTube results appear
3. Click "Separate" → verify song appears in library with progress
4. Wait for processing to complete → verify "Open Mixer" button appears
5. Open mixer → verify 6 channel strips load
6. Test faders, solo, mute, pan
7. Test presets (Full Mix, No Vocals, Rhythm, Harmony, Vocals Only)
8. Test keyboard shortcuts (space, 1-6, shift+1-6)
9. Test seek via timeline
10. Upload a local file → verify it processes and opens in mixer

**Step 3: Fix any issues found**

**Step 4: Commit**

```bash
git add .
git commit -m "fix: integration testing fixes and polish"
```

---

## Task 14: Startup Script & README

**Files:**
- Create: `start.sh` (root level)
- Create: `backend/.env.example`

**Step 1: Create root start.sh**

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Starting StemStudio..."

# Backend
cd backend
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

uvicorn app.main:app --host 0.0.0.0 --port 5222 &
BACKEND_PID=$!
cd ..

# Frontend
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "StemStudio is running:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5222"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
```

**Step 2: Commit**

```bash
chmod +x start.sh
git add start.sh backend/.env.example
git commit -m "feat: startup script and env example"
```

---

Plan complete and saved to `docs/plans/2026-03-04-stemstudio-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?