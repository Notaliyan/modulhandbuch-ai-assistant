"""Application configuration.

Loads settings from environment variables and a local .env file.
All paths are resolved relative to the backend/ directory so the app
behaves the same regardless of the current working directory.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> parents[1] == backend/
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Central settings object for the RAG backend."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- OpenAI ---------------------------------------------------------
    openai_api_key: str = ""
    chat_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    temperature: float = 0.0

    # --- Retrieval ------------------------------------------------------
    # Number of chunks fetched from the vector store per query.
    retrieval_k: int = 4
    # Text splitter parameters used during ingestion.
    chunk_size: int = 1000
    chunk_overlap: int = 150

    # --- Paths ----------------------------------------------------------
    # Where the PDF(s) to ingest live.
    docs_dir: Path = BACKEND_DIR / "data" / "docs"
    # Where the persisted ChromaDB collection is stored.
    chroma_dir: Path = BACKEND_DIR / "data" / "chroma"
    chroma_collection: str = "modulhandbuch"

    # --- Server / CORS --------------------------------------------------
    host: str = "127.0.0.1"
    port: int = 8000
    # Vite dev server default origin.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    def ensure_dirs(self) -> None:
        """Create the data directories if they do not yet exist."""
        self.docs_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)


# Single shared instance imported across the app.
settings = Settings()
settings.ensure_dirs()
