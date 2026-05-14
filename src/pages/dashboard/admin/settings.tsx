"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { TabGroup } from "@/components/shared/tab-group";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/stores/app";
import { AgentsPanel } from "@/components/settings/agents-panel";
import { SkillsPanel } from "@/components/settings/skills-panel";
import { DispatchPanel } from "@/components/settings/dispatch-panel";
import { StrategiesPanel } from "@/components/settings/strategies-panel";
import { RecurringPanel } from "@/components/settings/recurring-panel";
import { ApisConnectorsPanel } from "@/components/settings/ApisConnectorsPanel";
import { TaskIndexPanel } from "@/components/settings/TaskIndexPanel";

interface ClientFull {
  slug: string;
  name: string;
  emoji: string;
  phase: number;
  active: boolean;
  language: string;
  url: string;
  enabledFeatures: string[];
}

const TAB_KEYS = ["apis", "agents", "skills", "dispatch", "strategies", "recurring", "task-index", "clients", "admins", "preferences"] as const;
type TabKey = typeof TAB_KEYS[number];
const TAB_ICONS: Record<string, string> = {
  apis: "🔌", agents: "🤖", skills: "🧰", dispatch: "📡",
  strategies: "🎯", recurring: "🔄", "task-index": "📋", clients: "👥", admins: "🔐", preferences: "⚙️",
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const slug = useAppStore((s) => s.selectedClient) || "";
  const queryTab = typeof router.query.tab === "string" ? router.query.tab : null;
  const [activeTab, setActiveTab] = useState("apis");

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";

  // Tabs filtered by role — the "admins" tab only renders for admins.
  // The API also enforces this server-side, so a hand-crafted URL can't
  // bypass the gate.
  const visibleTabs = useMemo(
    () => TAB_KEYS.filter((key) => (key === "admins" ? isAdmin : true)),
    [isAdmin]
  );

  const TABS = useMemo(
    () => visibleTabs.map((key) => {
      // "admins" not in translation files; hardcode label for it.
      const label = key === "admins" ? "Admins" : t(`tabs.${key}` as Parameters<typeof t>[0]);
      return { key, label: `${TAB_ICONS[key]} ${label}` };
    }),
    [t, visibleTabs]
  );

  // Sync tab from URL query param while respecting role-gated tabs.
  useEffect(() => {
    if (queryTab && visibleTabs.includes(queryTab as TabKey)) {
      setActiveTab(queryTab);
    } else if (!visibleTabs.includes(activeTab as TabKey)) {
      setActiveTab("apis");
    }
  }, [activeTab, queryTab, visibleTabs]);

  // Wait for session to load
  if (sessionStatus === "loading") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{tCommon("loading")}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head><title>{t("title")} — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">⚙️ {t("title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{slug ? `${slug} — ` : ""}{t("subtitle")}</p>

      <TabGroup tabs={TABS} activeTab={activeTab} onChange={(key) => {
        setActiveTab(key);
        router.replace({ query: { ...router.query, tab: key } }, undefined, { shallow: true });
      }} />

      {activeTab === "apis" && <ApisConnectorsPanel />}
      {activeTab === "agents" && <AgentsPanel />}
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "dispatch" && <DispatchPanel />}
      {activeTab === "strategies" && <StrategiesPanel />}
      {activeTab === "recurring" && <RecurringPanel />}
      {activeTab === "task-index" && slug && <TaskIndexPanel slug={slug} />}
      {activeTab === "clients" && <ClientsPanel />}
      {activeTab === "admins" && isAdmin && <AdminsPanel currentEmail={session?.user?.email || ""} />}
      {activeTab === "preferences" && <PreferencesPanel />}
    </DashboardLayout>
  );
}

// ============================================================
// Clients Panel — CRUD for clients
// ============================================================

