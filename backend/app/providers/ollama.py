import json
from collections.abc import AsyncIterator

import httpx

from app.config import settings


def _strip_prefix(model: str) -> str:
    if model.startswith("ollama/"):
        return model[len("ollama/") :]
    return model


async def stream(model: str, messages: list[dict]) -> AsyncIterator[str]:
    url = settings.ollama_base_url.rstrip("/") + "/api/chat"
    payload = {
        "model": _strip_prefix(model),
        "messages": messages,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if data.get("done"):
                    return
                content = data.get("message", {}).get("content")
                if content:
                    yield content


async def complete(model: str, messages: list[dict]) -> str:
    url = settings.ollama_base_url.rstrip("/") + "/api/chat"
    payload = {
        "model": _strip_prefix(model),
        "messages": messages,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
    return data.get("message", {}).get("content", "")
