const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5222";

export interface Song {
  id: string;
  title: string;
  artist: string;
  source: string;
  source_url: string;
  duration: number;
  thumbnail: string;
  status: "pending" | "downloading" | "separating" | "done" | "error";
  model: string;
  stems: string[];
  error_message: string;
  bpm: number | null;
  key: string | null;
}

export interface SearchResult {
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  channel: string;
  quality: string;
}

export interface SpotifyResult {
  title: string;
  artist: string;
  album: string;
  thumbnail: string;
  duration: number;
  spotify_id: string;
  preview_url: string;
}

export async function searchYouTube(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function searchSpotify(query: string): Promise<SpotifyResult[]> {
  const res = await fetch(`${API_BASE}/api/search/spotify?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function listSongs(): Promise<Song[]> {
  const res = await fetch(`${API_BASE}/api/songs/`);
  return res.json();
}

export async function addSong(url: string): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}

export async function uploadSong(file: File): Promise<Song> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/songs/upload`, { method: "POST", body: form });
  return res.json();
}

export async function deleteSong(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/songs/${id}`, { method: "DELETE" });
}

export function streamSongEvents(songId: string, onEvent: (data: { phase: string; progress: number; message: string }) => void): EventSource {
  const es = new EventSource(`${API_BASE}/api/songs/${songId}/events`);
  for (const event of ["downloading", "preprocessing", "separating", "done", "error"]) {
    es.addEventListener(event, (e) => {
      onEvent(JSON.parse((e as MessageEvent).data));
    });
  }
  return es;
}

export function stemUrl(songId: string, stem: string): string {
  return `${API_BASE}/library/${songId}/${stem}.wav`;
}
