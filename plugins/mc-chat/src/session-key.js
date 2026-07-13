function modelFromValue(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const primary = value.primary;
    if (typeof primary === "string" && primary.trim()) return primary.trim();
  }
  return null;
}

export function resolveAgentModel(cfg, agentId) {
  const agents = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : [];
  const entry = agents.find((agent) => agent?.id === agentId);
  return modelFromValue(entry?.model) || modelFromValue(cfg?.agents?.defaults?.model);
}

export function modelSessionSlug(model) {
  const raw = typeof model === "string" && model.trim() ? model.trim() : "default";
  return raw
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "default";
}

export function buildAgentSessionKey(agentId, chatId, cfg, modelOverride) {
  const model = modelFromValue(modelOverride) || resolveAgentModel(cfg, agentId);
  return `agent:${agentId}:model:${modelSessionSlug(model)}:${chatId}`;
}
