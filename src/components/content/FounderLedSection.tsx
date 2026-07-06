"use client";

/**
 * FounderLedSection — the founder-led networks (LinkedIn, X) rendered as ONE
 * "Founder-Led Content" section instead of one card per channel. A voice =
 * a person on a network, so we flatten the per-channel `personas` from
 * channel-loops into a flat list of voice cards (Alfonso·LinkedIn,
 * Martín·LinkedIn, Alfonso·X), each tagged with its network logo.
 *
 * The section renders for every active founder-led network even before any
 * voice exists, so "+ Añadir voz" (wired by ChannelsTab to the
 * `founder-led-voice` pillar-manifest entry → skill `founder-led-setup`) is
 * always reachable. Per-network strategy state and the unassigned pool stay
 * per-channel — collapsing the cards must not hide either.
 */

import type { ChannelLoopState } from "@/types";
import { MetricoolBrandsList } from "@/components/content/MetricoolBrandsList";

function NetworkLogo({ channel }: { channel: string }) {
  if (channel === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" width={16} height={16} fill="#0A66C2" aria-label="LinkedIn" className="shrink-0">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
    );
  }
  if (channel === "twitter" || channel === "x") {
    return (
      <svg viewBox="0 0 24 24" width={14} height={14} aria-label="X" className="shrink-0 fill-ink">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  return <span className="text-sm">📣</span>;
}

const NETWORK_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  x: "X / Twitter",
};

type OnGo = (
  tab: "ideas" | "calendar" | "setup",
  channel?: string,
  focusStatus?: string,
  extra?: { author?: string; unassigned?: boolean },
) => void;

interface Props {
  slug: string;
  /** Founder-led channels (the personal-voice networks, active). */
  channels: ChannelLoopState[];
  onGo: OnGo;
  onAddVoice: () => void;
  onOpenStrategy: (strategyDoc: string) => void;
  onOpenSetup: (channel: string) => void;
}

export function FounderLedSection({ slug, channels, onGo, onAddVoice, onOpenStrategy, onOpenSetup }: Props) {
  const safeChannels = Array.isArray(channels) ? channels : [];
  // One voice per (person, network): flatten personas across the founder-led channels.
  const voices = safeChannels.flatMap((ch) =>
    (Array.isArray(ch.personas) ? ch.personas : []).map((persona) => ({ persona, channel: ch.channel })),
  );
  const networks = safeChannels.length;
  const pools = safeChannels.filter((ch) => (typeof ch.unassignedPool === "number" ? ch.unassignedPool : 0) > 0);

  return (
    <section className="border-[3px] border-ink rounded-lg bg-card overflow-hidden" style={{ boxShadow: "var(--pop-md)" }}>
      {/* Header */}
      <header className="flex items-center gap-3 flex-wrap px-4 py-3 border-b-[2.5px] border-ink" style={{ background: "var(--sc-paper-2)" }}>
        <span className="text-2xl">💼</span>
        <div className="flex-1 min-w-[180px]">
          <h3 className="font-heading text-lg text-ink leading-tight">Founder-Led Content</h3>
          <p className="text-[11px] text-muted-foreground">
            {voices.length} {voices.length === 1 ? "voz" : "voces"} · {networks} {networks === 1 ? "red" : "redes"}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddVoice}
          className="px-3 py-1.5 text-sm font-semibold border-2 border-ink rounded-lg bg-yellow-400/30 hover:-translate-y-0.5 hover:shadow-comic transition-all"
        >
          + Añadir voz
        </button>
      </header>

      {/* Per-network strategy — collapsing the cards must not hide each network's
          strategy doc (or its missing-strategy warning). One chip per network. */}
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {safeChannels.map((ch) =>
          ch.strategyDocExists && ch.strategyDoc ? (
            <button
              key={ch.channel}
              type="button"
              onClick={() => ch.strategyDoc && onOpenStrategy(ch.strategyDoc)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold border-2 border-ink rounded-full px-2.5 py-1 bg-card hover:-translate-y-0.5 transition-all"
            >
              <NetworkLogo channel={ch.channel} /> {NETWORK_LABEL[ch.channel] || ch.channel} · 📜 estrategia
            </button>
          ) : (
            <button
              key={ch.channel}
              type="button"
              onClick={() => onOpenSetup(ch.channel)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold border-2 border-destructive text-destructive rounded-full px-2.5 py-1 bg-card hover:-translate-y-0.5 transition-all"
              title="Crear la estrategia del canal en Setup"
            >
              <NetworkLogo channel={ch.channel} /> {NETWORK_LABEL[ch.channel] || ch.channel} · ⚠ sin estrategia
            </button>
          ),
        )}
      </div>

      {/* Voice cards — one per (person, network) */}
      <div className="px-4 py-3 space-y-1.5">
        {voices.length === 0 && (
          <p className="text-sm text-muted-foreground italic px-1 py-2">
            Aún no hay voces. Usa <b>+ Añadir voz</b> para dar de alta a una persona en una red (p. ej. «Alfonso · LinkedIn»).
          </p>
        )}
        {voices.map(({ persona: p, channel }) => {
          const st = p.stages;
          return (
            <button
              key={`${channel}:${p.id}`}
              type="button"
              onClick={() => onGo("ideas", channel, undefined, { author: p.id })}
              className="w-full text-left flex items-center gap-2 flex-wrap border-2 border-ink rounded-lg px-3 py-2 bg-card hover:-translate-y-0.5 hover:shadow-comic transition-all"
              style={{ boxShadow: "var(--pop-xs)" }}
            >
              <NetworkLogo channel={channel} />
              <span className="font-bold text-sm">{p.name}</span>
              {p.role && <span className="text-[11px] text-muted-foreground">· {p.role}</span>}
              <span className="text-[11px] font-semibold text-ink/80 border-2 border-ink/30 rounded-full px-2 py-0.5">
                {NETWORK_LABEL[channel] || channel}
                {p.handle ? ` · ${p.handle}` : ""}
              </span>
              <span className="text-[12px] text-ink ml-auto whitespace-nowrap">
                💡 {st?.ideation?.newCount ?? 0} · ✍️ {(st?.creation?.draftingCount ?? 0) + (st?.creation?.readyCount ?? 0)} · 🚀 {st?.published?.thisMonth ?? 0}
              </span>
              {p.nextAction && (
                <span className="text-[11px] font-semibold border-2 border-ink rounded px-1.5 bg-yellow-400/30 text-ink w-full sm:w-auto">
                  ⚡ {p.nextAction.label}
                </span>
              )}
            </button>
          );
        })}

        {/* Unassigned pool — kept PER network so the click lands on the right
            channel's pool (Ideas filters by channel before "unassigned"). */}
        {pools.map((ch) => (
          <button
            key={`pool-${ch.channel}`}
            type="button"
            onClick={() => onGo("ideas", ch.channel, undefined, { unassigned: true })}
            className="w-full text-left flex items-center gap-2 border-2 border-dashed border-ink/50 rounded-lg px-3 py-1.5 bg-muted/30 hover:-translate-y-0.5 transition-all text-[13px]"
          >
            📥 <span className="flex-1">
              Pool {NETWORK_LABEL[ch.channel] || ch.channel}: <b>{ch.unassignedPool}</b> sin repartir
            </span>
            <span className="font-heading text-rust">repartir →</span>
          </button>
        ))}

        <MetricoolBrandsList slug={slug} />
      </div>
    </section>
  );
}
