import subprocess
import json
import re
from pathlib import Path


class DownloadService:
    def search_youtube(self, query: str, max_results: int = 10) -> list[dict]:
        cmd = [
            "yt-dlp", f"ytsearch{max_results}:{query}",
            "--dump-json", "--no-download", "--flat-playlist",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        results = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            try:
                data = json.loads(line)
                video_id = data.get("id", "")
                url = data.get("webpage_url") or (
                    f"https://www.youtube.com/watch?v={video_id}" if video_id else data.get("url", "")
                )
                results.append({
                    "title": data.get("title", ""),
                    "url": url,
                    "thumbnail": data.get("thumbnail", ""),
                    "duration": data.get("duration", 0) or 0,
                    "channel": data.get("channel", data.get("uploader", "")),
                    "quality": self._quality_label(data.get("abr", 0)),
                })
            except json.JSONDecodeError:
                continue
        return results

    def download_audio(self, url: str, output_dir: Path, progress_callback=None) -> Path:
        output_path = output_dir / "original.%(ext)s"
        cmd = [
            "yt-dlp", url,
            "-x", "--audio-format", "wav",
            "--audio-quality", "0",
            "-o", str(output_path),
            "--no-playlist",
            "--progress",
        ]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in process.stdout:
            if progress_callback and "%" in line:
                match = re.search(r"(\d+\.?\d*)%", line)
                if match:
                    progress_callback(float(match.group(1)))
        process.wait()
        if process.returncode != 0:
            raise RuntimeError(f"yt-dlp failed with code {process.returncode}")
        for f in output_dir.glob("original.*"):
            return f
        raise FileNotFoundError("Downloaded file not found")

    def _quality_label(self, abr) -> str:
        if not abr:
            return ""
        abr = float(abr)
        if abr >= 256:
            return "HQ"
        if abr >= 128:
            return "Good"
        return "Low"


download_service = DownloadService()
