// ============================================================
// Constants extracted from mission-control.html & mc-work.js
// ============================================================

export const PRJ_CHANNELS = [
  "web",
  "content",
  "social",
  "email",
  "paid-ads",
  "prospecting",
  "partnerships",
  "intelligence",
  "creatives",
] as const;

export const PRJ_CH_ICON: Record<string, string> = {
  web: "🌐",
  content: "📝",
  social: "📱",
  email: "📧",
  "paid-ads": "💰",
  prospecting: "🔍",
  partnerships: "🤝",
  intelligence: "🧠",
  creatives: "🎨",
};

export const PRJ_STATUS_COLOR: Record<string, string> = {
  todo: "var(--border)",
  pending: "var(--border)",
  ready: "var(--border)",
  active: "var(--yellow)",
  "in-progress": "var(--yellow)",
  in_progress: "var(--yellow)",
  completed: "var(--green)",
  done: "var(--green)",
  blocked: "var(--red)",
  archived: "var(--muted)",
  cancelled: "var(--muted)",
  discarded: "var(--muted)",
};

export const PRJ_STATUS_LABEL: Record<string, Record<string, string>> = {
  es: {
    todo: "Por hacer",
    active: "Activo",
    completed: "Completado",
    blocked: "Bloqueado",
  },
  en: {
    todo: "To do",
    active: "Active",
    completed: "Completed",
    blocked: "Blocked",
  },
};

export const TASK_TYPE_META: Record<string, { color: string; icon: string }> = {
  content: { color: "var(--sage)", icon: "📝" },
  outreach: { color: "var(--navy)", icon: "📧" },
  foundation: { color: "var(--rust)", icon: "🏛️" },
  research: { color: "var(--cyan)", icon: "🔬" },
  analysis: { color: "var(--purple)", icon: "📊" },
  execution: { color: "var(--yellow)", icon: "⚡" },
};

export const FOUNDATION_ORDER = [
  "company-overview",
  "market-research",
  "self-assessment",
  "brand-strategy",
  "niche-strategy",
  "positioning-messaging",
  "content-strategy",
  "social-media-strategy",
  "email-strategy",
  "paid-media-strategy",
  "partnership-strategy",
  "web-strategy",
  "pricing-strategy",
  "business-model-audit",
  "visual-identity",
] as const;

export const FOUNDATION_COLORS: Record<string, string> = {
  "company-overview": "#C45D35",
  "market-research": "#1E3A5F",
  "self-assessment": "#4A5D23",
  "brand-strategy": "#F2C94C",
  "niche-strategy": "#3B9EBF",
  "positioning-messaging": "#C45D35",
  "content-strategy": "#4A5D23",
  "social-media-strategy": "#3B82F6",
  "email-strategy": "#fb923c",
  "paid-media-strategy": "#F2C94C",
  "partnership-strategy": "#1E3A5F",
  "web-strategy": "#3B9EBF",
  "pricing-strategy": "#C0392B",
  "business-model-audit": "#1A1A2E",
  "visual-identity": "#C45D35",
};
