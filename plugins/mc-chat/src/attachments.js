import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const MAX_ATTACHMENTS = 10;
const DEFAULT_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_TEXT_CHARS_PER_FILE = 12_000;
const DEFAULT_MAX_TOTAL_TEXT_CHARS = 35_000;
const DEFAULT_EXTRACT_TIMEOUT_MS = 10_000;

const execFileAsync = promisify(execFile);

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

function extensionOf(filenameOrUrl) {
  const clean = String(filenameOrUrl || "").split("?")[0].split("#")[0];
  const base = clean.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : "";
}

function attachmentKind(attachment) {
  const mime = attachment.mimeType.toLowerCase();
  const ext = extensionOf(attachment.filename) || extensionOf(attachment.url);
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) return "docx";
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  ) return "xlsx";
  if (
    mime.startsWith("text/") ||
    ["csv", "txt", "md", "markdown", "json", "xml", "html", "htm"].includes(ext)
  ) return "text";
  if (mime === "application/vnd.google-apps.document") return "google-doc";
  if (mime === "application/vnd.google-apps.spreadsheet") return "google-sheet";
  return "unsupported";
}

const FILE_READ_ACTION_RE =
  /\b(lee|leer|leelo|lea|abre|abrir|analiza|analizar|revisa|revisar|resume|resumir|extrae|extraer|transcribe|transcribir|procesa|procesar|interpreta|interpretar|describe|describir|read|analyze|analyse|review|summarize|summarise|extract|parse|inspect|open)\b/;
const FILE_DIRECT_OBJECT_ACTION_RE =
  /\b(leelo|leela|leelos|leelas|analizalo|analizala|analizalos|analizalas|revisalo|revisala|revisalos|revisalas|resumelo|resumela|resumelos|resumelas|extraelo|extraela|extraelos|extraelas|describelo|describela|describelos|describelas)\b/;
const FILE_REFERENCE_RE =
  /\b(archivo|adjunto|pdf|documento|doc|docx|imagen|foto|captura|texto|txt|markdown|csv|excel|xlsx|sheet|sheets|spreadsheet|hoja)\b/;
const FILE_QUESTION_RE = /\b(que|qué)\s+(dice|contiene|hay|ves|muestra)\b/;

function normalizeIntentText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function shouldExtractAttachmentContent(text) {
  const normalized = normalizeIntentText(text);
  if (!normalized.trim()) return false;
  return (
    FILE_DIRECT_OBJECT_ACTION_RE.test(normalized) ||
    (FILE_READ_ACTION_RE.test(normalized) && FILE_REFERENCE_RE.test(normalized)) ||
    FILE_QUESTION_RE.test(normalized)
  );
}

function normalizeSearchText(value) {
  return normalizeIntentText(value)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[_./()[\]{}:;,'"!?¿¡|\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function filenameStem(filename) {
  const base = String(filename || "").split("?")[0].split("#")[0].split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(0, idx) : base;
}

function searchTokens(value) {
  const generic = new Set([
    "archivo", "adjunto", "documento", "pdf", "doc", "docx", "imagen", "foto",
    "captura", "texto", "csv", "excel", "xlsx", "sheet", "sheets", "hoja",
    "ese", "este", "esta", "base", "cargado", "subido", "ver", "ves",
  ]);
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => {
      if (!token) return false;
      if (generic.has(token)) return false;
      return token.length >= 3 || /^\d{2,}$/.test(token);
    });
}

function scoreIndexedAttachmentMatch(item, userText) {
  const text = normalizeSearchText(userText);
  if (!text) return 0;

  const stem = filenameStem(item?.filename);
  const filename = normalizeSearchText(stem);
  if (!filename) return 0;
  if (text.includes(filename)) return 100;

  const tokens = Array.from(new Set(searchTokens(stem)));
  if (tokens.length === 0) return 0;

  const matched = tokens.filter((token) => text.includes(token));
  if (matched.length === 0) return 0;

  const ratio = matched.length / tokens.length;
  const hasDistinctiveMatch = matched.some((token) => token.length >= 5 || /^\d{4}$/.test(token));
  if (matched.length >= 2 && ratio >= 0.4) return 20 + Math.round(ratio * 60) + matched.length;
  if (matched.length >= 3) return 20 + matched.length;
  if (hasDistinctiveMatch && tokens.length <= 2) return 15 + matched.length;
  return 0;
}

