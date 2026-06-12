import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { buildNewTaskThread } from "@/lib/chat-openers";
import { cn } from "@/lib/utils";
import { navigateToClient } from "@/lib/navigation";
import { useClients } from "@/hooks/useClients";
import { useUnreadCount } from "@/hooks/useChat";

// Sidebar — primary nav (client-aware).

export function Sidebar() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedClient, sidebarOpen } = useAppStore();
  const { data: clients } = useClients();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    const handleRouteChange = () => setMobileOpen(false);
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router]);

  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const allowedSlugs = (session?.user as { allowedSlugs?: string[] | null })?.allowedSlugs;
  const isMultiClient = !isAdmin && !!allowedSlugs && allowedSlugs.length > 0;
  const routeSlug = typeof router.query.slug === "string" ? router.query.slug : null;
  // The client whose section/nav is active: an explicit store selection, else
  // the slug in the URL. Using the route slug means a client routed straight to
  // /dashboard/[slug] still gets the full client menu, even though they have no
  // client selector to populate the store.
  const activeSlug = selectedClient || routeSlug;
  const fallbackClient = clients?.find((client) => client.active)?.slug || null;
  const slug = activeSlug || fallbackClient;
  // Chat targets a concrete client only — never the "all clients"/global view,
  // so we deliberately exclude the fallback client here.
  const chatSlug = activeSlug;
  const unreadCount = useUnreadCount(chatSlug);

  function clientHref(path: string) {
    return slug ? `/dashboard/${slug}${path}` : "/dashboard";
  }

  function isActive(href: string) {
    const currentPath = router.asPath.split("#")[0].split("?")[0];
    return currentPath === href || currentPath.startsWith(href + "/");
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
          "fixed top-0 left-0 h-screen bg-card border-r-2 border-border z-[60] flex flex-col transition-all duration-200 overflow-hidden",
          sidebarOpen ? "lg:w-[220px]" : "lg:w-[60px]",
          mobileOpen ? "w-[260px]" : "max-lg:-translate-x-full",
          "max-lg:w-[260px]"
        )}
        style={{ padding: sidebarOpen ? "16px 12px" : "16px 8px" }}
      >
        {/* Logo + collapse toggle (fixed top) */}
        {sidebarOpen ? (
          <div className="mb-0.5 flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="SanchoCMO" className="flex-1 min-w-0 h-auto block" />
            <EnvBadge />
            <CollapseToggle collapsed={false} />
          </div>
        ) : (
          <div className="mb-0.5 flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="SanchoCMO" className="w-10 h-10 object-contain" />
            <CollapseToggle collapsed={true} />
          </div>
        )}

        {/* Client Selector */}
        {(isAdmin || isMultiClient) && sidebarOpen && (
          <div className="mt-3">
            <ClientSelector showGlobal={isAdmin} />
          </div>
        )}

        {/* Chat button (concrete client only — hidden in the global view) */}
        {chatSlug && sidebarOpen && (
          <button
            onClick={() => {
              // "Nueva tarea": open a fresh blank chat with Sancho in fullscreen,
              // ready to describe a new task (no auto-message). See chatEntries.new-task.
              const cfg = buildNewTaskThread(chatSlug);
              const chat = useChatStore.getState();
              chat.setCurrentSlug(chatSlug);
              chat.openSidebar(cfg);
              useChatStore.setState({ isFullscreen: true });
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 mt-2 bg-rust text-white rounded-lg font-bold text-[13px] hover:opacity-90 justify-center relative"
          >
            ➕ {t("chat.newTask")}
            {unreadCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Nav — the only scrollable region (between dropdown and user data) */}
        <nav className="flex-1 min-h-0 overflow-y-auto mt-1">
        {/* ── Overview ── */}
        <SectionLabel text={t("nav.overview")} visible={sidebarOpen} />
        <NavLink
          href={activeSlug ? `/dashboard/${activeSlug}` : "/dashboard"}
          icon="📊"
          label={t("nav.dashboard")}
          active={
            activeSlug
              ? router.asPath.split("?")[0].split("#")[0] === `/dashboard/${activeSlug}`
              : router.asPath.split("?")[0].split("#")[0] === "/dashboard"
          }
          collapsed={!sidebarOpen}
        />

        {/* ── Client section ── */}
        {activeSlug && (
          <>
            <NavLink
              href={clientHref("/brand-brain")}
              icon="🧠"
              label={t("nav.brandBrain")}
              active={isActive(clientHref("/brand-brain")) || isActive(clientHref("/foundation"))}
              collapsed={!sidebarOpen}
            />

            {/* ── Trabajo ── */}
            <SectionLabel text={t("nav.work")} visible={sidebarOpen} />
            <NavLink href={clientHref("/tasks")} icon="📋" label={t("nav.tasks")} active={isActive(clientHref("/tasks")) || isActive(clientHref("/projects"))} collapsed={!sidebarOpen} />
            <NavLink href={clientHref("/content-creation")} icon="✏️" label="Content Creation" active={isActive(clientHref("/content-creation"))} collapsed={!sidebarOpen} />
            <NavLink href={clientHref("/media-creation")} icon="🎨" label="Media Creation" active={isActive(clientHref("/media-creation"))} collapsed={!sidebarOpen} />
            <NavLink href={clientHref("/yalc")} icon="📤" label="Outreach" active={isActive(clientHref("/yalc"))} collapsed={!sidebarOpen} />
            <NavLink href={clientHref("/metrics")} icon="📈" label={t("nav.metrics")} active={isActive(clientHref("/metrics"))} collapsed={!sidebarOpen} />

            {/* ── Herramientas ── */}
            <SectionLabel text={t("nav.tools")} visible={sidebarOpen} />
            <NavLink href={clientHref("/trust-engine")} icon="🔍" label={t("nav.trustEngine")} active={isActive(clientHref("/trust-engine"))} collapsed={!sidebarOpen} />
            <NavLink href={clientHref("/intelligence")} icon="🧠" label="Intelligence" active={isActive(clientHref("/intelligence"))} collapsed={!sidebarOpen} />
          </>
        )}

        {/* ── Sistema ── */}
        <SectionLabel text={t("nav.system")} visible={sidebarOpen} />
        <NavLink
          href={activeSlug ? clientHref("/activity") : "/dashboard/admin/activity"}
          icon="📡"
          label={t("nav.activity")}
          active={activeSlug ? isActive(clientHref("/activity")) : isActive("/dashboard/admin/activity")}
          collapsed={!sidebarOpen}
        />
        <NavLink
          href={activeSlug ? clientHref("/settings") : "/dashboard/admin/settings"}
          icon="⚙️"
          label={t("nav.settings")}
          active={activeSlug ? isActive(clientHref("/settings")) : isActive("/dashboard/admin/settings")}
          collapsed={!sidebarOpen}
        />
        {isAdmin && !activeSlug && (
          <>
            <NavLink
              href="/dashboard/admin/clients"
              icon="👥"
              label="Clientes"
              active={isActive("/dashboard/admin/clients")}
              collapsed={!sidebarOpen}
            />
            <NavLink
              href="/dashboard/admin/users"
              icon="🔐"
              label="Usuarios"
              active={isActive("/dashboard/admin/users")}
              collapsed={!sidebarOpen}
            />
          </>
        )}

        </nav>

        {/* Footer — User menu (version lives in the role line) */}
        <div className="border-t border-border pt-3 mt-3">
          <UserFooter collapsed={!sidebarOpen} />
        </div>
      </aside>
    </>
  );
}

// --- Sub-components ---

function CollapseToggle({ collapsed }: { collapsed: boolean }) {
  // Desktop only — on mobile the sidebar is a full-width drawer.
  return (
    <button
      type="button"
      onClick={() => useAppStore.getState().toggleSidebar()}
      className="hidden lg:flex w-6 h-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground flex-shrink-0 transition-colors"
      aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
      title={collapsed ? "Expandir" : "Colapsar"}
    >
      {collapsed ? "›" : "‹"}
    </button>
  );
}

function EnvBadge() {
  // STAGING/PREVIEW badge by the logo — set via NEXT_PUBLIC_ENV_LABEL; empty in prod.
  const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL;
  if (!envLabel) return null;
  return (
    <span className="flex-shrink-0 bg-rust text-white text-[9px] font-semibold px-1.5 py-0.5 rounded border border-ink uppercase tracking-wide leading-none">
      {envLabel}
    </span>
  );
}

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
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        router.push(href);
      }}
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

