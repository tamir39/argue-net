import asyncio
import os
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services import whisper

router = APIRouter()


@router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)) -> dict[str, str]:
    if audio.size is not None and audio.size > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio quá lớn (>25MB).")

    contents = await audio.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Audio rỗng.")

    suffix = ".webm"
    name = audio.filename or ""
    for candidate in (".webm", ".ogg", ".m4a", ".mp3", ".wav"):
        if name.lower().endswith(candidate):
            suffix = candidate
            break

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(contents)
        path = f.name

    try:
        text = await asyncio.to_thread(whisper.transcribe, path, "vi")
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    return {"text": text}
