export interface TaskIndexEntry {
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  status: string;
  skill: string;
  skills?: string[];
  agent?: string;
  skillOk: boolean;
  executionMode?: "guided" | "agent";
  deliverableFile: string;
  docExists: boolean;
  mcChatThreadId: string;
  threadFileExists: boolean;
  pillar: string | null;
  type: string;
  parentTaskId?: string;
  ideaId?: string;
  targetChannels?: string[];
  channelSkills?: { channel: string; skill: string }[];
  isContentTask?: boolean;
}

export interface TaskIndexStats {
  total: number;
  docOk: number;
  docMissing: number;
  docPlaceholder: number;
  skillOk: number;
  threadOk: number;
  byStatus: Record<string, number>;
}

export interface TaskIndexResponse {
  ok: boolean;
  slug: string;
  entries: TaskIndexEntry[];
  stats: TaskIndexStats;
}
