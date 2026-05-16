# ArgueNet

A "Jarvis-like" multi-agent AI conversational system. **Nova** is the main orchestrator; when a question needs multiple perspectives, Nova summons three sub-agents — **Sol** (optimistic, pro), **Umbra** (cautious, contra), and **Polaris** (neutral synthesizer) — to debate before recommending. Voice-capable (planned).

## Status

**Phase 0 — Bootstrap.** Repo skeleton only. No runtime code yet.

See the implementation roadmap below.

## Vision

```
User  ⇄  Nova (orchestrator)
              │
              ├── decides: direct answer OR debate
              │
              └── summons:  Sol (Pro)  ⇄  Umbra (Con)  ⇄  Polaris (Mediator)
                                │            │              │
                                └────────────┴──────────────┘
                                            ↓
                                     Nova synthesizes
                                            ↓
                                       reply to user
```

- **Frontend**: Next.js 15 (App Router) + Tailwind + shadcn/ui.
- **Backend**: FastAPI + Python 3.11, SSE streaming.
- **Providers**: Gemini, Claude (Anthropic), Ollama (local) — via LiteLLM.
- **Voice** (later): browser-native Web Speech API first; ElevenLabs / Whisper later.

## Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Bootstrap repo, gitignore, env template | ☐ |
| 1 | CLI MVP: streaming chat with Gemini | ☐ |
| 2 | Multi-agent debate loop in CLI | ☐ |
| 3 | FastAPI + Next.js web UI | ☐ |
| 4 | Multi-provider routing per agent | ☐ |
| 5 | Voice in/out (Web Speech API) | ☐ |
| 6 | Polish: tools, memory, wake word | ☐ |

## Getting started (post-Phase 1)

```bash
# Backend
cd backend
uv sync
cp ../.env.example ../.env   # fill in keys
uv run python -m app.cli

# Frontend (Phase 3+)
cd frontend
npm install
npm run dev
```

## Project structure

```
ArgueNet/
├── backend/        # FastAPI + agents (Python)
├── frontend/       # Next.js chat UI (Phase 3+)
├── .env.example
└── README.md
```

## Branch policy

- All work happens on `develop` and feature branches off `develop`.
- `main` is reserved for shipped releases.

## License

TBD.
