"use client";
import type { Song } from "@/lib/api";

interface SongCardProps {
  song: Song;
  onOpen: (song: Song) => void;
  onDelete: (id: string) => void;
  processingState?: { phase: string; progress: number; message: string };
}

const STATUS_LABELS: Record<string, string> = {
  downloading: "Downloading...",
  preprocessing: "Normalizing audio...",
  separating: "Separating stems...",
  error: "Failed",
};

export function SongCard({ song, onOpen, onDelete, processingState }: SongCardProps) {
  const isReady = song.status === "done";
  const isProcessing = !isReady && song.status !== "error";
  const phase = processingState?.phase ?? song.status;
  const progress = processingState?.progress ?? 0;

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors">
      {song.thumbnail ? (
        <img
          src={song.thumbnail}
          alt=""
          className="shrink-0 rounded-lg object-cover"
          style={{ width: 56, height: 56 }}
        />
      ) : (
        <div
          className="shrink-0 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600 text-lg"
          style={{ width: 56, height: 56 }}
        >
          &#9835;
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{song.title}</p>
        {song.artist && <p className="text-xs text-zinc-500 truncate">{song.artist}</p>}
        {isProcessing && (
          <div className="mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">{STATUS_LABELS[phase] ?? phase}</span>
              {processingState && (
                <span className="text-zinc-500">{Math.round(progress)}%</span>
              )}
            </div>
            <div className="h-1 mt-1 rounded-full bg-zinc-800 overflow-hidden">
              {processingState ? (
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              ) : (
                <div className="h-full rounded-full bg-purple-500/60 animate-pulse" style={{ width: "60%" }} />
              )}
            </div>
          </div>
        )}
        {song.status === "error" && (
          <p className="text-xs text-red-400 mt-1 truncate">
            {song.error_message || "Processing failed"}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {isReady && (
          <button
            onClick={() => onOpen(song)}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Open Mixer
          </button>
        )}
        <button
          onClick={() => onDelete(song.id)}
          className="px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 text-sm transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
