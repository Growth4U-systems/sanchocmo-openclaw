import Head from "next/head";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ComicCard } from "@/components/shared/comic-card";

const GUIDE_SECTIONS = [
  {
    title: "1. Foundation — Conoce tu negocio",
    icon: "📂",
    content: "Foundation analiza tu empresa, mercado, competidores y posicionamiento. Empieza con Fast Foundation (URL → 5 docs en 30 min) o Full Foundation (9 pilares exhaustivos).",
  },
  {
    title: "2. Strategic Plan — Define tu rumbo",
    icon: "🗺️",
    content: "Basado en Foundation, Sancho propone un plan estratégico con proyectos priorizados por impacto. Cada proyecto tiene tareas ejecutables con skills asignadas.",
  },
  {
    title: "3. Trust Engine — Audita tu presencia",
    icon: "🔍",
    content: "SEO + GEO + Own Media audit. Detecta gaps, genera recomendaciones, y prioriza acciones para mejorar tu visibilidad y autoridad online.",
  },
  {
    title: "4. Projects — Ejecuta el plan",
    icon: "📋",
    content: "Cada proyecto agrupa tareas. Cada tarea tiene un skill, un canal, y se ejecuta via chat con Sancho/Escudero. El progreso se trackea aquí.",
  },
  {
    title: "5. Idea Bank — Captura oportunidades",
    icon: "💡",
    content: "Ideas de contenido y contactos generadas por Trust Engine, Atalaya, y manualmente. Se aprueban, asignan a proyectos, y ejecutan como tareas.",
  },
  {
    title: "6. Chat — El motor de ejecución",
    icon: "💬",
    content: "Todo se ejecuta via chat. Cada thread tiene contexto (skill, proyecto, tarea). Sancho orquesta, Escudero ejecuta, Rocinante verifica. Discord sync disponible.",
  },
  {
    title: "7. Metrics — Mide resultados",
    icon: "📈",
    content: "Conecta tus APIs (GA4, Meta, GSC, GHL) y trackea KPIs por módulo. Health score, performance analysis, y recomendaciones automáticas.",
  },
  {
    title: "8. Atalaya — Vigila tu sector",
    icon: "🏰",
    content: "Monitorea competidores, perfiles de influencers, y tendencias. Genera ideas automáticamente adaptadas a tu marca.",
  },
];

export default function GuidePage() {
  return (
    <DashboardLayout>
      <Head><title>¿Cómo empezar? — Mission Control</title></Head>

      <h1 className="font-heading text-2xl text-navy mb-1">📖 ¿Cómo empezar?</h1>
      <p className="text-sm text-muted-foreground mb-6">Todo lo que necesitas saber</p>

      <div className="space-y-4">
        {GUIDE_SECTIONS.map((section) => (
          <ComicCard key={section.title}>
            <h2 className="font-heading text-base text-navy mb-2">
              {section.icon} {section.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {section.content}
            </p>
          </ComicCard>
        ))}
      </div>
    </DashboardLayout>
  );
}
