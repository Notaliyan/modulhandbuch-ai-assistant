"use client";

/**
 * MessageBubble
 * -------------
 * Renders a single chat message.
 *
 * - User messages: blue bubble, right-aligned.
 * - Assistant messages: dark slate bubble, left-aligned, with an
 *   optional collapsible "Sources" section listing filename + page.
 * - While the assistant message is still streaming, a blinking caret
 *   is appended.
 */

import { useState } from "react";
import type { Source } from "@/hooks/useStreamingQuery";

export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
  /** True while this assistant message is still being streamed. */
  streaming?: boolean;
}

interface MessageBubbleProps {
  message: ChatMessage;
}

function SourcesSection({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-700/60 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-blue-400"
        aria-expanded={open}
      >
        <svg
          className={`h-3 w-3 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        {open ? "Hide" : "Show"} sources ({sources.length})
      </button>

      {open && (
        <ul className="mt-2 space-y-1">
          {sources.map((src, idx) => (
            <li
              key={`${src.filename}-${src.page}-${idx}`}
              className="flex items-center gap-2 rounded-md bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-300"
            >
              <svg
                className="h-3.5 w-3.5 shrink-0 text-blue-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-3.62-3.622A1.5 1.5 0 0 0 11.38 2H4.5Zm7 1.5v3A1.5 1.5 0 0 0 13 8h3l-4.5-4.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate font-medium text-slate-200">
                {src.filename}
              </span>
              <span className="ml-auto shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-300">
                p. {src.page}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-sm bg-blue-600 text-white"
            : "rounded-bl-sm bg-slate-800 text-slate-100 ring-1 ring-slate-700/60"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">
          {message.content}
          {message.streaming && (
            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-blue-400 align-middle" />
          )}
        </div>

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesSection sources={message.sources} />
        )}
      </div>
    </div>
  );
}
