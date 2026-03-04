"use client";
import { useState, useCallback } from "react";

interface UploadZoneProps {
  onUpload: (file: File) => void;
}

export function UploadZone({ onUpload }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  }, [onUpload]);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-white bg-zinc-800" : "border-zinc-700 hover:border-zinc-500"}`}>
      <input type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aac,.wma,.opus"
        onChange={handleChange} className="hidden" id="file-upload" />
      <label htmlFor="file-upload" className="cursor-pointer">
        <p className="text-zinc-400 text-sm">{isDragging ? "Drop your audio file here" : "Drag & drop an audio file, or click to browse"}</p>
        <p className="text-zinc-600 text-xs mt-1">MP3, WAV, FLAC, M4A, OGG, AAC, WMA, OPUS</p>
      </label>
    </div>
  );
}
