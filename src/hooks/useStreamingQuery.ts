"use client";

/**
 * useStreamingQuery
 * -----------------
 * Calls the backend `POST /api/query` endpoint and consumes its
 * Server-Sent Events stream.
 *
 * The browser's native `EventSource` only supports GET requests, so we
 * use `fetch()` with a streaming `ReadableStream` reader and parse the
 * SSE wire format ("event:" / "data:" lines separated by a blank line)
 * manually.
 *
 * IMPORTANT (bug fix):
 * `sse-starlette` (the backend's EventSourceResponse) terminates lines
 * and separates events with CRLF ("\r\n"). The previous version split
 * events on "\n\n" only, so with a "\r\n\r\n" separator no complete
 * event was ever found - everything piled up in the buffer remainder
 * and nothing rendered. The fix: normalize all "\r\n" to "\n" the
 * moment a chunk is decoded, then all downstream splitting works
 * regardless of whether the server uses LF or CRLF.
 *
 * Backend event contract:
 *   event: token   data: {"text": "..."}
 *   event: sources data: {"sources": [{"filename": "...", "page": 1}]}
 *   event: done    data: {}
 *   event: error   data: {"message": "..."}
 *
 * Debug logging:
 * Set NEXT_PUBLIC_SSE_DEBUG=1 in .env.local to log every raw chunk and
 * every parsed event to the browser console.
 */

import { useCallback, useRef, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// Toggle verbose stream logging without touching code.
const DEBUG = process.env.NEXT_PUBLIC_SSE_DEBUG === "1";

function dlog(...args: unknown[]): void {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log("[useStreamingQuery]", ...args);
  }
}

export interface Source {
  filename: string;
  page: number;
}

interface ParsedEvent {
  event: string;
  data: string;
}

export interface StreamCallbacks {
  /** Fired for every token as it arrives; receives the full text so far. */
  onToken?: (fullText: string) => void;
  /** Fired once when the source list arrives. */
  onSources?: (sources: Source[]) => void;
  /** Fired once when the stream completes successfully. */
  onDone?: (result: { text: string; sources: Source[] }) => void;
  /** Fired on a backend or transport error. */
  onError?: (message: string) => void;
}

interface UseStreamingQueryReturn {
  /** Live-updating assistant text for the in-flight request. */
  streamedText: string;
  /** Sources for the in-flight request (populated near the end). */
  sources: Source[];
  /** True while a request is streaming. */
  isStreaming: boolean;
  /** Last error message, or null. */
  error: string | null;
  /** Start a new streaming query. */
  sendQuery: (question: string, callbacks?: StreamCallbacks) => Promise<void>;
  /** Abort an in-flight query. */
  cancel: () => void;
}

/**
 * Splits a raw SSE buffer into complete events.
 *
 * Assumes the caller has already normalized line endings so that the
 * buffer contains only "\n" (no "\r"). Events are separated by a blank
 * line, i.e. the sequence "\n\n". Returns the parsed events plus any
 * trailing incomplete remainder that should be retained for the next
 * chunk.
 */
function parseSSEChunks(buffer: string): {
  events: ParsedEvent[];
  remainder: string;
} {
  const events: ParsedEvent[] = [];

  // Events are separated by a blank line. After CRLF normalization this
  // is always "\n\n".
  const blocks = buffer.split("\n\n");

  // The last element may be an incomplete event still being received,
  // so it is handed back as the remainder rather than parsed now.
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventName = "message"; // SSE default if no "event:" line.
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        // Per spec, a single leading space after the colon is stripped.
        dataLines.push(line.slice("data:".length).replace(/^ /, ""));
      }
      // ":" comment lines / "id:" / "retry:" are ignored.
    }

    events.push({ event: eventName, data: dataLines.join("\n") });
  }

  return { events, remainder };
}

