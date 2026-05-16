"""Multi-provider dispatcher with cross-provider fallback.

Model identifiers carry their provider as a prefix:
    gemini/<model>      → Google Gemini
    anthropic/<model>   → Anthropic Claude
    claude-...          → Anthropic Claude (no prefix needed)
    ollama/<model>      → Local Ollama HTTP API

Unprefixed strings default to Gemini for backward compat.
"""

import sys
from collections.abc import AsyncIterator

from app.config import settings


FALLBACK_MODELS: list[str] = [
    "gemini/gemini-2.5-flash",
    "gemini/gemini-2.5-flash-lite",
    "gemini/gemini-2.0-flash-lite",
    "gemini/gemini-flash-latest",
    "gemini/gemini-2.0-flash",
    "anthropic/claude-haiku-4-5-20251001",
    "ollama/llama3",
]


def _detect_provider(model: str) -> str:
    if model.startswith("gemini/"):
        return "gemini"
    if (
        model.startswith("anthropic/")
        or model.startswith("claude/")
        or model.startswith("claude-")
    ):
        return "anthropic"
    if model.startswith("ollama/"):
        return "ollama"
    return "gemini"


def _provider_available(name: str) -> bool:
    if name == "gemini":
        return bool(settings.gemini_api_key)
    if name == "anthropic":
        return bool(settings.anthropic_api_key)
    if name == "ollama":
        return True
    return False


def _get_module(name: str):
    from app.providers import anthropic_provider, gemini, ollama

    if name == "anthropic":
        return anthropic_provider
    if name == "ollama":
        return ollama
    return gemini


def _is_transient_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return (
        "429" in msg
        or "quota" in msg
        or "rate" in msg
        or "resource_exhausted" in msg
        or "timeout" in msg
        or "503" in msg
        or "502" in msg
        or "504" in msg
    )


def _build_chain(primary: str) -> list[str]:
    seen: set[str] = set()
    chain: list[str] = []
    for m in [primary, *FALLBACK_MODELS]:
        if m in seen:
            continue
        if not _provider_available(_detect_provider(m)):
            continue
        seen.add(m)
        chain.append(m)
    return chain


def _note_switch(primary: str, fallback: str, reason: str) -> None:
    short = reason[:90].replace("\n", " ")
    print(
        f"\n[auto-fallback] {primary} → {fallback}   ({short})",
        file=sys.stderr,
        flush=True,
    )


async def stream_completion(model: str, messages: list[dict]) -> AsyncIterator[str]:
    chain = _build_chain(model)
    if not chain:
        raise RuntimeError(
            "Không có provider nào khả dụng. Hãy đặt GEMINI_API_KEY hoặc "
            "ANTHROPIC_API_KEY trong .env, hoặc chạy Ollama local."
        )

    last_exc: BaseException | None = None
    for i, candidate in enumerate(chain):
        yielded_any = False
        try:
            provider = _get_module(_detect_provider(candidate))
            async for chunk in provider.stream(candidate, messages):
                yielded_any = True
                yield chunk
            return
        except Exception as e:
            if _is_transient_error(e) and not yielded_any and i < len(chain) - 1:
                last_exc = e
                _note_switch(candidate, chain[i + 1], str(e))
                continue
            raise
    if last_exc:
        raise last_exc


async def complete(model: str, messages: list[dict]) -> str:
    chain = _build_chain(model)
    if not chain:
        raise RuntimeError("Không có provider nào khả dụng.")

    last_exc: BaseException | None = None
    for i, candidate in enumerate(chain):
        try:
            provider = _get_module(_detect_provider(candidate))
            return await provider.complete(candidate, messages)
        except Exception as e:
            if _is_transient_error(e) and i < len(chain) - 1:
                last_exc = e
                _note_switch(candidate, chain[i + 1], str(e))
                continue
            raise
    if last_exc:
        raise last_exc
    return ""
