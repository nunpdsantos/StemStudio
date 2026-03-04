import io
import re
import zipfile
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from app.config import settings
from app.services.library import library_service

router = APIRouter(prefix="/api/songs", tags=["export"])

ALLOWED_FORMATS = {"wav", "mp3", "flac"}
SONG_ID_RE = re.compile(r"^[0-9a-f]+$")


def _validate_song_id(song_id: str):
    if not SONG_ID_RE.match(song_id):
        raise HTTPException(status_code=400, detail="Invalid song_id")


def _validate_stem(stem: str):
    if stem not in settings.stems:
        raise HTTPException(status_code=400, detail=f"Invalid stem: {stem}")


def _validate_format(fmt: str):
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid format: {fmt}")


def _convert_stem(wav_path: Path, out_path: Path, fmt: str):
    """Convert a WAV stem to the requested format using ffmpeg."""
    cmd = ["ffmpeg", "-y", "-i", str(wav_path)]
    if fmt == "mp3":
        cmd += ["-codec:a", "libmp3lame", "-b:a", "320k"]
    elif fmt == "flac":
        cmd += ["-codec:a", "flac"]
    cmd.append(str(out_path))
    subprocess.run(cmd, capture_output=True, check=True)


@router.get("/{song_id}/stems/{stem}")
async def download_stem(song_id: str, stem: str, format: str = Query("wav")):
    _validate_song_id(song_id)
    _validate_stem(stem)
    _validate_format(format)

    song = library_service.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    wav_path = settings.library_dir / song_id / f"{stem}.wav"
    if not wav_path.exists():
        raise HTTPException(status_code=404, detail="Stem not found")

    if format == "wav":
        return FileResponse(wav_path, filename=f"{song.title} - {stem}.wav")

    out_path = settings.library_dir / song_id / f"{stem}.{format}"
    if not out_path.exists():
        _convert_stem(wav_path, out_path, format)

    return FileResponse(out_path, filename=f"{song.title} - {stem}.{format}")


@router.get("/{song_id}/download-all")
async def download_all_stems(song_id: str, format: str = Query("wav")):
    _validate_song_id(song_id)
    _validate_format(format)

    song = library_service.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem in settings.stems:
            wav_path = settings.library_dir / song_id / f"{stem}.wav"
            if not wav_path.exists():
                continue
            if format == "wav":
                zf.write(wav_path, f"{song.title}/{stem}.wav")
            else:
                out_path = settings.library_dir / song_id / f"{stem}.{format}"
                if not out_path.exists():
                    _convert_stem(wav_path, out_path, format)
                zf.write(out_path, f"{song.title}/{stem}.{format}")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{song.title} - stems.zip"'},
    )
