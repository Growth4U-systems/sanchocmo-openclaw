import { useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { Bell, ExternalLink, Inbox, Mail, MessageSquare, RefreshCw, Users } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import type { NotificationArea } from "@/lib/notifications/lead-replies";

type Filter = "all" | NotificationArea;

interface NotificationItem {
  id: string;
  kind: "lead_reply";
  area: NotificationArea;
  leadId: string;
  campaignId?: string | null;
  campaignTitle?: string | null;
  contactName: string;
  company?: string | null;
  status?: string | null;
  channel?: string | null;
  subject?: string | null;
  body: string;
  receivedAt: string;
  source: "YALC";
}

interface NotificationsPayload {
  ok: boolean;
  count: number;
  notifications: NotificationItem[];
  generatedAt: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function notificationHref(slug: string, item: NotificationItem): string {
  const params = new URLSearchParams({ tab: "inbox" });
  if (item.area === "b2b") params.set("tipo", "b2b");
  return `/dashboard/${slug}/yalc?${params.toString()}`;
}

function areaLabel(area: NotificationArea): string {
  return area === "b2b" ? "B2B" : "Partners";
}

function channelLabel(channel?: string | null): string {
  const value = (channel || "").trim();
  if (!value) return "Canal";
  if (value.toLowerCase() === "instagram") return "Instagram";
  if (value.toLowerCase() === "linkedin") return "LinkedIn";
  if (value.toLowerCase() === "email") return "Email";
  return value;
}

export default function NotificationsPage() {
  const router = useRouter();
  const slug = typeof router.query.slug === "string" ? router.query.slug : "";
  const [filter, setFilter] = useState<Filter>("all");

  const repliesQuery = useQuery({
    queryKey: ["notifications", slug, "feed"],
    queryFn: () =>
      fetchJson<NotificationsPayload>(
        `/api/notifications/feed?slug=${encodeURIComponent(slug)}`,
      ),
    enabled: !!slug,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const notifications = repliesQuery.data?.notifications || [];
  const filtered = useMemo(
    () => notifications.filter((item) => filter === "all" || item.area === filter),
    [filter, notifications],
  );
  const counts = useMemo(
    () => ({
      all: notifications.length,
      partnerships: notifications.filter((item) => item.area === "partnerships").length,
      b2b: notifications.filter((item) => item.area === "b2b").length,
    }),
    [notifications],
  );

  if (!slug) return <DashboardLayout>{null}</DashboardLayout>;

  return (
    <DashboardLayout>
      <Head>
        <title>{`Notificaciones - ${slug} - SanchoCMO`}</title>
      </Head>

      <div className="max-w-6xl">
        <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sistema
            </p>
            <h1 className="flex items-center gap-2 font-heading text-2xl text-navy">
              <span className="inline-grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-card text-rust shadow-comic-sm">
                <Bell className="h-4 w-4" />
              </span>
              <span>Notificaciones</span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Lo importante que necesita acción. Por ahora: respuestas de leads B2B y partners.
            </p>
          </div>
          <button
            type="button"
            onClick={() => repliesQuery.refetch()}
            disabled={repliesQuery.isFetching}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", repliesQuery.isFetching && "animate-spin")} />
            Actualizar
          </button>
        </header>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <SummaryCard icon={<Inbox className="h-4 w-4" />} label="Pendientes" value={counts.all} />
          <SummaryCard icon={<Users className="h-4 w-4" />} label="Partners" value={counts.partnerships} />
          <SummaryCard icon={<Mail className="h-4 w-4" />} label="B2B" value={counts.b2b} />
        </div>

        <section className="rounded-lg border-2 border-border bg-card shadow-comic-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-heading text-lg text-navy">Notificaciones pendientes</h2>
              <p className="text-sm text-muted-foreground">
                Respuestas nuevas y eventos relevantes para gestionar.
              </p>
            </div>
            <div className="inline-flex w-full overflow-hidden rounded-md border border-border bg-background md:w-auto">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="Todas" count={counts.all} />
              <FilterButton active={filter === "partnerships"} onClick={() => setFilter("partnerships")} label="Partners" count={counts.partnerships} />
              <FilterButton active={filter === "b2b"} onClick={() => setFilter("b2b")} label="B2B" count={counts.b2b} />
            </div>
          </div>

          {repliesQuery.isError && (
            <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              No se pudieron cargar las notificaciones: {repliesQuery.error.message}
            </div>
          )}

          {repliesQuery.isLoading && (
            <div className="p-6 text-sm text-muted-foreground">Cargando notificaciones...</div>
          )}

          {!repliesQuery.isLoading && !repliesQuery.isError && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted-foreground">
                <Bell className="h-5 w-5" />
              </div>
              <h3 className="font-heading text-lg text-navy">Sin respuestas pendientes</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Cuando haya una notificación importante, aparecerá aquí con el acceso directo para gestionarla.
              </p>
            </div>
          )}

          {filtered.length > 0 && (
            <ul className="divide-y divide-border">
              {filtered.map((item) => (
                <li key={item.id} className="p-4 transition-colors hover:bg-background/70">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            item.area === "b2b"
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-amber-200 bg-amber-50 text-amber-800",
                          )}
                        >
                          {areaLabel(item.area)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          {channelLabel(item.channel)}
                        </span>
                        {item.status && (
                          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {item.status}
                          </span>
                        )}
                      </div>

                      <h3 className="truncate font-semibold text-foreground">
                        {item.contactName}
                        {item.company && <span className="font-normal text-muted-foreground"> · {item.company}</span>}
                      </h3>
                      {item.subject && (
                        <p className="mt-1 text-sm font-medium text-foreground">{item.subject}</p>
                      )}
                      <p className="mt-1 break-words text-sm text-muted-foreground">{item.body}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatDate(item.receivedAt)}
                        {item.campaignTitle && ` · ${item.campaignTitle}`}
                      </p>
                    </div>

                    <Link
                      href={notificationHref(slug, item)}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-rust px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      Abrir Inbox
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-2xl text-navy">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-rust">
          {icon}
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 text-xs font-semibold transition-colors md:flex-none",
        active
          ? "bg-rust text-white"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label} <span className="opacity-80">{count}</span>
    </button>
  );
}
