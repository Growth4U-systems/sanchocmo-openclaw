"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * ChatMarkdown — the single rich-text renderer for chat bubbles.
 *
 * Replaces the old regex-based `formatMessage` (which only knew **bold**,
 * *italic*, `code`, links and <br>, and broke long URLs with `break-all`).
 * Now every message is real GitHub-flavoured Markdown: lists, headings,
 * tables, blockquotes, code blocks — rendered compactly to fit a bubble.
 *
 * Colour inherits from the parent bubble, so the same component looks right
 * on the cream Sancho bubble (ink text) and the rust user bubble (white).
 * Links read from `--chat-link`; the user bubble overrides that var to white
 * via `[--chat-link:#ffffff]` so links stay legible on rust.
 *
 * Long URLs/tokens wrap with `overflow-wrap:anywhere` (breaks only the
 * unbreakable bits) instead of the old `break-all` that chopped every word.
 */
export function ChatMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "chat-md text-base leading-relaxed [overflow-wrap:anywhere]",
        // Compact block spacing — bubbles are tight, kill the default huge gaps
        "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_ul]:my-1.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:space-y-0.5",
        "[&_ol]:my-1.5 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:space-y-0.5",
        "[&_li]:marker:text-[var(--chat-text-faint)]",
        "[&_h1]:text-[17px] [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1",
        "[&_h2]:text-[16px] [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1",
        "[&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
        "[&_strong]:font-semibold",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--chat-border-strong)] [&_blockquote]:pl-3 [&_blockquote]:my-1.5 [&_blockquote]:italic [&_blockquote]:opacity-90",
        "[&_hr]:my-2 [&_hr]:border-[var(--chat-border)]",
        "[&_code]:rounded [&_code]:bg-[var(--chat-surface-2)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[14px]",
        "[&_pre]:my-1.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-[var(--chat-surface-2)] [&_pre]:p-2.5 [&_pre]:text-[13px]",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:my-1.5 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-[14px]",
        "[&_th]:border [&_th]:border-[var(--chat-border)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_td]:border [&_td]:border-[var(--chat-border)] [&_td]:px-2 [&_td]:py-1",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--chat-link)] underline decoration-1 underline-offset-2 hover:opacity-80 [overflow-wrap:anywhere]"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
