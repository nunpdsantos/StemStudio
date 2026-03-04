from fastapi import APIRouter, Query
from app.services.download import download_service
from app.models.schemas import SearchResult

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search", response_model=list[SearchResult])
async def search(q: str = Query(..., min_length=1)):
    results = download_service.search_youtube(q)
    return [SearchResult(**r) for r in results]
