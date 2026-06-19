/**
 * anchoring.ts — W3C TextQuoteSelector anchoring over rendered DOM (SAN-148).
 *
 * TypeScript port of the g4u-comments core (GBRAIN-66): build a global
 * text index of the rendered document, capture selections as
 * exact + prefix/suffix quotes, and re-anchor stored quotes after the
 * doc is regenerated (scoring: exact occurrences, +2 prefix match,
 * +2 suffix match, + proximity to the original offset).
 *
 * The vanilla twin for HTML deliverables lives in public/comments-embed.js —
 * if you change the scoring here, change it there too.
 *
 * Pure DOM/string logic, no React: testable against synthetic indexes.
 */

/** prefix/suffix capture window, chars. Same as g4u-comments. */
export const ANCHOR_CTX = 32;

export interface TextQuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
  /** Global text offset where the quote was captured (proximity tie-break). */
  start?: number;
}

export interface TextSegment {
  node: Text;
  start: number;
  len: number;
}

export interface TextIndex {
  segs: TextSegment[];
  full: string;
}

/**
 * Walk the rendered doc and build a flat text index. Skips script/style/
 * textarea and anything inside an element marked `data-comments-ui`
 * (our own overlay).
 */
export function buildTextIndex(root: HTMLElement): TextIndex {
  const segs: TextSegment[] = [];
  let full = "";
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n: Node) {
      const p = (n as Text).parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") {
        return NodeFilter.FILTER_REJECT;
      }
      if (p.closest("[data-comments-ui]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    segs.push({ node: t, start: full.length, len: t.data.length });
    full += t.data;
  }
  return { segs, full };
}

/** Global offset of a (node, offset) position, or -1 when outside the index. */
export function globalOffset(index: TextIndex, node: Node, offset: number): number {
  for (const seg of index.segs) {
    if (seg.node === node) return seg.start + offset;
  }
  // Selections may land on an element node (offset = child index): map to
  // the first text segment inside it.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const child = node.childNodes[offset] ?? node.childNodes[node.childNodes.length - 1];
    if (child) {
      for (const seg of index.segs) {
        if (child === seg.node || (child.contains && child.contains(seg.node))) {
          return seg.start;
        }
      }
    }
  }
  return -1;
}

/** Build a DOM Range spanning [start, end) global text offsets. */
export function rangeFromOffsets(index: TextIndex, start: number, end: number): Range | null {
  if (index.segs.length === 0) return null;
  const doc = index.segs[0].node.ownerDocument;
  const r = doc.createRange();
  let s: TextSegment | null = null;
  let e: TextSegment | null = null;
  for (const seg of index.segs) {
    if (s === null && start < seg.start + seg.len) {
      s = seg;
      r.setStart(seg.node, Math.max(0, start - seg.start));
    }
    if (end <= seg.start + seg.len) {
      e = seg;
      r.setEnd(seg.node, Math.max(0, end - seg.start));
      break;
    }
  }
  return s && e ? r : null;
}

/** Capture the current selection as a TextQuoteSelector anchor. */
export function quoteFromSelection(index: TextIndex, sel: Selection): TextQuoteAnchor | null {
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const sOff = globalOffset(index, range.startContainer, range.startOffset);
  const eOff = globalOffset(index, range.endContainer, range.endOffset);
  if (sOff < 0 || eOff < 0 || eOff <= sOff) return null;
  const full = index.full;
  return {
    exact: full.slice(sOff, eOff),
    prefix: full.slice(Math.max(0, sOff - ANCHOR_CTX), sOff),
    suffix: full.slice(eOff, eOff + ANCHOR_CTX),
    start: sOff,
  };
}

/**
 * Find the best occurrence of an anchor in the index. Pure string scoring,
 * exported separately so it's testable without a DOM.
 */
export function bestAnchorOffset(full: string, anchor: TextQuoteAnchor): number {
  if (!anchor.exact) return -1;
  const hits: number[] = [];
  let idx = full.indexOf(anchor.exact);
  while (idx !== -1 && hits.length < 50) {
    hits.push(idx);
    idx = full.indexOf(anchor.exact, idx + 1);
  }
  if (hits.length === 0) return -1;
  let best = hits[0];
  let bestScore = -1;
  for (const h of hits) {
    let score = 0;
    if (anchor.prefix && full.slice(Math.max(0, h - ANCHOR_CTX), h) === anchor.prefix) score += 2;
    if (
      anchor.suffix &&
      full.slice(h + anchor.exact.length, h + anchor.exact.length + ANCHOR_CTX) === anchor.suffix
    ) {
      score += 2;
    }
    if (typeof anchor.start === "number") score += 1 / (1 + Math.abs(h - anchor.start));
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** Re-anchor a stored quote into the current DOM. Null = orphaned. */
export function reanchor(index: TextIndex, anchor: TextQuoteAnchor): Range | null {
  const best = bestAnchorOffset(index.full, anchor);
  if (best < 0) return null;
  return rangeFromOffsets(index, best, best + anchor.exact.length);
}
