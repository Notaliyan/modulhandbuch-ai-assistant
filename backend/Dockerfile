# ---------------------------------------------------------------------------
# Backend image: FastAPI + LangChain + ChromaDB RAG service
# ---------------------------------------------------------------------------
# Build context for this Dockerfile is the `backend/` directory.
# Python 3.12 is used deliberately: Python 3.14 broke native package builds
# (chromadb and its C-extension dependencies) during development.
# ---------------------------------------------------------------------------
FROM python:3.12-slim

# - PYTHONDONTWRITEBYTECODE: no .pyc files, smaller image
# - PYTHONUNBUFFERED: logs stream out immediately (so `docker logs` is live)
# - PIP_NO_CACHE_DIR: don't bloat the image layer with pip's download cache
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# build-essential: some Python wheels still need a compiler / headers.
# curl: used by the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies in their own layer FIRST. As long as requirements.txt
# is unchanged, Docker reuses this cached layer and code edits rebuild fast.
COPY requirements.txt ./requirements.txt
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

# Copy the application package.
COPY app ./app

# Ensure the data directories exist. The actual ChromaDB store and PDF are
# supplied at runtime via a bind mount (see docker-compose.yml), so the
# already-populated vector store is reused and NOT re-ingested.
RUN mkdir -p /app/data/docs /app/data/chroma

EXPOSE 8000

# A healthcheck lets docker-compose hold the frontend back until the API is
# genuinely ready (see `depends_on: condition: service_healthy`).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fs http://localhost:8000/api/health || exit 1

# No --reload here; that is a dev-only convenience, not for a built image.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