export function findIndexedAttachmentMatches(index, userText, opts = {}) {
  const items = Array.isArray(index?.items) ? index.items : [];
  const maxMatches = opts.maxMatches || 3;
  return items
    .map((item) => ({ item, score: scoreIndexedAttachmentMatch(item, userText) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const aSeen = Number(a.item?.lastSeenAt || a.item?.firstSeenAt || 0);
      const bSeen = Number(b.item?.lastSeenAt || b.item?.firstSeenAt || 0);
      return bSeen - aSeen;
    })
    .slice(0, maxMatches)
    .map(({ item, score }) => ({ ...item, matchScore: score }));
}

function truncateText(value, maxChars) {
  const text = String(value || "").replace(/\u0000/g, "").trim();
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

function fenceText(value) {
  return String(value || "").replace(/```/g, "'''");
}

function readPngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifDimensions(buffer) {
  if (buffer.length < 10) return null;
  const sig = buffer.subarray(0, 6).toString("ascii");
  if (sig !== "GIF87a" && sig !== "GIF89a") return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function imageMetadata(buffer) {
  return readPngDimensions(buffer) || readGifDimensions(buffer) || readJpegDimensions(buffer);
}

async function downloadAttachment(attachment, opts) {
  const url = new URL(attachment.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, status: "unsupported_url", error: `URL protocol not supported: ${url.protocol}` };
  }
  const timeoutMs = opts.downloadTimeoutMs || DEFAULT_EXTRACT_TIMEOUT_MS;
  const maxBytes = opts.maxDownloadBytes || DEFAULT_MAX_DOWNLOAD_BYTES;
  const res = await fetch(attachment.url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    return { ok: false, status: "download_failed", error: `HTTP ${res.status}` };
  }
  const contentLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: "too_large", error: `content-length ${contentLength} exceeds ${maxBytes}` };
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > maxBytes) {
    return { ok: false, status: "too_large", error: `downloaded ${buffer.length} bytes exceeds ${maxBytes}` };
  }
  return {
    ok: true,
    buffer,
    contentType: cleanText(res.headers.get("content-type") || attachment.mimeType, attachment.mimeType),
  };
}

const PYTHON_EXTRACTOR = String.raw`
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

path, kind, max_chars_raw = sys.argv[1], sys.argv[2], sys.argv[3]
max_chars = int(max_chars_raw)

def clean(text):
    text = re.sub(r"\r\n?", "\n", text or "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:max_chars]

def emit(**payload):
    print(json.dumps(payload, ensure_ascii=False))

def extract_pdf():
    pages = 0
    texts = []
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            pages = len(pdf.pages)
            for page in pdf.pages[:80]:
                texts.append(page.extract_text() or "")
                if sum(len(t) for t in texts) >= max_chars:
                    break
    except Exception:
        try:
            from pypdf import PdfReader
            reader = PdfReader(path)
            pages = len(reader.pages)
            for page in reader.pages[:80]:
                texts.append(page.extract_text() or "")
                if sum(len(t) for t in texts) >= max_chars:
                    break
        except Exception as exc:
            emit(status="error", error=str(exc))
            return
    emit(status="extracted", text=clean("\n\n".join(texts)), pages=pages)

def xml_text(root):
    values = []
    for el in root.iter():
        if el.tag.endswith("}t") or el.tag == "t":
            if el.text:
                values.append(el.text)
        elif el.tag.endswith("}tab") or el.tag == "tab":
            values.append("\t")
        elif el.tag.endswith("}br") or el.tag == "br":
            values.append("\n")
    return "".join(values)

def extract_docx():
    try:
        texts = []
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.startswith("word/") and n.endswith(".xml")]
            for name in ["word/document.xml", *sorted(n for n in names if n != "word/document.xml")]:
                if name not in z.namelist():
                    continue
                root = ET.fromstring(z.read(name))
                value = xml_text(root)
                if value:
                    texts.append(value)
                if sum(len(t) for t in texts) >= max_chars:
                    break
        emit(status="extracted", text=clean("\n\n".join(texts)))
    except Exception as exc:
        emit(status="error", error=str(exc))

def shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return [xml_text(si) for si in root]

def cell_text(cell, shared):
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    typ = cell.attrib.get("t")
    if typ == "inlineStr":
        return xml_text(cell)
    v = cell.find(ns + "v")
    if v is None or v.text is None:
        return ""
    if typ == "s":
        try:
            return shared[int(v.text)]
        except Exception:
            return v.text
    return v.text

def extract_xlsx():
    try:
        lines = []
        with zipfile.ZipFile(path) as z:
            shared = shared_strings(z)
            sheet_names = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
            for idx, name in enumerate(sheet_names[:20], 1):
                lines.append(f"Sheet {idx}:")
                root = ET.fromstring(z.read(name))
                for row in root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                    values = [cell_text(c, shared) for c in row]
                    values = [v for v in values if v != ""]
                    if values:
                        lines.append("\t".join(values))
                    if sum(len(line) for line in lines) >= max_chars:
                        break
                if sum(len(line) for line in lines) >= max_chars:
                    break
        emit(status="extracted", text=clean("\n".join(lines)), sheets=len(sheet_names))
    except Exception as exc:
        emit(status="error", error=str(exc))

if kind == "pdf":
    extract_pdf()
elif kind == "docx":
    extract_docx()
elif kind == "xlsx":
    extract_xlsx()
else:
    emit(status="error", error=f"unsupported kind {kind}")
`;

async function runPythonExtractor(kind, buffer, opts) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-chat-attachment-"));
  const file = path.join(tmpDir, `attachment.${kind}`);
  try {
    await fs.writeFile(file, buffer);
    const { stdout } = await execFileAsync(
      "python3",
      ["-c", PYTHON_EXTRACTOR, file, kind, String(opts.maxTextCharsPerFile || DEFAULT_MAX_TEXT_CHARS_PER_FILE)],
      {
        timeout: opts.extractTimeoutMs || DEFAULT_EXTRACT_TIMEOUT_MS,
        maxBuffer: (opts.maxTextCharsPerFile || DEFAULT_MAX_TEXT_CHARS_PER_FILE) * 4 + 20_000,
      },
    );
    return JSON.parse(stdout || "{}");
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractAttachmentContent(attachment, opts) {
  const kind = attachmentKind(attachment);
  if (kind === "google-doc" || kind === "google-sheet") {
    return {
      status: "metadata_only",
      note: "Google-native files need an exported PDF/DOCX/XLSX/CSV or an authenticated Drive export URL.",
    };
  }
  if (kind === "unsupported") {
    return { status: "metadata_only", note: "No extractor is available for this file type yet." };
  }

  let downloaded;
  try {
    const fetchAttachment = opts.fetchAttachment || downloadAttachment;
    downloaded = await fetchAttachment(attachment, opts);
  } catch (error) {
    return {
      status: "download_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!downloaded?.ok) return downloaded || { status: "download_failed" };

  if (kind === "image") {
    const dimensions = imageMetadata(downloaded.buffer);
    return {
      status: "image_metadata",
      dimensions,
      note: "Image binary is attached by URL. A vision-capable runtime/tool must inspect the image content.",
    };
  }
  if (kind === "text") {
    const decoded = downloaded.buffer.toString("utf8");
    const { text, truncated } = truncateText(decoded, opts.maxTextCharsPerFile || DEFAULT_MAX_TEXT_CHARS_PER_FILE);
    return { status: "extracted", text, truncated };
  }
  return runPythonExtractor(kind, downloaded.buffer, opts);
}

async function buildAttachmentContextBlockWithExtraction(normalized, originalCount, opts) {
  const lines = attachmentHeader(normalized.length);
  let remaining = opts.maxTotalTextChars || DEFAULT_MAX_TOTAL_TEXT_CHARS;

  for (const [index, attachment] of normalized.entries()) {
    lines.push(...attachmentMetadataLines(attachment, index));
    const extracted = await extractAttachmentContent(attachment, opts);
    const status = cleanText(extracted?.status, "metadata_only");
    lines.push(`- read_status: ${status}`);
    if (extracted?.dimensions?.width && extracted?.dimensions?.height) {
      lines.push(`- image_dimensions: ${extracted.dimensions.width}x${extracted.dimensions.height}`);
    }
    if (extracted?.pages) lines.push(`- pages: ${extracted.pages}`);
    if (extracted?.sheets) lines.push(`- sheets: ${extracted.sheets}`);
    if (extracted?.note) lines.push(`- note: ${cleanText(extracted.note)}`);
    if (extracted?.error) lines.push(`- extraction_error: ${cleanText(extracted.error).slice(0, 300)}`);
    if (extracted?.text) {
      const { text, truncated } = truncateText(extracted.text, Math.max(0, remaining));
      remaining -= text.length;
      lines.push(`- extracted_text_chars: ${text.length}${truncated || extracted.truncated ? " (truncated)" : ""}`);
      if (text) {
        lines.push("- extracted_text:");
        lines.push("```text");
        lines.push(fenceText(text));
        lines.push("```");
      }
    }
  }

  appendFooter(lines, originalCount, normalized.length);
  return lines.join("\n");
}

