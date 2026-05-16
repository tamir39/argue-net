"""Lazy-loaded faster-whisper model for server-side STT.

The model downloads from HuggingFace on first use (~150MB for `base`).
We use int8 quantisation on CPU — fast enough for short utterances
on a normal laptop without GPU.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")

_model: "WhisperModel | None" = None


def get_model() -> "WhisperModel":
    global _model
    if _model is not None:
        return _model
    from faster_whisper import WhisperModel

    _model = WhisperModel(
        WHISPER_MODEL_SIZE,
        device="cpu",
        compute_type="int8",
    )
    return _model


def transcribe(audio_path: str, language: str | None = "vi") -> str:
    model = get_model()
    segments, _info = model.transcribe(
        audio_path,
        language=language,
        beam_size=1,
        vad_filter=True,
    )
    return "".join(s.text for s in segments).strip()
