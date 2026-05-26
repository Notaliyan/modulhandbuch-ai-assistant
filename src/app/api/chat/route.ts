// =============================================================================
// src/app/api/chat/route.ts
// Semantic Search & Streaming Chat Engine
//
// Pipeline:
//   JSON body { question, history, documentId? }
//     → Zod validation
//     → OpenAI text-embedding-3-small  (query vectorisation)
//     → pgvector cosine similarity     ($queryRaw, top-4 chunks)
//     → Anti-hallucination system prompt construction
//     → GPT-4o streaming completion    (streamed back as text/plain)
//
// Prerequisites:
//   npm install openai zod @prisma/client
//
//   Required env vars:
//     DATABASE_URL, OPENAI_API_KEY
// =============================================================================

import { type NextRequest, NextResponse } from "next/server";
import { Prisma }                         from "@prisma/client";
import OpenAI                             from "openai";
import { z }                             from "zod";
import { prisma }                         from "@/lib/prisma";

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL  = "text-embedding-3-small" as const;
const EMBEDDING_DIMS   = 1536;
const CHAT_MODEL       = "gpt-4o"                 as const;
const TOP_K            = 4;    // number of chunks to retrieve
const MAX_CHAT_TOKENS  = 1024; // max tokens in the assistant's reply
const TEMPERATURE      = 0.1;  // near-deterministic for factual academic answers

// ── OpenAI client ─────────────────────────────────────────────────────────────

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ── Input validation schemas ──────────────────────────────────────────────────

const MessageSchema = z.object({
  role:    z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(32_000),
});

