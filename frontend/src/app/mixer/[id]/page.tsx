"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MixerConsole } from "@/components/mixer/MixerConsole";
import type { Song } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5222";

export default function MixerPage() {
  const params = useParams();
  const songId = params.id as string;
  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/songs/${songId}`)
      .then((r) => r.json())
      .then(setSong);
  }, [songId]);

  if (!song)
    return <div className="p-6 text-zinc-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800">
        <a href="/" className="text-zinc-500 hover:text-white text-sm">
          &larr; Back
        </a>
        <h1 className="text-xl font-bold tracking-tight">StemStudio</h1>
      </header>
      <main className="p-6 max-w-5xl mx-auto">
        <MixerConsole songId={songId} songTitle={song.title} />
      </main>
    </div>
  );
}
