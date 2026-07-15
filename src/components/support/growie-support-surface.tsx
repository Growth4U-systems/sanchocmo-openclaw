"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
} from "lucide-react";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { GrowieAvatar } from "@/components/support/growie-avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";
import { isGrowieSupportThreadId } from "@/lib/support/growie";
import type { ChatMessage } from "@/hooks/useChat";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface PendingImage {
  file: File;
  preview: string;
}

interface SupportThreadResponse {
  messages: ChatMessage[];
  status: { text: string; agent?: string; ts: number } | null;
  activeRun: { id: string; status: "queued" | "running"; createdAt: string } | null;
}

interface UploadedAttachment {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

function newSupportThreadId(slug: string): string {
  const entropy = globalThis.crypto?.randomUUID?.().slice(0, 8)
    ?? Math.random().toString(36).slice(2, 10);
  return `${slug}:support-growie-${Date.now().toString(36)}-${entropy}`;
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `growie-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function supportStorageKey(slug: string): string {
  return `growie-support-thread:${slug}`;
}

function visibleSupportMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) =>
    message.role === "user" || message.role === "bot" || message.role === "system",
  );
}

export function GrowieSupportSurface() {
  const t = useTranslations("growieSupport");
  const router = useRouter();
  const { data: session } = useSession();
  const selectedClient = useAppStore((state) => state.selectedClient);
  const chatOpen = useChatStore((state) => state.sidebarOpen);
  const chatFullscreen = useChatStore((state) => state.isFullscreen);
  const routeSlug = typeof router.query.slug === "string" ? router.query.slug : null;
  const slug = routeSlug || selectedClient;
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const enabled = process.env.NEXT_PUBLIC_GROWIE_SUPPORT_ENABLED === "1";

  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingImagesRef = useRef<PendingImage[]>([]);
  const queryClient = useQueryClient();

  const currentPage = router.asPath.split("?")[0].split("#")[0] || "/dashboard";

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => () => {
    pendingImagesRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
  }, []);

  useEffect(() => {
    setThreadId(null);
    setError(null);
    if (!slug || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(supportStorageKey(slug));
    if (stored && isGrowieSupportThreadId(stored, slug)) setThreadId(stored);
  }, [slug]);

  const threadQuery = useQuery<SupportThreadResponse>({
    queryKey: ["growie-support", threadId],
    queryFn: async () => {
      const response = await fetch(`/api/chat/thread/${encodeURIComponent(threadId || "")}`);
      if (!response.ok) throw new Error(t("errors.load"));
      return response.json();
    },
    enabled: open && Boolean(threadId),
    refetchInterval: open && threadId ? 2_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 500,
  });

  const messages = visibleSupportMessages(threadQuery.data?.messages ?? []);
  const hasUserMessage = messages.some((message) => message.role === "user");
  const hasDiagnosis = messages.some((message) => message.role === "bot");
  const isAnalysing = isSending
    || Boolean(threadQuery.data?.activeRun)
    || Boolean(threadQuery.data?.status);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, messages.length, isAnalysing]);

  const addImages = useCallback((files: FileList | File[]) => {
    setError(null);
    const accepted: PendingImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(t("errors.imageType"));
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(t("errors.imageSize"));
        continue;
      }
      accepted.push({ file, preview: URL.createObjectURL(file) });
      if (accepted.length >= MAX_IMAGES) break;
    }
    setPendingImages((previous) => {
      const available = Math.max(0, MAX_IMAGES - previous.length);
      const used = accepted.slice(0, available);
      accepted.slice(available).forEach((item) => URL.revokeObjectURL(item.preview));
      return [...previous, ...used];
    });
  }, [t]);

  const removeImage = useCallback((index: number) => {
    setPendingImages((previous) => {
      const removed = previous[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return previous.filter((_, itemIndex) => itemIndex !== index);
    });
  }, []);

  const captureScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(t("errors.captureUnsupported"));
      return;
    }

    setError(null);
    setIsCapturing(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      await video.play();

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) throw new Error("empty capture");
      const scale = Math.min(1, 1_600 / sourceWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sourceWidth * scale);
      canvas.height = Math.round(sourceHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
      if (!blob) throw new Error("capture encoding failed");
      addImages([
        new File([blob], `growie-captura-${new Date().toISOString().replace(/[:.]/g, "-")}.png`, {
          type: "image/png",
        }),
      ]);
    } catch (captureError) {
      if ((captureError as DOMException)?.name !== "NotAllowedError") {
        setError(t("errors.capture"));
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setIsCapturing(false);
    }
  }, [addImages, t]);

  const uploadImages = useCallback(async (): Promise<UploadedAttachment[]> => {
    const uploaded: UploadedAttachment[] = [];
    for (const item of pendingImages) {
      const form = new FormData();
      form.append("file", item.file);
      const response = await fetch(`/api/upload-file?slug=${encodeURIComponent(slug || "")}`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t("errors.upload"));
      uploaded.push(payload as UploadedAttachment);
    }
    return uploaded;
  }, [pendingImages, slug, t]);

  const sendMessage = useCallback(async () => {
    if (!slug || isSending) return;
    const cleanDraft = draft.trim();
    if (!cleanDraft && pendingImages.length === 0) return;

    setError(null);
    setIsSending(true);
    const nextThreadId = threadId || newSupportThreadId(slug);
    if (!threadId) {
      setThreadId(nextThreadId);
      window.localStorage.setItem(supportStorageKey(slug), nextThreadId);
    }

    try {
      const attachments = pendingImages.length > 0 ? await uploadImages() : [];
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          threadId: nextThreadId,
          threadName: "Growie · Soporte",
          idempotencyKey: newIdempotencyKey(),
          text: cleanDraft || t("screenshotOnly"),
          userName: session?.user?.name || "Admin",
          linkedTo: "support/growie",
          agent: "sancho",
          scope: "agent",
          skillMode: "auto",
          _source: "growie-support",
          ...(attachments.length > 0 ? { attachments } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t("errors.send"));

      pendingImages.forEach((item) => URL.revokeObjectURL(item.preview));
      setPendingImages([]);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["growie-support", nextThreadId] });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("errors.send"));
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, pendingImages, queryClient, session?.user?.name, slug, t, threadId, uploadImages]);

  const startNewCase = useCallback(() => {
    if (!slug || isAnalysing) return;
    if (threadId) window.localStorage.removeItem(supportStorageKey(slug));
    pendingImages.forEach((item) => URL.revokeObjectURL(item.preview));
    setPendingImages([]);
    setThreadId(null);
    setDraft("");
    setError(null);
  }, [isAnalysing, pendingImages, slug, threadId]);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) useChatStore.getState().closeSidebar();
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addImages(event.dataTransfer.files);
  }, [addImages]);

  const onPaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length > 0) addImages(files);
  }, [addImages]);

  const onComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  if (!enabled || !isAdmin || !slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null;

  const phase = hasDiagnosis ? 2 : isAnalysing ? 1 : hasUserMessage ? 0 : -1;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={cn(
          "group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[70] flex min-h-12 items-center gap-2.5 rounded-full border-2 border-[var(--sc-ink)] bg-[var(--sc-sun-100)] px-4 py-2 text-left text-[var(--sc-ink)] shadow-[3px_3px_0_var(--sc-ink)] transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[4px_5px_0_var(--sc-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 active:translate-y-0 active:shadow-[2px_2px_0_var(--sc-ink)] motion-reduce:transform-none",
          chatOpen && "z-[410] max-md:bottom-24",
          chatFullscreen && "bottom-24",
          chatOpen && !chatFullscreen && "md:right-[400px] md:z-[70]",
        )}
        aria-label={t("open")}
      >
        <GrowieAvatar className="size-8" fallbackIconSize={17} />
        <span className="hidden lg:block">
          <span className="block text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--sc-fg-muted)]">Growie</span>
          <span className="block text-sm font-bold leading-tight">{t("launcher")}</span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-[100dvh] w-full max-w-none gap-0 border-l-2 border-[var(--sc-ink)] bg-[var(--chat-bg)] p-0 shadow-none sm:max-w-[460px]"
        >
          <SheetHeader className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14">
            <div className="flex items-center gap-3">
              <GrowieAvatar
                className="size-11 border-2 border-[var(--sc-ink)] shadow-[2px_2px_0_var(--sc-ink)]"
                fallbackIconSize={22}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-xl font-bold text-[var(--chat-text)]">Growie</SheetTitle>
                  <span className="rounded-full bg-[var(--sc-sun-100)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--sc-ink)]">
                    {t("beta")}
                  </span>
                </div>
                <SheetDescription className="mt-0.5 text-xs text-[var(--chat-text-muted)]">
                  {t("subtitle")}
                </SheetDescription>
              </div>
              {threadId && (
                <button
                  type="button"
                  onClick={startNewCase}
                  disabled={isAnalysing}
                  className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-40"
                  title={t("newCase")}
                >
                  <Plus size={14} aria-hidden="true" />
                  {t("newCase")}
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-2)] px-3 py-2 text-[11px] text-[var(--chat-text-muted)]">
              <ShieldCheck size={15} className="shrink-0 text-[var(--sc-sage-500)]" aria-hidden="true" />
              <span className="font-semibold text-[var(--chat-text)]">{t("readOnly")}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate" title={currentPage}>{currentPage}</span>
            </div>
          </SheetHeader>

          <SupportPhaseRail phase={phase} labels={[t("phases.received"), t("phases.analysing"), t("phases.diagnosis")]} />

          <div
            className={cn(
              "relative flex-1 overflow-y-auto px-4 py-5",
              dragging && "ring-2 ring-inset ring-rust",
            )}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {dragging && (
              <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-xl border-2 border-dashed border-rust bg-[var(--chat-bg)]/95 text-sm font-bold text-rust">
                {t("dropImage")}
              </div>
            )}

            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-full max-w-[38ch] flex-col justify-center pb-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sc-sage-500)]">{t("eyebrow")}</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight text-[var(--chat-text)]">{t("emptyTitle")}</h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--chat-text-muted)]">{t("emptyBody")}</p>
                <div className="mt-6 grid gap-2">
                  {[t("prompts.broken"), t("prompts.confusing"), t("prompts.missing")].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDraft(prompt)}
                      className="min-h-11 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-3 py-2 text-left text-sm font-medium text-[var(--chat-text)] transition-colors hover:border-rust hover:bg-[var(--chat-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  if (message.role === "system") {
                    return (
                      <div key={`${message.ts || index}-system`} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800" role="status">
                        {message.text}
                      </div>
                    );
                  }
                  return (
                    <div key={`${message.ts || index}-${message.role}`} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        isUser
                          ? "rounded-br-md bg-rust text-white"
                          : "rounded-bl-md border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)]",
                      )}>
                        {!isUser && (
                          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--sc-sage-500)]">
                            <GrowieAvatar className="size-3.5" fallbackIconSize={10} /> Growie
                          </div>
                        )}
                        {isUser ? message.text : <ChatMarkdown text={message.text} className="text-sm" />}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.attachments.filter((attachment) => attachment.mimeType.startsWith("image/")).map((attachment) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={attachment.url}
                                src={attachment.url}
                                alt={attachment.filename}
                                className="max-h-32 max-w-[190px] rounded-lg border border-[var(--chat-border)] object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isAnalysing && (
                  <div className="flex justify-start" aria-live="polite">
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3.5 py-2.5 text-sm text-[var(--chat-text-muted)]">
                      <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      {threadQuery.data?.status?.text || t("analysing")}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {pendingImages.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto" aria-label={t("attachedImages")}>
                {pendingImages.map((item, index) => (
                  <div key={item.preview} className="group/image relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.preview} alt={item.file.name} className="h-16 w-24 rounded-lg border border-[var(--chat-border-strong)] object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-[var(--sc-ink)] bg-[var(--chat-surface)] text-xs font-bold text-[var(--chat-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
                      aria-label={t("removeImage", { name: item.file.name })}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label htmlFor="growie-support-message" className="mb-1.5 block text-xs font-bold text-[var(--chat-text)]">
              {messages.length === 0 ? t("messageLabelFirst") : t("messageLabelFollowup")}
            </label>
            <textarea
              id="growie-support-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              onPaste={onPaste}
              rows={3}
              placeholder={t("placeholder")}
              disabled={isSending}
              className="w-full resize-none rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-bg)] px-3 py-2.5 text-base leading-snug text-[var(--chat-text)] placeholder:text-[var(--chat-text-faint)] focus:border-rust focus:outline-none focus:ring-2 focus:ring-rust/20 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void captureScreen()}
                disabled={isCapturing || isSending || pendingImages.length >= MAX_IMAGES}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-40"
              >
                {isCapturing ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Camera size={15} aria-hidden="true" />}
                {t("capture")}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || pendingImages.length >= MAX_IMAGES}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-2)] hover:text-[var(--chat-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust disabled:opacity-40"
              >
                <ImagePlus size={15} aria-hidden="true" />
                {t("attach")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.length) addImages(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={isSending || (!draft.trim() && pendingImages.length === 0)}
                className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg border-2 border-[var(--sc-ink)] bg-rust px-3.5 text-sm font-bold text-white shadow-[2px_2px_0_var(--sc-ink)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSending ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                {t("send")}
              </button>
            </div>
            {error && <p className="mt-2 text-xs leading-relaxed text-[var(--chat-danger)]" role="alert">{error}</p>}
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--chat-text-faint)]">{t("privacyNote")}</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SupportPhaseRail({ phase, labels }: { phase: number; labels: string[] }) {
  return (
    <div className="border-b border-[var(--chat-border)] bg-[var(--chat-bg-deep)] px-5 py-3" aria-label="Support progress">
      <ol className="grid grid-cols-3 gap-2">
        {labels.map((label, index) => {
          const completed = phase > index;
          const active = phase === index;
          return (
            <li key={label} className="min-w-0">
              <div className={cn(
                "mb-1 h-1 rounded-full",
                completed || active ? "bg-[var(--sc-sage-500)]" : "bg-[var(--chat-border-strong)]",
              )} />
              <span className={cn(
                "flex items-center gap-1 truncate text-[10px] font-semibold",
                active || completed ? "text-[var(--chat-text)]" : "text-[var(--chat-text-faint)]",
              )}>
                {completed && <Check size={10} aria-hidden="true" />}
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
