import json
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from app.services.library import library_service
from app.services.pipeline import process_song
from app.models.schemas import Song, SongCreate
from app.config import settings

router = APIRouter(prefix="/api/songs", tags=["songs"])


@router.get("/", response_model=list[Song])
async def list_songs():
    return library_service.list_songs()


@router.post("/", response_model=Song)
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


@router.get("/{song_id}/events")
async def song_events(song_id: str):
    song = library_service.get_song(song_id)
    if not song:
        async def error_stream():
            yield f"event: error\ndata: {json.dumps({'phase': 'error', 'message': 'Song not found'})}\n\n"
        return StreamingResponse(
            error_stream(), media_type="text/event-stream",
        )

    source_url = song.source_url if song.source == "youtube" else None
    file_path = None
    if song.source == "upload":
        song_dir = settings.library_dir / song_id
        if song_dir.exists():
            for f in song_dir.iterdir():
                if f.stem == "upload":
                    file_path = f
                    break

    async def event_stream():
        async for event in process_song(song_id, url=source_url, file_path=file_path):
            yield f"event: {event.phase}\ndata: {json.dumps(event.to_dict())}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
