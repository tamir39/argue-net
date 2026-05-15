from dataclasses import dataclass, field


@dataclass
class Agent:
    name: str
    model: str
    system_prompt: str
    history: list[dict] = field(default_factory=list)

    def build_messages(self, user_message: str | None = None) -> list[dict]:
        msgs: list[dict] = [{"role": "system", "content": self.system_prompt}]
        msgs.extend(self.history)
        if user_message is not None:
            msgs.append({"role": "user", "content": user_message})
        return msgs

    def remember(self, role: str, content: str) -> None:
        self.history.append({"role": role, "content": content})

    def reset(self) -> None:
        self.history.clear()
