"use client";

import { useEffect, useState } from "react";
import Head from "next/head";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { StatusPill } from "@/components/shared/status-pill";
import { cn } from "@/lib/utils";

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

export default function AdminClientsPage() {
  const t = useTranslations("settings");

  return (
    <DashboardLayout>
      <Head><title>Clientes — Mission Control</title></Head>
      <h1 className="font-heading text-2xl text-navy mb-1">👥 Clientes</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      <ClientsPanel />
    </DashboardLayout>
  );
}

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

            <button
              onClick={() => setEditSlug(editSlug === client.slug ? null : client.slug)}
              className="text-xs px-3 py-1 rounded border border-border hover:border-rust text-muted-foreground"
            >
              ✏️ {tCommon("edit")}
            </button>
          </div>

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
