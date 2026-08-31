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

# Copy the application package and the source PDF. Locally the data dir is
# bind-mounted (see docker-compose.yml) and this baked-in copy is shadowed.
# On a cloud host with no mount, the bundled PDF lets the app ingest on its
# first boot (see app.rag.ensure_ingested).
COPY app ./app
COPY data/docs ./data/docs
RUN mkdir -p /app/data/chroma

# Render/other hosts inject $PORT; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

# A healthcheck lets docker-compose hold the frontend back until the API is
# genuinely ready (see `depends_on: condition: service_healthy`).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fs "http://localhost:${PORT}/api/health" || exit 1

# Shell form so ${PORT} is expanded. --forwarded-allow-ips lets uvicorn trust
# the X-Forwarded-* headers set by the host's proxy (needed for real client
# IPs in rate limiting). No --reload: that is a dev-only convenience.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --forwarded-allow-ips '*'
