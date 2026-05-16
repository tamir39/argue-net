import sys
from collections.abc import AsyncIterator

import google.generativeai as genai

from app.config import settings

if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)


FALLBACK_MODELS: list[str] = [
    "gemini/gemini-2.5-flash",
    "gemini/gemini-2.5-flash-lite",
    "gemini/gemini-2.0-flash-lite",
    "gemini/gemini-flash-latest",
    "gemini/gemini-2.0-flash",
]


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "quota" in msg or "resource_exhausted" in msg or "rate" in msg


def _build_chain(primary: str) -> list[str]:
    seen: set[str] = set()
    chain: list[str] = []
    for m in [primary, *FALLBACK_MODELS]:
        if m not in seen:
            seen.add(m)
            chain.append(m)
    return chain


def _note_switch(primary: str, fallback: str, reason: str) -> None:
    print(
        f"\n[auto-fallback] {primary} hết quota → đổi sang {fallback}",
        file=sys.stderr,
        flush=True,
    )


def _strip_gemini_prefix(model: str) -> str:
    return model[len("gemini/") :] if model.startswith("gemini/") else model


def _to_gemini_history(messages: list[dict]) -> tuple[str | None, list[dict], str]:
    system_text: str | None = None
    history: list[dict] = []
    last_user = ""
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if role == "system":
            system_text = (system_text + "\n\n" + content) if system_text else content
        elif role == "user":
            last_user = content
            history.append({"role": "user", "parts": [content]})
        elif role == "assistant":
            history.append({"role": "model", "parts": [content]})
    if history and history[-1]["role"] == "user":
        history.pop()
    return system_text, history, last_user


def _make_model(model: str, system: str | None) -> genai.GenerativeModel:
    return genai.GenerativeModel(
        model_name=_strip_gemini_prefix(model),
        system_instruction=system,
    )


async def stream_completion(model: str, messages: list[dict]) -> AsyncIterator[str]:
    chain = _build_chain(model)
    last_exc: Exception | None = None
    system, history, user_text = _to_gemini_history(messages)

    for i, candidate in enumerate(chain):
        yielded_any = False
        try:
            gemini_model = _make_model(candidate, system)
            chat = gemini_model.start_chat(history=history)
            response = await chat.send_message_async(user_text, stream=True)
            async for chunk in response:
                if chunk.text:
                    yielded_any = True
                    yield chunk.text
            return
        except Exception as e:
            if _is_quota_error(e) and not yielded_any and i < len(chain) - 1:
                last_exc = e
                _note_switch(candidate, chain[i + 1], "quota")
                continue
            raise
    if last_exc:
        raise last_exc


async def complete(model: str, messages: list[dict]) -> str:
    chain = _build_chain(model)
    last_exc: Exception | None = None
    system, history, user_text = _to_gemini_history(messages)

    for i, candidate in enumerate(chain):
        try:
            gemini_model = _make_model(candidate, system)
            chat = gemini_model.start_chat(history=history)
            response = await chat.send_message_async(user_text)
            return response.text or ""
        except Exception as e:
            if _is_quota_error(e) and i < len(chain) - 1:
                last_exc = e
                _note_switch(candidate, chain[i + 1], "quota")
                continue
            raise
    if last_exc:
        raise last_exc
    return ""
