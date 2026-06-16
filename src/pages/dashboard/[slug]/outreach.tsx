/**
 * Outreach section — Phase 1 skeleton (2026-04-15).
 *
 * Mirrors the Content Creation shape (decision #3 in the outreach plan v3):
 *   - StrategyBanner-style header for client-global setup tasks
 *   - Tabs: Strategy / Encuentra Contactos / Contactos / Pipeline / Replies / Settings
 *
 * Phase 1 delivers navigable skeleton only. Each tab renders a placeholder
 * with a short description of what it will contain. No data layer, no new
 * API endpoints, no schema changes. The goal is to give Ragi something to
 * click through and validate the layout BEFORE we invest in Phase 2
 * (Drizzle schema + migration of contacts.json).
 *
 * Reference: plan v3 in the #outreach thread, 2026-04-14.
 */

import { useState } from "react";
import Head from "next/head";
import { useSlugSync } from "@/hooks/useSlugSync";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TitleIcon } from "@/components/layout/title-icon";
import { cn } from "@/lib/utils";
import { OutreachStrategyTab } from "@/components/outreach/OutreachStrategyTab";
import { OutreachFindContactsTab } from "@/components/outreach/OutreachFindContactsTab";
import { OutreachContactsTab } from "@/components/outreach/OutreachContactsTab";
import { OutreachRepliesTab } from "@/components/outreach/OutreachRepliesTab";
import { OutreachSettingsTab } from "@/components/outreach/OutreachSettingsTab";

// Pipeline merged into Contactos tab (2026-04-15): same data, two view modes
// (list + kanban) toggle inside OutreachContactsTab. Parallels the Content
// Creation pattern where ideas/calendar are one dataset with two views.
const TABS = [
  { key: "strategy", label: "Strategy" },
  { key: "find-contacts", label: "Encuentra Contactos" },
  { key: "contacts", label: "Contactos" },
  { key: "replies", label: "Replies" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function OutreachPage() {
  const slug = useSlugSync();
  const [activeTab, setActiveTab] = useState<TabKey>("strategy");

  return (
    <DashboardLayout>
      <Head>
        <title>Outreach — {slug} — Mission Control</title>
      </Head>

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-heading text-2xl text-navy"><TitleIcon name="outreach" />Outreach</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{slug}</p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all",
              activeTab === tab.key
                ? "bg-rust text-white border-rust"
                : "border-border hover:border-rust"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "strategy" && <OutreachStrategyTab slug={slug} />}
      {activeTab === "find-contacts" && <OutreachFindContactsTab slug={slug} />}
      {activeTab === "contacts" && <OutreachContactsTab slug={slug} />}
      {activeTab === "replies" && <OutreachRepliesTab slug={slug} />}
      {activeTab === "settings" && <OutreachSettingsTab slug={slug} />}
    </DashboardLayout>
  );
}
