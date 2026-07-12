import type { ThreadData } from "@/lib/data/mc-chat";

const ASK_BLOCK_RE = /^:::ask\s*\n([\s\S]*?)\n:::\s*$/gm;
const OPTION_ANSWER_RE = /^\[ask:([^\]\s]+)\]\s*respuesta:.*?<!--workflow-option:([A-Za-z0-9._:-]+)-->\s*$/gm;

export interface OutboundWorkflowChoice {
  questionId: "outbound_ecp_v1";
  optionId: string;
  label: string;
  intent: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function selectedOption(textValue: string): { questionId: string; optionId: string } | null {
  const matches = [...textValue.matchAll(OPTION_ANSWER_RE)];
  if (matches.length !== 1) return null;
  return { questionId: matches[0][1], optionId: matches[0][2] };
}

function validatedIntent(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (text(value.channel).toLowerCase() !== "linkedin") return null;
  if (text(value.discoveryStrategy) !== "account_first_v1") return null;
  if (!text(value.targetSegment) || !text(value.contactReason)) return null;
  if (!isRecord(value.accountTarget) || !isRecord(value.personTarget)) return null;
  return {
    ...value,
    schemaVersion: 1,
    channel: "linkedin",
    discoveryStrategy: "account_first_v1",
  };
}

/**
 * Resolve a selected outbound option against the last trusted bot message.
 * The browser sends only an id; it never submits or mutates the hidden intent.
 */
export function resolveOutboundWorkflowChoice(
  thread: Pick<ThreadData, "messages">,
  answerText: string,
): OutboundWorkflowChoice | null {
  const selected = selectedOption(answerText);
  if (!selected || selected.questionId !== "outbound_ecp_v1") return null;

  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (message.role !== "bot" || !message.text.includes(":::ask")) continue;
    for (const match of message.text.matchAll(ASK_BLOCK_RE)) {
      let question: unknown;
      try {
        question = JSON.parse(match[1]);
      } catch {
        continue;
      }
      if (!isRecord(question) || text(question.id) !== selected.questionId) continue;
      const options = Array.isArray(question.options) ? question.options : [];
      const option = options.find((candidate) => isRecord(candidate) && text(candidate.id) === selected.optionId);
      if (!isRecord(option)) return null;
      const intent = validatedIntent(option.workflowIntent);
      if (!intent) return null;
      return {
        questionId: "outbound_ecp_v1",
        optionId: selected.optionId,
        label: text(option.label) || selected.optionId,
        intent,
      };
    }
  }
  return null;
}