function attachmentHeader(count) {
  return [
    "[User Attachments]",
    `El usuario adjunto ${count} archivo(s) a este mensaje. Tratalos como parte del turno actual.`,
    "Si el usuario pide leer, revisar o analizar el archivo, usa primero el texto extraido incluido aqui. Si no hay texto extraido, descarga la URL indicada con tus herramientas disponibles.",
    "No digas que no hay adjuntos cuando esta seccion este presente.",
    "",
  ];
}

function attachmentMetadataLines(attachment, index) {
  const lines = [
    `Archivo ${index + 1}: ${attachment.filename}`,
    `- url: ${attachment.url}`,
    `- mime_type: ${attachment.mimeType}`,
  ];
  if (attachment.size !== null) lines.push(`- size_bytes: ${attachment.size}`);
  return lines;
}

function appendFooter(lines, originalCount, normalizedCount) {
  if (originalCount > normalizedCount) {
    lines.push(`Se omitieron ${originalCount - normalizedCount} adjunto(s) extra para mantener el contexto acotado.`);
  }
  lines.push("[/User Attachments]");
}

function uploadedIndexCandidates(slug, opts = {}) {
  const brandPath = path.join("brand", slug, "attachments", "index.json");
  const workspaceDir = opts.workspaceDir;
  const home = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
  return Array.from(new Set([
    workspaceDir ? path.join(workspaceDir, brandPath) : "",
    path.join(home, "workspace-sancho", brandPath),
    path.join(process.cwd(), brandPath),
    path.join(process.cwd(), "workspace-sancho", brandPath),
  ].filter(Boolean)));
}

