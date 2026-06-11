/* mc-comments-embed — capa de comentarios para deliverables HTML compartidos (SAN-148).
 * Port de g4u-comments (GBRAIN-66) al contrato de Mission Control. Sin cuentas:
 * nombre + comentario. Anclaje TextQuoteSelector (W3C) con re-anclaje por scoring.
 *
 * El gemelo canónico del motor de anclaje vive en src/lib/anchoring.ts (visor
 * markdown React) — si cambias el scoring aquí, cámbialo allí también.
 *
 * Uso (inyectado por /api/share/[token]/view):
 *   <script src="/comments-embed.js" data-api="/api/share/<token>/comments" defer></script>
 */
(function () {
  "use strict";

  // ---------- config ----------
  var script = document.currentScript || document.querySelector("script[data-api][src*='comments-embed.js']");
  if (!script) return;
  var API = script.getAttribute("data-api");
  if (!API) return;
  var CTX = 32; // chars de prefix/suffix

  var state = { comments: [], open: false };
  var textIndex = null;

  // ---------- índice de texto (TreeWalker) ----------
  function buildIndex() {
    var segs = [];
    var full = "";
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        if (p.closest("[data-mcc-ui]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = walker.nextNode())) {
      segs.push({ node: n, start: full.length, len: n.data.length });
      full += n.data;
    }
    return { segs: segs, full: full };
  }

  function globalOffset(node, off) {
    for (var i = 0; i < textIndex.segs.length; i++) {
      if (textIndex.segs[i].node === node) return textIndex.segs[i].start + off;
    }
    // Element containers (triple-click / programmatic selections): the
    // offset is a child index, not a character offset. Map to the first
    // text segment of that child, or to the end of the element's last
    // segment when the offset points past the final child.
    if (node.nodeType === 1) {
      var children = node.childNodes;
      if (off < children.length) {
        var child = children[off];
        for (var j = 0; j < textIndex.segs.length; j++) {
          var seg = textIndex.segs[j];
          if (child === seg.node || (child.contains && child.contains(seg.node))) return seg.start;
        }
      } else {
        var last = -1;
        for (var k = 0; k < textIndex.segs.length; k++) {
          var s2 = textIndex.segs[k];
          if (node.contains(s2.node)) last = s2.start + s2.len;
        }
        return last;
      }
    }
    return -1;
  }

  function rangeFromOffsets(start, end) {
    var r = document.createRange();
    var s = null, e = null;
    for (var i = 0; i < textIndex.segs.length; i++) {
      var seg = textIndex.segs[i];
      if (s === null && start < seg.start + seg.len) { s = seg; r.setStart(seg.node, Math.max(0, start - seg.start)); }
      if (end <= seg.start + seg.len) { e = seg; r.setEnd(seg.node, Math.max(0, end - seg.start)); break; }
    }
    return s && e ? r : null;
  }

  // ---------- anclaje ----------
  function quoteFromSelection(sel) {
    var range = sel.getRangeAt(0);
    var sOff = globalOffset(range.startContainer, range.startOffset);
    var eOff = globalOffset(range.endContainer, range.endOffset);
    if (sOff < 0 || eOff < 0 || eOff <= sOff) return null;
    var full = textIndex.full;
    return {
      exact: full.slice(sOff, eOff),
      prefix: full.slice(Math.max(0, sOff - CTX), sOff),
      suffix: full.slice(eOff, eOff + CTX),
      start: sOff,
    };
  }

  function reanchor(anchor) {
    if (!anchor || !anchor.exact) return null;
    var full = textIndex.full;
    var hits = [];
    var idx = full.indexOf(anchor.exact);
    while (idx !== -1 && hits.length < 50) { hits.push(idx); idx = full.indexOf(anchor.exact, idx + 1); }
    if (!hits.length) return null;
    var best = hits[0], bestScore = -1;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i], score = 0;
      if (anchor.prefix && full.slice(Math.max(0, h - CTX), h) === anchor.prefix) score += 2;
      if (anchor.suffix && full.slice(h + anchor.exact.length, h + anchor.exact.length + CTX) === anchor.suffix) score += 2;
      if (typeof anchor.start === "number") score += 1 / (1 + Math.abs(h - anchor.start));
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return rangeFromOffsets(best, best + anchor.exact.length);
  }

  // ---------- contrato MC ⇄ anchor interno ----------
  function anchorOf(c) {
    if (!c.anchorText) return null;
    return {
      exact: c.anchorText,
      prefix: c.anchorPrefix || "",
      suffix: c.anchorSuffix || "",
      start: typeof c.anchorDocOffset === "number" ? c.anchorDocOffset : undefined,
    };
  }

  // ---------- highlights (CSS Custom Highlight API) ----------
  var canHighlight = typeof window.Highlight === "function" && CSS.highlights;
  function paintHighlights() {
    if (!canHighlight) return;
    var open = [], done = [];
    state.comments.forEach(function (c) {
      if (c._range) (c.resolved ? done : open).push(c._range);
    });
    try {
      CSS.highlights.set("mcc", open.length ? new window.Highlight(...open) : new window.Highlight());
      CSS.highlights.set("mcc-done", done.length ? new window.Highlight(...done) : new window.Highlight());
    } catch (e) { /* no-op */ }
  }

  // ---------- UI (tema Sancho: parchment + tinta + rust) ----------
  var css = [
    "[data-mcc-ui]{font-family:'Nunito','Space Grotesk',system-ui,sans-serif;box-sizing:border-box;line-height:1.45}",
    "[data-mcc-ui] *{box-sizing:border-box}",
    "::highlight(mcc){background:rgba(242,201,76,.55)}",
    "::highlight(mcc-done){background:rgba(16,185,129,.18)}",
    "#mcc-fab{position:fixed;right:22px;bottom:22px;z-index:99990;background:#1E3A5F;color:#fff;border:2px solid #1A1A2E;border-radius:999px;box-shadow:3px 3px 0 #1A1A2E;padding:10px 18px;font-size:14.5px;font-weight:700;cursor:pointer}",
    "#mcc-fab:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 #1A1A2E}",
    "#mcc-bubble{position:absolute;z-index:99991;background:#1E3A5F;color:#fff;border:2px solid #1A1A2E;border-radius:8px;box-shadow:3px 3px 0 #1A1A2E;padding:7px 13px;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap}",
    "#mcc-form{position:absolute;z-index:99992;width:300px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:6px;box-shadow:5px 5px 0 #1A1A2E;padding:14px}",
    "#mcc-form .mcc-quote{font-size:11.5px;color:#2D2D44;border-left:3px solid #F2C94C;padding-left:8px;margin-bottom:9px;max-height:54px;overflow:hidden}",
    "#mcc-form input[type=text],#mcc-form textarea{width:100%;border:1.5px solid #1A1A2E;border-radius:5px;padding:7px 9px;font:inherit;font-size:13.5px;background:#fff;color:#1A1A2E;margin-bottom:8px}",
    "#mcc-form textarea{min-height:72px;resize:vertical}",
    "#mcc-form .mcc-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}",
    ".mcc-btn{background:#C45D35;color:#fff;border:2px solid #1A1A2E;border-radius:5px;box-shadow:2px 2px 0 #1A1A2E;padding:7px 15px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}",
    ".mcc-btn--ghost{background:#FDF8EF;color:#1A1A2E;box-shadow:none}",
    "#mcc-panel{position:fixed;top:0;right:0;height:100vh;width:340px;max-width:92vw;z-index:99989;background:#F5F0E6;border-left:2px solid #1A1A2E;box-shadow:-4px 0 0 rgba(26,26,46,.08);display:flex;flex-direction:column;transform:translateX(105%);transition:transform .22s cubic-bezier(.16,1,.3,1)}",
    "#mcc-panel.open{transform:none}",
    ".mcc-head{padding:16px 18px;border-bottom:2px solid #1A1A2E;display:flex;align-items:center;justify-content:space-between}",
    ".mcc-head b{font-size:15px;color:#1A1A2E}",
    ".mcc-list{flex:1;overflow-y:auto;padding:12px 14px}",
    ".mcc-item{background:#FDF8EF;border:1.5px solid #1A1A2E;border-radius:6px;box-shadow:2px 2px 0 rgba(26,26,46,.15);padding:11px 13px;margin-bottom:10px;font-size:13.5px;color:#1A1A2E}",
    ".mcc-item.resolved{opacity:.55}",
    ".mcc-item .mcc-meta{font-size:11px;color:#2D2D44;margin-bottom:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
    ".mcc-item .mcc-q{font-size:11.5px;color:#2D2D44;border-left:3px solid #F2C94C;padding-left:7px;margin:5px 0;max-height:40px;overflow:hidden;font-style:italic;cursor:pointer}",
    ".mcc-reply{border-top:1px dashed rgba(26,26,46,.3);margin-top:8px;padding:7px 0 0 14px}",
    ".mcc-actions{display:flex;gap:12px;margin-top:7px}",
    ".mcc-alink{font-size:11.5px;font-weight:700;color:#1E3A5F;cursor:pointer;background:none;border:none;padding:0;font-family:inherit}",
    ".mcc-alink:hover{text-decoration:underline}",
    ".mcc-alink--ok{color:#0B6E45}",
    ".mcc-mini{margin-top:8px}",
    ".mcc-mini input,.mcc-mini textarea{width:100%;border:1.5px solid #1A1A2E;border-radius:5px;padding:6px 8px;font:inherit;font-size:12.5px;background:#fff;color:#1A1A2E;margin-bottom:6px;box-sizing:border-box}",
    ".mcc-mini textarea{min-height:54px;resize:vertical}",
    ".mcc-tagx{font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(26,26,46,.4);border-radius:4px;padding:1px 5px}",
    ".mcc-foot{padding:12px 14px;border-top:2px solid #1A1A2E}",
    "@media print{[data-mcc-ui]{display:none!important}}",
  ].join("\n");

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtTs(ts) { var d = new Date(ts); return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }

  var fab, panel, listEl, bubble, form;

  function metaLine(c, badges) {
    return '<div class="mcc-meta"><b>' + esc(c.author) + "</b> · " + fmtTs(c.createdAt) + " " + (badges || "") + "</div>";
  }

  function postComment(payload, done, fail) {
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); }).then(done).catch(fail || function () {});
  }

  function patchComment(id, payload, done, fail) {
    fetch(API + "/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) { return r.json(); }).then(done).catch(fail || function () {});
  }

  function replyForm(root, item) {
    var mini = el("div", { class: "mcc-mini" });
    mini.innerHTML =
      '<input type="text" class="mcc-rname" placeholder="Tu nombre" maxlength="60">' +
      '<textarea class="mcc-rbody" placeholder="Tu respuesta…" maxlength="4000"></textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="mcc-btn mcc-btn--ghost mcc-rcancel">Cancelar</button>' +
      '<button class="mcc-btn mcc-rsend">Responder</button></div>';
    var nameI = mini.querySelector(".mcc-rname");
    nameI.value = localStorage.getItem("mcc-name") || "";
    mini.querySelector(".mcc-rcancel").addEventListener("click", function () { mini.remove(); });
    mini.querySelector(".mcc-rsend").addEventListener("click", function () {
      var name = nameI.value.trim(), body = mini.querySelector(".mcc-rbody").value.trim();
      if (!name || !body) return;
      localStorage.setItem("mcc-name", name);
      var btn = mini.querySelector(".mcc-rsend"); btn.disabled = true; btn.textContent = "Enviando…";
      postComment({ author: name, body: body, parentId: root.id, website: "" }, function (res) {
        if (res.ok && res.id) {
          state.comments.push({ id: res.id, author: name, body: body, parentId: root.id, resolved: false, createdAt: res.createdAt || new Date().toISOString() });
          renderPanel();
        } else { btn.disabled = false; btn.textContent = "Reintentar"; }
      }, function () { btn.disabled = false; btn.textContent = "Reintentar"; });
    });
    item.appendChild(mini);
    (nameI.value ? mini.querySelector(".mcc-rbody") : nameI).focus();
  }

  function renderPanel() {
    var roots = state.comments.filter(function (c) { return !c.parentId; });
    var openC = roots.filter(function (c) { return !c.resolved; });
    fab.textContent = "💬 " + openC.length;
    listEl.innerHTML = "";
    if (!state.comments.length) {
      listEl.appendChild(el("div", { style: "font-size:13px;color:#2D2D44;padding:8px 4px" },
        "Sin comentarios todavía. Selecciona texto del documento para comentar, o usa «Comentario general»."));
    }
    roots.forEach(function (c) {
      var replies = state.comments.filter(function (r) { return r.parentId === c.id; });
      var item = el("div", { class: "mcc-item" + (c.resolved ? " resolved" : "") });
      var badges = "";
      if (c.anchorText && !c._range) badges += '<span class="mcc-tagx" style="color:#9A3A14;background:#FAE3DA">huérfano</span>';
      if (!c.anchorText) badges += '<span class="mcc-tagx" style="color:#1E3A5F;background:#E3EAFD">general</span>';
      if (c.resolved) badges += '<span class="mcc-tagx" style="color:#0B6E45;background:#E2F4EA">resuelto</span>';
      var html = metaLine(c, badges) +
        (c.anchorText ? '<div class="mcc-q" title="Ir al texto">“' + esc(c.anchorText.slice(0, 140)) + '”</div>' : "") +
        "<div>" + esc(c.body) + "</div>";
      replies.forEach(function (r) {
        html += '<div class="mcc-reply">' + metaLine(r) + "<div>" + esc(r.body) + "</div></div>";
      });
      html += '<div class="mcc-actions">' +
        '<button class="mcc-alink mcc-do-reply">↩ Responder</button>' +
        '<button class="mcc-alink mcc-alink--ok mcc-do-resolve">' + (c.resolved ? "Reabrir" : "✓ Resolver") + "</button>" +
        "</div>";
      item.innerHTML = html;
      var q = item.querySelector(".mcc-q");
      if (q && c._range) {
        q.addEventListener("click", function () {
          var node = c._range.startContainer.parentElement;
          if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      item.querySelector(".mcc-do-reply").addEventListener("click", function () {
        if (!item.querySelector(".mcc-mini")) replyForm(c, item);
      });
      item.querySelector(".mcc-do-resolve").addEventListener("click", function () {
        patchComment(c.id, { resolved: !c.resolved }, function (res) {
          if (res.ok) { c.resolved = !c.resolved; paintHighlights(); renderPanel(); }
        });
      });
      listEl.appendChild(item);
    });
  }

  function hideBubble() { if (bubble) { bubble.remove(); bubble = null; } }
  function hideForm() { if (form) { form.remove(); form = null; } }

  function showForm(anchor, x, y) {
    hideForm(); hideBubble();
    form = el("div", { id: "mcc-form", "data-mcc-ui": "1" });
    form.innerHTML =
      (anchor && anchor.exact ? '<div class="mcc-quote">“' + esc(anchor.exact.slice(0, 160)) + '”</div>' : "<b style='font-size:13px'>Comentario general</b><div style='height:8px'></div>") +
      '<input type="text" id="mcc-name" placeholder="Tu nombre" maxlength="60">' +
      '<textarea id="mcc-body" placeholder="Tu comentario…" maxlength="4000"></textarea>' +
      '<input type="text" class="mcc-hp" name="website" tabindex="-1" autocomplete="off">' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="mcc-btn mcc-btn--ghost" id="mcc-cancel">Cancelar</button>' +
      '<button class="mcc-btn" id="mcc-send">Comentar</button></div>';
    document.body.appendChild(form);
    var fw = 300, fx = Math.min(Math.max(8, x), window.innerWidth + window.scrollX - fw - 8);
    form.style.left = fx + "px"; form.style.top = (y + 8) + "px";
    var nameI = form.querySelector("#mcc-name");
    nameI.value = localStorage.getItem("mcc-name") || "";
    (nameI.value ? form.querySelector("#mcc-body") : nameI).focus();
    form.querySelector("#mcc-cancel").addEventListener("click", hideForm);
    form.querySelector("#mcc-send").addEventListener("click", function () {
      var name = nameI.value.trim(), body = form.querySelector("#mcc-body").value.trim();
      var hp = form.querySelector(".mcc-hp").value;
      if (!name || !body) return;
      localStorage.setItem("mcc-name", name);
      var btn = form.querySelector("#mcc-send"); btn.disabled = true; btn.textContent = "Enviando…";
      var payload = { author: name, body: body, website: hp };
      if (anchor) {
        payload.anchorText = anchor.exact;
        payload.anchorPrefix = anchor.prefix;
        payload.anchorSuffix = anchor.suffix;
        payload.anchorDocOffset = anchor.start;
      }
      postComment(payload, function (res) {
        if (res.ok && res.id) {
          var c = {
            id: res.id, author: name, body: body, parentId: null, resolved: false,
            createdAt: res.createdAt || new Date().toISOString(),
            anchorText: anchor ? anchor.exact : null,
            anchorPrefix: anchor ? anchor.prefix : null,
            anchorSuffix: anchor ? anchor.suffix : null,
            anchorDocOffset: anchor ? anchor.start : null,
          };
          c._range = anchor ? reanchor(anchor) : null;
          state.comments.push(c);
          paintHighlights(); renderPanel();
          if (!state.open) togglePanel(true);
          hideForm();
        } else { btn.disabled = false; btn.textContent = "Reintentar"; }
      }, function () { btn.disabled = false; btn.textContent = "Reintentar"; });
    });
  }

  function togglePanel(force) {
    state.open = force !== undefined ? force : !state.open;
    panel.classList.toggle("open", state.open);
  }

  function onSelection() {
    hideBubble();
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    if (form && form.contains(sel.anchorNode)) return;
    var range = sel.getRangeAt(0);
    if (!document.body.contains(range.commonAncestorContainer)) return;
    var anchor = quoteFromSelection(sel);
    if (!anchor || !anchor.exact.trim()) return;
    var rect = range.getBoundingClientRect();
    bubble = el("div", { id: "mcc-bubble", "data-mcc-ui": "1" }, "💬 Comentar");
    document.body.appendChild(bubble);
    var bx = window.scrollX + rect.left + rect.width / 2 - 50;
    var by = window.scrollY + rect.bottom + 6;
    bubble.style.left = Math.max(8, bx) + "px"; bubble.style.top = by + "px";
    bubble.addEventListener("mousedown", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      showForm(anchor, bx, by);
    });
  }

  function mountUI() {
    var style = el("style", { "data-mcc-ui": "1" }); style.textContent = css;
    document.head.appendChild(style);
    fab = el("button", { id: "mcc-fab", "data-mcc-ui": "1", title: "Comentarios" }, "💬 0");
    fab.addEventListener("click", function () { togglePanel(); });
    document.body.appendChild(fab);
    panel = el("div", { id: "mcc-panel", "data-mcc-ui": "1" });
    panel.innerHTML = '<div class="mcc-head"><b>Comentarios</b><button class="mcc-btn mcc-btn--ghost" id="mcc-close">✕</button></div>' +
      '<div class="mcc-list"></div>' +
      '<div class="mcc-foot"><button class="mcc-btn" id="mcc-general" style="width:100%">+ Comentario general</button>' +
      '<div style="font-size:10.5px;color:#2D2D44;margin-top:7px;text-align:center">Selecciona texto del documento para comentar un pasaje concreto · SanchoCMO</div></div>';
    document.body.appendChild(panel);
    listEl = panel.querySelector(".mcc-list");
    panel.querySelector("#mcc-close").addEventListener("click", function () { togglePanel(false); });
    panel.querySelector("#mcc-general").addEventListener("click", function () {
      showForm(null, window.scrollX + window.innerWidth / 2 - 150, window.scrollY + 80);
    });
    document.addEventListener("mouseup", function (ev) {
      if (ev.target.closest && ev.target.closest("[data-mcc-ui]")) return;
      setTimeout(onSelection, 10);
    });
    document.addEventListener("mousedown", function (ev) {
      if (form && !form.contains(ev.target) && !(ev.target.closest && ev.target.closest("#mcc-bubble"))) hideForm();
    });
  }

  function init() {
    textIndex = buildIndex();
    fetch(API)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (res) {
        mountUI();
        state.comments = res.comments || [];
        state.comments.forEach(function (c) {
          var a = anchorOf(c);
          c._range = a ? reanchor(a) : null;
        });
        paintHighlights();
        renderPanel();
      })
      .catch(function (e) { console.warn("[mc-comments] backend no disponible:", e.message); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
