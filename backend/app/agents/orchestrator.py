from collections.abc import AsyncIterator

from app.agents.base import Agent
from app.agents.debaters import make_con, make_mediator, make_pro
from app.config import settings
from app.providers import stream_completion
from app.schemas.events import Speaker, StreamEvent

NOVA_SYSTEM = """Bạn là Nova — trợ lý AI cá nhân.

Trả lời tự nhiên, ngắn gọn, hữu ích. Tiếng Việt mặc định, đổi ngôn ngữ
nếu người dùng đổi. Không bịa khi không chắc.

Bạn có một đội tranh luận có thể triệu hồi gồm Sol (ủng hộ), Umbra
(phản biện), Polaris (trung gian). KHÔNG triệu hồi tự động.

Khi gặp câu hỏi mở / so sánh / cần nhiều quan điểm (ví dụ: "X hay Y",
"có nên ...", "đánh giá ..."), bạn:
1. Cho ý kiến ngắn của riêng bạn trước (2-3 câu).
2. Hỏi lại người dùng có muốn triệu hồi nhóm tranh luận để đào sâu
   không.

Câu đơn giản (chào hỏi, info, code, dịch, mô tả, kể chuyện) thì trả
lời thẳng, không đề cập đến đội."""


# ─────────────────────────────────────────────────────────────
# Heuristics for the "offer + confirm → run debate" flow
# ─────────────────────────────────────────────────────────────

_AFFIRMATIVE_TOKENS = (
    "có",
    "vâng",
    "ừ",
    "ừm",
    "uh",
    "ok",
    "okay",
    "okie",
    "yes",
    "yep",
    "yeah",
    "được",
    "đồng ý",
    "đúng",
    "phải",
    "triệu hồi",
    "tranh luận",
    "đào sâu",
    "phân tích",
    "đi",
    "cho xem",
    "muốn",
)
_NEGATIVE_TOKENS = (
    "không",
    "thôi",
    "khỏi",
    "no",
    "nope",
    "khong",
    "đừng",
)


def _is_affirmation(msg: str) -> bool:
    m = msg.strip().lower()
    if not m:
        return False
    words = m.split()
    if len(words) > 6:
        return False
    if any(neg in m for neg in _NEGATIVE_TOKENS):
        return False
    return any(tok in m for tok in _AFFIRMATIVE_TOKENS)


_OFFER_HINTS = (
    "triệu hồi",
    "nhóm tranh luận",
    "đào sâu",
    "phân tích sâu",
    "đa chiều",
    "đồng đội",
    "sol",
    "umbra",
    "polaris",
)


def _did_offer_debate(response: str) -> bool:
    lower = response.lower()
    if "?" not in response:
        return False
    return any(hint in lower for hint in _OFFER_HINTS)


# ─────────────────────────────────────────────────────────────


