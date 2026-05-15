import asyncio
import sys

from rich.console import Console
from rich.prompt import Prompt

from app.agents.orchestrator import Jarvis
from app.config import settings

console = Console()


async def main() -> int:
    if not settings.has_any_provider():
        console.print(
            "[red]ERROR:[/red] Chưa có API key nào trong .env.\n"
            "Điền GEMINI_API_KEY hoặc ANTHROPIC_API_KEY vào file .env ở repo root."
        )
        return 1

    console.print(
        "[bold cyan]Jarvis[/bold cyan] đã sẵn sàng. "
        "Gõ [italic]exit[/italic] để thoát, [italic]/reset[/italic] để xóa ngữ cảnh.\n"
    )
    jarvis = Jarvis()

    while True:
        try:
            user_msg = Prompt.ask("[bold green]Bạn[/bold green]")
        except (KeyboardInterrupt, EOFError):
            console.print("\nTạm biệt.")
            return 0

        stripped = user_msg.strip()
        if not stripped:
            continue
        if stripped.lower() in {"exit", "quit", "/exit", "/quit"}:
            console.print("Tạm biệt.")
            return 0
        if stripped.lower() == "/reset":
            jarvis.reset()
            console.print("[yellow]Đã xóa ngữ cảnh.[/yellow]")
            continue

        console.print("[bold cyan]Jarvis[/bold cyan]: ", end="")
        try:
            async for chunk in jarvis.stream_reply(stripped):
                console.print(chunk, end="", soft_wrap=True, highlight=False)
        except Exception as exc:
            console.print(f"\n[red]Lỗi khi gọi LLM:[/red] {exc}")
            continue
        console.print()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
