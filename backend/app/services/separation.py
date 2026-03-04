import torch
import demucs.api
from pathlib import Path
from app.config import settings
import threading

gpu_lock = threading.Lock()


class SeparationService:
    def __init__(self):
        self._separator = None

    def _get_separator(self) -> demucs.api.Separator:
        if self._separator is None:
            device = self._detect_device()
            self._separator = demucs.api.Separator(
                model=settings.default_model,
                device=device,
            )
        return self._separator

    def _detect_device(self) -> str:
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def separate(self, audio_path: Path, output_dir: Path,
                 progress_callback=None) -> dict[str, Path]:
        with gpu_lock:
            separator = self._get_separator()

            if progress_callback:
                progress_callback(0, "Loading audio")

            origin, separated = separator.separate_audio_file(str(audio_path))

            stem_paths = {}
            total_stems = len(separated)

            for i, (stem_name, audio_tensor) in enumerate(separated.items()):
                if progress_callback:
                    pct = ((i + 1) / total_stems) * 100
                    progress_callback(pct, f"Saving {stem_name}")

                output_path = output_dir / f"{stem_name}.wav"
                demucs.api.save_audio(
                    audio_tensor,
                    str(output_path),
                    samplerate=separator.samplerate,
                )
                stem_paths[stem_name] = output_path

            return stem_paths


separation_service = SeparationService()
