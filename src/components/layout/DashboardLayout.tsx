import { type ReactNode } from "react";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { sidebarOpen } = useAppStore();
  const { sidebarOpen: chatOpen, isFullscreen: chatFullscreen } = useChatStore();

  // Adjust main content width when chat is open
  const chatWidth = chatOpen ? (chatFullscreen ? "calc(100vw - 220px)" : "380px") : "0px";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-200",
          sidebarOpen ? "ml-[220px]" : "ml-[60px]"
        )}
        style={{ marginRight: chatOpen ? chatWidth : undefined }}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
      {/* Chat sidebar — renders on all dashboard pages */}
      <ChatSidebar />
    </div>
  );
}
