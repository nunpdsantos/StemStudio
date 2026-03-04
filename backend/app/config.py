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
    supported_formats: list[str] = [
        ".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma", ".opus"
    ]
    spotify_client_id: str = ""
    spotify_client_secret: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
