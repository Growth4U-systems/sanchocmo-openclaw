"use client";

import { useState } from "react";
import Head from "next/head";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";

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
      <Head><title>Usuarios admin — Mission Control</title></Head>
      <AdminsPanel currentEmail={session?.user?.email || ""} />
    </DashboardLayout>
  );
}

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
    if (email.toLowerCase() === currentEmail.toLowerCase()) {
      setErrorMsg("No puedes quitarte a ti mismo de la lista de admins.");
      return;
    }
    if (!confirm(`¿Quitar ${email} de la lista de admins?`)) return;
    removeMutation.mutate(email);
  }

  return (
    <div>
      <h1 className="font-heading text-2xl text-navy mb-1">🔐 Administradores</h1>
      <p className="text-xs text-muted-foreground mb-5">
        Personas externas con acceso de administrador. Las cuentas <code className="text-rust">@growth4u.io</code> son admin automáticamente y no necesitan estar en esta lista.
      </p>

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
