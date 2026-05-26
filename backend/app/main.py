"""FastAPI application entrypoint.

Endpoints
---------
GET  /api/health  - liveness/readiness probe.
POST /api/query   - ask a question; the answer streams back via
                    Server-Sent Events (SSE).

Run locally:
    uvicorn app.main:app --reload
"""

from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.rag import get_engine

app = FastAPI(
    title="Modulhandbuch RAG API",
    description="Retrieval-Augmented Generation over the THD AI module guide.",
    version="0.1.0",
)

# --- CORS ------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Schemas ---------------------------------------------------------------

class QueryRequest(BaseModel):
    """Body for POST /api/query."""

    question: str = Field(..., min_length=1, description="User question.")


# --- Routes ----------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict:
    """Simple health check.

    Reports whether an OpenAI API key is configured. It does NOT return
    the key itself.
    """
    return {
        "status": "ok",
        "chat_model": settings.chat_model,
        "embedding_model": settings.embedding_model,
        "openai_key_configured": bool(settings.openai_api_key),
        "chroma_collection": settings.chroma_collection,
    }


@app.post("/api/query")
async def query(request: QueryRequest) -> EventSourceResponse:
    """Stream an answer to the user's question via Server-Sent Events.

    Event stream
    ------------
    event: token   data: {"text": "..."}        (many)
    event: sources data: {"sources": [...]}      (once, near the end)
    event: done    data: {}                      (once)
    event: error   data: {"message": "..."}      (only on failure)
    """
    engine = get_engine()

    async def event_generator() -> AsyncGenerator[dict, None]:
        try:
            async for item in engine.astream(request.question):
                kind = item["type"]
                if kind == "token":
                    yield {
                        "event": "token",
                        "data": json.dumps({"text": item["data"]}),
                    }
                elif kind == "sources":
                    yield {
                        "event": "sources",
                        "data": json.dumps({"sources": item["data"]}),
                    }
                elif kind == "done":
                    yield {"event": "done", "data": json.dumps({})}
                elif kind == "error":
                    yield {
                        "event": "error",
                        "data": json.dumps({"message": item["data"]}),
                    }
        except Exception as exc:  # noqa: BLE001 - never crash the stream
            yield {
                "event": "error",
                "data": json.dumps({"message": str(exc)}),
            }

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/")
async def root() -> dict:
    """Root convenience route."""
    return {
        "service": "Modulhandbuch RAG API",
        "docs": "/docs",
        "health": "/api/health",
    }
