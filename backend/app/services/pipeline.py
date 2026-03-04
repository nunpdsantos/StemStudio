import subprocess
import threading
from pathlib import Path
from app.config import settings
from app.services.library import library_service
from app.services.download import download_service
from app.services.separation import separation_service


class PipelineManager:
    """Runs pipelines in background threads. Stores events for SSE clients to read."""

    def __init__(self):
        self._events: dict[str, list[dict]] = {}
        self._lock = threading.Lock()

    def _emit(self, song_id: str, phase: str, progress: float, message: str = ""):
        event = {"phase": phase, "progress": progress, "message": message}
        with self._lock:
            if song_id not in self._events:
                self._events[song_id] = []
            self._events[song_id].append(event)

    def get_events(self, song_id: str, after: int = 0) -> list[dict]:
        with self._lock:
            events = self._events.get(song_id, [])
            return events[after:]

    def start(self, song_id: str, url: str | None = None, file_path: Path | None = None):
        thread = threading.Thread(
            target=self._run, args=(song_id, url, file_path), daemon=True
        )
        thread.start()

    def _run(self, song_id: str, url: str | None, file_path: Path | None):
        song_dir = settings.library_dir / song_id
        song_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Phase 1: Download or copy
            if url:
                self._emit(song_id, "downloading", 0, "Starting download")
                library_service.update_song(song_id, status="downloading")
                audio_path = download_service.download_audio(url, song_dir)
                # Update metadata from YouTube
                meta = download_service.get_metadata(url)
                if meta:
                    library_service.update_song(
                        song_id,
                        title=meta.get("title", ""),
                        artist=meta.get("artist", ""),
                        duration=meta.get("duration", 0),
                        thumbnail=meta.get("thumbnail", ""),
                    )
                self._emit(song_id, "downloading", 100, "Download complete")
            elif file_path:
                audio_path = file_path
                self._emit(song_id, "downloading", 100, "File received")
            else:
                raise ValueError("No URL or file provided")

            # Phase 2: Normalize to WAV
            self._emit(song_id, "preprocessing", 0, "Normalizing audio")
            normalized_path = song_dir / "original.wav"
            if audio_path.suffix != ".wav" or audio_path != normalized_path:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", str(audio_path),
                        "-ar", "44100", "-ac", "2", "-sample_fmt", "s16",
                        "-filter:a", "loudnorm=I=-14:TP=-1:LRA=11",
                        str(normalized_path),
                    ],
                    capture_output=True,
                    check=True,
                )
                if audio_path != normalized_path:
                    audio_path.unlink(missing_ok=True)
            self._emit(song_id, "preprocessing", 100, "Audio normalized")

            # Phase 3: Separate
            self._emit(song_id, "separating", 0, "Starting separation")
            library_service.update_song(song_id, status="separating")
            stem_paths = separation_service.separate(normalized_path, song_dir)
            self._emit(song_id, "separating", 100, "Separation complete")

            # Phase 4: Done
            stems = list(stem_paths.keys())
            library_service.update_song(song_id, status="done", stems=stems)
            self._emit(song_id, "done", 100, "Processing complete")

        except Exception as e:
            library_service.update_song(song_id, status="error", error_message=str(e))
            self._emit(song_id, "error", 0, str(e))


pipeline_manager = PipelineManager()
