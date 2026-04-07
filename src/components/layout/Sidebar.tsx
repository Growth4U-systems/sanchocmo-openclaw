import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useClients } from "@/hooks/useClients";

interface NavItem {
  href: string;
  icon: string;
  labelKey: string;
  adminOnly?: boolean;
  clientOnly?: boolean;
  badge?: number;
}

const globalItems: NavItem[] = [
  { href: "/dashboard", icon: "📊", labelKey: "dashboard" },
];

const clientItems: NavItem[] = [
  { href: "/foundation", icon: "📂", labelKey: "foundation" },
  { href: "/projects", icon: "📋", labelKey: "projects" },
  { href: "/ideas", icon: "💡", labelKey: "ideas" },
  { href: "/metrics", icon: "📈", labelKey: "metrics" },
];

const toolItems: NavItem[] = [
  { href: "/trust-engine", icon: "🔍", labelKey: "trustEngine" },
  { href: "/atalaya", icon: "🏰", labelKey: "atalaya" },
  { href: "/recurring-tasks", icon: "🔄", labelKey: "recurringTasks" },
];

const systemItems: NavItem[] = [
  { href: "/dashboard/admin/activity", icon: "📡", labelKey: "activity", adminOnly: true },
  { href: "/dashboard/changelog", icon: "📜", labelKey: "changelog", adminOnly: true },
  { href: "/dashboard/guide", icon: "📖", labelKey: "guide" },
  { href: "/dashboard/admin/settings", icon: "⚙️", labelKey: "settings", adminOnly: true },
];

export function Sidebar() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedClient, sidebarOpen } = useAppStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    const handleRouteChange = () => setMobileOpen(false);
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router]);

  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const slug = selectedClient;

  function clientHref(path: string) {
    return slug ? `/dashboard/${slug}${path}` : "/dashboard";
  }

  function isActive(href: string) {
    return router.asPath === href || router.asPath.startsWith(href + "/");
  }

  return (
    <>
    {/* Mobile hamburger */}
    <button
      onClick={() => setMobileOpen(true)}
      className="lg:hidden fixed top-3 left-3 z-[60] w-10 h-10 rounded-lg bg-card border-2 border-ink flex items-center justify-center shadow-comic-sm"
      aria-label="Open menu"
    >
      ☰
    </button>

    {/* Mobile overlay */}
    {mobileOpen && (
      <div
        className="lg:hidden fixed inset-0 bg-black/40 z-[55]"
        onClick={() => setMobileOpen(false)}
      />
    )}

    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-card border-r-[3px] border-ink z-[60] flex flex-col transition-all duration-200",
        // Desktop: normal sidebar behavior
        sidebarOpen ? "lg:w-[220px]" : "lg:w-[60px]",
        // Mobile: full-width overlay, hidden by default
        mobileOpen ? "w-[260px]" : "max-lg:-translate-x-full",
        "max-lg:w-[260px]"
      )}
    >
      {/* Logo — matching legacy nav .logo */}
      <div className="px-4 pt-4 pb-1">
        {sidebarOpen ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="SanchoCMO" className="w-full h-auto block mb-0.5" />
            <span className="inline-block bg-rust text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-md border-2 border-ink">
              v2.0
            </span>
          </>
        ) : (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="SanchoCMO" className="w-10 h-10 object-contain" />
          </div>
        )}
      </div>

      {/* Client Selector (admin only) */}
      {isAdmin && sidebarOpen && (
        <div className="px-3 mt-3">
          <ClientSelector />
        </div>
      )}

      {/* Chat button (when client selected) */}
      {slug && sidebarOpen && (
        <div className="px-3 mt-2">
          <button
            onClick={() => {
              useChatStore.getState().setCurrentSlug(slug);
              useChatStore.getState().toggleSidebar();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 bg-rust text-white rounded-lg font-bold text-[13px] hover:opacity-90 justify-center"
          >
            💬 Chat con Sancho
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 mt-3 space-y-1">
        {/* Overview */}
        <SectionLabel text="Overview" visible={sidebarOpen} />
        {globalItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              active={isActive(item.href)}
              collapsed={!sidebarOpen}
            />
          );
        })}

        {/* Client section */}
        {slug && (
          <>
            <SectionLabel text={slug} visible={sidebarOpen} />
            {clientItems.map((item) => (
              <NavLink
                key={item.href}
                href={clientHref(item.href)}
                icon={item.icon}
                label={t(item.labelKey)}
                active={isActive(clientHref(item.href))}
                collapsed={!sidebarOpen}
                badge={item.badge}
              />
            ))}

            <SectionLabel text="Herramientas" visible={sidebarOpen} />
            {toolItems.map((item) => (
              <NavLink
                key={item.href}
                href={clientHref(item.href)}
                icon={item.icon}
                label={t(item.labelKey)}
                active={isActive(clientHref(item.href))}
                collapsed={!sidebarOpen}
              />
            ))}
          </>
        )}

        {/* System */}
        <SectionLabel text="Sistema" visible={sidebarOpen} />
        {systemItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              active={isActive(item.href)}
              collapsed={!sidebarOpen}
            />
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-3">
        <UserFooter collapsed={!sidebarOpen} />
      </div>
    </aside>
    </>
  );
}

