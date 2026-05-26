"use client";

/**
 * ChatWindow
 * ----------
 * Owns the conversation state, renders the scrolling message list, and
 * provides the input box. Wires user submissions to the streaming
 * backend via the `useStreamingQuery` hook.
 */

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import MessageBubble, { ChatMessage } from "@/components/MessageBubble";
import { useStreamingQuery } from "@/hooks/useStreamingQuery";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const SUGGESTIONS = [
  "How many ECTS is the Machine Learning module?",
  "Who teaches Computer Vision?",
  "What are the entrance requirements for Statistics?",
];

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const { isStreaming, sendQuery, cancel } = useStreamingQuery();

  // Ref to the currently-streaming assistant message id.
  const activeAssistantId = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest content whenever messages change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Update one message in place by id. */
  const patchMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      );
    },
    []
  );

  const submit = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessage = {
        id: makeId(),
        role: "user",
        content: trimmed,
      };
      const assistantId = makeId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        streaming: true,
      };
      activeAssistantId.current = assistantId;

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");

      await sendQuery(trimmed, {
        onToken: (fullText) => {
          patchMessage(assistantId, { content: fullText });
        },
        onSources: (sources) => {
          patchMessage(assistantId, { sources });
        },
        onDone: ({ text, sources }) => {
          patchMessage(assistantId, {
            content: text,
            sources,
            streaming: false,
          });
          activeAssistantId.current = null;
        },
        onError: (message) => {
          patchMessage(assistantId, {
            content:
              `⚠️ ${message}` +
              "\n\nMake sure the backend is running at http://127.0.0.1:8000.",
            streaming: false,
          });
          activeAssistantId.current = null;
        },
      });
    },
    [isStreaming, patchMessage, sendQuery]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  };

  const handleCancel = () => {
    cancel();
    if (activeAssistantId.current) {
      patchMessage(activeAssistantId.current, { streaming: false });
      activeAssistantId.current = null;
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
          {isEmpty ? (
            <div className="mt-16 flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 ring-1 ring-blue-500/30">
                <svg
                  className="h-6 w-6 text-blue-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h8M8 14h5m-9 7 3.5-2.5A2 2 0 0 1 9.7 18H18a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v14Z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-100">
                Ask about the AI Module Guide
              </h2>
              <p className="mt-1 max-w-md text-sm text-slate-400">
                Questions are answered from the official THD Artificial
                Intelligence Modulhandbuch.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void submit(s)}
                    className="rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:text-blue-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-slate-800 bg-slate-900/80 px-4 py-4 backdrop-blur">
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-800 p-2 focus-within:border-blue-500/60">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask a question about the module guide…"
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={handleCancel}
                className="shrink-0 rounded-xl bg-slate-700 px-3.5 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-500">
            Press Enter to send, Shift+Enter for a new line.
          </p>
        </form>
      </div>
    </div>
  );
}
