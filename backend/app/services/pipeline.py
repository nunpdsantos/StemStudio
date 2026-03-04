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


async def process_song(
    song_id: str, url: str | None = None, file_path: Path | None = None
) -> AsyncGenerator[PipelineEvent, None]:
    song_dir = settings.library_dir / song_id
    song_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Phase 1: Download or copy
        if url:
            yield PipelineEvent("downloading", 0, "Starting download")
            library_service.update_song(song_id, status="downloading")
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
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", str(audio_path),
                        "-ar", "44100", "-ac", "2", "-sample_fmt", "s16",
                        "-filter:a", "loudnorm=I=-14:TP=-1:LRA=11",
                        str(normalized_path),
                    ],
                    capture_output=True,
                    check=True,
                ),
            )
            if audio_path != normalized_path:
                audio_path.unlink(missing_ok=True)
        yield PipelineEvent("preprocessing", 100, "Audio normalized")

        # Phase 3: Separate
        yield PipelineEvent("separating", 0, "Starting separation")
        library_service.update_song(song_id, status="separating")
        loop = asyncio.get_event_loop()
        stem_paths = await loop.run_in_executor(
            None, lambda: separation_service.separate(normalized_path, song_dir)
        )
        yield PipelineEvent("separating", 100, "Separation complete")

        # Phase 4: Done
        stems = list(stem_paths.keys())
        library_service.update_song(song_id, status="done", stems=stems)
        yield PipelineEvent("done", 100, "Processing complete")

    except Exception as e:
        library_service.update_song(song_id, status="error", error_message=str(e))
        yield PipelineEvent("error", 0, str(e))
