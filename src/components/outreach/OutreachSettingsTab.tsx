/**
 * Outreach > Settings tab.
 *
 * Sender domains, API keys (Gmail OAuth / Instantly / HeyReach / Apollo /
 * Hunter), auto-selector Gmail vs Instantly por volumen, GDPR retention.
 */

import { OutreachPhase1Placeholder } from "./OutreachPhase1Placeholder";

interface Props {
  slug: string;
}

export function OutreachSettingsTab({ slug }: Props) {
  return (
    <OutreachPhase1Placeholder
      icon="⚙️"
      title="Settings"
      slug={slug}
      description="Sender domains, API keys (Gmail OAuth / Instantly / HeyReach / Apollo / Hunter), auto-selector Gmail vs Instantly por volumen, GDPR retention."
      actions={[
        "Sender domains configurados + warmup status",
        "Gmail OAuth (outreach bajo volumen ≤30)",
        "Instantly API key + campaign binding (outreach >30)",
        "HeyReach API key (opcional)",
        "Enrichment waterfall: Apollo / Hunter / SignalHire keys",
        "Threshold auto-selector (ej: 30 contactos → Gmail, >30 → Instantly)",
        "GDPR retention: 90 días sin engagement (configurable)",
      ]}
    />
  );
}