function ClientSelector({ showGlobal = true }: { showGlobal?: boolean }) {
  const t = useTranslations("sidebar");
  const router = useRouter();
  const { selectedClient, setSelectedClient } = useAppStore();
  const { data: clients } = useClients();
  const activeClients = (clients || []).filter((c) => c.active);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "global") {
      setSelectedClient(null);
      navigateToClient(router, null);
    } else {
      setSelectedClient(value);
      navigateToClient(router, value);
    }
  };

  // Non-admins (multi-client members) have no global view — default to a client.
  const effectiveValue = selectedClient || (showGlobal ? "global" : activeClients[0]?.slug || "");

  return (
    <select
      value={effectiveValue}
      onChange={handleChange}
      className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-rust"
    >
      {showGlobal && <option value="global">🌐 {t("allClients")}</option>}
      {activeClients.map((c) => (
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
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const sessionUser = session?.user as { role?: string; allowedSlugs?: string[] | null } | undefined;
  // admin → Admin; scoped team member (allowedSlugs) → Colaborador; the
  // client themselves (single-slug portal) → Cliente.
  const role =
    sessionUser?.role === "admin"
      ? t("sidebar.admin")
      : sessionUser?.allowedSlugs && sessionUser.allowedSlugs.length > 0
      ? t("sidebar.collaborator")
      : t("sidebar.client");

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
          <div className="text-[10px] text-muted-foreground truncate">
            {role}
            {version && <span className="opacity-70"> · v{version}</span>}
          </div>
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
