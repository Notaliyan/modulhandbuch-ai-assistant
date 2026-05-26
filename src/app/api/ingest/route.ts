// =============================================================================
// src/app/api/ingest/route.ts
// PDF Ingestion & Embedding Pipeline
//
// Pipeline:
//   FormData (PDF file)
//     → pdf-parse  (page-level text extraction)
//     → splitIntoChunks (recursive character splitter, 1000 chars / 200 overlap)
//     → OpenAI text-embedding-3-small (batched, 1536 dims)
//     → Prisma (insert chunk rows)
//     → $executeRaw (write vector(1536) column via pgvector)
//     → Document status → READY
//
// Prerequisites:
//   npm install pdf-parse openai @prisma/client
//   npm install -D @types/pdf-parse
//
//   In next.config.ts, add:
//     experimental: { serverExternalPackages: ["pdf-parse"] }
//
//   Required env vars:
//     DATABASE_URL, OPENAI_API_KEY
// =============================================================================

import { type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

// ── Constants ──────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-3-small" as const;
const EMBEDDING_DIMS  = 1536;
const CHUNK_SIZE      = 1000;  // characters
const CHUNK_OVERLAP   = 200;   // characters
const EMBED_BATCH     = 96;    // max texts per OpenAI embeddings request
const MAX_FILE_BYTES  = 50 * 1024 * 1024; // 50 MB hard cap

// ── OpenAI client ─────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageText {
  pageNumber: number; // 1-based
  text:       string;
}

interface TextChunk {
  content:    string;
  pageNumber: number; // inherited from the source page
  chunkIndex: number; // 0-based global index within the document
}

// ── Helper: PDF extraction ────────────────────────────────────────────────────

/**
 * Parse a PDF buffer and return the text of each page in order.
 *
 * Uses a dynamic import of pdf-parse to avoid Next.js build-time errors that
 * occur because pdf-parse tries to read a local test file at require() time.
 * The `serverExternalPackages` config option in next.config.ts is the
 * companion fix — both are needed together.
 */
async function extractPagesFromPDF(buffer: Buffer): Promise<PageText[]> {
  // Dynamic import prevents the build-time fs.readFileSync error
  const pdfParse = (await import("pdf-parse")).default;

  const pageTexts: string[] = [];

  /**
   * pdf-parse calls this function once per page with a PDF.js Page object.
   * We replicate pdf-parse's own default render but capture each page's
   * text individually before they are concatenated into `data.text`.
   */
  const pageRenderCallback = (pageData: {
    getTextContent: (opts?: {
      normalizeWhitespace?: boolean;
    }) => Promise<{
      items: Array<{ str: string; transform: number[] }>;
    }>;
  }): Promise<string> => {
    return pageData
      .getTextContent({ normalizeWhitespace: true })
      .then((content) => {
        let lastY: number | null = null;
        let pageText = "";

        for (const item of content.items) {
          const currentY = item.transform[5] ?? null;

          // Insert a newline whenever the vertical position changes noticeably
          // (i.e., a new text line in the PDF layout)
          if (lastY !== null && currentY !== null && Math.abs(lastY - currentY) > 2) {
            pageText += "\n";
          }

          pageText += item.str;
          lastY = currentY;
        }

        pageTexts.push(pageText);
        return pageText;
      });
  };

  await pdfParse(buffer, { pagerender: pageRenderCallback });

  return pageTexts.map((text, idx) => ({
    pageNumber: idx + 1,
    text:       text.trim(),
  }));
}

// ── Helper: Recursive character splitter ──────────────────────────────────────

/**
 * Splits `text` into overlapping chunks that are at most `chunkSize` characters
 * long, with `overlap` characters of lookback for cross-boundary context.
 *
 * Split preference order (most to least preferred break point):
 *   paragraph break → line break → sentence end → comma → word boundary
 *
 * This mirrors LangChain's RecursiveCharacterTextSplitter behaviour without
 * the external dependency.
 */
function splitIntoChunks(
  text:      string,
  chunkSize: number,
  overlap:   number,
): string[] {
  // Ordered list of preferred break characters
  const SEPARATORS = ["\n\n", "\n", ". ", ", ", " "] as const;

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const rawEnd    = Math.min(start + chunkSize, text.length);
    let   splitAt   = rawEnd;

    // If we're not at the very end of the string, hunt for a natural boundary
    // within the last 150 characters of the current window
    if (rawEnd < text.length) {
      const searchFrom   = Math.max(rawEnd - 150, start);
      const searchRegion = text.slice(searchFrom, rawEnd);

      for (const sep of SEPARATORS) {
        const idx = searchRegion.lastIndexOf(sep);
        if (idx !== -1) {
          // +sep.length so the separator is included with the preceding chunk
          splitAt = searchFrom + idx + sep.length;
          break;
        }
      }
    }

    const chunk = text.slice(start, splitAt).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Step forward while preserving `overlap` characters for context continuity
    start = Math.max(start + 1, splitAt - overlap);
  }

  return chunks;
}

// ── Helper: Page-aware chunking ───────────────────────────────────────────────

/**
 * Chunk each page of the document independently so every chunk carries an
 * accurate source page number for citation purposes.
 *
 * Chunking per-page rather than across the full concatenated text means a
 * chunk never spans a page boundary, which keeps [Page N] citations exact.
 */
