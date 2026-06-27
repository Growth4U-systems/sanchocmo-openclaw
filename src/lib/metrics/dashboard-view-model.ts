import { SURFACES, type SurfaceKey } from "./surfaces";

export type MetricDashboardTab =
  | "overview"
  | "surfaces"
  | "channels"
  | "conversion"
  | "trends";

export type MetricDataState =
  | "ON"
  | "PARCIAL"
  | "OFF"
  | "SIN DATOS"
  | "CONECTADO SIN SNAPSHOTS"
  | "COMING SOON";

export type MetricQualityStatus =
  | "ok"
  | "partial"
  | "missing"
  | "pending"
  | "future"
  | "dirty"
  | "stale"
  | "demo";

export interface SurfaceDetailSection {
  title: string;
  description: string;
  requiredSource: string;
  nextAction: string;
}

export interface SurfaceDetailConfig {
  key: SurfaceKey;
  label: string;
  eyebrow: string;
  headline: string;
  sections: SurfaceDetailSection[];
}

export const METRIC_DASHBOARD_TABS: Array<{
  key: MetricDashboardTab;
  label: string;
  description: string;
}> = [
  {
    key: "overview",
    label: "Overview",
    description: "North Star, economía, embudo y salud de surfaces.",
  },
  {
    key: "surfaces",
    label: "Surfaces",
    description: "Estado y detalle de cada sistema que alimenta Métricas.",
  },
  {
    key: "channels",
    label: "Channels",
    description: "Atribución y contribución por canal, pendiente de eventos.",
  },
  {
    key: "conversion",
    label: "Conversion",
    description: "Embudo end-to-end, tasas y velocidad, pendiente de rollups.",
  },
  {
    key: "trends",
    label: "Trends",
    description: "Evolución, hitos e inteligencia, pendiente de KPI runs.",
  },
];

export const METRICS_SURFACE_ORDER: SurfaceKey[] = [
  "reputation",
  "web",
  "product",
  "pipeline",
  "paid",
  "email",
  "partnerships",
  "social",
];

