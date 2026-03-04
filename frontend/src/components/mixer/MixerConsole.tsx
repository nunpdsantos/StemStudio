"use client";

import { useEffect, useCallback } from "react";
import { ChannelStrip } from "./ChannelStrip";
import { Transport } from "./Transport";
import { useAudioEngine } from "@/hooks/useAudioEngine";

interface MixerConsoleProps {
  songId: string;
  songTitle: string;
}

const PRESETS: {
  label: string;
  config: Record<string, { gain: number; muted: boolean }>;
}[] = [
  {
    label: "Full Mix",
    config: {
      vocals: { gain: 1, muted: false },
      drums: { gain: 1, muted: false },
      bass: { gain: 1, muted: false },
      guitar: { gain: 1, muted: false },
      piano: { gain: 1, muted: false },
      other: { gain: 1, muted: false },
    },
  },
  {
    label: "No Vocals",
    config: {
      vocals: { gain: 0, muted: true },
      drums: { gain: 1, muted: false },
      bass: { gain: 1, muted: false },
      guitar: { gain: 1, muted: false },
      piano: { gain: 1, muted: false },
      other: { gain: 1, muted: false },
    },
  },
  {
    label: "Rhythm",
    config: {
      vocals: { gain: 0, muted: true },
      drums: { gain: 1, muted: false },
      bass: { gain: 1, muted: false },
      guitar: { gain: 0, muted: true },
      piano: { gain: 0, muted: true },
      other: { gain: 0, muted: true },
    },
  },
  {
    label: "Harmony",
    config: {
      vocals: { gain: 0, muted: true },
      drums: { gain: 0, muted: true },
      bass: { gain: 0, muted: true },
      guitar: { gain: 1, muted: false },
      piano: { gain: 1, muted: false },
      other: { gain: 0, muted: true },
    },
  },
  {
    label: "Vocals Only",
    config: {
      vocals: { gain: 1, muted: false },
      drums: { gain: 0, muted: true },
      bass: { gain: 0, muted: true },
      guitar: { gain: 0, muted: true },
      piano: { gain: 0, muted: true },
      other: { gain: 0, muted: true },
    },
  },
];

export function MixerConsole({ songId, songTitle }: MixerConsoleProps) {
  const engine = useAudioEngine(songId);

  useEffect(() => {
    engine.load();
  }, [songId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    engine.channels.forEach((ch, i) => {
      const cfg = preset.config[ch.name];
      if (cfg)
        engine.updateChannel(i, {
          gain: cfg.gain,
          muted: cfg.muted,
          soloed: false,
        });
    });
  };

  // Keyboard shortcuts (Task 11 — inlined)
  const togglePlay = useCallback(() => {
    if (engine.isPlaying) engine.pause();
    else engine.play();
  }, [engine]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          engine.seek(Math.max(0, engine.currentTime - 5));
          break;
        case "ArrowRight":
          engine.seek(Math.min(engine.duration, engine.currentTime + 5));
          break;
        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4":
        case "Digit5":
        case "Digit6": {
          const idx = parseInt(e.code.replace("Digit", "")) - 1;
          if (e.shiftKey) {
            engine.updateChannel(idx, {
              muted: !engine.channels[idx].muted,
            });
          } else {
            engine.updateChannel(idx, {
              soloed: !engine.channels[idx].soloed,
            });
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, engine]);

  if (!engine.isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading stems...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{songTitle}</h2>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs font-medium hover:text-white hover:bg-zinc-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <Transport
        isPlaying={engine.isPlaying}
        currentTime={engine.currentTime}
        duration={engine.duration}
        onPlay={() => engine.play()}
        onPause={() => engine.pause()}
        onSeek={(t) => engine.seek(t)}
      />
      <div className="flex gap-3 justify-center">
        {engine.channels.map((ch, i) => (
          <ChannelStrip
            key={ch.name}
            channel={ch}
            index={i}
            onUpdate={engine.updateChannel}
          />
        ))}
      </div>
    </div>
  );
}
