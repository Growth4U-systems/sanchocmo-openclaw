import type { TaskIndexEntry } from "@/lib/task-index-types";

export type TaskIndexFilter = "all" | "ok" | "issues";

export interface VisibleTaskIndexRow {
  key: string;
  entry: TaskIndexEntry;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  autoExpanded: boolean;
}

export interface TaskIndexGroup {
  projectId: string;
  projectName: string;
  rows: VisibleTaskIndexRow[];
}

interface ProjectionOptions {
  filter: TaskIndexFilter;
  search: string;
  expanded: ReadonlySet<string>;
}

export function taskIndexProjectIsExpanded(
  projectId: string,
  expandedProjects: ReadonlySet<string>,
  filter: TaskIndexFilter,
  search: string,
): boolean {
  return expandedProjects.has(projectId)
    || filter !== "all"
    || search.trim().length > 0;
}

const naturalCollator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

export function taskIndexEntryKey(entry: Pick<TaskIndexEntry, "projectId" | "taskId">): string {
  return `${entry.projectId}::${entry.taskId}`;
}

function entryIsOk(entry: TaskIndexEntry): boolean {
  return entry.docExists && entry.skillOk && entry.threadFileExists;
}

function matchesEntry(entry: TaskIndexEntry, filter: TaskIndexFilter, query: string): boolean {
  const ok = entryIsOk(entry);
  if (filter === "ok" && !ok) return false;
  if (filter === "issues" && ok) return false;
  if (!query) return true;

  const haystack = [
    entry.taskId,
    entry.taskName,
    entry.projectId,
    entry.projectName,
    entry.skill,
    ...(entry.skills || []),
    entry.agent || "",
    entry.pillar || "",
    ...(entry.targetChannels || []),
  ].join(" ").toLocaleLowerCase("es");

  return haystack.includes(query);
}

function compareEntries(a: TaskIndexEntry, b: TaskIndexEntry): number {
  return naturalCollator.compare(a.taskId, b.taskId)
    || naturalCollator.compare(a.taskName, b.taskName);
}

/**
 * Projects the flat task index into expandable rows. Filtering keeps matching
 * descendants discoverable by retaining and automatically opening their
 * ancestors. A visited set makes malformed cyclic parent data harmless.
 */
export function projectTaskIndex(
  entries: TaskIndexEntry[],
  { filter, search, expanded }: ProjectionOptions,
): TaskIndexGroup[] {
  const query = search.trim().toLocaleLowerCase("es");
  const filtering = filter !== "all" || query.length > 0;
  const projects = new Map<string, TaskIndexEntry[]>();

  for (const entry of entries) {
    const bucket = projects.get(entry.projectId) || [];
    bucket.push(entry);
    projects.set(entry.projectId, bucket);
  }

  return Array.from(projects.entries())
    .sort(([a], [b]) => naturalCollator.compare(a, b))
    .map(([projectId, projectEntries]) => {
      const sortedEntries = [...projectEntries].sort(compareEntries);
      const byKey = new Map(sortedEntries.map((entry) => [taskIndexEntryKey(entry), entry]));
      const keyByTaskId = new Map(sortedEntries.map((entry) => [entry.taskId, taskIndexEntryKey(entry)]));
      const parentByKey = new Map<string, string>();
      const childrenByKey = new Map<string, string[]>();

      for (const entry of sortedEntries) {
        if (!entry.parentTaskId) continue;
        const key = taskIndexEntryKey(entry);
        const parentKey = keyByTaskId.get(entry.parentTaskId);
        if (!parentKey || parentKey === key) continue;
        parentByKey.set(key, parentKey);
        const children = childrenByKey.get(parentKey) || [];
        children.push(key);
        childrenByKey.set(parentKey, children);
      }

      for (const children of childrenByKey.values()) {
        children.sort((a, b) => compareEntries(byKey.get(a)!, byKey.get(b)!));
      }

      const directMatches = new Set(
        sortedEntries
          .filter((entry) => matchesEntry(entry, filter, query))
          .map(taskIndexEntryKey),
      );
      const visibleKeys = filtering ? new Set(directMatches) : new Set(byKey.keys());
      const autoExpanded = new Set<string>();

      if (filtering) {
        for (const key of directMatches) {
          const seen = new Set<string>([key]);
          let parentKey = parentByKey.get(key);
          while (parentKey && !seen.has(parentKey)) {
            seen.add(parentKey);
            visibleKeys.add(parentKey);
            autoExpanded.add(parentKey);
            parentKey = parentByKey.get(parentKey);
          }
        }
      }

      const rows: VisibleTaskIndexRow[] = [];
      const visited = new Set<string>();
      const append = (key: string, depth: number) => {
        if (visited.has(key) || !visibleKeys.has(key)) return;
        const entry = byKey.get(key);
        if (!entry) return;
        visited.add(key);

        const visibleChildren = (childrenByKey.get(key) || []).filter((childKey) => visibleKeys.has(childKey));
        const isExpanded = expanded.has(key) || autoExpanded.has(key);
        rows.push({
          key,
          entry,
          depth,
          hasChildren: visibleChildren.length > 0,
          expanded: isExpanded,
          autoExpanded: autoExpanded.has(key),
        });

        if (isExpanded) {
          for (const childKey of visibleChildren) append(childKey, depth + 1);
        }
      };

      const roots = sortedEntries
        .map(taskIndexEntryKey)
        .filter((key) => visibleKeys.has(key) && !visibleKeys.has(parentByKey.get(key) || ""));
      for (const root of roots) append(root, 0);

      // A cycle has no natural root. Append only cyclic components here;
      // ordinary descendants intentionally remain hidden under a collapsed
      // ancestor and must not leak into the end of the table.
      const belongsToCycle = (startKey: string) => {
        const seen = new Set<string>();
        let key: string | undefined = startKey;
        while (key && visibleKeys.has(key)) {
          if (seen.has(key)) return true;
          seen.add(key);
          key = parentByKey.get(key);
        }
        return false;
      };
      for (const entry of sortedEntries) {
        const key = taskIndexEntryKey(entry);
        if (belongsToCycle(key)) append(key, 0);
      }

      return {
        projectId,
        projectName: sortedEntries[0]?.projectName || projectId,
        rows,
      };
    })
    .filter((group) => group.rows.length > 0);
}
