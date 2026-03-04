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
    source: str = ""
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
