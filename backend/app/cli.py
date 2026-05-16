import sys

print("Loading Nova (lan dau ~5-10s)...", flush=True)

import asyncio  # noqa: E402

from rich.console import Console  # noqa: E402

from app.agents.orchestrator import Nova  # noqa: E402
from app.config import settings  # noqa: E402

console = Console(force_terminal=True, soft_wrap=True)

SPEAKER_STYLE: dict[str, tuple[str, str]] = {
    "jarvis": ("bold cyan", "Nova"),
    "pro": ("bold green", "Sol"),
    "con": ("bold red", "Umbra"),
    "mediator": ("bold yellow", "Polaris"),
    "system": ("dim", "System"),
}


def print_speaker_header(speaker: str) -> None:
    style, label = SPEAKER_STYLE.get(speaker, ("white", speaker))
    console.print(f"\n[{style}]{label}[/{style}]: ", end="")
    sys.stdout.flush()


def print_info(text: str) -> None:
    console.print(f"\n[dim italic]» {text}[/dim italic]")
    sys.stdout.flush()


async def chat_loop(nova: Nova) -> None:
    while True:
        sys.stdout.write("\nBạn: ")
        sys.stdout.flush()
        try:
            user_msg = input()
        except (KeyboardInterrupt, EOFError):
            print("\nTạm biệt.")
            return

        stripped = user_msg.strip()
        if not stripped:
            continue
        if stripped.lower() in {"exit", "quit", "/exit", "/quit"}:
            print("Tạm biệt.")
            return
        if stripped.lower() == "/reset":
            nova.reset()
            print("(Đã xóa ngữ cảnh.)")
            continue

        last_speaker: str | None = None
        try:
            async for ev in nova.stream_reply(stripped):
                if ev.kind == "info":
                    print_info(ev.text)
                    last_speaker = None
                    continue
                if ev.speaker != last_speaker:
                    print_speaker_header(ev.speaker)
                    last_speaker = ev.speaker
                console.print(ev.text, end="", highlight=False)
                sys.stdout.flush()
        except Exception as exc:
            print(f"\n[Lỗi khi gọi LLM] {exc}")
            continue
        print()


async def main() -> int:
    if not settings.has_any_provider():
        print(
            "ERROR: Chưa có API key. Điền GEMINI_API_KEY hoặc "
            "ANTHROPIC_API_KEY vào .env ở repo root."
        )
        return 1

    print(
        "Nova đã sẵn sàng. Câu hỏi mở ('có nên ...', 'X hay Y') sẽ kích hoạt "
        "Sol / Umbra / Polaris. Gõ 'exit' để thoát, '/reset' để xóa ngữ cảnh.",
        flush=True,
    )

    nova = Nova()
    await chat_loop(nova)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
