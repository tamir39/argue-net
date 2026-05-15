from collections.abc import AsyncIterator

from app.agents.base import Agent
from app.config import settings
from app.providers.litellm_provider import stream_completion

JARVIS_SYSTEM = """Bạn là Jarvis — trợ lý AI cá nhân của người dùng, lấy cảm hứng từ J.A.R.V.I.S. trong Iron Man.

Phong cách:
- Thông minh, lịch sự, hơi hài hước nhẹ.
- Trả lời ngắn gọn nhưng đầy đủ. Tránh lan man.
- Mặc định dùng tiếng Việt, trừ khi người dùng đổi ngôn ngữ.
- Khi không chắc chắn, nói "Tôi chưa chắc" thay vì bịa.

Vai trò trong dự án ArgueNet:
- Bạn là agent điều phối chính.
- Phase 1 (hiện tại): chỉ trò chuyện một-một, chưa triệu hồi agent phụ.
- Phase 2 trở đi: khi gặp câu hỏi mở (vd "có nên...", "X hay Y", "ưu nhược điểm"),
  bạn sẽ triệu hồi nhóm tranh luận — nhưng chưa làm bây giờ."""


class Jarvis:
    def __init__(self) -> None:
        self.agent = Agent(
            name="Jarvis",
            model=settings.jarvis_model,
            system_prompt=JARVIS_SYSTEM,
        )

    async def stream_reply(self, user_message: str) -> AsyncIterator[str]:
        messages = self.agent.build_messages(user_message)
        collected: list[str] = []
        async for chunk in stream_completion(self.agent.model, messages):
            collected.append(chunk)
            yield chunk
        self.agent.remember("user", user_message)
        self.agent.remember("assistant", "".join(collected))

    def reset(self) -> None:
        self.agent.reset()