function ClientsPanel() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const qc = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const { data: clients, isLoading } = useQuery<ClientFull[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) return [];
      const d = await res.json();
      return d.clients || [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ slug, active }: { slug: string; active: boolean }) => {
      const res = await fetch("/api/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, updates: { active } }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const updateClient = useMutation({
    mutationFn: async ({ slug, updates }: { slug: string; updates: Record<string, unknown> }) => {
      const res = await fetch("/api/clients/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, updates }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const createClient = useMutation({
    mutationFn: async (payload: {
      slug: string;
      name: string;
      emoji: string;
      url: string;
      guild: string;
      language: string;
      active: boolean;
    }) => {
      const res = await fetch("/api/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setCreateError(null);
      setShowCreateForm(false);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const [editSlug, setEditSlug] = useState<string | null>(null);

  if (isLoading) return <p className="text-muted-foreground">{t("loadingClients")}</p>;

  const allClients = clients || [];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm text-muted-foreground">
          {allClients.filter((c) => c.active).length} activos de {allClients.length} totales
        </p>
        <button
          onClick={() => {
            setCreateError(null);
            setShowCreateForm((value) => !value);
          }}
          className="px-4 py-1.5 bg-rust text-white border-2 border-ink rounded-md text-sm font-bold shadow-comic hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all"
        >
          {showCreateForm ? "Cerrar" : "➕ Nuevo cliente"}
        </button>
      </div>

      {showCreateForm && (
        <ClientCreateForm
          existingSlugs={allClients.map((client) => client.slug)}
          isSaving={createClient.isPending}
          error={createError}
          onSave={(payload) => createClient.mutate(payload)}
          onCancel={() => {
            setCreateError(null);
            setShowCreateForm(false);
          }}
        />
      )}

      {allClients.map((client) => (
        <ComicCard
          key={client.slug}
          className={cn(!client.active && "opacity-50")}
        >
          <div className="flex items-center gap-4">
            {/* Toggle */}
            <button
              onClick={() => toggleActive.mutate({ slug: client.slug, active: !client.active })}
              className={cn(
                "w-11 h-6 rounded-full transition-colors flex-shrink-0 relative",
                client.active ? "bg-sage" : "bg-border"
              )}
              title={client.active ? t("deactivate") : t("activate")}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full bg-white border border-ink absolute top-0.5 transition-all",
                  client.active ? "left-5" : "left-0.5"
                )}
              />
            </button>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">{client.emoji || "🏢"}</span>
                <span className="font-heading font-bold text-base">{client.name}</span>
                <StatusPill status={client.active ? "active" : "inactive"} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                <span>{client.slug}</span>
                <span>{tCommon("phase")} {client.phase}</span>
                <span>🌐 {client.language || "es"}</span>
                {client.url && <span className="truncate max-w-[200px]">{client.url}</span>}
              </div>
            </div>

            {/* Edit button */}
            <button
              onClick={() => setEditSlug(editSlug === client.slug ? null : client.slug)}
              className="text-xs px-3 py-1 rounded border border-border hover:border-rust text-muted-foreground"
            >
              ✏️ {tCommon("edit")}
            </button>
          </div>

          {/* Inline edit form */}
          {editSlug === client.slug && (
            <ClientEditForm
              client={client}
              onSave={(updates) => {
                updateClient.mutate({ slug: client.slug, updates });
                setEditSlug(null);
              }}
              onCancel={() => setEditSlug(null)}
            />
          )}
        </ComicCard>
      ))}
    </div>
  );
}

function slugifyClientName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function ClientCreateForm({
  existingSlugs,
  isSaving,
  error,
  onSave,
  onCancel,
}: {
  existingSlugs: string[];
  isSaving: boolean;
  error: string | null;
  onSave: (payload: {
    slug: string;
    name: string;
    emoji: string;
    url: string;
    guild: string;
    language: string;
    active: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [emoji, setEmoji] = useState("🏢");
  const [url, setUrl] = useState("");
  const [guild, setGuild] = useState("");
  const [language, setLanguage] = useState("es");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyClientName(name));
  }, [name, slugTouched]);

  const normalizedSlug = slug.trim().toLowerCase();
  const slugExists = existingSlugs.includes(normalizedSlug);
  const canSave =
    Boolean(name.trim()) &&
    /^[a-z0-9][a-z0-9-]*$/.test(normalizedSlug) &&
    /^\d{17,20}$/.test(guild.trim()) &&
    !slugExists &&
    !isSaving;

  return (
    <ComicCard className="border-dashed border-rust/70">
      <div className="space-y-4">
        <div>
          <h3 className="font-heading text-base text-navy">➕ Nuevo cliente</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crea el cliente en Mission Control, genera token de portal y prepara la carpeta base en brand/.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme"
              className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Slug</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugifyClientName(e.target.value));
              }}
              placeholder="acme"
              className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
            {slugExists && <p className="text-[11px] text-red-500 mt-1">Ese slug ya existe.</p>}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Discord Guild ID</label>
            <input
              value={guild}
              onChange={(e) => setGuild(e.target.value.replace(/\D/g, "").slice(0, 20))}
              placeholder="123456789012345678"
              className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Website</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Emoji</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Idioma</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-rust"
          />
          Activar cliente al crearlo
        </label>

        {error && <p className="text-xs text-red-500">⚠️ {error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => onSave({
              slug: normalizedSlug,
              name: name.trim(),
              emoji: emoji.trim() || "🏢",
              url: url.trim(),
              guild: guild.trim(),
              language,
              active,
            })}
            disabled={!canSave}
            className="px-4 py-1.5 bg-rust text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Creando..." : "Crear cliente"}
          </button>
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-1.5 border border-border rounded-lg text-sm text-muted-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </ComicCard>
  );
}

