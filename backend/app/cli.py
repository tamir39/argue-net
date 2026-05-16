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


def print_help() -> None:
    print(
        "\nLệnh:\n"
        "  exit                            — thoát\n"
        "  /reset                          — xóa ngữ cảnh hội thoại\n"
        "  /model                          — xem model hiện tại của Nova/Sol/Umbra/Polaris\n"
        "  /model <tên-model>              — đổi tất cả agents sang model mới\n"
        "  /model <vai> <tên-model>        — đổi 1 agent (vai = nova|sol|umbra|polaris)\n"
        "\nVí dụ model: gemini/gemini-2.5-flash, gemini/gemini-2.0-flash-lite,\n"
        "             gemini/gemini-flash-latest, gemini/gemini-2.5-pro\n",
        flush=True,
    )


def handle_model_command(nova: "Nova", cmd: str) -> None:
    parts = cmd.split()
    if len(parts) == 1:
        for name, model in nova.list_models().items():
            print(f"  {name:8s} → {model}")
        return
    if len(parts) == 2:
        try:
            nova.set_model("all", parts[1])
            print(f"(Đổi tất cả sang {parts[1]})")
        except ValueError as e:
            print(f"(Lỗi: {e})")
        return
    if len(parts) == 3:
        try:
            nova.set_model(parts[1], parts[2])
            print(f"({parts[1]} → {parts[2]})")
        except ValueError as e:
            print(f"(Lỗi: {e})")
        return
    print("(Cú pháp: /model | /model <model> | /model <vai> <model>)")


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
        if stripped.lower().startswith("/model"):
            handle_model_command(nova, stripped)
            continue
        if stripped.lower() in {"/help", "?"}:
            print_help()
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
        "Sol / Umbra / Polaris.\n"
        "Lệnh: exit | /reset | /model | /help",
        flush=True,
    )

    nova = Nova()
    await chat_loop(nova)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
