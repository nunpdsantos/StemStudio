"use client";

interface TransportProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Transport({
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onSeek,
}: TransportProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onSeek(Math.max(0, currentTime - 5))}
        className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm transition-colors"
      >
        -5s
      </button>
      <button
        onClick={isPlaying ? onPause : onPlay}
        className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center text-lg font-bold hover:bg-zinc-200 transition-colors"
      >
        {isPlaying ? "\u23F8" : "\u25B6"}
      </button>
      <button
        onClick={() => onSeek(Math.min(duration, currentTime + 5))}
        className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-sm transition-colors"
      >
        +5s
      </button>
      <div className="flex-1 flex items-center gap-3">
        <span className="text-xs text-zinc-500 tabular-nums w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration * 1000}
          value={currentTime * 1000}
          onChange={(e) => onSeek(Number(e.target.value) / 1000)}
          className="flex-1 h-1 appearance-none cursor-pointer rounded-full bg-zinc-700 accent-white"
        />
        <span className="text-xs text-zinc-500 tabular-nums w-10">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
