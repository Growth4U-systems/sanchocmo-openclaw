import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";
import { useClients } from "@/hooks/useClients";
import { useUnreadCount } from "@/hooks/useChat";
import { navigateToClient } from "@/lib/navigation";

/**
 * Sidebar — faithful replica of legacy mission-control.html <nav>.
 *
 * Structure (from legacy HTML):
 *   Logo + version
 *   Client Selector
 *   💬 Chat con Sancho (client only)
 *   ── Overview ──
 *     📊 Dashboard
 *   ── [client name] ──  (client only)
 *     📂 Documents
 *   ── Trabajo ──  (client only)
 *     📋 Proyectos
 *     💡 Idea Bank
 *     📈 Métricas
 *   ── Herramientas ──  (client only)
 *     🔍 Trust Engine
 *     🏰 Atalaya
 *   ── Sistema ──
 *     📡 Activity
 *   ── spacer ──
 *   ── Footer ──
 *     User avatar + name (clickable → dropdown)
 *     Dropdown: Changelog, Guía, Dark mode, Settings, Regenerar
 */

export function Sidebar() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    const handleRouteChange = () => setMobileOpen(false);
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router]);

  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  // Sidebar scope is derived from the URL, not the Zustand store: on admin or
  // global routes we never render client-only sections, even if the store
  // still holds the last client the user was working with.
  const slug = (router.query.slug as string | undefined) || null;
  const unreadCount = useUnreadCount(slug);

  const dashboardHref = slug ? `/dashboard/${slug}` : "/dashboard";

  function clientHref(path: string) {
    return slug ? `/dashboard/${slug}${path}` : "/dashboard";
  }

  function isActive(href: string) {
    const path = router.asPath.split("?")[0];
    return path === href || path.startsWith(href + "/");
  }

  // Home routes (global or client dashboard) should match only the exact
  // URL — otherwise the Dashboard link would show active on every sub-page
  // since it is a prefix of their paths.
  function isExact(href: string) {
    return router.asPath.split("?")[0] === href;
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
          "fixed top-0 left-0 h-screen bg-card border-r-2 border-border z-[60] flex flex-col transition-all duration-200",
          sidebarOpen ? "lg:w-[220px]" : "lg:w-[60px]",
          mobileOpen ? "w-[260px]" : "max-lg:-translate-x-full",
          "max-lg:w-[260px]"
        )}
        style={{ padding: sidebarOpen ? "16px 12px" : "16px 8px" }}
      >
        {/* ─── Fixed header: logo + client selector + chat ─── */}
        <div className="flex-shrink-0">
          {sidebarOpen ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="SanchoCMO" className="w-full h-auto block" />
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="inline-block bg-rust text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-md border-2 border-ink">
                    v2.0
                  </span>
                  {process.env.NEXT_PUBLIC_ENV_LABEL && (
                    <span className="inline-block bg-amber-400 text-ink text-[10px] font-semibold px-2.5 py-0.5 rounded-md border-2 border-ink uppercase">
                      {process.env.NEXT_PUBLIC_ENV_LABEL}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => useAppStore.getState().toggleSidebar()}
                className="hidden lg:flex shrink-0 w-6 h-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground text-xs"
                aria-label={t("sidebar.collapse")}
                title={t("sidebar.collapse")}
              >
                «
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => useAppStore.getState().toggleSidebar()}
              className="w-full flex justify-center"
              aria-label={t("sidebar.expand")}
              title={t("sidebar.expand")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.webp" alt="SanchoCMO" className="w-10 h-10 object-contain" />
            </button>
          )}

          {isAdmin && sidebarOpen && (
            <div className="mt-3">
              <ClientSelector />
            </div>
          )}

          {slug && sidebarOpen && (
            <button
              onClick={() => {
                useChatStore.getState().setCurrentSlug(slug);
                useChatStore.getState().toggleSidebar();
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 mt-2 bg-rust text-white rounded-lg font-bold text-[13px] hover:opacity-90 justify-center relative"
            >
              💬 {t("chat.title")}
              {unreadCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* ─── Scrollable middle: nav sections ─── */}
        <nav className="flex-1 min-h-0 overflow-y-auto mt-1 -mx-1 px-1">
          {/* ── Overview ── */}
          <SectionLabel text={t("nav.overview")} visible={sidebarOpen} />
          <NavLink
            href={dashboardHref}
            icon="📊"
            label={t("nav.dashboard")}
            active={isExact(dashboardHref)}
            collapsed={!sidebarOpen}
          />

          {/* ── Client section ── */}
          {slug && (
            <>
              <SectionLabel text={slug} visible={sidebarOpen} />
              <NavLink
                href={clientHref("/foundation")}
                icon="📂"
                label={t("nav.documents")}
                active={isActive(clientHref("/foundation"))}
                collapsed={!sidebarOpen}
              />

              <SectionLabel text={t("nav.work")} visible={sidebarOpen} />
              <NavLink href={clientHref("/projects")} icon="📋" label={t("nav.projects")} active={isActive(clientHref("/projects"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/content-creation")} icon="✏️" label="Content Creation" active={isActive(clientHref("/content-creation"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/outreach")} icon="📤" label="Outreach" active={isActive(clientHref("/outreach"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/ideas")} icon="💡" label={t("nav.ideas")} active={isActive(clientHref("/ideas"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/metrics")} icon="📈" label={t("nav.metrics")} active={isActive(clientHref("/metrics"))} collapsed={!sidebarOpen} />

              <SectionLabel text={t("nav.tools")} visible={sidebarOpen} />
              <NavLink href={clientHref("/trust-engine")} icon="🔍" label={t("nav.trustEngine")} active={isActive(clientHref("/trust-engine"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/atalaya")} icon="🏰" label={t("nav.atalaya")} active={isActive(clientHref("/atalaya"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/activity")} icon="📡" label={t("nav.activity")} active={isActive(clientHref("/activity"))} collapsed={!sidebarOpen} />
              <NavLink href={clientHref("/settings")} icon="⚙️" label={t("nav.settings")} active={isActive(clientHref("/settings"))} collapsed={!sidebarOpen} />
            </>
          )}

          {/* ── Sistema ── */}
          <SectionLabel text={t("nav.system")} visible={sidebarOpen} />
          <NavLink
            href="/dashboard/admin/activity"
            icon="📡"
            label={t("nav.activity")}
            active={isActive("/dashboard/admin/activity")}
            collapsed={!sidebarOpen}
          />
          <NavLink
            href="/dashboard/admin/settings"
            icon="⚙️"
            label={t("nav.settings")}
            active={isActive("/dashboard/admin/settings")}
            collapsed={!sidebarOpen}
          />
        </nav>

        {/* ─── Fixed footer: user menu ─── */}
        <div className="flex-shrink-0 border-t border-border pt-3 mt-3">
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
    <div className="text-[12px] text-muted-foreground font-semibold mt-3.5 mb-2 px-3">
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
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all mb-px",
        active
          ? "bg-background text-rust font-semibold"
          : "text-muted-foreground hover:bg-background hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : undefined}
    >
      <span className="text-sm">{icon}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </Link>
  );
}

function ClientSelector() {
  const t = useTranslations("sidebar");
  const router = useRouter();
  const { data: clients } = useClients();

  // The selector mirrors the URL, not a parallel store. On admin/global
  // routes there is no slug in the URL, so the dropdown shows "global".
  const urlSlug = (router.query.slug as string | undefined) || null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    navigateToClient(router, value === "global" ? null : value);
  };

  return (
    <select
      value={urlSlug || "global"}
      onChange={handleChange}
      className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-rust"
    >
      <option value="global">🌐 {t("allClients")}</option>
      {(clients || []).filter((c) => c.active).map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.emoji || "🏢"} {c.name}
        </option>
      ))}
    </select>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const { toggleTheme, theme } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const name = session?.user?.name || "Alfonso";
  const initial = name.charAt(0).toUpperCase();
  const role = (session?.user as { role?: string })?.role === "admin" ? t("sidebar.admin") : t("sidebar.client");

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={() => useAppStore.getState().toggleSidebar()}
          className="w-8 h-8 rounded-full bg-rust text-white flex items-center justify-center text-xs font-bold"
          title={name}
        >
          {initial}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* User menu dropdown (above the avatar, like legacy) */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-[100]">
            <DropdownItem icon="📜" label={t("nav.changelog")} onClick={() => { router.push("/dashboard/changelog"); setMenuOpen(false); }} />
            <DropdownItem icon="📖" label={t("settings.howToStart")} onClick={() => { router.push("/dashboard/guide"); setMenuOpen(false); }} />
            <DropdownItem
              icon="🌗"
              label={theme === "light" ? t("theme.dark") : t("theme.light")}
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
            />
            <DropdownItem
              icon="🌐"
              label={useAppStore.getState().locale === "es" ? t("language.en") : t("language.es")}
              onClick={() => {
                useAppStore.getState().setLocale(useAppStore.getState().locale === "es" ? "en" : "es");
                setMenuOpen(false);
              }}
            />
            <button
              onClick={() => { signOut({ callbackUrl: "/auth/signin" }); setMenuOpen(false); }}
              className="w-full text-left px-3.5 py-2 text-xs text-red-500 hover:bg-background transition-colors"
            >
              🚪 {t("auth.signOut")}
            </button>
          </div>
        </>
      )}

      {/* User avatar row (clickable) */}
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background transition-colors cursor-pointer text-left"
      >
        <div className="w-7 h-7 rounded-full bg-rust text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{name}</div>
          <div className="text-[10px] text-muted-foreground">{role}</div>
        </div>
        <span className="text-[10px] text-muted-foreground">⋯</span>
      </button>
    </div>
  );
}

function DropdownItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3.5 py-2 text-xs text-foreground hover:bg-background transition-colors border-b border-border last:border-b-0"
    >
      {icon} {label}
    </button>
  );
}
