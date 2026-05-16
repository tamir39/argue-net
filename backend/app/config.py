from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")

    jarvis_model: str = Field(default="gemini/gemini-2.5-flash", alias="JARVIS_MODEL")
    pro_agent_model: str = Field(default="gemini/gemini-2.5-flash", alias="PRO_AGENT_MODEL")
    con_agent_model: str = Field(default="gemini/gemini-2.5-flash", alias="CON_AGENT_MODEL")
    mediator_model: str = Field(default="gemini/gemini-2.5-flash", alias="MEDIATOR_MODEL")

    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    def has_any_provider(self) -> bool:
        return bool(self.gemini_api_key or self.anthropic_api_key)


settings = Settings()