class Nova:
    def __init__(self) -> None:
        self.agent = Agent(
            name="Nova",
            model=settings.jarvis_model,
            system_prompt=NOVA_SYSTEM,
        )
        self.pending_debate_topic: str | None = None

    def reset(self) -> None:
        self.agent.reset()
        self.pending_debate_topic = None

    def set_model(self, role: str, model: str) -> None:
        role = role.lower()
        if role in {"all", "*"}:
            self.agent.model = model
            settings.pro_agent_model = model
            settings.con_agent_model = model
            settings.mediator_model = model
        elif role in {"nova", "jarvis"}:
            self.agent.model = model
        elif role in {"sol", "pro"}:
            settings.pro_agent_model = model
        elif role in {"umbra", "con"}:
            settings.con_agent_model = model
        elif role in {"polaris", "mediator"}:
            settings.mediator_model = model
        else:
            raise ValueError(f"Vai trò không hợp lệ: {role}")

    def list_models(self) -> dict[str, str]:
        return {
            "Nova": self.agent.model,
            "Sol": settings.pro_agent_model,
            "Umbra": settings.con_agent_model,
            "Polaris": settings.mediator_model,
        }

    async def stream_reply(self, user_message: str) -> AsyncIterator[StreamEvent]:
        # User is confirming a pending debate offer
        if self.pending_debate_topic and _is_affirmation(user_message):
            topic = self.pending_debate_topic
            self.pending_debate_topic = None
            yield StreamEvent(
                speaker="jarvis",
                text=f"Triệu hồi nhóm tranh luận về: {topic}",
                kind="info",
            )
            self.agent.remember("user", user_message)
            self.agent.remember(
                "assistant",
                f"(Đang triệu hồi nhóm tranh luận về: {topic})",
            )
            async for ev in self._run_debate(topic):
                yield ev
            return

        # Otherwise: clear stale pending, stream Nova's direct reply
        self.pending_debate_topic = None
        collected: list[str] = []
        async for ev in self._direct_reply(user_message, collected):
            yield ev

        # If Nova's response asked to summon the team, remember the
        # original topic so the next affirmation triggers debate.
        full = "".join(collected)
        if _did_offer_debate(full):
            self.pending_debate_topic = user_message

    async def _direct_reply(
        self, user_message: str, collected: list[str]
    ) -> AsyncIterator[StreamEvent]:
        messages = self.agent.build_messages(user_message)
        async for chunk in stream_completion(self.agent.model, messages):
            collected.append(chunk)
            yield StreamEvent(speaker="jarvis", text=chunk)
        self.agent.remember("user", user_message)
        self.agent.remember("assistant", "".join(collected))

    async def _stream_agent(
        self,
        agent: Agent,
        user_prompt: str,
        speaker: Speaker,
        out: list[str],
    ) -> AsyncIterator[StreamEvent]:
        messages = agent.build_messages(user_prompt)
        collected: list[str] = []
        async for chunk in stream_completion(agent.model, messages):
            collected.append(chunk)
            yield StreamEvent(speaker=speaker, text=chunk)
        full = "".join(collected).strip()
        agent.remember("user", user_prompt)
        agent.remember("assistant", full)
        out.append(full)

    async def _run_debate(self, topic: str) -> AsyncIterator[StreamEvent]:
        pro = make_pro()
        con = make_con()
        mediator = make_mediator()

        sol_first: list[str] = []
        async for ev in self._stream_agent(
            pro,
            f'Chủ đề: "{topic}". Hãy đưa quan điểm ỦNG HỘ.',
            "pro",
            sol_first,
        ):
            yield ev

        umbra_first: list[str] = []
        async for ev in self._stream_agent(
            con,
            f'Chủ đề: "{topic}".\nSol vừa nói: "{sol_first[0]}"\nPhản biện ngắn gọn.',
            "con",
            umbra_first,
        ):
            yield ev

        sol_second: list[str] = []
        async for ev in self._stream_agent(
            pro,
            f'Umbra vừa phản biện: "{umbra_first[0]}"\nBổ sung hoặc phản biện lại, tối đa 3 câu.',
            "pro",
            sol_second,
        ):
            yield ev

        polaris_out: list[str] = []
        med_prompt = (
            f'Chủ đề: "{topic}"\n\n'
            f"SOL mở đầu: {sol_first[0]}\n\n"
            f"UMBRA phản biện: {umbra_first[0]}\n\n"
            f"SOL bổ sung: {sol_second[0]}\n\n"
            "Tổng hợp theo đúng vai Polaris — người dẫn đường công bằng."
        )
        async for ev in self._stream_agent(mediator, med_prompt, "mediator", polaris_out):
            yield ev

        nova_prompt = (
            f'Cuộc tranh luận về "{topic}" vừa kết thúc.\n\n'
            f"SOL: {sol_first[0]}\n"
            f"UMBRA: {umbra_first[0]}\n"
            f"SOL bổ sung: {sol_second[0]}\n"
            f"POLARIS: {polaris_out[0]}\n\n"
            "Đưa khuyến nghị cuối cùng cho người dùng — 2-3 câu, kèm 1 hành động "
            "cụ thể họ nên làm tiếp."
        )
        messages = self.agent.build_messages(nova_prompt)
        collected: list[str] = []
        async for chunk in stream_completion(self.agent.model, messages):
            collected.append(chunk)
            yield StreamEvent(speaker="jarvis", text=chunk)

        self.agent.remember("assistant", "".join(collected).strip())
