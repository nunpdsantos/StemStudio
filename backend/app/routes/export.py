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
