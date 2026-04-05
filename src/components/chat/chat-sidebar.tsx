"use client";

import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
import { useAppStore } from "@/stores/app";
import {
  useThreadMessages,
  useThreadList,
  useSendMessage,
  useCancelMessage,
} from "@/hooks/useChat";
import { threadIcon } from "@/lib/chat-openers";

// ---------------------------------------------------------------------------
// Agent badge config
// ---------------------------------------------------------------------------

const AGENT_BADGES: Record<string, { emoji: string; label: string; color: string }> = {
  sancho:    { emoji: "🤠", label: "Sancho",    color: "bg-rust" },
  escudero:  { emoji: "⚔️",  label: "Escudero",  color: "bg-green-600" },
  rocinante: { emoji: "🐴", label: "Rocinante", color: "bg-cyan-600" },
  cervantes: { emoji: "✒️",  label: "Cervantes", color: "bg-purple-600" },
};

function agentBadge(agent?: string) {
  return AGENT_BADGES[agent ?? "sancho"] ?? AGENT_BADGES.sancho;
}

// ---------------------------------------------------------------------------
// Simple markdown-ish formatter
// ---------------------------------------------------------------------------

function formatMessage(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="bg-[#45475a] px-1 py-0.5 rounded text-[11px]">$1</code>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener" class="underline text-blue-400 hover:text-blue-300">$1</a>'
    )
    .replace(
      /(^|[^"'])(https?:\/\/[^\s<]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener" class="underline text-blue-400 hover:text-blue-300">$2</a>'
    )
    .replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------
// ChatSidebar
// ---------------------------------------------------------------------------

export function ChatSidebar() {
  const {
    sidebarOpen,
    sidebarLocked,
    lockedThreadId,
    isFullscreen,
    currentThread,
    threadMeta,
    closeSidebar,
    toggleFullscreen,
    unlockSidebar,
    setCurrentThread,
    isPolling,
  } = useChatStore();

  const { selectedClient } = useAppStore();
  const slug = selectedClient ?? "";

  // Thread list (free mode)
  const threadListQuery = useThreadList(slug);
  const threads = threadListQuery.data ?? [];

  // Determine active thread id
  const activeThreadId = sidebarLocked && lockedThreadId ? lockedThreadId : currentThread;

  // Messages for active thread
  const messagesQuery = useThreadMessages(activeThreadId ?? null);
  const messages = messagesQuery.data?.messages ?? [];
  const statusData = messagesQuery.data?.status;

  // Send / cancel
  const sendMutation = useSendMessage();
  const cancelMutation = useCancelMessage();

  // Thread metadata
  const meta = activeThreadId ? threadMeta[activeThreadId] : undefined;
  const skills = meta?.skills ?? [];
  const primarySkill = meta?.skill || skills[0];
  const extraSkillCount = skills.length > 1 ? skills.length - 1 : 0;

  // Input state
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Typing indicator
  const lastMsg = messages[messages.length - 1];
  const isBotThinking = isPolling && lastMsg?.role === "user";
  const showTyping = isBotThinking || !!statusData?.text;

  // Handlers
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !activeThreadId) return;
    sendMutation.mutate({ text: trimmed, threadId: activeThreadId });
    setInput("");
  }, [input, activeThreadId, sendMutation]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Don't render if closed
  if (!sidebarOpen) return null;

  const panelWidth = isFullscreen ? "calc(100vw - 220px)" : "380px";

  return (
    <div
      className="fixed top-0 right-0 h-screen flex flex-col"
      style={{ width: panelWidth, zIndex: 400, backgroundColor: "#1E1E2E" }}
    >
      {/* HEADER BAR */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#313244] shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="text-[12px] font-semibold text-[#cdd6f4]">Chat con Sancho</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#a6adc8]">
            {statusData?.text || (isPolling ? "Conectado" : "En espera")}
          </span>
          <button
            onClick={toggleFullscreen}
            className="text-[#a6adc8] hover:text-[#cdd6f4] text-sm leading-none border border-[#45475a] rounded-md px-1.5 py-0.5"
            title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            {isFullscreen ? "⤡" : "⤢"}
          </button>
          <button
            onClick={closeSidebar}
            className="text-[#a6adc8] hover:text-[#f38ba8] text-sm leading-none border border-[#45475a] rounded-md px-1.5 py-0.5"
            title="Cerrar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* THREAD BAR */}
      <div className="px-3 py-2 border-b border-[#313244] shrink-0">
        {sidebarLocked && lockedThreadId ? (
          /* Locked mode */
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-rust text-sm">
                  {threadIcon(lockedThreadId.split(":").slice(1).join(":"))}
                </span>
                <span
                  className="text-[12px] font-semibold text-rust truncate font-heading"
                >
                  {meta?.threadName ?? lockedThreadId.split(":").slice(1).join(":").replace(/-/g, " ")}
                </span>
                {primarySkill && (
                  <span className="inline-flex items-center gap-0.5 bg-rust/15 text-[10px] text-rust px-2 py-0.5 rounded-full shrink-0 font-semibold">
                    {primarySkill}
                    {extraSkillCount > 0 && (
                      <span className="opacity-70"> +{extraSkillCount}</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="text-[#a6adc8] hover:text-[#cdd6f4] text-sm border border-[#45475a] rounded-md px-1 py-0.5"
                  title="Sincronizar con Discord"
                >
                  📱
                </button>
                <button
                  onClick={unlockSidebar}
                  className="text-[#a6adc8] hover:text-[#cdd6f4] text-sm border border-[#45475a] rounded-md px-1 py-0.5"
                  title="Desbloquear — modo libre"
                >
                  🔓
                </button>
              </div>
            </div>

            {/* Pinned doc panel */}
            {meta?.docPath && (
              <div className="bg-[#313244] rounded-lg px-3 py-1.5 text-[11px] text-[#a6adc8] flex items-center gap-1.5 truncate cursor-pointer hover:bg-[#45475a] transition-colors">
                <span>📄</span>
                <span className="text-rust font-heading">Documento actual</span>
                <span className="text-[#6c7086]">—</span>
                <span className="text-[#cdd6f4] truncate">{meta.docPath.split("/").pop()}</span>
              </div>
            )}
          </div>
        ) : (
          /* Free mode */
          <div className="flex items-center gap-2">
            <select
              value={activeThreadId ?? ""}
              onChange={(e) => setCurrentThread(e.target.value || null)}
              className="flex-1 bg-[#313244] text-[#cdd6f4] text-[12px] px-2 py-1.5 rounded-lg border border-[#45475a] focus:outline-none focus:border-rust truncate"
            >
              <option value="">Seleccionar hilo...</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {threadIcon(t.shortId)} {t.name}
                </option>
              ))}
            </select>
            <button
              className="bg-[#313244] hover:bg-[#45475a] text-green-500 w-7 h-7 rounded-lg flex items-center justify-center text-sm border border-[#45475a]"
              title="Nuevo hilo"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="max-w-[85%] px-[14px] py-[10px] rounded-[14px] text-[12px] leading-relaxed bg-[#313244] text-[#cdd6f4]">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded bg-rust">
                🤠 Sancho
              </span>
            </div>
            {sidebarLocked ? "🔄 Cargando..." : "Selecciona un thread para empezar."}
          </div>
        )}

        {messages.map((msg: { role: string; text: string; agent?: string; ts?: number }, i: number) => {
          const isUser = msg.role === "user";
          const badge = !isUser ? agentBadge(msg.agent) : null;

          return (
            <div key={i} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] px-[14px] py-[10px] rounded-[14px] text-[12px] leading-relaxed",
                  isUser ? "bg-rust text-white" : "bg-[#313244] text-[#cdd6f4]"
                )}
              >
                {badge && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded",
                      badge.color
                    )}>
                      {badge.emoji} {badge.label}
                    </span>
                  </div>
                )}
                <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.text || "") }} />
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {showTyping && (
          <div className="flex justify-start">
            <div className="bg-[#313244] text-[#a6adc8] px-[14px] py-[10px] rounded-[14px] text-[11px] italic flex items-center gap-2">
              {primarySkill && (
                <span className="bg-rust/15 text-rust text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                  {primarySkill}
                </span>
              )}
              <span>· 🔄 Sancho está pensando...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT BAR */}
      <div className="px-3 py-2 border-t border-[#313244] shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe aquí..."
            disabled={!activeThreadId}
            className="flex-1 bg-[#313244] text-[#cdd6f4] placeholder-[#6c7086] text-[12px] px-3 py-2 rounded-lg border border-[#45475a] focus:outline-none focus:border-rust disabled:opacity-50"
          />
          {showTyping || sendMutation.isPending ? (
            <button
              onClick={() => cancelMutation.mutate({ threadId: activeThreadId ?? undefined })}
              className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
              title="Detener"
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!activeThreadId || !input.trim()}
              className="bg-rust hover:opacity-90 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Enviar"
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