function chunkDocument(
  pages:     PageText[],
  chunkSize: number,
  overlap:   number,
): TextChunk[] {
  const result: TextChunk[] = [];
  let   globalIndex = 0;

  for (const { pageNumber, text } of pages) {
    if (!text) continue; // skip blank pages (e.g. cover images)

    const pageChunks = splitIntoChunks(text, chunkSize, overlap);

    for (const content of pageChunks) {
      result.push({ content, pageNumber, chunkIndex: globalIndex++ });
    }
  }

  return result;
}

// ── Helper: Batch embedding ───────────────────────────────────────────────────

/**
 * Generate 1536-dimensional float embeddings for an array of text strings.
 *
 * OpenAI's embeddings endpoint accepts up to 2 048 strings per request but
 * we use a conservative batch size of 96 to stay well within token limits
 * for long handbook passages.
 *
 * The response `data` array is sorted by `index` to guarantee the output
 * order matches the input order (the API contract guarantees this, but we
 * sort defensively).
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);

    const response = await openai.embeddings.create({
      model:           EMBEDDING_MODEL,
      input:           batch,
      encoding_format: "float",
      dimensions:      EMBEDDING_DIMS,
    });

    const sorted = response.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((e)      => e.embedding);

    allEmbeddings.push(...sorted);
  }

  return allEmbeddings;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Track the created document ID so we can mark it FAILED on any error
  let documentId: string | null = null;

  try {
    // ── 1. Parse multipart form data ─────────────────────────────────────────

    const formData = await req.formData();
    const file     = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid 'file' field. Upload a PDF via multipart/form-data." },
        { status: 400 },
      );
    }

    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted. Received MIME type: " + file.type },
        { status: 415 },
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB size limit.` },
        { status: 413 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 },
      );
    }

    // ── 2. Create Document record in PROCESSING state ─────────────────────────

    // Sanitise filename: keep alphanumerics, dots, hyphens, underscores
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const document = await prisma.document.create({
      data: {
        filename:         safeFilename,
        originalName:     file.name,
        mimeType:         file.type || "application/pdf",
        fileSize:         file.size,
        processingStatus: "PROCESSING",
      },
    });

    documentId = document.id;

    // ── 3. Read file into a Node.js Buffer ───────────────────────────────────

    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // ── 4. Extract text, page by page ────────────────────────────────────────

    const pages = await extractPagesFromPDF(buffer);

    if (pages.length === 0 || pages.every((p) => p.text.length === 0)) {
      throw new Error(
        "No extractable text found in this PDF. " +
        "The file may be a scanned image-only PDF — run OCR before ingesting."
      );
    }

    // ── 5. Chunk the extracted text ───────────────────────────────────────────

    const chunks = chunkDocument(pages, CHUNK_SIZE, CHUNK_OVERLAP);

    if (chunks.length === 0) {
      throw new Error("Text extraction succeeded but produced zero chunks.");
    }

    // ── 6. Generate vector embeddings (batched) ───────────────────────────────

    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${chunks.length}, received ${embeddings.length}.`
      );
    }

    // ── 7. Persist chunks and write embeddings ────────────────────────────────
    //
    // For each chunk we:
    //   a) INSERT the text row with Prisma (returns the generated id)
    //   b) UPDATE the raw vector(1536) column with $executeRaw + Prisma.sql
    //      (parameterised — safe from SQL injection despite the raw template)
    //
    // We also stamp embeddedAt so we can distinguish un-embedded rows if an
    // interrupted run leaves orphan chunks without vectors.

    const now = new Date();

    for (let i = 0; i < chunks.length; i++) {
      const chunk     = chunks[i]!;
      const embedding = embeddings[i]!;

      // 7a. Insert the chunk row via the Prisma ORM client
      const savedChunk = await prisma.documentChunk.create({
        data: {
          documentId:     document.id,
          content:        chunk.content,
          pageNumber:     chunk.pageNumber,
          chunkIndex:     chunk.chunkIndex,
          tokenCount:     Math.ceil(chunk.content.length / 4), // rough estimate
          embeddingModel: EMBEDDING_MODEL,
          embeddedAt:     now,
        },
      });

      // 7b. Write the pgvector embedding into the raw vector(1536) column.
      //     Prisma.sql ensures the embedding string is properly parameterised
      //     and the ::vector cast is applied server-side by PostgreSQL.
      const vectorLiteral = `[${embedding.join(",")}]`;

      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE document_chunks
          SET    embedding = ${vectorLiteral}::vector
          WHERE  id        = ${savedChunk.id}
        `
      );
    }

    // ── 8. Mark document as READY ─────────────────────────────────────────────

    const finishedDoc = await prisma.document.update({
      where: { id: document.id },
      data:  {
        processingStatus: "READY",
        totalPages:       pages.length,
        totalChunks:      chunks.length,
      },
      select: {
        id:               true,
        filename:         true,
        processingStatus: true,
        totalPages:       true,
        totalChunks:      true,
        createdAt:        true,
      },
    });

    return NextResponse.json(
      {
        success:  true,
        document: finishedDoc,
      },
      { status: 201 },
    );

  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred during ingestion.";

    console.error("[INGEST ERROR]", {
      documentId,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Mark the document record as FAILED so the UI can surface the error
    if (documentId) {
      await prisma.document
        .update({
          where: { id: documentId },
          data:  {
            processingStatus: "FAILED",
            errorMessage:     message.slice(0, 1000),
          },
        })
        .catch((updateError: unknown) => {
          // Don't mask the original error — just log the secondary failure
          console.error("[INGEST] Failed to update document status to FAILED:", updateError);
        });
    }

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}