async function readUploadedAttachmentIndex(slug, opts = {}) {
  if (!slug || typeof slug !== "string") return null;
  for (const filePath of uploadedIndexCandidates(slug, opts)) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data?.items)) return { ...data, filePath };
    } catch {
      // Try the next candidate path.
    }
  }
  return null;
}

function indexedAttachmentMetadataLines(attachment, index, indexPath) {
  const normalized = normalizeAttachment(attachment);
  if (!normalized) return [];
  const lines = [
    `Archivo indexado ${index + 1}: ${normalized.filename}`,
    `- index_path: ${indexPath}`,
    `- url: ${normalized.url}`,
    `- mime_type: ${normalized.mimeType}`,
  ];
  if (normalized.size !== null) lines.push(`- size_bytes: ${normalized.size}`);
  if (attachment?.references?.[0]?.threadId) lines.push(`- source_thread: ${cleanText(attachment.references[0].threadId)}`);
  if (attachment?.references?.[0]?.threadFile) lines.push(`- source_chat_file: ${cleanText(attachment.references[0].threadFile)}`);
  if (attachment?.matchScore) lines.push(`- match_score: ${attachment.matchScore}`);
  return lines;
}

export async function buildIndexedAttachmentContextBlock({ slug, text, extractContent = false, logger, ...opts } = {}) {
  const index = await readUploadedAttachmentIndex(slug, opts);
  if (!index) return "";
  const matches = findIndexedAttachmentMatches(index, text, opts);
  if (matches.length === 0) return "";

  const brandPath = index.indexPath || `brand/${slug}/attachments/index.json`;
  const lines = [
    "[Indexed Uploaded Files]",
    `El usuario menciono archivo(s) ya subido(s) que aparecen en ${brandPath}.`,
    "Si el usuario solo pregunta si ves el archivo, si esta cargado o donde esta, confirma que esta en el indice y usa estos metadatos. No leas ni resumas el contenido en ese caso.",
    "Solo uses extracted_text cuando el usuario pida explicitamente leer, analizar, revisar, resumir, extraer, interpretar o describir el contenido del archivo.",
    "No inventes rutas locales para estos archivos. Usa la URL indicada o el texto extraido incluido aqui.",
    "",
  ];

  let remaining = opts.maxTotalTextChars || DEFAULT_MAX_TOTAL_TEXT_CHARS;
  for (const [indexInBlock, attachment] of matches.entries()) {
    const normalized = normalizeAttachment(attachment);
    if (!normalized) continue;
    lines.push(...indexedAttachmentMetadataLines(attachment, indexInBlock, brandPath));
    if (!extractContent) {
      lines.push("- read_status: not_requested");
      continue;
    }

    const extracted = await extractAttachmentContent(normalized, opts);
    const status = cleanText(extracted?.status, "metadata_only");
    lines.push(`- read_status: ${status}`);
    if (extracted?.dimensions?.width && extracted?.dimensions?.height) {
      lines.push(`- image_dimensions: ${extracted.dimensions.width}x${extracted.dimensions.height}`);
    }
    if (extracted?.pages) lines.push(`- pages: ${extracted.pages}`);
    if (extracted?.sheets) lines.push(`- sheets: ${extracted.sheets}`);
    if (extracted?.note) lines.push(`- note: ${cleanText(extracted.note)}`);
    if (extracted?.error) lines.push(`- extraction_error: ${cleanText(extracted.error).slice(0, 300)}`);
    if (extracted?.text) {
      const { text: extractedText, truncated } = truncateText(extracted.text, Math.max(0, remaining));
      remaining -= extractedText.length;
      lines.push(`- extracted_text_chars: ${extractedText.length}${truncated || extracted.truncated ? " (truncated)" : ""}`);
      if (extractedText) {
        lines.push("- extracted_text:");
        lines.push("```text");
        lines.push(fenceText(extractedText));
        lines.push("```");
      }
    }
  }

  lines.push("[/Indexed Uploaded Files]");
  logger?.info?.(`[mc-chat] indexed attachments matched slug=${slug} count=${matches.length} extract=${Boolean(extractContent)}`);
  return lines.join("\n");
}

export function buildAttachmentContextBlock(attachments, opts = {}) {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const normalized = attachments.map(normalizeAttachment).filter(Boolean).slice(0, MAX_ATTACHMENTS);
  if (normalized.length === 0) return "";
  if (opts.extractContent) {
    return buildAttachmentContextBlockWithExtraction(normalized, attachments.length, opts);
  }

  const lines = attachmentHeader(normalized.length);
  normalized.forEach((attachment, index) => {
    lines.push(...attachmentMetadataLines(attachment, index));
  });

  appendFooter(lines, attachments.length, normalized.length);
  return lines.join("\n");
}
