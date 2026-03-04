import httpx
import base64
from app.config import settings


class SpotifyService:
    TOKEN_URL = "https://accounts.spotify.com/api/token"
    API_BASE = "https://api.spotify.com/v1"

    def __init__(self):
        self._token: str | None = None

    async def _get_token(self) -> str:
        if self._token:
            return self._token
        if not settings.spotify_client_id or not settings.spotify_client_secret:
            raise ValueError("Spotify credentials not configured")
        credentials = base64.b64encode(
            f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()
        ).decode()
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.TOKEN_URL,
                headers={"Authorization": f"Basic {credentials}"},
                data={"grant_type": "client_credentials"},
            )
            resp.raise_for_status()
            self._token = resp.json()["access_token"]
            return self._token

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        try:
            token = await self._get_token()
        except ValueError:
            return []
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.API_BASE}/search",
                params={"q": query, "type": "track", "limit": limit},
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401:
                self._token = None
                token = await self._get_token()
                resp = await client.get(
                    f"{self.API_BASE}/search",
                    params={"q": query, "type": "track", "limit": limit},
                    headers={"Authorization": f"Bearer {token}"},
                )
            resp.raise_for_status()
            tracks = resp.json().get("tracks", {}).get("items", [])
            return [
                {
                    "title": t["name"],
                    "artist": ", ".join(a["name"] for a in t["artists"]),
                    "album": t["album"]["name"],
                    "thumbnail": t["album"]["images"][0]["url"] if t["album"]["images"] else "",
                    "duration": t["duration_ms"] / 1000,
                    "spotify_id": t["id"],
                    "preview_url": t.get("preview_url", ""),
                }
                for t in tracks
            ]


spotify_service = SpotifyService()
