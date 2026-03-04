"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { stemUrl } from "@/lib/api";

export interface StemChannel {
  name: string;
  gain: number;
  pan: number;
  muted: boolean;
  soloed: boolean;
  color: string;
}

const STEM_COLORS: Record<string, string> = {
  vocals: "#3b82f6",
  drums: "#ef4444",
  bass: "#a855f7",
  guitar: "#f97316",
  piano: "#22c55e",
  other: "#71717a",
};

const STEMS = ["vocals", "drums", "bass", "guitar", "piano", "other"];

export function useAudioEngine(songId: string | null) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const sourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainsRef = useRef<Map<string, GainNode>>(new Map());
  const pannersRef = useRef<Map<string, StereoPannerNode>>(new Map());

  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  const [channels, setChannels] = useState<StemChannel[]>(
    STEMS.map((name) => ({
      name,
      gain: 1,
      pan: 0,
      muted: false,
      soloed: false,
      color: STEM_COLORS[name],
    }))
  );

  const load = useCallback(async () => {
    if (!songId) return;

    // Close previous AudioContext to prevent memory leak
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      await audioCtxRef.current.close();
    }
    buffersRef.current.clear();
    gainsRef.current.clear();
    pannersRef.current.clear();

    const ctx = new AudioContext({ sampleRate: 44100 });
    audioCtxRef.current = ctx;

    const loadBuffer = async (stem: string): Promise<[string, AudioBuffer]> => {
      const url = stemUrl(songId, stem);
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      return [stem, audioBuf];
    };

    const results = await Promise.all(STEMS.map(loadBuffer));
    for (const [name, buf] of results) {
      buffersRef.current.set(name, buf);
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner();
      gain.connect(panner);
      panner.connect(ctx.destination);
      gainsRef.current.set(name, gain);
      pannersRef.current.set(name, panner);
    }

    const firstBuf = results[0][1];
    setDuration(firstBuf.duration);
    setIsLoaded(true);
  }, [songId]);

  const play = useCallback(
    async (fromOffset?: number) => {
      const ctx = audioCtxRef.current;
      if (!ctx || !isLoaded) return;

      // Resume AudioContext suspended by Chrome/Safari autoplay policy
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Stop existing sources
      sourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      sourcesRef.current.clear();

      const offset = fromOffset ?? offsetRef.current;
      const startTime = ctx.currentTime;
      startTimeRef.current = startTime;
      offsetRef.current = offset;

      for (const stem of STEMS) {
        const buf = buffersRef.current.get(stem);
        const gain = gainsRef.current.get(stem);
        if (!buf || !gain) continue;

        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(gain);
        source.start(startTime, offset);
        sourcesRef.current.set(stem, source);
      }

      setIsPlaying(true);
    },
    [isLoaded]
  );

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - startTimeRef.current;
    offsetRef.current += elapsed;
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    sourcesRef.current.clear();
    setIsPlaying(false);
  }, []);

  const seek = useCallback(
    (time: number) => {
      offsetRef.current = time;
      setCurrentTime(time);
      if (isPlaying) {
        play(time);
      }
    },
    [isPlaying, play]
  );

  const updateChannel = useCallback(
    (index: number, updates: Partial<StemChannel>) => {
      setChannels((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        const anySoloed = next.some((c) => c.soloed);
        for (let i = 0; i < next.length; i++) {
          const ch = next[i];
          const gain = gainsRef.current.get(ch.name);
          const panner = pannersRef.current.get(ch.name);
          if (gain) {
            const audible = anySoloed ? ch.soloed : !ch.muted;
            gain.gain.value = audible ? ch.gain : 0;
          }
          if (panner) {
            panner.pan.value = ch.pan;
          }
        }
        return next;
      });
    },
    []
  );

  // Time update loop
  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (isPlaying && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
        const time = offsetRef.current + elapsed;
        setCurrentTime(time);
        if (time >= duration && duration > 0) {
          pause();
          offsetRef.current = 0;
          setCurrentTime(0);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration, pause]);

  // Cleanup
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      buffersRef.current.clear();
      if (audioCtxRef.current?.state !== "closed") {
        audioCtxRef.current?.close();
      }
    };
  }, []);

  return {
    isLoaded,
    isPlaying,
    currentTime,
    duration,
    channels,
    load,
    play,
    pause,
    seek,
    updateChannel,
  };
}
