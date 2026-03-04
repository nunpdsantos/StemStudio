"use client";
import type { SearchResult, SpotifyResult } from "@/lib/api";

interface SearchResultsProps {
  youtubeResults: SearchResult[];
  spotifyResults: SpotifyResult[];
  onAddSong: (url: string) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SearchResults({ youtubeResults, spotifyResults, onAddSong }: SearchResultsProps) {
  if (youtubeResults.length === 0 && spotifyResults.length === 0) return null;
  return (
    <div className="space-y-6">
      {youtubeResults.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">YouTube</h3>
          <div className="space-y-2">
            {youtubeResults.map((r, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors group">
                {r.thumbnail && <img src={r.thumbnail} alt="" className="w-16 h-12 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500">{r.channel} · {formatDuration(r.duration)}</p>
                </div>
                {r.quality && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.quality === "HQ" ? "bg-green-900 text-green-300" : "bg-zinc-700 text-zinc-300"}`}>{r.quality}</span>
                )}
                <button onClick={() => onAddSong(r.url)}
                  className="px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Separate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {spotifyResults.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Spotify (metadata)</h3>
          <div className="space-y-2">
            {spotifyResults.map((r, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-zinc-900">
                {r.thumbnail && <img src={r.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500">{r.artist} · {r.album} · {formatDuration(r.duration)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
