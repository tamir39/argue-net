from dataclasses import dataclass
from typing import Literal

Speaker = Literal["jarvis", "pro", "con", "mediator", "system"]
EventKind = Literal["token", "info"]


@dataclass(frozen=True)
class StreamEvent:
    speaker: Speaker
    text: str
    kind: EventKind = "token"