// --- Sub-components ---

function SectionLabel({ text, visible }: { text: string; visible: boolean }) {
  if (!visible) return <div className="h-3" />;
  return (
    <div className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {text}
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
  badge,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
        active
          ? "bg-rust text-white font-semibold"
          : "text-muted-foreground hover:bg-background hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : undefined}
    >
      <span className="text-base">{icon}</span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  );
}

function ClientSelector() {
  const { selectedClient, setSelectedClient } = useAppStore();
  const { data: clients } = useClients();

  return (
    <select
      value={selectedClient || "global"}
      onChange={(e) => setSelectedClient(e.target.value === "global" ? null : e.target.value)}
      className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-rust"
    >
      <option value="global">🌐 Todos los clientes</option>
      {(clients || []).filter((c) => c.active).map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.emoji || "🏢"} {c.name}
        </option>
      ))}
    </select>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("auth");
  const tTheme = useTranslations("theme");
  const { data: session } = useSession();
  const { toggleTheme, theme } = useAppStore();
  const name = session?.user?.name || "Admin";
  const initial = name.charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-full bg-rust text-white flex items-center justify-center text-xs font-bold"
          title={name}
        >
          {initial}
        </button>
        <button
          onClick={() => useAppStore.getState().toggleSidebar()}
          className="w-8 h-8 rounded border border-border hover:bg-background text-muted-foreground flex items-center justify-center text-sm"
          title="Expandir sidebar"
        >
          ☰
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          className="w-8 h-8 rounded border border-border hover:border-red-400 hover:bg-red-500/5 text-muted-foreground hover:text-red-600 flex items-center justify-center text-sm transition-colors"
          title={t("signOut")}
        >
          🚪
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
        <div className="w-7 h-7 rounded-full bg-rust text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{name}</div>
          <div className="text-[10px] text-muted-foreground">
            {(session?.user as { role?: string })?.role === "admin" ? "Admin" : "Client"}
          </div>
        </div>
      </div>
      <div className="flex gap-1 text-[11px]">
        <button
          onClick={toggleTheme}
          className="flex-1 px-2 py-1 rounded border border-border hover:bg-background text-muted-foreground"
        >
          {theme === "light" ? `🌗 ${tTheme("dark")}` : `☀️ ${tTheme("light")}`}
        </button>
        <button
          onClick={() => useAppStore.getState().setLocale(
            useAppStore.getState().locale === "es" ? "en" : "es"
          )}
          className="px-2 py-1 rounded border border-border hover:bg-background text-muted-foreground"
        >
          🌐 {useAppStore.getState().locale === "es" ? "ES" : "EN"}
        </button>
        <button
          onClick={() => useAppStore.getState().toggleSidebar()}
          className="px-2 py-1 rounded border border-border hover:bg-background text-muted-foreground"
          title="Colapsar sidebar"
        >
          ☰
        </button>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/auth/signin" })}
        className="w-full px-2 py-1.5 rounded border border-border hover:border-red-400 hover:bg-red-500/5 text-muted-foreground hover:text-red-600 text-[11px] transition-colors"
      >
        🚪 {t("signOut")}
      </button>
    </div>
  );
}