export const SURFACE_DETAIL_CONFIGS: Record<SurfaceKey, SurfaceDetailConfig> = {
  reputation: {
    key: "reputation",
    label: "Reputation",
    eyebrow: "Trust Engine",
    headline: "Confianza, gap competitivo, presencia IA y listening.",
    sections: [
      {
        title: "KPIs de reputación",
        description:
          "Trust Score, gap vs líder, presencia en IA, reseñas y competidores.",
        requiredSource: "trust_score",
        nextAction:
          "Ejecutar o re-ejecutar Trust Engine para generar el primer snapshot.",
      },
      {
        title: "6 pilares vs competidores",
        description: "Benchmark por pilar y ficha de cada competidor.",
        requiredSource: "trust_score.compare",
        nextAction: "Definir competidores y guardar el compare report.",
      },
      {
        title: "Listening",
        description: "Sentimiento, share of voice, menciones y reviews.",
        requiredSource: "reviews/listening",
        nextAction: "Fase posterior: conectar scraping/listening recurrente.",
      },
    ],
  },
  web: {
    key: "web",
    label: "Web/SEO",
    eyebrow: "Discoverability",
    headline: "GA4, Search Console, PageSpeed, queries, páginas y movers.",
    sections: [
      {
        title: "SEO KPIs",
        description:
          "Clicks, impressions, CTR, posición, sesiones y engagement.",
        requiredSource: "gsc + ga4",
        nextAction: "Conectar GSC y GA4 o esperar snapshots del colector.",
      },
      {
        title: "Breakdowns",
        description:
          "Queries, páginas, canales, dispositivos, países y movers.",
        requiredSource: "metric_snapshots dimensions",
        nextAction: "PR posterior: API de breakdown por dimensiones.",
      },
      {
        title: "Health",
        description: "Core Web Vitals, PageSpeed y distribución de posiciones.",
        requiredSource: "pagespeed + gsc",
        nextAction: "Activar PageSpeed automático con URL del cliente.",
      },
    ],
  },
  product: {
    key: "product",
    label: "Product",
    eyebrow: "Activation",
    headline: "Activación, retención, TTV, adopción y fricción.",
    sections: [
      {
        title: "Activation funnel",
        description: "Pasos de activación y dropoff por etapa.",
        requiredSource: "posthog",
        nextAction: "Conectar PostHog o definir fallback de eventos GA4.",
      },
      {
        title: "Retention cohorts",
        description: "DAU/WAU/MAU, cohortes y uso recurrente.",
        requiredSource: "posthog cohorts",
        nextAction: "PR posterior: cómputo KPI directo desde snapshots.",
      },
      {
        title: "Friction",
        description: "Errores, rage clicks, recordings y pasos bloqueados.",
        requiredSource: "posthog recordings",
        nextAction: "Marcar como opcional hasta conectar señales cualitativas.",
      },
    ],
  },
  pipeline: {
    key: "pipeline",
    label: "Pipeline/CRM",
    eyebrow: "Revenue system",
    headline: "Leads, oportunidades, forecast, deals y velocidad comercial.",
    sections: [
      {
        title: "Pipeline KPIs",
        description: "Pipeline, forecast, closed-won, win rate y deal size.",
        requiredSource: "crm",
        nextAction: "Conectar CRM y mapear etapas.",
      },
      {
        title: "Stage waterfall",
        description: "Entradas, salidas, aging y conversión entre etapas.",
        requiredSource: "metric_stage_rollups",
        nextAction: "PR posterior: rollups semánticos de funnel.",
      },
      {
        title: "Deal inspection",
        description: "Deals atascados, cobertura y aging por owner.",
        requiredSource: "crm deal dimensions",
        nextAction: "Definir dimensiones permitidas para breakdown.",
      },
    ],
  },
  paid: {
    key: "paid",
    label: "Paid",
    eyebrow: "Media buying",
    headline: "Spend, CPA plataforma, ROAS plataforma, campañas y fatiga.",
    sections: [
      {
        title: "Spend and efficiency",
        description: "Spend, CPA, revenue plataforma, ROAS, CTR y CPC.",
        requiredSource: "ads snapshots",
        nextAction: "Conectar Meta/Google/LinkedIn Ads.",
      },
      {
        title: "Campaign breakdown",
        description: "Campañas, placements, audiencias, keywords y creatives.",
        requiredSource: "ads dimensions",
        nextAction: "PR posterior: endpoint de breakdown.",
      },
      {
        title: "Pacing and fatigue",
        description: "Pacing, frecuencia, saturación y caída creativa.",
        requiredSource: "ads history",
        nextAction: "Necesita series temporales antes de alertar.",
      },
    ],
  },
  email: {
    key: "email",
    label: "Outbound ICP",
    eyebrow: "Outbound",
    headline: "Enviados, replies, positive replies, meetings y deliverability.",
    sections: [
      {
        title: "ICP Outreach",
        description:
          "Sent, replies, positive replies, meetings, bounce y opt-out.",
        requiredSource: "instantly/lemlist",
        nextAction: "Conectar Instantly o Lemlist.",
      },
      {
        title: "Deliverability",
        description: "Opens MPP, spam, bounce, dominios y health de envío.",
        requiredSource: "email provider health",
        nextAction: "Separar métricas de vanity de señales accionables.",
      },
      {
        title: "Sequence breakdown",
        description: "Campañas, segmentos ICP y mensajes que convierten.",
        requiredSource: "outbound dimensions",
        nextAction: "PR posterior: breakdown por campaña y segmento.",
      },
    ],
  },
  partnerships: {
    key: "partnerships",
    label: "Partnerships",
    eyebrow: "Creators",
    headline: "Creators, invested, CPA, value, ROI y break-even.",
    sections: [
      {
        title: "Creator economics",
        description: "Invested, CPA, value, ROI, clicks, signups y KYC.",
        requiredSource: "yalc/creators",
        nextAction: "Usar el módulo Partnerships existente como fuente.",
      },
      {
        title: "Break-even",
        description: "Primer depósito, primera transacción, calidad y payback.",
        requiredSource: "partnerships revenue events",
        nextAction: "PR posterior: unir eventos con revenue/CRM.",
      },
      {
        title: "Creator table",
        description: "Rendimiento por creator y estado de campaña.",
        requiredSource: "creator dimensions",
        nextAction: "Exponer dimensiones desde el módulo YALC.",
      },
    ],
  },
  social: {
    key: "social",
    label: "Social",
    eyebrow: "Distribution",
    headline: "Impressions, reach, engagement, posts, clicks y formatos.",
    sections: [
      {
        title: "Network KPIs",
        description: "Impressions, reach, ER, followers, posts y clicks.",
        requiredSource: "metricool",
        nextAction: "Conectar Metricool y confirmar blogId.",
      },
      {
        title: "Top content",
        description: "Top posts, formato, guardados, shares y vídeo.",
        requiredSource: "metricool post dimensions",
        nextAction: "PR posterior: breakdown por post/formato/red.",
      },
      {
        title: "Best time",
        description: "Franja horaria, cadencia y red que mejor empuja visitas.",
        requiredSource: "social history",
        nextAction: "Necesita histórico suficiente antes de recomendar.",
      },
    ],
  },
};

export function surfaceLabel(key: SurfaceKey): string {
  return (
    SURFACE_DETAIL_CONFIGS[key]?.label ??
    SURFACES.find((surface) => surface.key === key)?.name ??
    key
  );
}
