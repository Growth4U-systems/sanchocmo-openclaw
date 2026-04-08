"use client";

import { useQuery } from "@tanstack/react-query";
import { ComicCard } from "@/components/shared/comic-card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChannelRole {
  description: string;
  channels: string[];
  rules?: Record<string, string>;
}

interface Persona {
  emoji: string;
  name: string;
  skills?: string[] | string;
  brand_context?: string;
}

interface DispatchData {
  channel_roles: Record<string, ChannelRole>;
  personas?: Persona[];
  flow?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ROLE_ICONS: Record<string, string> = {
  decision: "\u{1F9ED}",   // 🧭
  execution: "\u26A1",      // ⚡
  intelligence: "\u{1F50D}", // 🔍
  support: "\u{1F6DF}",     // 🛟
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeSkills(skills?: string[] | string): string[] {
  if (!skills) return [];
  if (typeof skills === "string") return [skills];
  return skills;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DispatchPanel() {
  const { data, isLoading } = useQuery<DispatchData>({
    queryKey: ["system", "dispatch"],
    queryFn: async () => {
      const res = await fetch("/api/system/dispatch");
      if (!res.ok) throw new Error("Failed to fetch dispatch data");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-xl text-navy">
            {"\u{1F4E1}"} Dispatch &amp; Personas
          </h2>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </section>
    );
  }

  const channelRoles = data?.channel_roles ?? {};
  const personas = data?.personas ?? [];
  const flow = data?.flow;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-heading text-xl text-navy">
          {"\u{1F4E1}"} Dispatch &amp; Personas
        </h2>
        <p className="text-sm text-muted-foreground">
          Reglas de despacho por canal y personas del sistema
        </p>
      </div>

      {/* Channel Roles */}
      <div className="space-y-3">
        <h3 className="font-heading text-lg text-navy">
          {"\u{1F4E1}"} Channel Roles
        </h3>

        <div className="space-y-3">
          {Object.entries(channelRoles).map(([role, info]) => (
            <ComicCard key={role} className="space-y-2">
              <h4 className="font-heading text-base text-navy">
                {ROLE_ICONS[role] ?? "\u{1F4CC}"} {capitalize(role)}
              </h4>
              <p className="text-sm text-muted-foreground">
                {info.description}
              </p>

              <div className="space-y-1">
                {info.channels.map((ch) => (
                  <div key={ch} className="flex items-baseline gap-2">
                    <span className="font-bold text-sm">#{ch}</span>
                    {info.rules?.[ch] && (
                      <span className="text-xs text-muted-foreground">
                        {info.rules[ch]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ComicCard>
          ))}
        </div>
      </div>

      {/* Personas */}
      {personas.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-lg text-navy">
            {"\u{1F465}"} Personas
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {personas.map((p) => (
              <ComicCard key={p.name} className="space-y-1 p-4">
                <h4 className="font-heading text-sm text-navy">
                  {p.emoji} {p.name}
                </h4>

                {normalizeSkills(p.skills).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {normalizeSkills(p.skills).join(", ")}
                  </p>
                )}

                {p.brand_context && (
                  <p className="text-xs text-muted-foreground italic">
                    {p.brand_context}
                  </p>
                )}
              </ComicCard>
            ))}
          </div>
        </div>
      )}

      {/* Flow */}
      {flow && (
        <div className="space-y-3">
          <ComicCard className="space-y-2">
            <h3 className="font-heading text-lg text-navy">
              {"\u{1F504}"} Flow
            </h3>
            <p className="text-sm whitespace-pre-wrap">{flow}</p>
          </ComicCard>
        </div>
      )}
    </section>
  );
}
