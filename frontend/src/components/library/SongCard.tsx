"use client";
import type { Song } from "@/lib/api";

interface SongCardProps {
  song: Song;
  onOpen: (song: Song) => void;
  onDelete: (id: string) => void;
  processingState?: { phase: string; progress: number; message: string };
}

export function SongCard({ song, onOpen, onDelete, processingState }: SongCardProps) {
  const isReady = song.status === "done";
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors">
      {song.thumbnail ? (
        <img src={song.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover" />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 text-lg">&#9835;</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{song.title}</p>
        {song.artist && <p className="text-xs text-zinc-500">{song.artist}</p>}
        {processingState && song.status !== "done" && (
          <div className="mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">{processingState.phase}</span>
              <span className="text-zinc-500">{Math.round(processingState.progress)}%</span>
            </div>
            <div className="h-1 mt-1 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: `${processingState.progress}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {isReady && (
          <button onClick={() => onOpen(song)}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors">
            Open Mixer
          </button>
        )}
        <button onClick={() => onDelete(song.id)}
          className="px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 text-sm transition-colors">
          Delete
        </button>
      </div>
    </div>
  );
}
