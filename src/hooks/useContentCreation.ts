import { useQuery } from "@tanstack/react-query";

export interface ContentDocument {
  id: string;
  name: string;
  description: string;
  type: string | null;
  pillar: string | null;
  channel: string | null;
  niche: string | null;
  status: string;
  deliverable: string | null;
  output_files: string[];
  depends_on: string | null;
  owner: string | null;
  // Legacy compat fields
  key: string;
  section: string;
  skill: string | null;
  docPath: string | null;
  children?: Array<{ name: string; status: string; docPath: string }>;
}

export interface ContentCron {
  name: string;
  schedule: string;
  lastRun: string | null;
  status: string;
  ideasCount: number;
}

export interface ContentCreationState {
  hasProject: boolean;
  projectId: string | null;
  documents: ContentDocument[];
  niches: Array<{ slug: string; name: string }>;
  selectedNiche: string | null;
  crons: ContentCron[];
  ideaCounts: {
    total: number;
    new: number;
    approved: number;
    inProgress: number;
    published: number;
  };
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeDocument(raw: unknown): ContentDocument {
  const doc = asRecord(raw);
  const id = asString(doc.id, asString(doc.key, "document"));
  const name = asString(doc.name, id);
  const docPath = asNullableString(doc.docPath);
  return {
    id,
    name,
    description: asString(doc.description),
    type: asNullableString(doc.type),
    pillar: asNullableString(doc.pillar),
    channel: asNullableString(doc.channel),
    niche: asNullableString(doc.niche),
    status: asString(doc.status, "pending"),
    deliverable: asNullableString(doc.deliverable),
    output_files: asStringArray(doc.output_files),
    depends_on: asNullableString(doc.depends_on),
    owner: asNullableString(doc.owner),
    key: asString(doc.key, id),
    section: asString(doc.section),
    skill: asNullableString(doc.skill),
    docPath,
    children: Array.isArray(doc.children)
      ? doc.children.map((child) => {
          const c = asRecord(child);
          return {
            name: asString(c.name),
            status: asString(c.status, "pending"),
            docPath: asString(c.docPath),
          };
        })
      : undefined,
  };
}

function normalizeCron(raw: unknown): ContentCron {
  const cron = asRecord(raw);
  return {
    name: asString(cron.name),
    schedule: asString(cron.schedule),
    lastRun: asNullableString(cron.lastRun),
    status: asString(cron.status, "unknown"),
    ideasCount: asNumber(cron.ideasCount),
  };
}

function normalizeContentCreationState(raw: unknown): ContentCreationState {
  const state = asRecord(raw);
  const projectId = asNullableString(state.projectId);
  const counts = asRecord(state.ideaCounts);
  return {
    hasProject: typeof state.hasProject === "boolean" ? state.hasProject : Boolean(projectId),
    projectId,
    documents: Array.isArray(state.documents) ? state.documents.map(normalizeDocument) : [],
    niches: Array.isArray(state.niches)
      ? state.niches.map((item) => {
          const niche = asRecord(item);
          const slug = asString(niche.slug);
          return { slug, name: asString(niche.name, slug) };
        })
      : [],
    selectedNiche: asNullableString(state.selectedNiche),
    crons: Array.isArray(state.crons) ? state.crons.map(normalizeCron) : [],
    ideaCounts: {
      total: asNumber(counts.total),
      new: asNumber(counts.new),
      approved: asNumber(counts.approved),
      inProgress: asNumber(counts.inProgress),
      published: asNumber(counts.published),
    },
  };
}

export function useContentCreation(slug: string | null, niche?: string | null) {
  const result = useQuery<ContentCreationState>({
    queryKey: ["content-creation", slug, niche || "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ slug: slug! });
      if (niche) params.set("niche", niche);
      const res = await fetch(`/api/content-creation/state?${params}`);
      if (!res.ok) throw new Error("Failed to fetch content creation state");
      return normalizeContentCreationState(await res.json());
    },
    enabled: !!slug,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  return result;
}
