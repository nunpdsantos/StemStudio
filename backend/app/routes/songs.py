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
