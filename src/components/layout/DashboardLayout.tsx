import { type ReactNode } from "react";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { useClientUrlSync } from "@/hooks/useClientUrlSync";
import { Sidebar } from "./Sidebar";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  /** When true, content fills the viewport with no padding (for V2 dashboard) */
  fullBleed?: boolean;
}

export function DashboardLayout({ children, fullBleed }: DashboardLayoutProps) {
  // Centralised URL → store sync for the active client. Runs here so every
  // dashboard page inherits it without each page having to opt in.
  useClientUrlSync();

  const { sidebarOpen } = useAppStore();
  const { sidebarOpen: chatOpen, isFullscreen: chatFullscreen } = useChatStore();

  // Fullscreen chat must leave a gap exactly the width of the nav sidebar
  // (220px expanded / 60px collapsed — see Sidebar `lg:w-[...]` and the
  // `lg:ml-[...]` offsets below). Hardcoding 220 left a 160px strip of the
  // dashboard peeking through when the sidebar was collapsed.
  const sidebarW = sidebarOpen ? 220 : 60;
  const chatWidth = chatOpen ? (chatFullscreen ? `calc(100vw - ${sidebarW}px)` : "380px") : "0px";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-200",
          // Desktop: offset by sidebar width; Mobile: no offset (sidebar is overlay or hidden)
          sidebarOpen ? "lg:ml-[220px] ml-0" : "lg:ml-[60px] ml-0"
        )}
        style={{ marginRight: chatOpen ? chatWidth : undefined }}
      >
        <main className={fullBleed ? "" : "p-8 pt-6"}>{children}</main>
      </div>
      <ChatSidebar />
    </div>
  );
}
