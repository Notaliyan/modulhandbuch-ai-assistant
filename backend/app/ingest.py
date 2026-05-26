"""One-time ingestion script.

Run from the backend/ directory:
    python -m app.ingest
"""

from app.rag import ingest_pdfs

if __name__ == "__main__":
    print("Starting ingestion...")
    count = ingest_pdfs()
    print(f"✅ Done — {count} chunks written to ChromaDB.")