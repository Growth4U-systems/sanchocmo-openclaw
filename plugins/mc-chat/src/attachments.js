const MAX_ATTACHMENTS = 10;

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\r\n]+/g, " ").trim() || fallback;
}

function normalizeAttachment(input) {
  if (!input || typeof input !== "object") return null;
  const url = cleanText(input.url);
  const filename = cleanText(input.filename, "archivo-adjunto");
  if (!url) return null;
  const size = Number(input.size);
  return {
    url,
    filename,
    mimeType: cleanText(input.mimeType || input.type, "application/octet-stream"),
    size: Number.isFinite(size) && size >= 0 ? Math.round(size) : null,
  };
}

export function buildAttachmentContextBlock(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const normalized = attachments.map(normalizeAttachment).filter(Boolean).slice(0, MAX_ATTACHMENTS);
  if (normalized.length === 0) return "";

  const lines = [
    "[User Attachments]",
    `El usuario adjuntó ${normalized.length} archivo(s) a este mensaje. Trátalos como parte del turno actual.`,
    "Si el usuario pide leer, revisar o analizar el archivo, descarga la URL indicada con tus herramientas disponibles antes de responder.",
    "No digas que no hay adjuntos cuando esta sección esté presente.",
    "",
  ];

  normalized.forEach((attachment, index) => {
    lines.push(`Archivo ${index + 1}: ${attachment.filename}`);
    lines.push(`- url: ${attachment.url}`);
    lines.push(`- mime_type: ${attachment.mimeType}`);
    if (attachment.size !== null) lines.push(`- size_bytes: ${attachment.size}`);
  });

  if (attachments.length > normalized.length) {
    lines.push(`Se omitieron ${attachments.length - normalized.length} adjunto(s) extra para mantener el contexto acotado.`);
  }

  lines.push("[/User Attachments]");
  return lines.join("\n");
}
