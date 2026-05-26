/**
 * Chat page.
 *
 * Full-height dark layout with a fixed header and the ChatWindow filling
 * the remaining space. The conversation column is constrained to
 * max-w-3xl and centered (handled inside ChatWindow).
 */

import ChatWindow from "@/components/ChatWindow";

export default function Page() {
  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <svg
              className="h-4.5 w-4.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5L14 8m-4 8-2.5 2.5m9 0L14 16m-4-8L7.5 5.5"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-slate-100">
              AI Module Guide Assistant
            </h1>
            <p className="text-[11px] leading-tight text-slate-500">
              Deggendorf Institute of Technology · Artificial Intelligence
            </p>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-hidden">
        <ChatWindow />
      </div>
    </main>
  );
}
