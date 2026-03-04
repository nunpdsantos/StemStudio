import torch
import soundfile as sf
import numpy as np
from pathlib import Path
from app.config import settings
import threading

gpu_lock = threading.Lock()


class SeparationService:
    def __init__(self):
        self._model = None
        self._device = None

    def _get_model(self):
        if self._model is None:
            from demucs.pretrained import get_model
            self._device = self._detect_device()
            self._model = get_model(settings.default_model)
            self._model.to(self._device)
        return self._model

    def _detect_device(self) -> str:
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def separate(self, audio_path: Path, output_dir: Path,
                 progress_callback=None) -> dict[str, Path]:
        from demucs.apply import apply_model

        with gpu_lock:
            model = self._get_model()

            if progress_callback:
                progress_callback(0, "Loading audio")

            # Load audio with soundfile (avoids torchaudio backend issues)
            audio_np, sr = sf.read(str(audio_path), dtype="float32")
            # soundfile returns (samples, channels), torch wants (channels, samples)
            if audio_np.ndim == 1:
                audio_np = audio_np[:, np.newaxis]
            wav = torch.from_numpy(audio_np.T)

            # Resample if needed
            if sr != model.samplerate:
                import torchaudio
                wav = torchaudio.functional.resample(wav, sr, model.samplerate)

            # Add batch dimension: (channels, samples) -> (1, channels, samples)
            ref = wav.mean(0)
            wav = (wav - ref.mean()) / ref.std()
            wav = wav.unsqueeze(0).to(self._device)

            if progress_callback:
                progress_callback(10, "Separating stems")

            # Apply model
            sources = apply_model(model, wav, device=self._device, progress=True)
            sources = sources * ref.std() + ref.mean()

            # Save each stem
            stem_paths = {}
            for i, stem_name in enumerate(model.sources):
                if progress_callback:
                    pct = 10 + ((i + 1) / len(model.sources)) * 90
                    progress_callback(pct, f"Saving {stem_name}")

                output_path = output_dir / f"{stem_name}.wav"
                stem_audio = sources[0, i].cpu()  # Remove batch dim, move to CPU
                # Save with soundfile (avoids torchaudio TorchCodec requirement)
                audio_np = stem_audio.numpy().T  # (channels, samples) -> (samples, channels)
                sf.write(str(output_path), audio_np, model.samplerate)
                stem_paths[stem_name] = output_path

            return stem_paths


separation_service = SeparationService()
