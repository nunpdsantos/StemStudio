"use client";
import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };
  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a song..."
        className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors" />
      <button type="submit" disabled={isLoading || !query.trim()}
        className="px-6 py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        {isLoading ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