function ClientEditForm({
  client,
  onSave,
  onCancel,
}: {
  client: ClientFull;
  onSave: (updates: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(client.name);
  const [emoji, setEmoji] = useState(client.emoji || "");
  const [url, setUrl] = useState(client.url || "");
  const [language, setLanguage] = useState(client.language || "es");
  const [phase, setPhase] = useState(client.phase);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("emoji")}</label>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("url")}</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{t("clientLanguage")}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">{tCommon("phase")}</label>
          <input
            type="number"
            value={phase}
            onChange={(e) => setPhase(Number(e.target.value))}
            className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ name, emoji, url, language, phase })}
          className="px-4 py-1.5 bg-rust text-white rounded-lg text-sm font-semibold"
        >
          {tCommon("save")}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 border border-border rounded-lg text-sm text-muted-foreground"
        >
          {tCommon("cancel")}
        </button>
      </div>
    </div>
  );
}


// ============================================================
// Admins Panel — manage external admin allowlist (adminEmails)
// ============================================================

function AdminsPanel({ currentEmail }: { currentEmail: string }) {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ emails: string[] }>({
    queryKey: ["admin-emails"],
    queryFn: async () => {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) throw new Error("Failed to load admins");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setNewEmail("");
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["admin-emails"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/admin/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["admin-emails"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const emails = data?.emails || [];

  function handleAdd() {
    const e = newEmail.trim();
    if (!e) return;
    addMutation.mutate(e);
  }

  function handleRemove(email: string) {
    // Guard: don't let user remove themselves
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      setErrorMsg("No puedes quitarte a ti mismo de la lista de admins.");
      return;
    }
    if (!confirm(`¿Quitar ${email} de la lista de admins?`)) return;
    removeMutation.mutate(email);
  }

  return (
    <div>
      <h2 className="font-heading text-lg text-navy mb-1">🔐 Administradores</h2>
      <p className="text-xs text-muted-foreground mb-5">
        Personas externas con acceso de administrador. Las cuentas <code className="text-rust">@growth4u.io</code> son admin automáticamente y no necesitan estar en esta lista.
      </p>

      {/* Add form */}
      <ComicCard className="mb-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
            Agregar admin externo
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setErrorMsg(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="email@dominio.com"
              className="flex-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
              disabled={addMutation.isPending}
            />
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending || !newEmail.trim()}
              className="px-4 py-1.5 bg-rust text-white border-2 border-ink rounded-md text-sm font-bold shadow-comic hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-comic disabled:translate-x-0 disabled:translate-y-0"
            >
              {addMutation.isPending ? "⏳..." : "➕ Agregar"}
            </button>
          </div>
          {errorMsg && (
            <p className="text-xs text-red-500 mt-2">⚠️ {errorMsg}</p>
          )}
        </div>
      </ComicCard>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : emails.length === 0 ? (
        <ComicCard>
          <p className="text-sm text-muted-foreground text-center py-3">
            No hay admins externos. Solo los <code>@growth4u.io</code> tienen acceso de admin.
          </p>
        </ComicCard>
      ) : (
        <div className="space-y-2">
          {emails.map((email) => {
            const isSelf = email.toLowerCase() === currentEmail.toLowerCase();
            return (
              <ComicCard key={email}>
                <div className="flex items-center gap-3">
                  <span className="text-base">🔐</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm truncate">{email}</div>
                    {isSelf && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">(tú mismo)</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(email)}
                    disabled={isSelf || removeMutation.isPending}
                    className="text-xs px-3 py-1 rounded border border-border hover:border-red-500 hover:text-red-500 text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
                    title={isSelf ? "No puedes quitarte a ti mismo" : "Quitar admin"}
                  >
                    🗑 Quitar
                  </button>
                </div>
              </ComicCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Preferences Panel
// ============================================================

function PreferencesPanel() {
  const [username, setUsername] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mc-user-name") || "" : ""
  );
  const [lang, setLang] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mc-lang") || "es" : "es"
  );
  const [theme, setTheme] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("mc-theme") || "auto" : "auto"
  );

  const savePref = (key: string, value: string) => {
    localStorage.setItem(key, value);
  };

  const applyTheme = (val: string) => {
    setTheme(val);
    savePref("mc-theme", val);
    if (val === "dark") document.documentElement.dataset.theme = "dark";
    else if (val === "light") document.documentElement.dataset.theme = "";
    else document.documentElement.removeAttribute("data-theme");
  };

  return (
    <div>
      <h2 className="font-heading text-lg text-navy mb-3">⚙️ Preferencias</h2>
      <ComicCard>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                savePref("mc-user-name", e.target.value);
              }}
              placeholder="Tu nombre"
              className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Idioma
            </label>
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
                savePref("mc-lang", e.target.value);
              }}
              className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            >
              <option value="es">🇪🇸 Español</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
              Tema
            </label>
            <select
              value={theme}
              onChange={(e) => applyTheme(e.target.value)}
              className="w-full max-w-sm px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
            >
              <option value="auto">🌗 Auto (sistema)</option>
              <option value="light">☀️ Claro</option>
              <option value="dark">🌙 Oscuro</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Las preferencias se guardan localmente en el navegador.
          </p>
        </div>
      </ComicCard>
    </div>
  );
}
