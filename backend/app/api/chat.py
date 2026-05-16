import json
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.agents.orchestrator import Nova
from app.config import settings

router = APIRouter()

_SESSIONS: dict[str, Nova] = {}


def _get_or_create(session_id: str) -> Nova:
    nova = _SESSIONS.get(session_id)
    if nova is None:
        nova = Nova()
        _SESSIONS[session_id] = nova
    return nova


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=8000)


class ResetRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)


class ModelRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=1, max_length=32)
    model: str = Field(min_length=1, max_length=128)


@router.post("/chat")
async def chat(req: Annotated[ChatRequest, Body()]) -> EventSourceResponse:
    if not settings.has_any_provider():
        raise HTTPException(status_code=500, detail="No LLM provider configured")

    nova = _get_or_create(req.session_id)

    async def event_stream() -> AsyncGenerator[dict, None]:
        try:
            async for ev in nova.stream_reply(req.message):
                yield {
                    "data": json.dumps(
                        {"speaker": ev.speaker, "text": ev.text, "kind": ev.kind}
                    )
                }
        except Exception as exc:
            yield {"event": "error", "data": json.dumps({"error": str(exc)})}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_stream())


@router.post("/sessions/reset")
def reset_session(req: ResetRequest) -> dict[str, str]:
    nova = _SESSIONS.get(req.session_id)
    if nova is not None:
        nova.reset()
    return {"status": "ok"}


@router.get("/sessions/{session_id}/models")
def get_models(session_id: str) -> dict[str, str]:
    return _get_or_create(session_id).list_models()


@router.post("/sessions/model")
def set_model(req: ModelRequest) -> dict[str, str]:
    nova = _get_or_create(req.session_id)
    try:
        nova.set_model(req.role, req.model)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return nova.list_models()
