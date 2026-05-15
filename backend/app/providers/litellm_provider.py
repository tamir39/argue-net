import os
from collections.abc import AsyncIterator

import litellm

from app.config import settings

if settings.gemini_api_key:
    os.environ["GEMINI_API_KEY"] = settings.gemini_api_key
if settings.anthropic_api_key:
    os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
os.environ.setdefault("OLLAMA_API_BASE", settings.ollama_base_url)

litellm.drop_params = True
litellm.suppress_debug_info = True


async def stream_completion(model: str, messages: list[dict]) -> AsyncIterator[str]:
    response = await litellm.acompletion(model=model, messages=messages, stream=True)
    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def complete(model: str, messages: list[dict]) -> str:
    response = await litellm.acompletion(model=model, messages=messages, stream=False)
    return response.choices[0].message.content or ""