const ChatRequestSchema = z.object({
  /** The user's current question */
  question: z
    .string()
    .min(1,     "Question cannot be empty.")
    .max(4_000, "Question exceeds the 4 000-character limit."),

  /** Prior conversation turns for multi-turn context (optional) */
  history: z
    .array(MessageSchema)
    .max(50, "History cannot exceed 50 messages.")
    .optional()
    .default([]),

  /** If provided, restrict the vector search to this document's chunks */
  documentId: z.string().cuid("Invalid documentId.").optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatRequest = z.infer<typeof ChatRequestSchema>;

interface RetrievedChunk {
  id:         string;
  content:    string;
  pageNumber: number;
  similarity: number; // cosine similarity in [0, 1]
}

// ── Helper: query embedding ───────────────────────────────────────────────────

/**
 * Convert the user's raw question into a 1536-dimensional float vector using
 * the same model that was used during ingestion (text-embedding-3-small).
 *
 * Matching embedding models is mandatory — mixing models produces meaningless
 * distance comparisons and will silently return wrong results.
 */
async function embedQuery(question: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model:           EMBEDDING_MODEL,
    input:           question.trim(),
    encoding_format: "float",
    dimensions:      EMBEDDING_DIMS,
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Expected a ${EMBEDDING_DIMS}-dimensional embedding from OpenAI but received ` +
      `${embedding?.length ?? 0} dimensions.`
    );
  }

  return embedding;
}

// ── Helper: vector similarity search ─────────────────────────────────────────

/**
 * Retrieve the `topK` most semantically similar chunks from the database using
 * pgvector's cosine distance operator `<=>` (lower value = more similar).
 *
 * The similarity score returned is the cosine SIMILARITY (1 − distance),
 * rounded to 4 decimal places for readable logging and response headers.
 *
 * When `documentId` is provided the search is scoped to that document's chunks;
 * otherwise the query searches across all indexed documents.
 *
 * Security note: The vector literal is passed as a Prisma.sql parameter.
 * PostgreSQL receives it as a bound parameter and applies the ::vector cast
 * server-side — no string interpolation reaches the wire.
 */
async function retrieveRelevantChunks(
  queryEmbedding: number[],
  topK:           number,
  documentId?:    string,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  if (documentId) {
    return prisma.$queryRaw<RetrievedChunk[]>(
      Prisma.sql`
        SELECT
          id,
          content,
          "pageNumber",
          ROUND(
            CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS NUMERIC),
            4
          ) AS similarity
        FROM  document_chunks
        WHERE "documentId" = ${documentId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${topK}
      `
    );
  }

  return prisma.$queryRaw<RetrievedChunk[]>(
    Prisma.sql`
      SELECT
        id,
        content,
        "pageNumber",
        ROUND(
          CAST(1 - (embedding <=> ${vectorLiteral}::vector) AS NUMERIC),
          4
        ) AS similarity
      FROM  document_chunks
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `
  );
}

// ── Helper: system prompt construction ───────────────────────────────────────

/**
 * Builds the anti-hallucination system prompt that wraps the retrieved context
 * chunks and enforces strict citation and fallback behaviour on the model.
 *
 * Design rationale:
 * - Each context block is labelled with its page number so the model can emit
 *   precise [Page N] citations without guessing.
 * - The instruction list is numbered so the model treats them as hard rules
 *   rather than soft suggestions.
 * - The exact fallback string is quoted verbatim so the model can pattern-match
 *   against it when it has no valid answer.
 */
function buildSystemPrompt(chunks: RetrievedChunk[]): string {
  const contextSection = chunks
    .map(
      (chunk, i) =>
        `### Context Block ${i + 1}  |  Source: Page ${chunk.pageNumber}\n` +
        chunk.content.trim()
    )
    .join("\n\n---\n\n");

  return `\
You are a precise, authoritative academic assistant embedded in a university module handbook Q&A system.

Your sole source of truth is the context extracted directly from official university module handbooks and provided below. You have no access to any external knowledge.

## RETRIEVED CONTEXT
${contextSection}

## MANDATORY RULES — follow every rule on every response

1. **Exclusive sourcing.** Answer exclusively from the context blocks above. Do not use prior training knowledge, make inferences, or extrapolate beyond what is explicitly stated in the context.

2. **Conciseness and clarity.** Be direct and professional. Structure your answer in clear prose or a short numbered list where appropriate. Do not pad or repeat yourself.

3. **Inline page citations — required.** After every factual statement, module name, credit value, deadline, or any other specific piece of information, append a bracketed citation in the format [Page N] where N is the exact page number shown in the context block header. If multiple context blocks support the same fact, cite all relevant pages: [Page 3, Page 7].

4. **Citation accuracy.** Only cite a page number that appears in the context headers above. Never invent or estimate page numbers.

5. **Strict fallback.** If the answer to the user's question cannot be explicitly verified from the context blocks above — even partially — respond with **exactly** this sentence and nothing else:
   "I cannot find that information in the official module handbook."
   Do not attempt to answer from outside knowledge, do not guess, and do not suggest that the answer might exist elsewhere.

6. **No hallucination.** Academic misinformation has real consequences. When in doubt, use the fallback response.`;
}

// ── Helper: stream a plain text fallback ─────────────────────────────────────

/**
 * Returns a streaming Response containing a single static string.
 * Used when no relevant context is found so the client receives a stream
 * (not a JSON error) and can render it identically to a normal reply.
 */
function streamFallback(message: string, extraHeaders?: HeadersInit): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(message));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      ...extraHeaders,
    },
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // ── 1. Parse and validate the JSON request body ───────────────────────────

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const parsed = ChatRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:   "Invalid request payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { question, history, documentId }: ChatRequest = parsed.data;

    // ── 2. Vectorise the user's query ─────────────────────────────────────────

    const queryEmbedding = await embedQuery(question);

    // ── 3. Retrieve the most relevant document chunks ─────────────────────────

    const relevantChunks = await retrieveRelevantChunks(
      queryEmbedding,
      TOP_K,
      documentId,
    );

    // If the vector index is empty or no chunks exist yet, short-circuit with
    // the standard fallback so the UI renders something instead of hanging.
    if (relevantChunks.length === 0) {
      console.warn("[CHAT] No embedded chunks found in the database.", {
        documentId,
        question: question.slice(0, 120),
      });

      return streamFallback(
        "I cannot find that information in the official module handbook.",
        { "X-No-Context": "true" },
      );
    }

    // ── 4. Build the anti-hallucination system prompt ─────────────────────────

    const systemPrompt = buildSystemPrompt(relevantChunks);

    // ── 5. Assemble the messages array for GPT-4o ─────────────────────────────
    //
    // Layout:
    //   [system]  — grounding prompt with context blocks and rules
    //   [history] — prior turns from the client (oldest first)
    //   [user]    — the current question
    //
    // The history is inserted between the system prompt and the current user
    // message so the model can maintain conversational continuity while the
    // system prompt anchors it firmly to the retrieved context.

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map(
        (m): OpenAI.Chat.ChatCompletionMessageParam => ({
          role:    m.role,
          content: m.content,
        })
      ),
      { role: "user", content: question },
    ];

    // ── 6. Start a streaming chat completion ──────────────────────────────────

    const openaiStream = await openai.chat.completions.create({
      model:             CHAT_MODEL,
      messages,
      stream:            true,
      temperature:       TEMPERATURE,
      max_tokens:        MAX_CHAT_TOKENS,
      presence_penalty:  0,
      frequency_penalty: 0,
    });

    // ── 7. Pipe the OpenAI stream into a Web ReadableStream ───────────────────
    //
    // The for-await loop consumes the OpenAI AsyncIterable and forwards each
    // text delta to the client as it arrives, producing true token-level
    // streaming with minimal buffering.
    //
    // `cancel()` is called if the client disconnects mid-stream; we abort the
    // upstream OpenAI request to avoid unnecessary billing.

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of openaiStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(delta));
            }

            // `finish_reason` is set on the final chunk — break early rather
            // than waiting for the iterator to naturally exhaust
            const finishReason = chunk.choices[0]?.finish_reason;
            if (finishReason && finishReason !== null) {
              break;
            }
          }
        } catch (streamError: unknown) {
          const msg =
            streamError instanceof Error
              ? streamError.message
              : "Stream error";
          console.error("[CHAT] OpenAI stream error:", msg);
          controller.error(streamError);
          return;
        }

        controller.close();
      },

      cancel() {
        // Client disconnected — abort the upstream request to stop billing
        openaiStream.controller.abort();
      },
    });

    // ── 8. Return the stream with provenance metadata headers ─────────────────
    //
    // The X-Source-Pages and X-Similarity-Scores headers let the frontend
    // display citation chips and confidence indicators without needing a
    // separate round-trip to fetch citation metadata.

    const sourcePages       = relevantChunks.map((c) => c.pageNumber).join(",");
    const similarityScores  = relevantChunks.map((c) => c.similarity).join(",");

    return new Response(readableStream, {
      headers: {
        "Content-Type":       "text/plain; charset=utf-8",
        "Cache-Control":      "no-cache, no-store",
        "X-Chunks-Retrieved": String(relevantChunks.length),
        "X-Source-Pages":     sourcePages,
        "X-Similarity-Scores": similarityScores,
      },
    });

  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred.";

    console.error("[CHAT ERROR]", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: "Failed to process chat request.", detail: message },
      { status: 500 },
    );
  }
}