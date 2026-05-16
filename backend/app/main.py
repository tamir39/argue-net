from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, health

app = FastAPI(title="ArgueNet", description="Nova orchestrator + multi-agent debate")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:4321",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:4321",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "ArgueNet", "see": "/docs"}
