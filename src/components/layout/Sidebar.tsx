import { useRouter } from "next/router";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
  { href: "/dashboard/admin/tasks", icon: "📋", labelKey: "tasks", adminOnly: true },
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

  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const slug = selectedClient;

  function clientHref(path: string) {
    return slug ? `/dashboard/${slug}${path}` : "/dashboard";
  }

  function isActive(href: string) {
    return router.asPath === href || router.asPath.startsWith(href + "/");
  }

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-card border-r-[3px] border-ink z-50 flex flex-col transition-all duration-200",
        sidebarOpen ? "w-[220px]" : "w-[60px]"
      )}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-1">
        <h1
          className={cn(
            "font-heading text-rust transition-all",
            sidebarOpen ? "text-xl" : "text-sm text-center"
          )}
        >
          {sidebarOpen ? "Mission Control" : "MC"}
        </h1>
        <span className="inline-block bg-rust text-white text-[10px] font-semibold px-2 py-0.5 rounded border-2 border-ink mt-1">
          v2.0
        </span>
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

  // TODO: Load actual clients from API
  const clients = [
    { slug: "hospital-capilar", name: "Hospital Capilar", emoji: "🏥" },
    { slug: "growth4u", name: "Growth4U", emoji: "🚀" },
  ];

  return (
    <select
      value={selectedClient || "global"}
      onChange={(e) => setSelectedClient(e.target.value === "global" ? null : e.target.value)}
      className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-rust"
    >
      <option value="global">🌐 Todos los clientes</option>
      {clients.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.emoji} {c.name}
        </option>
      ))}
    </select>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { data: session } = useSession();
  const { toggleTheme, theme } = useAppStore();
  const name = session?.user?.name || "Admin";
  const initial = name.charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <button
        onClick={toggleTheme}
        className="w-8 h-8 mx-auto rounded-full bg-rust text-white flex items-center justify-center text-xs font-bold"
        title={name}
      >
        {initial}
      </button>
    );
  }

  return (
    <div className="space-y-1">
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
          {theme === "light" ? "🌗 Dark" : "☀️ Light"}
        </button>
        <Link
          href="/dashboard/admin/settings"
          className="flex-1 px-2 py-1 rounded border border-border hover:bg-background text-muted-foreground text-center"
        >
          ⚙️
        </Link>
      </div>
    </div>
  );
}