export function useStreamingQuery(): UseStreamingQueryReturn {
  const [streamedText, setStreamedText] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendQuery = useCallback(
    async (question: string, callbacks?: StreamCallbacks) => {
      // Reset state for the new request.
      setStreamedText("");
      setSources([]);
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let fullText = "";
      let collectedSources: Source[] = [];
      let chunkCount = 0;
      let eventCount = 0;

      try {
        dlog("POST", `${API_URL}/api/query`, { question });

        const response = await fetch(`${API_URL}/api/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });

        dlog("response status", response.status, response.statusText);

        if (!response.ok) {
          throw new Error(
            `Backend responded with ${response.status} ${response.statusText}`
          );
        }
        if (!response.body) {
          throw new Error("Response body is empty - cannot stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Read the stream chunk by chunk.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            dlog("stream closed by server. total chunks:", chunkCount);
            break;
          }

          // Decode this chunk.
          const rawChunk = decoder.decode(value, { stream: true });
          chunkCount += 1;

          // --- DEBUG: show exactly what arrived on the wire ----------
          // JSON.stringify makes \r and \n visible as escape sequences
          // so you can confirm the line-ending style the server uses.
          dlog(
            `raw chunk #${chunkCount} (${rawChunk.length} chars):`,
            JSON.stringify(rawChunk)
          );

          // --- THE FIX -----------------------------------------------
          // Normalize CRLF -> LF (and any stray CR -> LF). sse-starlette
          // emits "\r\n", so without this the "\n\n" event split below
          // never matches and the UI never updates.
          const normalized = rawChunk
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
          buffer += normalized;

          const { events, remainder } = parseSSEChunks(buffer);
          buffer = remainder;

          dlog(
            `parsed ${events.length} event(s); remainder kept:`,
            JSON.stringify(remainder)
          );

          for (const evt of events) {
            eventCount += 1;
            dlog(
              `event #${eventCount}: name="${evt.event}" data=`,
              JSON.stringify(evt.data)
            );

            if (!evt.data) {
              dlog("  -> skipped (empty data)");
              continue;
            }

            let payload: unknown;
            try {
              payload = JSON.parse(evt.data);
            } catch (parseErr) {
              dlog("  -> skipped (JSON parse failed)", parseErr);
              continue;
            }

            if (evt.event === "token") {
              const text = (payload as { text?: string }).text ?? "";
              fullText += text;
              setStreamedText(fullText);
              callbacks?.onToken?.(fullText);
            } else if (evt.event === "sources") {
              const incoming =
                (payload as { sources?: Source[] }).sources ?? [];
              collectedSources = incoming;
              setSources(incoming);
              callbacks?.onSources?.(incoming);
              dlog("  -> sources applied:", incoming);
            } else if (evt.event === "done") {
              dlog("  -> done");
              callbacks?.onDone?.({
                text: fullText,
                sources: collectedSources,
              });
            } else if (evt.event === "error") {
              const message =
                (payload as { message?: string }).message ??
                "Unknown backend error.";
              throw new Error(message);
            } else {
              dlog(`  -> unhandled event name "${evt.event}"`);
            }
          }
        }

        // Flush: a final event may sit in the buffer with no trailing
        // blank line if the server closed the connection abruptly.
        const tail = buffer.trim();
        if (tail) {
          dlog("flushing trailing buffer:", JSON.stringify(buffer));
          const { events } = parseSSEChunks(buffer + "\n\n");
          for (const evt of events) {
            if (!evt.data) continue;
            try {
              const payload = JSON.parse(evt.data);
              if (evt.event === "token") {
                const text = (payload as { text?: string }).text ?? "";
                fullText += text;
                setStreamedText(fullText);
                callbacks?.onToken?.(fullText);
              } else if (evt.event === "sources") {
                const incoming =
                  (payload as { sources?: Source[] }).sources ?? [];
                collectedSources = incoming;
                setSources(incoming);
                callbacks?.onSources?.(incoming);
              } else if (evt.event === "done") {
                callbacks?.onDone?.({
                  text: fullText,
                  sources: collectedSources,
                });
              }
            } catch {
              // Ignore an unparseable tail.
            }
          }
        }

        dlog(
          "stream finished. events:",
          eventCount,
          "final length:",
          fullText.length
        );
      } catch (err) {
        // An intentional cancel() shows up as an AbortError - ignore it.
        if (err instanceof DOMException && err.name === "AbortError") {
          dlog("request aborted by user");
          return;
        }
        const message =
          err instanceof Error ? err.message : "Unexpected error.";
        dlog("ERROR:", message);
        setError(message);
        callbacks?.onError?.(message);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    []
  );

  return {
    streamedText,
    sources,
    isStreaming,
    error,
    sendQuery,
    cancel,
  };
}