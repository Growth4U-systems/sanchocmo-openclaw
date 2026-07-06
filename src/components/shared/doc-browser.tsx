/** File tree browser for Foundation with expandable directories and file selection. */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  status?: string;
  children?: FileEntry[];
}

interface DocBrowserProps {
  slug: string;
  files: FileEntry[];
  onSelect: (path: string) => void;
  currentPath?: string;
}

export function DocBrowser({ slug, files, onSelect, currentPath }: DocBrowserProps) {
  return (
    <div className="text-sm" data-slug={slug}>
      {files.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          onSelect={onSelect}
          currentPath={currentPath}
          depth={0}
        />
      ))}

      {files.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No files found
        </p>
      )}
    </div>
  );
}

interface TreeNodeProps {
  entry: FileEntry;
  onSelect: (path: string) => void;
  currentPath?: string;
  depth: number;
}

function TreeNode({ entry, onSelect, currentPath, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const isActive = currentPath === entry.path;
  const isDir = entry.type === "directory";
  const icon = isDir
    ? expanded
      ? "\uD83D\uDCC2"
      : "\uD83D\uDCC1"
    : entry.name.endsWith(".md")
      ? "\uD83D\uDCDD"
      : "\uD83D\uDCC4";

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDir) {
            setExpanded((prev) => !prev);
          } else {
            onSelect(entry.path);
          }
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm hover:bg-background cursor-pointer w-full text-left transition-colors",
          isActive && "bg-rust/10 text-rust font-semibold",
          isDir && "font-bold",
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{entry.name}</span>
        {entry.status && (
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {entry.status}
          </span>
        )}
      </button>

      {isDir && expanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              onSelect={onSelect}
              currentPath={currentPath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
