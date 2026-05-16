from collections.abc import AsyncIterator

from app.agents.base import Agent
from app.agents.debaters import make_con, make_mediator, make_pro
from app.config import settings
from app.providers.litellm_provider import complete, stream_completion
from app.schemas.events import Speaker, StreamEvent

NOVA_SYSTEM = """Bạn là NOVA — trợ lý AI cá nhân, một ngôi sao bùng sáng dẫn đường cho người dùng.

Phong cách:
- Thông minh, lịch sự, hơi hài hước nhẹ.
- Trả lời ngắn gọn, đầy đủ. Tiếng Việt mặc định.
- Xưng "tôi", gọi người dùng là "bạn" (không phải "ngài").

Khi cần ý kiến đa chiều, NOVA triệu hồi nhóm tranh luận gồm:
- SOL (mặt trời) — tiếng nói ủng hộ, lạc quan.
- UMBRA (bóng tối) — tiếng nói phản biện, cẩn trọng.
- POLARIS (sao Bắc Đẩu) — người dẫn đường, tổng hợp công bằng.

Sau khi nghe SOL, UMBRA, POLARIS, bạn (NOVA) tổng hợp và đưa khuyến nghị
cuối kèm một bước hành động cụ thể."""

CLASSIFIER_PROMPT = """Người dùng vừa nói: "{msg}"

Câu này có cần nhiều quan điểm tranh luận không?
- DEBATE nếu là câu hỏi mở: có nên..., X hay Y, đánh giá lựa chọn, ưu/nhược điểm, nên/không nên.
- DIRECT cho câu thông tin đơn giản, chào hỏi, yêu cầu cụ thể, code, tính toán, dịch.

Trả lời CHỈ 1 từ: DEBATE hoặc DIRECT."""


class Nova:
    def __init__(self) -> None:
        self.agent = Agent(
            name="Nova",
            model=settings.jarvis_model,
            system_prompt=NOVA_SYSTEM,
        )

    def reset(self) -> None:
        self.agent.reset()

    async def _should_debate(self, msg: str) -> bool:
        try:
            verdict = await complete(
                self.agent.model,
                [{"role": "user", "content": CLASSIFIER_PROMPT.format(msg=msg)}],
            )
            return "DEBATE" in verdict.upper()
        except Exception:
            return False

    async def stream_reply(self, user_message: str) -> AsyncIterator[StreamEvent]:
        if await self._should_debate(user_message):
            async for ev in self._run_debate(user_message):
                yield ev
        else:
            async for ev in self._direct_reply(user_message):
                yield ev

    async def _direct_reply(self, user_message: str) -> AsyncIterator[StreamEvent]:
        messages = self.agent.build_messages(user_message)
        collected: list[str] = []
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
        yield StreamEvent(
            speaker="jarvis",
            text="Đang triệu hồi Sol, Umbra và Polaris...",
            kind="info",
        )

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
            f'SOL mở đầu: {sol_first[0]}\n\n'
            f'UMBRA phản biện: {umbra_first[0]}\n\n'
            f'SOL bổ sung: {sol_second[0]}\n\n'
            "Tổng hợp theo đúng vai Polaris — người dẫn đường công bằng."
        )
        async for ev in self._stream_agent(mediator, med_prompt, "mediator", polaris_out):
            yield ev

        nova_prompt = (
            f'Cuộc tranh luận về "{topic}" vừa kết thúc.\n\n'
            f'SOL: {sol_first[0]}\n'
            f'UMBRA: {umbra_first[0]}\n'
            f'SOL bổ sung: {sol_second[0]}\n'
            f'POLARIS: {polaris_out[0]}\n\n'
            "Đưa khuyến nghị cuối cùng cho người dùng — 2-3 câu, kèm 1 hành động "
            "cụ thể họ nên làm tiếp."
        )
        messages = self.agent.build_messages(nova_prompt)
        collected: list[str] = []
        async for chunk in stream_completion(self.agent.model, messages):
            collected.append(chunk)
            yield StreamEvent(speaker="jarvis", text=chunk)

        self.agent.remember("user", topic)
        self.agent.remember("assistant", "".join(collected).strip())
