"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { UploadZone } from "@/components/search/UploadZone";
import { SongCard } from "@/components/library/SongCard";
import {
  searchYouTube, searchSpotify, listSongs, addSong, uploadSong, deleteSong,
  streamSongEvents,
} from "@/lib/api";
import type { SearchResult, SpotifyResult, Song } from "@/lib/api";

type Tab = "search" | "library";

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  const [ytResults, setYtResults] = useState<SearchResult[]>([]);
  const [spResults, setSpResults] = useState<SpotifyResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [processingStates, setProcessingStates] = useState<Record<string, { phase: string; progress: number; message: string }>>({});

  // Load library on mount and when switching to library tab
  useEffect(() => {
    listSongs().then(setSongs).catch(console.error);
  }, [tab]);

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const [yt, sp] = await Promise.all([searchYouTube(query), searchSpotify(query)]);
      setYtResults(yt);
      setSpResults(sp);
    } catch (e) {
      console.error("Search failed:", e);
    }
    setIsSearching(false);
  };

  const startProcessing = useCallback((songId: string) => {
    const es = streamSongEvents(songId, (data) => {
      setProcessingStates((prev) => ({ ...prev, [songId]: data }));
      if (data.phase === "done" || data.phase === "error") {
        es.close();
        listSongs().then(setSongs).catch(console.error);
      }
    });
  }, []);

  const handleAddSong = async (url: string) => {
    const song = await addSong(url);
    setSongs((prev) => [song, ...prev]);
    setTab("library");
    startProcessing(song.id);
  };

  const handleUpload = async (file: File) => {
    const song = await uploadSong(file);
    setSongs((prev) => [song, ...prev]);
    setTab("library");
    startProcessing(song.id);
  };

  const handleOpen = (song: Song) => {
    router.push(`/mixer/${song.id}`);
  };

  const handleDelete = async (id: string) => {
    await deleteSong(id);
    setSongs((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight">StemStudio</h1>
        <nav className="flex gap-1">
          {(["search", "library"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}>
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {tab === "search" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <SearchBar onSearch={handleSearch} isLoading={isSearching} />
            <UploadZone onUpload={handleUpload} />
            <SearchResults youtubeResults={ytResults} spotifyResults={spResults} onAddSong={handleAddSong} />
          </div>
        )}
        {tab === "library" && (
          <div className="max-w-3xl mx-auto space-y-3">
            {songs.length === 0 ? (
              <p className="text-zinc-500 text-center py-12">No songs yet. Search or upload to get started.</p>
            ) : (
              songs.map((song) => (
                <SongCard key={song.id} song={song} onOpen={handleOpen} onDelete={handleDelete}
                  processingState={processingStates[song.id]} />
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
