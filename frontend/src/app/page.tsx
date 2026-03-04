"use client";

import { useState } from "react";

type Tab = "search" | "library";

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-6 px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold tracking-tight">StemStudio</h1>
        <nav className="flex gap-1">
          {(["search", "library"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {tab === "search" && <div>Search tab placeholder</div>}
        {tab === "library" && <div>Library tab placeholder</div>}
      </main>
    </div>
  );
}
