"""Retrieval-Augmented Generation engine.

Wraps a LangChain ConversationalRetrievalChain backed by a persisted
ChromaDB vector store. Exposes:

* ``ingest_pdfs``      - load PDFs from disk into the vector store.
* ``RagEngine.astream`` - async generator that yields answer tokens and,
                          finally, the list of source documents
                          (filename + page number).

The engine is designed for an SSE streaming endpoint: tokens are pushed
through an ``asyncio.Queue`` by a LangChain callback handler while the
chain runs in a background task.
"""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator, Optional

from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import PromptTemplate
from langchain.callbacks.base import AsyncCallbackHandler
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.config import settings

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a helpful assistant for the Deggendorf Institute \
of Technology (THD) module guide ("Modulhandbuch") for the Artificial \
Intelligence bachelor's programme.

Use ONLY the context below to answer the user's question. The context \
consists of excerpts from the official module guide.

Rules:
- Answer in clear, concise English.
- If the answer is not contained in the context, say that you could not \
find it in the module guide rather than guessing.
- When you state facts (ECTS, semester, examination type, lecturer, etc.), \
make sure they come from the context.
- Be precise and do not invent module codes or names.

Context:
{context}

Question: {question}

Helpful answer:"""

QA_PROMPT = PromptTemplate(
    template=SYSTEM_PROMPT,
    input_variables=["context", "question"],
)


# ---------------------------------------------------------------------------
# Streaming callback handler
# ---------------------------------------------------------------------------

class _QueueCallbackHandler(AsyncCallbackHandler):
    """Pushes new LLM tokens onto an asyncio queue as they are generated."""

    def __init__(self, queue: "asyncio.Queue[Optional[str]]") -> None:
        self._queue = queue

    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        await self._queue.put(token)


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

def _build_embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(
        model=settings.embedding_model,
        api_key=settings.openai_api_key,
    )


def get_vectorstore() -> Chroma:
    """Return the persisted Chroma vector store (creating it if empty)."""
    return Chroma(
        collection_name=settings.chroma_collection,
        embedding_function=_build_embeddings(),
        persist_directory=str(settings.chroma_dir),
    )


def ingest_pdfs() -> int:
    """Load every PDF in ``settings.docs_dir`` into the vector store.

    Returns the number of chunks written. Each chunk keeps the source
    filename and page number in its metadata so they can be surfaced as
    citations later.
    """
    settings.ensure_dirs()
    pdf_paths = sorted(settings.docs_dir.glob("*.pdf"))
    if not pdf_paths:
        raise FileNotFoundError(
            f"No PDF files found in {settings.docs_dir}. "
            "Place your Modulhandbuch PDF there and re-run ingestion."
        )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )

    all_chunks = []
    for pdf_path in pdf_paths:
        loader = PyPDFLoader(str(pdf_path))
        pages = loader.load()  # one Document per page
        for page in pages:
            # PyPDFLoader stores 0-indexed "page"; expose 1-indexed too.
            zero_indexed = page.metadata.get("page", 0)
            page.metadata["filename"] = pdf_path.name
            page.metadata["page_number"] = int(zero_indexed) + 1
        all_chunks.extend(splitter.split_documents(pages))

    vectorstore = get_vectorstore()
    vectorstore.add_documents(all_chunks)
    return len(all_chunks)


def ensure_ingested() -> None:
    """Populate the vector store on first run; no-op once it has documents.

    Safe to call on every startup. On a fresh deploy the persisted Chroma
    directory is empty, so this ingests the bundled PDF once (a few seconds
    and a fraction of a cent in embeddings). On later restarts the existing
    store is detected and reused.
    """
    store = get_vectorstore()
    try:
        if store.get(limit=1).get("ids"):
            return
    except Exception:  # noqa: BLE001 - treat any read failure as "empty"
        pass
    count = ingest_pdfs()
    print(f"[startup] ingested {count} chunks into ChromaDB")


# ---------------------------------------------------------------------------
# RAG engine
# ---------------------------------------------------------------------------

class RagEngine:
    """Conversational RAG engine with token streaming support."""

    def __init__(self) -> None:
        self._vectorstore = get_vectorstore()
        self._retriever = self._vectorstore.as_retriever(
            search_kwargs={"k": settings.retrieval_k},
        )

    def _build_chain(
        self,
        callback: _QueueCallbackHandler,
    ) -> ConversationalRetrievalChain:
        """Build a fresh chain bound to a streaming callback handler."""
        llm = ChatOpenAI(
            model=settings.chat_model,
            temperature=settings.temperature,
            api_key=settings.openai_api_key,
            streaming=True,
            callbacks=[callback],
        )
        memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True,
            output_key="answer",
        )
        return ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=self._retriever,
            memory=memory,
            return_source_documents=True,
            combine_docs_chain_kwargs={"prompt": QA_PROMPT},
        )

    async def astream(
        self,
        question: str,
    ) -> AsyncGenerator[dict, None]:
        """Stream the answer to ``question``.

        Yields dicts of the form:
            {"type": "token",   "data": "<partial text>"}
            {"type": "sources", "data": [{"filename": ..., "page": ...}, ...]}
            {"type": "done"}
            {"type": "error",   "data": "<message>"}
        """
        queue: "asyncio.Queue[Optional[str]]" = asyncio.Queue()
        callback = _QueueCallbackHandler(queue)
        chain = self._build_chain(callback)

        result_holder: dict = {}

        async def _run() -> None:
            try:
                result = await chain.ainvoke({"question": question})
                result_holder["result"] = result
            except Exception as exc:  # noqa: BLE001 - surface to caller
                result_holder["error"] = str(exc)
            finally:
                # Sentinel: no more tokens.
                await queue.put(None)

        task = asyncio.create_task(_run())

        # Drain tokens as the background task produces them.
        while True:
            token = await queue.get()
            if token is None:
                break
            yield {"type": "token", "data": token}

        await task

        if "error" in result_holder:
            yield {"type": "error", "data": result_holder["error"]}
            return

        result = result_holder.get("result", {})
        sources = []
        seen: set[tuple[str, int]] = set()
        for doc in result.get("source_documents", []):
            meta = doc.metadata or {}
            filename = meta.get("filename", "unknown.pdf")
            page = int(meta.get("page_number", meta.get("page", 0)))
            key = (filename, page)
            if key in seen:
                continue
            seen.add(key)
            sources.append({"filename": filename, "page": page})

        yield {"type": "sources", "data": sources}
        yield {"type": "done"}


# Lazily-created singleton so importing the module does not require an
# API key or a populated vector store.
_engine: Optional[RagEngine] = None


def get_engine() -> RagEngine:
    global _engine
    if _engine is None:
        _engine = RagEngine()
    return _engine
