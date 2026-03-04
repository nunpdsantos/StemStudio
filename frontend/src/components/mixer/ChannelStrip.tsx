"use client";
import type { StemChannel } from "@/hooks/useAudioEngine";

interface ChannelStripProps {
  channel: StemChannel;
  index: number;
  onUpdate: (index: number, updates: Partial<StemChannel>) => void;
}

export function ChannelStrip({ channel, index, onUpdate }: ChannelStripProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-zinc-900 w-28">
      <span
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: channel.color }}
      >
        {channel.name}
      </span>
      <div className="relative h-48 w-6 flex items-center justify-center">
        <input
          type="range"
          min={0}
          max={100}
          value={channel.gain * 100}
          onChange={(e) =>
            onUpdate(index, { gain: Number(e.target.value) / 100 })
          }
          className="absolute h-48 w-6 appearance-none cursor-pointer"
          style={{
            writingMode: "vertical-lr",
            direction: "rtl",
            accentColor: channel.color,
          }}
        />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums">
        {Math.round(channel.gain * 100)}%
      </span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-zinc-600">L</span>
        <input
          type="range"
          min={-100}
          max={100}
          value={channel.pan * 100}
          onChange={(e) =>
            onUpdate(index, { pan: Number(e.target.value) / 100 })
          }
          className="w-16 h-1 appearance-none cursor-pointer rounded-full bg-zinc-700"
          style={{ accentColor: channel.color }}
        />
        <span className="text-[10px] text-zinc-600">R</span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onUpdate(index, { soloed: !channel.soloed })}
          className={`w-8 h-7 rounded text-xs font-bold transition-colors ${
            channel.soloed
              ? "bg-yellow-500 text-black"
              : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          S
        </button>
        <button
          onClick={() => onUpdate(index, { muted: !channel.muted })}
          className={`w-8 h-7 rounded text-xs font-bold transition-colors ${
            channel.muted
              ? "bg-red-500 text-white"
              : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          }`}
        >
          M
        </button>
      </div>
    </div>
  );
}
