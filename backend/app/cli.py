import asyncio
import sys

from rich.console import Console
from rich.prompt import Prompt

from app.agents.orchestrator import Jarvis
from app.config import settings
from app.schemas.events import StreamEvent

console = Console()

SPEAKER_STYLE: dict[str, tuple[str, str]] = {
    "jarvis": ("bold cyan", "Jarvis"),
    "pro": ("bold green", "Pro"),
    "con": ("bold red", "Con"),
    "mediator": ("bold yellow", "Mediator"),
    "system": ("dim", "System"),
}


def print_speaker_header(speaker: str) -> None:
    style, label = SPEAKER_STYLE.get(speaker, ("white", speaker))
    console.print(f"\n[{style}]{label}[/{style}]: ", end="")


def print_info(text: str) -> None:
    console.print(f"\n[dim italic]» {text}[/dim italic]")


async def chat_loop(jarvis: Jarvis) -> None:
    while True:
        try:
            user_msg = Prompt.ask("\n[bold green]Bạn[/bold green]")
        except (KeyboardInterrupt, EOFError):
            console.print("\nTạm biệt.")
            return

        stripped = user_msg.strip()
        if not stripped:
            continue
        if stripped.lower() in {"exit", "quit", "/exit", "/quit"}:
            console.print("Tạm biệt.")
            return
        if stripped.lower() == "/reset":
            jarvis.reset()
            console.print("[yellow]Đã xóa ngữ cảnh.[/yellow]")
            continue

        last_speaker: str | None = None
        try:
            async for ev in jarvis.stream_reply(stripped):
                if ev.kind == "info":
                    print_info(ev.text)
                    last_speaker = None
                    continue
                if ev.speaker != last_speaker:
                    print_speaker_header(ev.speaker)
                    last_speaker = ev.speaker
                console.print(ev.text, end="", soft_wrap=True, highlight=False)
        except Exception as exc:
            console.print(f"\n[red]Lỗi khi gọi LLM:[/red] {exc}")
            continue
        console.print()


async def main() -> int:
    if not settings.has_any_provider():
        console.print(
            "[red]ERROR:[/red] Chưa có API key. Điền GEMINI_API_KEY hoặc "
            "ANTHROPIC_API_KEY vào .env ở repo root."
        )
        return 1

    console.print(
        "[bold cyan]Jarvis[/bold cyan] đã sẵn sàng. "
        "Câu hỏi mở (vd: 'có nên dùng X?') sẽ kích hoạt nhóm Pro/Con/Mediator. "
        "[italic]exit[/italic] để thoát, [italic]/reset[/italic] để xóa ngữ cảnh."
    )

    jarvis = Jarvis()
    await chat_loop(jarvis)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
