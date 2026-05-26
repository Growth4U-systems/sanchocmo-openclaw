"use client";

import { useState } from "react";
import Head from "next/head";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { useClients } from "@/hooks/useClients";

type UserRole = "admin" | "client";
interface ManagedUser {
  email: string;
  role: UserRole;
  slugs: string[];
}

export default function AdminUsersPage() {
  const tCommon = useTranslations("common");
  const { data: session, status: sessionStatus } = useSession();

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
      <Head><title>Usuarios — Mission Control</title></Head>
      <UsersPanel currentEmail={session?.user?.email || ""} />
    </DashboardLayout>
  );
}

function UsersPanel({ currentEmail }: { currentEmail: string }) {
  const qc = useQueryClient();
  const { data: clients } = useClients();
  const allClients = (clients || []).filter((c) => c.active);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("admin");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Local-only rows not yet persisted (a client role with no clients picked).
  const [pending, setPending] = useState<ManagedUser[]>([]);

  const { data, isLoading, error: fetchError, refetch } = useQuery<{ users: ManagedUser[] }, Error>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status} — ${body}`);
      }
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const saveMutation = useMutation({
    mutationFn: async ({ email, role, slugs }: ManagedUser) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, slugs }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      return json;
    },
    onSuccess: () => {
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/admin/users", {
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
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const serverUsers = data?.users || [];
  const pendingEmails = new Set(pending.map((p) => p.email));
  const rows: ManagedUser[] = [
    ...serverUsers.filter((u) => !pendingEmails.has(u.email)),
    ...pending,
  ].sort((a, b) => a.email.localeCompare(b.email));

  const busy = saveMutation.isPending || removeMutation.isPending;

  function clearPending(email: string) {
    setPending((p) => p.filter((x) => x.email !== email));
  }

  function handleAdd() {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (e.endsWith("@growth4u.io")) {
      setErrorMsg("Las cuentas @growth4u.io ya son admin automáticamente");
      return;
    }
    if (rows.some((r) => r.email === e)) {
      setErrorMsg("Ese usuario ya está en la lista");
      return;
    }
    if (newRole === "admin") {
      saveMutation.mutate({ email: e, role: "admin", slugs: [] });
      setNewEmail("");
    } else {
      // Stage a client row so the admin can pick clients before persisting.
      setPending((p) => [...p, { email: e, role: "client", slugs: [] }]);
      setNewEmail("");
      setErrorMsg(`Marcá al menos un cliente para ${e}`);
    }
  }

  function changeRole(u: ManagedUser, role: UserRole) {
    if (role === "admin") {
      clearPending(u.email);
      saveMutation.mutate({ email: u.email, role: "admin", slugs: [] });
    } else {
      // Switch to client: stage as pending until ≥1 client is picked.
      setPending((p) => [
        ...p.filter((x) => x.email !== u.email),
        { email: u.email, role: "client", slugs: u.role === "client" ? u.slugs : [] },
      ]);
      if (u.slugs.length === 0) setErrorMsg(`Marcá al menos un cliente para ${u.email}`);
    }
  }

  function toggleSlug(u: ManagedUser, slug: string) {
    const next = u.slugs.includes(slug)
      ? u.slugs.filter((s) => s !== slug)
      : [...u.slugs, slug];
    clearPending(u.email);
    if (next.length === 0) {
      // No clients left = no access; remove the user entirely.
      removeMutation.mutate(u.email);
    } else {
      saveMutation.mutate({ email: u.email, role: "client", slugs: next });
    }
  }

  function handleRemove(u: ManagedUser) {
    if (u.email.toLowerCase() === currentEmail.toLowerCase()) {
      setErrorMsg("No puedes quitarte a ti mismo.");
      return;
    }
    if (!confirm(`¿Quitar todo el acceso de ${u.email}?`)) return;
    clearPending(u.email);
    removeMutation.mutate(u.email);
  }

  return (
    <div>
      <h1 className="font-heading text-2xl text-navy mb-1">👥 Usuarios</h1>
      <p className="text-xs text-muted-foreground mb-5">
        Gestioná quién accede a Mission Control y a qué clientes. Las cuentas <code className="text-rust">@growth4u.io</code> son admin automáticamente y no se listan aquí.
      </p>

      <ComicCard className="mb-4">
        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
          Agregar usuario
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setErrorMsg(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="email@dominio.com"
            className="flex-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserRole)}
            className="px-2 py-1.5 border-2 border-ink rounded-lg text-sm bg-background"
          >
            <option value="admin">Admin (todos)</option>
            <option value="client">Clientes específicos</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={!newEmail.trim() || busy}
            className="px-4 py-1.5 bg-rust text-white border-2 border-ink rounded-md text-sm font-bold shadow-comic hover:shadow-comic-hover hover:-translate-x-px hover:-translate-y-px active:shadow-[1px_1px_0_var(--ink)] active:translate-x-px active:translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-comic disabled:translate-x-0 disabled:translate-y-0"
          >
            ➕ Agregar
          </button>
        </div>
        {errorMsg && <p className="text-xs text-red-500 mt-2">⚠️ {errorMsg}</p>}
      </ComicCard>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : fetchError ? (
        <ComicCard>
          <p className="text-sm text-red-500 mb-2">⚠️ No se pudo cargar la lista de usuarios.</p>
          <p className="text-xs text-muted-foreground mb-3">{fetchError.message}</p>
          <button onClick={() => refetch()} className="px-3 py-1 text-xs border border-border rounded hover:border-rust">
            🔄 Reintentar
          </button>
        </ComicCard>
      ) : rows.length === 0 ? (
        <ComicCard>
          <p className="text-sm text-muted-foreground text-center py-3">
            No hay usuarios configurados. Solo los <code>@growth4u.io</code> tienen acceso.
          </p>
        </ComicCard>
      ) : (
        <div className="space-y-2">
          {rows.map((u) => {
            const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
            return (
              <ComicCard key={u.email}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-sm truncate min-w-0">
                    {u.email}
                    {isSelf && <span className="ml-2 text-[10px] text-muted-foreground">(tú)</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={u.role}
                      disabled={isSelf || busy}
                      onChange={(e) => changeRole(u, e.target.value as UserRole)}
                      className="px-2 py-1 border border-border rounded-md text-xs bg-background disabled:opacity-50"
                    >
                      <option value="admin">Admin (todos)</option>
                      <option value="client">Clientes específicos</option>
                    </select>
                    <button
                      onClick={() => handleRemove(u)}
                      disabled={isSelf || busy}
                      title={isSelf ? "No puedes quitarte a ti mismo" : "Quitar acceso"}
                      className="text-xs px-2.5 py-1 rounded border border-border hover:border-red-500 hover:text-red-500 text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                {u.role === "client" && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {allClients.map((c) => {
                      const on = u.slugs.includes(c.slug);
                      return (
                        <button
                          key={c.slug}
                          onClick={() => toggleSlug(u, c.slug)}
                          disabled={busy}
                          className={
                            "text-xs px-2.5 py-1 rounded-md border-2 transition-all disabled:opacity-50 " +
                            (on
                              ? "bg-rust text-white border-ink"
                              : "bg-background text-muted-foreground border-border hover:border-rust")
                          }
                        >
                          {c.emoji || "🏢"} {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ComicCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
