"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { KanbanBoard, type KanbanColumn } from "@/components/shared/kanban-board";
import { cn } from "@/lib/utils";

interface CervantesTask {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  proposed_by?: string;
  client?: string;
  description?: string;
  created_at?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  infra: "bg-navy/15 text-navy",
  skill: "bg-purple-500/15 text-purple-700",
  agent: "bg-sage/15 text-sage",
  flow: "bg-yellow-600/15 text-yellow-700",
  client: "bg-red-500/15 text-red-700",
  brain: "bg-cyan-500/15 text-cyan-700",
  tool: "bg-yellow-400/15 text-yellow-600",
  docs: "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "bg-red-500 text-white",
  P1: "bg-orange-400 text-black",
  P2: "bg-yellow-300 text-black",
  P3: "bg-border text-muted-foreground",
};

const COLUMNS: { key: string; label: string; icon: string }[] = [
  { key: "proposals", label: "Propuestas", icon: "📥" },
  { key: "approved", label: "Aprobadas", icon: "✅" },
  { key: "in-progress", label: "En progreso", icon: "🔧" },
  { key: "completed", label: "Completadas", icon: "✅" },
  { key: "discarded", label: "Descartadas", icon: "🗑️" },
];

export default function CervantesTasksPage() {
  const [showForm, setShowForm] = useState(false);

  // TODO: Create proper API endpoint for Cervantes tasks
  // For now, this is a placeholder that renders the kanban structure
  const { data: tasks } = useQuery<CervantesTask[]>({
    queryKey: ["cervantes-tasks"],
    queryFn: async () => {
      // Cervantes tasks come from TASKS.md parsing — not yet implemented as API
      return [];
    },
    staleTime: 60_000,
  });

  const allTasks = tasks || [];
  const columns: KanbanColumn<CervantesTask>[] = COLUMNS.map((col) => ({
    key: col.key,
    label: `${col.icon} ${col.label}`,
    items: allTasks.filter((t) => t.status === col.key),
  }));

  return (
    <DashboardLayout>
      <Head><title>Tareas Cervantes — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">📋 Tareas Cervantes</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Fuente de verdad: TASKS.md
      </p>

      {/* Create task form */}
      <CollapsibleSection title="Nueva tarea" icon="➕" defaultOpen={showForm}>
        <ComicCard className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Título</label>
              <input className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Categoría</label>
              <select className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background">
                {Object.keys(CATEGORY_COLORS).map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Prioridad</label>
              <select className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background">
                <option>P0</option><option>P1</option><option>P2</option><option>P3</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Propuesto por</label>
              <input className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Descripción</label>
              <textarea className="w-full mt-1 px-3 py-1.5 border-2 border-ink rounded-lg text-sm bg-background h-20 resize-none" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="px-4 py-1.5 bg-rust text-white rounded-lg text-sm font-semibold">Crear</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-border rounded-lg text-sm text-muted-foreground">Cancelar</button>
          </div>
        </ComicCard>
      </CollapsibleSection>

      {/* Kanban board */}
      <KanbanBoard
        columns={columns}
        renderCard={(task) => (
          <div className="border-[3px] border-ink rounded-lg p-3 bg-card shadow-comic-sm">
            <div className="text-[10px] text-muted-foreground font-mono mb-1">{task.id}</div>
            <div className="text-sm font-medium mb-2">{task.title}</div>
            <div className="flex flex-wrap gap-1">
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold", CATEGORY_COLORS[task.category] || "bg-muted text-muted-foreground")}>
                {task.category}
              </span>
              <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold", PRIORITY_COLORS[task.priority] || "bg-muted")}>
                {task.priority}
              </span>
            </div>
          </div>
        )}
        emptyLabel="Sin tareas"
      />
    </DashboardLayout>
  );
}
