from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

from app.config import settings

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic

_client: "AsyncAnthropic | None" = None


def _get_client() -> "AsyncAnthropic":
    global _client
    if _client is not None:
        return _client
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY chưa được cấu hình.")
    from anthropic import AsyncAnthropic

    _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _strip_prefix(model: str) -> str:
    if model.startswith("anthropic/"):
        return model[len("anthropic/") :]
    return model


def _split_system(messages: list[dict]) -> tuple[str | None, list[dict]]:
    system: str | None = None
    rest: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system = (system + "\n\n" + m["content"]) if system else m["content"]
        else:
            rest.append({"role": m["role"], "content": m["content"]})
    return system, rest


async def stream(model: str, messages: list[dict]) -> AsyncIterator[str]:
    client = _get_client()
    system, rest = _split_system(messages)
    kwargs: dict = {
        "model": _strip_prefix(model),
        "messages": rest,
        "max_tokens": 4096,
    }
    if system:
        kwargs["system"] = system
    async with client.messages.stream(**kwargs) as stream_ctx:
        async for text in stream_ctx.text_stream:
            yield text


async def complete(model: str, messages: list[dict]) -> str:
    client = _get_client()
    system, rest = _split_system(messages)
    kwargs: dict = {
        "model": _strip_prefix(model),
        "messages": rest,
        "max_tokens": 4096,
    }
    if system:
        kwargs["system"] = system
    response = await client.messages.create(**kwargs)
    if not response.content:
        return ""
    block = response.content[0]
    return getattr(block, "text", "") or ""
