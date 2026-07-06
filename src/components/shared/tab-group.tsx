/** Comic-style tab switcher with optional icons and count badges. */

"use client";

import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

interface TabGroupProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function TabGroup({ tabs, activeTab, onChange }: TabGroupProps) {
  return (
    <div className="flex gap-2 mb-4">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all cursor-pointer",
              isActive
                ? "bg-rust text-white border-rust"
                : "border-border hover:border-rust text-muted-foreground",
            )}
          >
            {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[11px] opacity-80">
                ({tab.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
