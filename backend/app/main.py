from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.routes.songs import router as songs_router
from app.routes.search import router as search_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure directories exist before StaticFiles mount resolves
    settings.library_dir.mkdir(parents=True, exist_ok=True)
    settings.models_dir.mkdir(parents=True, exist_ok=True)

    library_json = settings.library_dir / "library.json"
    if not library_json.exists():
        library_json.write_text("[]")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# StaticFiles checks directory existence at mount time, not at request time.
# Create library_dir eagerly so the mount doesn't blow up on import.
settings.library_dir.mkdir(parents=True, exist_ok=True)

app.include_router(songs_router)
app.include_router(search_router)

app.mount("/library", StaticFiles(directory=str(settings.library_dir)), name="library")


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.app_name}
