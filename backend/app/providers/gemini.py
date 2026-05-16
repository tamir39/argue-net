from collections.abc import AsyncIterator

import google.generativeai as genai

from app.config import settings

_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY chưa được cấu hình.")
    genai.configure(api_key=settings.gemini_api_key)
    _configured = True


def _strip_prefix(model: str) -> str:
    return model[len("gemini/") :] if model.startswith("gemini/") else model


def _to_history(messages: list[dict]) -> tuple[str | None, list[dict], str]:
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


def _make_model(model: str, system: str | None) -> "genai.GenerativeModel":
    return genai.GenerativeModel(
        model_name=_strip_prefix(model),
        system_instruction=system,
    )


async def stream(model: str, messages: list[dict]) -> AsyncIterator[str]:
    _ensure_configured()
    system, history, user_text = _to_history(messages)
    gm = _make_model(model, system)
    chat = gm.start_chat(history=history)
    response = await chat.send_message_async(user_text, stream=True)
    async for chunk in response:
        try:
            text = chunk.text
        except (ValueError, AttributeError):
            continue
        if text:
            yield text


async def complete(model: str, messages: list[dict]) -> str:
    _ensure_configured()
    system, history, user_text = _to_history(messages)
    gm = _make_model(model, system)
    chat = gm.start_chat(history=history)
    response = await chat.send_message_async(user_text)
    try:
        return response.text or ""
    except (ValueError, AttributeError):
        return ""
