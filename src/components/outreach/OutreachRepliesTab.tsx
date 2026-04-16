/**
 * Outreach > Replies tab.
 *
 * Inbox unificado de respuestas (Gmail + Instantly + HeyReach) con
 * clasificación automática. Acciones inline: book meeting, mark resolved,
 * reopen.
 */

import { OutreachPhase1Placeholder } from "./OutreachPhase1Placeholder";

interface Props {
  slug: string;
}

export function OutreachRepliesTab({ slug }: Props) {
  return (
    <OutreachPhase1Placeholder
      icon="💬"
      title="Replies"
      slug={slug}
      description="Inbox unificado de respuestas (Gmail + Instantly + HeyReach) con clasificación automática. Acciones: book meeting, mark resolved, reopen."
      actions={[
        "Feed unificado ordenado por recencia",
        "Filtro por classification (positive / negative / OOO / wrong person)",
        "Drawer de contexto full: touch previo + secuencia + contacto",
        "Acciones inline: Book meeting (Calendly link), Mark resolved, Reopen",
        "Webhook receivers en MC: /api/outreach/webhooks/{gmail,instantly,heyreach}",
        "reply-classifier skill invocado automáticamente al recibir webhook",
      ]}
    />
  );
}
