import json
import uuid
import shutil
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
        songs = [s for s in self._read() if s["id"] != song_id]
        self._write(songs)
        song_dir = settings.library_dir / song_id
        if song_dir.exists():
            shutil.rmtree(song_dir)


library_service = LibraryService()
