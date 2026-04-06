const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec: execCb, spawn } = require('child_process');

const PORT = 18790;
const BASE = path.join(__dirname, '..');
const API_HEALTH_FILE = path.join(BASE, '_system', 'api-health.json');
const CLIENTS_FILE = path.join(BASE, 'clients.json');
let _clientCreationInProgress = false;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Safe writer for foundation-state.json — validates JSON + required fields + backup
function safeWriteFoundationState(stateFile, state) {
  const json = JSON.stringify(state, null, 2);
  JSON.parse(json); // Validate JSON roundtrip
  if (!state.sections) throw new Error('foundation-state.json: missing sections');
  // Backup before overwrite
  if (fs.existsSync(stateFile)) {
    fs.copyFileSync(stateFile, stateFile + '.bak');
  }
  fs.writeFileSync(stateFile, json);
}

const ALLOWED_FILES = [
  'mission-control.html',
  'mc-data.js',
  'mc-work.js',
  'mc-work.css',
  'clients.js',
  'skills-data.js',
  'agents-data.js',
];

// Directories accessible via /docs/ viewer

// Foundation section order (matches actual directory structure + foundation-state.json)
const FOUNDATION_ORDER = [
  { cat: '🏢 Company Brief', folder: 'company-brief', pillarsKey: 'pillars' },
  { cat: '📊 Market & Us', folder: 'market-and-us', pillarsKey: 'pillars' },
  { cat: '🎯 Go-To-Market', folder: 'go-to-market', pillarsKey: 'pillars' },
  { cat: '📖 Brand Book', folder: 'brand-book', pillarsKey: 'pillars' },
  { cat: '📏 Métricas', folder: 'metrics-setup', pillarsKey: 'pillars' },
  { cat: '🗺️ Strategic Plan', folder: 'strategic-plan', pillarsKey: 'pillars' },
];
const PILLAR_FLAT = FOUNDATION_ORDER.map(g => g.folder);

// Recursive .md file counter (skips _ and . dirs)
function countMdFiles(dirPath) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) count += countMdFiles(full);
      else if (entry.name.endsWith('.md')) count++;
    }
  } catch {}
  return count;
}

const DOC_ROOTS = {
  'brand':  path.join(BASE, 'brand'),
  'prds':   path.join(BASE, '_system', 'prds'),
  'skills': path.join(BASE, 'skills'),
  'memory': path.join(BASE, 'memory'),
};

const STYLE = `<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',sans-serif;background:#FFFDF9;color:#1A1A2E;max-width:1200px;margin:40px auto;padding:0 40px;line-height:1.85;font-size:17px;}
h1{font-family:'Space Grotesk';font-size:2.2em,cursive;color:#C45D35;}h2{color:#1E3A5F;margin-top:24px;}h3{color:#C45D35;}h4{color:#5D5348;}
strong{color:#1A1A2E;}ul{padding-left:20px;}li{margin:1px 0;line-height:1.4;padding:0;}ul{margin:8px 0;line-height:1.4;}ol{margin:8px 0;line-height:1.4;}li p{margin:0;padding:0;line-height:1.4;display:inline;}ul ul{margin:2px 0;}p+ul{margin-top:-8px;}p+ol{margin-top:-8px;}
a{color:#C45D35;text-decoration:none;font-weight:700;}a:hover{text-decoration:underline;}
.card{margin:8px 0;padding:10px 14px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:6px;box-shadow:3px 3px 0 #1A1A2E;}
.card a{font-size:16px;}
.card .meta{color:#5D5348;font-size:13px;margin-top:2px;}
.back{font-size:14px;color:#5D5348;font-weight:400;}
.nav{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap;}
.nav a{padding:6px 14px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:6px;font-size:14px;box-shadow:2px 2px 0 #1A1A2E;}
.nav a:hover{background:#C45D35;color:#FDF8EF;}
table{border-collapse:collapse;width:100%;margin:12px 0;}
th,td{border:2px solid #1A1A2E;padding:10px 14px;text-align:left;font-size:16px;}
th{background:#1A1A2E;color:#F5F0E6;font-family:'Space Grotesk',sans-serif;letter-spacing:0.5px;}
tr:nth-child(even){background:#FDF8EF;}
code{background:#FDF8EF;padding:2px 6px;border-radius:4px;font-size:13px;border:1px solid #D4C9B0;}
pre{background:#FDF8EF;padding:12px;border:2px solid #1A1A2E;border-radius:6px;overflow-x:auto;font-size:13px;}
pre code{border:none;padding:0;}
blockquote{border-left:4px solid #C45D35;margin:12px 0;padding:8px 16px;background:#FDF8EF;font-style:italic;}
</style>`;

// Simple server-side markdown to HTML (fallback when marked.js CDN blocked)
function simpleMarkdownToHtml(md) {
  let html = md;
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => 
    '<pre><code>' + code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim() + '</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Images (before links to avoid conflict)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:8px 0;">');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');
  // Tables (basic)
  html = html.replace(/^\|(.+)\|$/gm, (_, row) => {
    const cells = row.split('|').map(c => c.trim());
    return '<tr>' + cells.map(c => /^[-:]+$/.test(c) ? '' : '<td>' + c + '</td>').join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*?<\/tr>\n?)+/g, m => '<table>' + m + '</table>');
  html = html.replace(/<table><tr>(<td>[-:]+<\/td>)+<\/tr>/g, '<table>');
  // Lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Paragraphs (lines not already tagged)
  html = html.replace(/^(?!<[hupoltbd]|<\/|<li|<bl|<hr|<co|<ta|<tr)(.+)$/gm, '<p>$1</p>');
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

function renderMarkdown(md, docContext) {
  // docContext: { slug, docsBase } - for rewriting relative links in brand docs
  // docsBase: e.g. '/mc/docs/brand/growth4u' or '/mc/portal/{token}/docs/brand/growth4u'
  const ctxJson = docContext ? JSON.stringify(docContext).replace(/</g,'\\u003c').replace(/>/g,'\\u003e') : 'null';
  
  // Server-side rendered HTML as fallback (visible immediately, even without marked.js)
  const ssrHtml = simpleMarkdownToHtml(md);
  
  return `<div class="md-raw" style="display:none;">${md.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div><div class="md-rendered">${ssrHtml}</div>
<style>
a.mc-redlink { color: #C45D35 !important; text-decoration: line-through wavy !important; opacity: 0.7; cursor: help; position: relative; }
a.mc-redlink::after { content: ' (pendiente)'; font-size: 0.8em; font-style: italic; opacity: 0.6; }
a.mc-internal { color: #C45D35 !important; text-decoration: underline !important; }
</style>
<script>
if (typeof marked !== 'undefined') {
  const raw = document.querySelector('.md-raw');
  const rendered = document.querySelector('.md-rendered');
  const docCtx = ${ctxJson};
  if (raw && rendered) {
    marked.setOptions({ breaks: true, gfm: true });
    rendered.innerHTML = marked.parse(raw.textContent);
    raw.style.display = 'none';
    
    // Rewrite and check links
    rendered.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      
      // Absolute-path links (e.g. /servicios/trust-engine/) → rewrite to MC docs
      if (href.startsWith('/') && !href.startsWith('//') && docCtx && docCtx.docsBase) {
        // Map /path/to/page/ → {docsBase}/pages/path/to/page.md (or just the path within brand)
        const cleanPath = href.replace(/^\/+|\/+$/g, '');
        const mcHref = docCtx.docsBase + '/pages/' + cleanPath + '/';
        a.setAttribute('href', mcHref);
        a.removeAttribute('target');
        a.classList.add('mc-internal');
        a.title = 'Contenido interno: /' + cleanPath + '/';
        // Check if the target exists
        fetch(mcHref, { method: 'HEAD' }).then(r => {
          if (!r.ok) {
            a.classList.remove('mc-internal');
            a.classList.add('mc-redlink');
            a.title = 'Página pendiente de crear: /' + cleanPath + '/';
            a.onclick = (e) => { e.preventDefault(); alert('📝 Página pendiente de crear: /' + cleanPath + '/'); };
          }
        }).catch(() => {
          a.classList.remove('mc-internal');
          a.classList.add('mc-redlink');
          a.title = 'Página pendiente de crear: /' + cleanPath + '/';
          a.onclick = (e) => { e.preventDefault(); alert('📝 Página pendiente de crear: /' + cleanPath + '/'); };
        });
      } else if (href.startsWith('http')) {
        // External links: open in new tab
        a.style.color = '#C45D35';
        a.target = '_blank';
      } else {
        a.style.color = '#C45D35';
      }
    });
  }
}
</script>`;
}

function page(title, breadcrumb, content, opts = {}) {
  const editJS = opts.editable ? `
<link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/toastui-editor.min.css">
<script src="https://uicdn.toast.com/editor/latest/toastui-editor-all.min.js"></script>
<script>
let editor = null;
function toggleEdit() {
  const view = document.getElementById('doc-view');
  const edit = document.getElementById('doc-edit');
  if (edit.style.display === 'none') {
    edit.style.display = 'block'; view.style.display = 'none';
    if (!editor) {
      editor = new toastui.Editor({
        el: document.getElementById('editor-container'),
        height: '75vh',
        initialEditType: 'wysiwyg',
        previewStyle: 'vertical',
        initialValue: document.getElementById('doc-raw').textContent,
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'link'],
          ['code', 'codeblock'],
          ['scrollSync']
        ]
      });
    }
  } else {
    edit.style.display = 'none'; view.style.display = 'block';
  }
}
async function saveDoc() {
  const btn = document.getElementById('save-btn');
  const status = document.getElementById('save-status');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const md = editor.getMarkdown();
    const res = await fetch(window.location.pathname, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: md
    });
    if (res.ok) {
      status.textContent = '✅ Guardado'; status.style.color = 'var(--green,#2a9d2a)';
      setTimeout(() => location.reload(), 500);
    } else {
      status.textContent = '❌ Error: ' + res.statusText; status.style.color = 'var(--rust,#C45D35)';
    }
  } catch(e) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--rust,#C45D35)'; }
  btn.disabled = false; btn.textContent = '💾 Guardar';
}
</script>` : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — SanchoCMO</title>${STYLE}
<style>#edit-area{width:100%;min-height:75vh;font-family:'Nunito',monospace;font-size:14px;padding:12px;border:2px solid var(--ink,#1A1A2E);border-radius:6px;background:var(--paper,#FDF8EF);resize:vertical;line-height:1.6;}
.edit-bar{display:flex;gap:10px;align-items:center;margin:10px 0;}.edit-btn{padding:6px 14px;background:var(--paper,#FDF8EF);border:2px solid var(--ink,#1A1A2E);border-radius:6px;cursor:pointer;font-family:'Nunito',sans-serif;font-weight:700;font-size:14px;box-shadow:2px 2px 0 var(--ink,#1A1A2E);}.edit-btn:hover{background:var(--rust,#C45D35);color:var(--paper,#FDF8EF);}</style>
</head><body>
${breadcrumb}${opts.editable ? ' <button class="edit-btn" onclick="toggleEdit()" style="float:right;margin-top:-30px;">✏️ Editar</button>' : ''}
<div id="doc-view">${content}</div>
${opts.editable ? `<div id="doc-edit" style="display:none;"><div class="edit-bar"><button id="save-btn" class="edit-btn" onclick="saveDoc()">💾 Guardar</button><button class="edit-btn" onclick="toggleEdit()">✖ Cancelar</button><span id="save-status"></span></div><div id="editor-container"></div></div><script type="text/plain" id="doc-raw">${opts.rawMd || ''}</script>` : ''}
${editJS}
</body></html>`;
}

function listDir(dirPath, urlPrefix, opts = {}) {
  const entries = fs.readdirSync(dirPath);
  const allDirs = entries.filter(f => {
    try { return fs.statSync(path.join(dirPath, f)).isDirectory() && !f.startsWith('.'); } catch { return false; }
  });
  const files = entries.filter(f => f.endsWith('.md') || f.endsWith('.html')).sort();

  // Detect if this is a brand/{slug} level (pillar listing)
  const isBrandClient = opts.brandPillars || false;
  const brandSection = opts.brandSection || null;

  let html = '';

  // === Section-level view: brand/{slug}/{section}/ ===
  if (brandSection) {
    let fSections = {};
    try {
      const stateFile = path.join(dirPath, '..', 'foundation-state.json');
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      fSections = stateData.sections || {};
    } catch {}

    const section = fSections[brandSection.section] || {};
    const group = FOUNDATION_ORDER.find(g => g.folder === brandSection.section);
    const pillarsKey = group ? group.pillarsKey : 'pillars';
    const pillars = section[pillarsKey] || {};
    const syntheses = section.syntheses || {};

    // Map pillar names to directory names (for linking)
    const pillarDirMap = {
      'market-analysis': 'market',
      'competitor-analysis': 'competitors',
      'self-analysis': 'self',
      'swot': 'swot',
      'niche-discovery': 'ecps',
      'existing-customer-data': 'existing-customer-data',
      'positioning': 'positioning',
      'pricing': 'pricing',
      'brand-voice': 'voice-profile',
      'visual-identity': 'visual-identity',
      // company-brief skills
      'company-context': null,
      'business-model': null,
      'budget': null,
    };

    const statusIcon = (s) => {
      if (s === 'approved' || s === 'done') return '✅';
      if (s === 'generated') return '📝';
      if (s === 'request-refresh') return '🔄';
      if (s === 'in-progress' || s === 'draft' || s === 'pending-review' || s === 'pending-approval') return '⚠️';
      return '⬜';
    };
    const statusLabel = (s) => {
      const labels = { 'approved': 'Validado', 'done': 'Completado', 'in-progress': 'En progreso', 'draft': 'Borrador', 'pending-review': 'Pendiente revisión', 'pending-approval': 'Pendiente aprobación', 'generated': 'Generado', 'not-started': 'No iniciado', 'not-generated': 'No generado', 'request-refresh': 'Solicitar actualización' };
      return labels[s] || s;
    };

    // Show pillars
    html += '<h2 style="font-family:\'Space Grotesk\',sans-serif;color:#C45D35;margin-bottom:12px;">Pilares</h2>\n';
    for (const [pName, pData] of Object.entries(pillars)) {
      const pStatus = pData.status || 'not-started';
      const icon = statusIcon(pStatus);
      const label = statusLabel(pStatus);
      const displayName = pName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const optional = pData.optional ? ' <span style="font-size:11px;color:#5D5348;">(opcional)</span>' : '';
      const dirName = pillarDirMap[pName] || pName;
      const dirExists = dirName && (() => { try { return fs.statSync(path.join(dirPath, dirName)).isDirectory(); } catch { return false; } })();
      const fileCount = dirExists ? countMdFiles(path.join(dirPath, dirName)) : 0;

      const cardStyle = pStatus === 'approved' || pStatus === 'done' ? '' : pStatus === 'not-started' ? 'opacity:0.55;' : 'border-left:4px solid #E5A100;';
      const metaColor = pStatus === 'approved' || pStatus === 'done' ? '' : pStatus === 'not-started' ? 'color:#999;' : 'color:#B8860B;';

      if (dirExists) {
        html += `<div class="card" style="${cardStyle}"><a href="${urlPrefix}${dirName}/">${icon} ${displayName}</a>${optional}<div class="meta" style="${metaColor}">${label} · ${fileCount} docs</div></div>\n`;
      } else {
        html += `<div class="card" style="${cardStyle}"><span>${icon} ${displayName}</span>${optional}<div class="meta" style="${metaColor}">${label}</div></div>\n`;
      }
    }

    // Show syntheses
    const synthKeys = Object.keys(syntheses);
    if (synthKeys.length > 0) {
      html += '<h2 style="font-family:\'Space Grotesk\',sans-serif;color:#C45D35;margin:20px 0 12px;">Síntesis</h2>\n';
      for (const [sName, sData] of Object.entries(syntheses)) {
        const sStatus = sData.status || 'not-generated';
        const icon = statusIcon(sStatus);
        const label = statusLabel(sStatus);
        const displayName = sName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const dirName = sName;
        const dirExists = (() => { try { return fs.statSync(path.join(dirPath, dirName)).isDirectory(); } catch { return false; } })();
        const cardStyle = sStatus === 'generated' || sStatus === 'pending-approval' ? 'border-left:4px solid #4A90D9;' : 'opacity:0.55;';

        if (dirExists) {
          html += `<div class="card" style="${cardStyle}"><a href="${urlPrefix}${dirName}/">${icon} ${displayName}</a> <span style="font-size:11px;color:#5D5348;">(síntesis)</span><div class="meta">${label}</div></div>\n`;
        } else {
          html += `<div class="card" style="${cardStyle}"><span>${icon} ${displayName}</span> <span style="font-size:11px;color:#5D5348;">(síntesis)</span><div class="meta">${label}</div></div>\n`;
        }
      }
    }

    // Show remaining dirs (_qa, sources, etc.)
    const knownDirs = new Set(Object.values(pillarDirMap).filter(Boolean));
    Object.keys(syntheses).forEach(s => knownDirs.add(s));
    const remainingDirs = allDirs.filter(d => !knownDirs.has(d) && d !== '_archive').sort();
    if (remainingDirs.length > 0) {
      html += '<h2 style="font-family:\'Space Grotesk\',sans-serif;color:#C45D35;margin:20px 0 12px;">Otros</h2>\n';
      for (const d of remainingDirs) {
        const subFiles = countMdFiles(path.join(dirPath, d));
        html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
      }
    }

    // Show loose .md files at this level
    for (const f of files) {
      const stat2 = fs.statSync(path.join(dirPath, f));
      const size = stat2.size > 1024 ? `${(stat2.size / 1024).toFixed(1)}KB` : `${stat2.size}B`;
      html += `<div class="card"><a href="${urlPrefix}${f}">${f.replace('.md', '')}</a><div class="meta">${size}</div></div>\n`;
    }

    if (!html) html = '<p style="color:#5D5348;">No hay documentos aquí.</p>';
    return html;
  }

  if (isBrandClient) {
    // Load foundation-state.json for section/pillar statuses
    let fSections = {};
    try {
      const stateFile = path.join(dirPath, 'foundation-state.json');
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      fSections = stateData.sections || {};
    } catch {}

    const existing = new Set(allDirs);
    for (const group of FOUNDATION_ORDER) {
      const d = group.folder;
      const section = fSections[d] || {};
      const sectionStatus = section.status || 'not-started';
      const pillars = section[group.pillarsKey] || {};
      const pillarNames = Object.keys(pillars);
      const requiredPillars = pillarNames.filter(p => !pillars[p].optional);
      const approvedCount = requiredPillars.filter(p => pillars[p].status === 'approved').length;
      const totalCount = requiredPillars.length;

      html += `<h2 style="margin:24px 0 10px;font-family:'Space Grotesk',sans-serif;font-size:1.4em;color:#C45D35;">${group.cat}</h2>\n`;

      if (existing.has(d)) {
        existing.delete(d);
        const subFiles = countMdFiles(path.join(dirPath, d));

        // Section card with link
        const sIcon = sectionStatus === 'approved' ? '✅' : '⚠️';
        const sStyle = sectionStatus === 'approved'
          ? ''
          : 'border-left:4px solid #E5A100;';
        const sMeta = sectionStatus === 'approved'
          ? `${subFiles} documentos · Validado`
          : `${subFiles} documentos · ${approvedCount}/${totalCount} pilares validados`;
        const sMetaStyle = sectionStatus === 'approved' ? '' : 'color:#B8860B;';
        html += `<div class="card" style="${sStyle}"><a href="${urlPrefix}${d}/">${sIcon} ${d}</a><div class="meta" style="${sMetaStyle}">${sMeta}</div></div>\n`;

        // Individual pillar statuses within the section
        if (pillarNames.length > 0) {
          html += '<div style="margin-left:24px;margin-bottom:8px;">\n';
          for (const pName of pillarNames) {
            const p = pillars[pName];
            const pStatus = p.status || 'not-started';
            const displayName = pName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const optional = p.optional ? ' <span style="font-size:10px;color:#5D5348;">(opcional)</span>' : '';
            if (pStatus === 'approved') {
              html += `<div style="padding:3px 0;font-size:14px;">✅ ${displayName}${optional}</div>\n`;
            } else if (pStatus === 'draft' || pStatus === 'in-progress' || pStatus === 'pending-review') {
              html += `<div style="padding:3px 0;font-size:14px;color:#B8860B;">⚠️ ${displayName}${optional}</div>\n`;
            } else {
              html += `<div style="padding:3px 0;font-size:14px;opacity:0.45;">⬜ ${displayName}${optional}</div>\n`;
            }
          }
          html += '</div>\n';
        }

        // Syntheses
        const syntheses = section.syntheses || {};
        const synthNames = Object.keys(syntheses);
        if (synthNames.length > 0) {
          for (const sn of synthNames) {
            const sv = syntheses[sn];
            const st = sv.status || 'not-generated';
            const icon = st === 'generated' ? '📝' : '⬜';
            const opacity = st === 'generated' ? '1' : '0.45';
            html += `<div style="margin-left:24px;padding:3px 0;font-size:14px;font-style:italic;opacity:${opacity};">${icon} ${sn.replace(/-/g, ' ')} <span style="font-size:10px;color:#5D5348;">(síntesis)</span></div>\n`;
          }
        }
      } else {
        html += `<div class="card" style="opacity:0.45;"><span>⬜ ${d}</span><div class="meta">No existe</div></div>\n`;
      }
    }
    // Any remaining dirs not in Foundation order
    const foundationFolders = new Set(FOUNDATION_ORDER.map(g => g.folder));
    const remaining = [...existing].filter(d => !foundationFolders.has(d) && d !== '_archive').sort();
    if (remaining.length) {
      html += `<h2 style="margin:24px 0 10px;font-family:'Space Grotesk',sans-serif;font-size:1.4em;color:#C45D35;">📁 Otros</h2>\n`;
      for (const d of remaining) {
        const subFiles = countMdFiles(path.join(dirPath, d));
        html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
      }
    }
  } else {
    // Default alphabetical listing
    const dirs = allDirs.sort();
    for (const d of dirs) {
      const subFiles = countMdFiles(path.join(dirPath, d));
      html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
    }
  }

  // Files
  for (const f of files) {
    const stat = fs.statSync(path.join(dirPath, f));
    const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(1)}KB` : `${stat.size}B`;
    const modified = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
    html += `<div class="card"><a href="${urlPrefix}${f}">${f.replace('.md', '')}</a><div class="meta">${size} · ${modified}</div></div>\n`;
  }

  if (!html) html = '<p style="color:#5D5348;">No hay documentos aquí.</p>';
  return html;
}

// ========== Env Var Management ==========
const ENV_FILE = path.join(BASE, '..', '.env');

// Map service → env var names needed
const SERVICE_ENV_MAP = {
  anthropic:  [{ key: 'ANTHROPIC_API_KEY', label: 'API Key', placeholder: 'sk-ant-...' }],
  openrouter: [{ key: 'OPENROUTER_API_KEY', label: 'API Key', placeholder: 'sk-or-...' }],
  openai:     [{ key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' }],
  gemini:     [{ key: 'GEMINI_API_KEY', label: 'API Key', placeholder: 'AIza...' }],
  xai:        [{ key: 'XAI_API_KEY', label: 'API Key', placeholder: 'xai-...' }],
  minimax:    [{ key: 'MINIMAX_API_KEY', label: 'API Key', placeholder: 'eyJ...' }],
  brave:      [{ key: 'BRAVE_API_KEY', label: 'API Key', placeholder: 'BSA...' }],
  apify:      [{ key: 'APIFY_API_KEY', label: 'API Key', placeholder: 'apify_api_...' }],
  firecrawl:  [{ key: 'FIRECRAWL_API_KEY', label: 'API Key', placeholder: 'fc-...' }],
  serper:     [{ key: 'SERPER_API_KEY', label: 'API Key', placeholder: '' }],
  dataforseo: [{ key: 'DATAFORSEO_LOGIN', label: 'Login (email)', placeholder: 'you@email.com' }, { key: 'DATAFORSEO_PASSWORD', label: 'Password', placeholder: '' }],
  notion:     [{ key: 'NOTION_API_KEY', label: 'Integration Token', placeholder: 'ntn_...' }],
  supabase:   [{ key: 'SUPABASE_URL', label: 'Project URL', placeholder: 'https://xxx.supabase.co' }, { key: 'SUPABASE_ANON_KEY', label: 'Anon Key', placeholder: 'eyJ...' }],
  fal:        [{ key: 'FAL_API_KEY', label: 'API Key', placeholder: '' }],
  wavespeed:  [{ key: 'WAVESPEED_API_KEY', label: 'API Key', placeholder: '' }],
  dumpling:   [{ key: 'DUMPLING_API_KEY', label: 'API Key', placeholder: '' }],
  slack:      [{ key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-...' }],
  instantly:  [{ key: 'INSTANTLY_API_KEY', label: 'API Key', placeholder: '' }],
  metricool:  [{ key: 'METRICOOL_API_KEY', label: 'API Key', placeholder: '' }],
};

function maskKey(val) {
  if (!val || val.length < 8) return val ? '••••' : '';
  return val.slice(0, 4) + '•'.repeat(Math.min(val.length - 8, 20)) + val.slice(-4);
}

function readEnvFile() {
  try { return fs.readFileSync(ENV_FILE, 'utf-8'); } catch { return ''; }
}

function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

function setEnvVars(updates) {
  // updates = { KEY: value, ... }
  let content = readEnvFile();
  const lines = content.split('\n');

  for (const [key, value] of Object.entries(updates)) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(key + '=')) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    if (!found) lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf-8');
  // Also set in current process env so health checks pick them up immediately
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

// ========== API Health Check Logic ==========

function loadApiHealth() {
  try { return JSON.parse(fs.readFileSync(API_HEALTH_FILE, 'utf-8')); }
  catch { return { lastCheck: null, services: {} }; }
}

function saveApiHealth(data) {
  data.lastCheck = new Date().toISOString();
  fs.writeFileSync(API_HEALTH_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function checkService(serviceId) {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    const timeout = 15000;
    // Read env vars from .env file (MC server may not have them in process.env)
    const _envVars = parseEnv(readEnvFile());
    const getKey = (k) => _envVars[k] || process.env[k];

    switch (serviceId) {
      case 'anthropic': {
        const key = getKey('ANTHROPIC_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'ANTHROPIC_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: ${key}" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'openrouter': {
        const key = getKey('OPENROUTER_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'OPENROUTER_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://openrouter.ai/api/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'brave': {
        const key = getKey('BRAVE_API_KEY') || getKey('BRAVE_SEARCH_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'BRAVE_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "X-Subscription-Token: ${key}" "https://api.search.brave.com/res/v1/web/search?q=test&count=1" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'apify': {
        const key = getKey('APIFY_TOKEN') || getKey('APIFY_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'APIFY_TOKEN not set' } });
        try {
          const raw = execSync(`curl -s -H "Authorization: Bearer ${key}" https://api.apify.com/v2/users/me -m 10`, { timeout, encoding: 'utf-8' });
          const data = JSON.parse(raw);
          if (data && data.data) {
            resolve({ status: 'ok', lastCheck: now, details: { username: data.data.username || '', plan: data.data.plan?.name || '' } });
          } else {
            resolve({ status: 'error', lastCheck: now, details: { error: 'Unexpected response' } });
          }
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'gog': {
        try {
          // Use 'gog gmail inbox --max 1' as a lightweight auth test (People API may be disabled)
          const raw = execSync('/opt/homebrew/bin/gog gmail list "is:unread" 2>&1', { timeout: 20000, encoding: 'utf-8' });
          // If it returns any output without error, auth works
          const hasError = /error|unauthorized|invalid/i.test(raw) && !/subject/i.test(raw);
          if (hasError) {
            resolve({ status: 'error', lastCheck: now, details: { error: raw.slice(0, 150) } });
          } else {
            resolve({ status: 'ok', lastCheck: now, details: { account: 'alfonso@growth4u.io', test: 'gmail inbox' } });
          }
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'openai': {
        const key = getKey('OPENAI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'OPENAI_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://api.openai.com/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'gemini': {
        const key = getKey('GEMINI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'GEMINI_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" "https://generativelanguage.googleapis.com/v1beta/models?key=${key}" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'xai': {
        const key = getKey('XAI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'XAI_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://api.x.ai/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'minimax': {
        const key = getKey('MINIMAX_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'MINIMAX_API_KEY not set' } });
        // MiniMax doesn't have a simple /models endpoint; verify key format
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present, no lightweight verify endpoint' } });
        break;
      }
      case 'firecrawl': {
        const key = getKey('FIRECRAWL_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'FIRECRAWL_API_KEY not set' } });
        try {
          // POST to scrape with a minimal test URL (costs 1 credit but verifies auth)
          const raw = execSync(`curl -s -w "\\n%{http_code}" -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '{"url":"https://example.com"}' https://api.firecrawl.dev/v1/scrape -m 15`, { timeout: 20000, encoding: 'utf-8' });
          const lines = raw.trim().split('\n');
          const httpCode = lines[lines.length - 1];
          resolve({ status: httpCode === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'serper': {
        const key = getKey('SERPER_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'SERPER_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-API-KEY: ${key}" -H "Content-Type: application/json" -d '{"q":"test","num":1}' https://google.serper.dev/search -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'dataforseo': {
        const login = getKey('DATAFORSEO_LOGIN');
        const password = getKey('DATAFORSEO_PASSWORD');
        if (!login || !password) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -u "${login}:${password}" https://api.dataforseo.com/v3/appendix/user_data -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res, login } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'notion': {
        const key = getKey('NOTION_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'NOTION_API_KEY not set' } });
        try {
          const raw = execSync(`curl -s -H "Authorization: Bearer ${key}" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/users/me -m 10`, { timeout, encoding: 'utf-8' });
          const data = JSON.parse(raw);
          if (data && data.id) {
            resolve({ status: 'ok', lastCheck: now, details: { botName: data.name || data.bot?.owner?.user?.name || 'connected' } });
          } else if (data.code) {
            resolve({ status: 'error', lastCheck: now, details: { error: data.message || data.code } });
          } else {
            resolve({ status: 'ok', lastCheck: now, details: {} });
          }
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'supabase': {
        const url = getKey('SUPABASE_URL');
        const key = getKey('SUPABASE_ANON_KEY');
        if (!url || !key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'SUPABASE_URL or SUPABASE_ANON_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "apikey: ${key}" -H "Authorization: Bearer ${key}" "${url}/rest/v1/" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          const projectId = url.match(/https:\/\/(\w+)\./)?.[1] || '';
          resolve({ status: (res === '200' || res === '204') ? 'ok' : 'error', lastCheck: now, details: { httpCode: res, project: projectId } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'fal': {
        const key = getKey('FAL_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'FAL_API_KEY not set' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'wavespeed': {
        const key = getKey('WAVESPEED_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'WAVESPEED_API_KEY not set' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'dumpling': {
        const key = getKey('DUMPLING_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'DUMPLING_API_KEY not set' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'brave': {
        const key = getKey('BRAVE_API_KEY') || getKey('BRAVE_SEARCH_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'BRAVE_API_KEY not set — OpenClaw uses Gemini web_search instead' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "X-Subscription-Token: ${key}" "https://api.search.brave.com/res/v1/web/search?q=test&count=1" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'slack': {
        const key = getKey('SLACK_BOT_TOKEN');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'SLACK_BOT_TOKEN not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://slack.com/api/auth.test -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'instantly': {
        // Instantly.ai — cold email platform, web login (no env var API key typically)
        const key = getKey('INSTANTLY_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { note: 'Web login — no API key in .env' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" "https://api.instantly.ai/api/v1/account/list?api_key=${key}" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'metricool': {
        // Metricool — social scheduling, web login
        const key = getKey('METRICOOL_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { note: 'Web login — no API key in .env' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'nanobanana': {
        // Nano Banana Pro = Gemini image generation — uses GEMINI_API_KEY
        const key = getKey('GEMINI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'Uses GEMINI_API_KEY (shared)' } });
        resolve({ status: 'ok', lastCheck: now, details: { note: 'Uses Gemini API key (shared)', engine: 'gemini-2.0-flash-exp' } });
        break;
      }
      case 'remotion': {
        // Remotion — programmatic video rendering (local install, no API key)
        try {
          const raw = execSync('npx remotion --version 2>&1 || echo "not-found"', { timeout: 15000, encoding: 'utf-8' }).trim();
          const notFound = /not.found|command not found|ERR/i.test(raw);
          resolve({ status: notFound ? 'not-configured' : 'ok', lastCheck: now, details: { version: notFound ? null : raw.split('\n')[0], note: 'Local install' } });
        } catch { resolve({ status: 'not-configured', lastCheck: now, details: { note: 'Not installed locally' } }); }
        break;
      }
      case 'discord': {
        const token = getKey('DISCORD_BOT_TOKEN');
        if (!token) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'DISCORD_BOT_TOKEN not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bot ${token}" https://discord.com/api/v10/users/@me -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'openclaw': {
        try {
          const raw = execSync('/opt/homebrew/bin/openclaw status 2>&1', { timeout, encoding: 'utf-8' });
          const running = /running/i.test(raw);
          const appVersionMatch = raw.match(/app\s+([\d.]+)/);
          const npmVersionMatch = raw.match(/npm latest\s+([\d.]+)/);
          const version = appVersionMatch ? appVersionMatch[1] : '';
          const latest = npmVersionMatch ? npmVersionMatch[1] : '';
          resolve({ status: running ? 'ok' : 'error', lastCheck: now, details: { gateway: running ? 'running' : 'stopped', version, latest } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      default:
        resolve({ status: 'unknown', lastCheck: now, details: { error: `Unknown service: ${serviceId}` } });
    }
  });
}

async function runHealthChecks(serviceFilter) {
  const health = loadApiHealth();
  const allServices = ['anthropic', 'openrouter', 'openai', 'gemini', 'xai', 'minimax', 'brave', 'apify', 'firecrawl', 'serper', 'dataforseo', 'notion', 'supabase', 'slack', 'fal', 'wavespeed', 'dumpling', 'instantly', 'metricool', 'nanobanana', 'remotion', 'gog', 'openclaw', 'discord'];
  const toCheck = serviceFilter === 'all' ? allServices : allServices.includes(serviceFilter) ? [serviceFilter] : [];

  if (toCheck.length === 0) return { error: `Unknown service: ${serviceFilter}` };

  const results = {};
  for (const svc of toCheck) {
    results[svc] = await checkService(svc);
    health.services[svc] = results[svc];
  }
  saveApiHealth(health);
  return { checked: toCheck, results, lastCheck: health.lastCheck };
}

// ========== Portal: Client-scoped access ==========

// Ensure brand directory structure exists for a client
function ensureBrandStructure(slug) {
  const brandDir = path.join(BASE, 'brand', slug);
  const dirs = [
    '', 'company-brief', 'market-and-us', 'market-and-us/market', 'market-and-us/competitors',
    'market-and-us/self', 'market-and-us/swot', 'go-to-market', 'go-to-market/ecps',
    'go-to-market/positioning', 'go-to-market/pricing', 'brand-identity',
    'brand-identity/voice-profile', 'brand-identity/visual-identity',
    'strategic-plan', 'presentations', 'projects', 'chat/threads',
    'monitoring', 'monitoring/weekly',
  ];
  for (const d of dirs) {
    const full = path.join(brandDir, d);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
  // Create foundation-state.json if it doesn't exist
  const stateFile = path.join(brandDir, 'foundation-state.json');
  if (!fs.existsSync(stateFile)) {
    const state = {
      version: '2.0',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sections: {
        'company-brief': { status: 'not-started', skills: { 'company-context': { status: 'not-started' }, 'business-model': { status: 'not-started' }, 'budget': { status: 'not-started' } } },
        'market-and-us': { status: 'not-started', pillars: { 'market-analysis': { status: 'not-started' }, 'competitor-analysis': { status: 'not-started' }, 'self-analysis': { status: 'not-started' }, 'swot': { status: 'not-started' } }, syntheses: {} },
        'go-to-market': { status: 'not-started', pillars: { 'niche-discovery': { status: 'not-started' }, 'positioning': { status: 'not-started' }, 'pricing': { status: 'not-started' } }, syntheses: {} },
        'brand-identity': { status: 'not-started', pillars: { 'brand-voice': { status: 'not-started' }, 'visual-identity': { status: 'not-started' } }, syntheses: {} },
      },
    };
    safeWriteFoundationState(stateFile, state);
  }
}

function loadClientsData() {
  try { return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8')); }
  catch { return { clients: [], adminToken: null }; }
}

function loadClients() {
  return loadClientsData().clients || [];
}

// ========== Idea Bank & Recurring Tasks helpers ==========

// --- Ideas v2: central store at brand/{slug}/ideas.json ---
// Ideas have: id, title, description, type, list, source, source_data, priority_score,
//   status (pool|assigned|executed|rejected), project_ids[], pieces[], created_at
// Pieces have: id, channel, channel_type, intent, format, status, task_id, created_at, output_url

function loadIdeas(slug) {
  // Try new central location first
  const centralFile = path.join(BASE, 'brand', slug, 'ideas.json');
  try {
    const data = JSON.parse(fs.readFileSync(centralFile, 'utf-8'));
    return data.ideas || data; // support both {ideas:[...]} and [...] formats
  } catch {}
  // Fallback to legacy location
  const legacyFile = path.join(BASE, 'brand', slug, 'idea-generation', 'ideas.json');
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'));
    // Mark as legacy so UI can show migration prompt
    return legacy.map(idea => ({ ...idea, _legacy: true, project_ids: idea.project_ids || [], pieces: idea.pieces || [] }));
  } catch { return []; }
}

function saveIdeas(slug, ideas) {
  const brandDir = path.join(BASE, 'brand', slug);
  fs.mkdirSync(brandDir, { recursive: true });
  fs.writeFileSync(path.join(brandDir, 'ideas.json'), JSON.stringify({ ideas }, null, 2));
}

function getProjectPool(slug, projectId) {
  return loadIdeas(slug).filter(idea => (idea.project_ids || []).includes(projectId));
}

function getUnassignedIdeas(slug) {
  return loadIdeas(slug).filter(idea => !idea.project_ids || idea.project_ids.length === 0);
}
// --- Recurring Tasks: reads from OpenClaw crons (source of truth) + local JSON overlay ---

// Category detection from cron name/prompt
function _detectCronCategory(name, prompt) {
  const n = (name || '').toLowerCase();
  const p = (prompt || '').toLowerCase();
  if (n.includes('metric') || n.includes('cost') || n.includes('dashboard') || n.includes('regenerar')) return 'metrics';
  if (n.includes('pulse') || n.includes('intelligence') || n.includes('synthesis') || n.includes('thief') || n.includes('signal') || n.includes('idea')) return 'intelligence';
  if (n.includes('outreach') || n.includes('lead') || n.includes('call prep') || n.includes('prospecting')) return 'outreach';
  if (n.includes('content') || n.includes('blog') || n.includes('social') || n.includes('newsletter')) return 'content';
  if (n.includes('health') || n.includes('backup') || n.includes('watchdog') || n.includes('memory') || n.includes('update') || n.includes('token') || n.includes('image-opt') || n.includes('compact') || n.includes('changelog') || n.includes('activity') || n.includes('mejora') || n.includes('skill-improvement') || n.includes('pattern')) return 'system';
  return 'other';
}

// Humanize cron expression
function _humanizeCron(schedule) {
  if (!schedule) return '—';
  if (schedule.kind === 'every') {
    const h = Math.round((schedule.everyMs || 0) / 3600000);
    return h >= 24 ? `Cada ${Math.round(h/24)}d` : `Cada ${h}h`;
  }
  const expr = schedule.expr || '';
  const tz = schedule.tz || '';
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, dom, mon, dow] = parts;
  const hStr = hour.includes(',') ? hour.split(',').map(h => `${h}:${min.padStart(2,'0')}`).join(', ') : `${hour}:${min.padStart(2,'0')}`;
  const dowMap = { '0': 'Dom', '1': 'Lun', '2': 'Mar', '3': 'Mié', '4': 'Jue', '5': 'Vie', '6': 'Sáb' };
  let dayStr = '';
  if (dow === '*' && dom === '*') dayStr = 'Cada día';
  else if (dow === '1-5') dayStr = 'L-V';
  else if (dow === '0-4') dayStr = 'D-J';
  else if (dow !== '*') {
    dayStr = dow.split(',').map(d => dowMap[d] || d).join(', ');
    if (dow.includes('-')) {
      const [a,b] = dow.split('-');
      dayStr = (dowMap[a]||a) + '-' + (dowMap[b]||b);
    }
  }
  else if (dom === '1') dayStr = 'Día 1 del mes';
  else dayStr = `Día ${dom}`;
  return `${dayStr} ${hStr}`;
}

// Extract client slug from cron name (e.g. "Daily Pulse — Growth4U" → "growth4u")
function _extractSlugFromCron(cronName, clients) {
  const lower = (cronName || '').toLowerCase();
  for (const c of clients) {
    if (lower.includes(c.name.toLowerCase()) || lower.includes(c.slug.toLowerCase())) return c.slug;
  }
  // Check if prompt mentions a slug
  return null;
}

// Extract executable script paths from a cron prompt
function _extractScripts(prompt) {
  if (!prompt) return [];
  const scripts = new Set();
  // Match explicit invocations: node X.js, python3 Y.py, bash Z.sh
  const invocations = prompt.matchAll(/(?:node|python3|bash)\s+([^\s;|&"']+\.(?:js|py|sh))/g);
  for (const m of invocations) scripts.add(m[1]);
  // Match absolute paths to scripts
  const absPaths = prompt.matchAll(/((?:~\/|\/)[^\s;|&"']+\.(?:js|py|sh))/g);
  for (const m of absPaths) scripts.add(m[1]);
  // Match relative paths like scripts/X.py or skills/Y/scripts/Z.js
  const relPaths = prompt.matchAll(/((?:scripts|skills)\/[^\s;|&"']+\.(?:js|py|sh))/g);
  for (const m of relPaths) scripts.add(m[1]);

  // Resolve paths and filter to actual executable scripts (not config/data files)
  const resolved = [];
  const seen = new Set();
  for (const s of scripts) {
    // Skip obvious non-scripts (config files, output paths, wildcards)
    if (s.includes('*') || s.includes('YYYY') || s.includes('config.js') || s.includes('state.js')) continue;
    // Resolve path
    let absPath = s;
    if (s.startsWith('~/')) absPath = s.replace('~', process.env.HOME || '/Users/ragi');
    else if (s.startsWith('scripts/') || s.startsWith('skills/')) absPath = path.join(BASE, s);
    else if (!s.startsWith('/')) absPath = path.join(BASE, s);
    // Normalize
    try { absPath = fs.realpathSync(absPath); } catch { continue; } // skip if file doesn't exist
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    const basename = path.basename(absPath);
    const relPath = absPath.startsWith(BASE) ? path.relative(BASE, absPath) : absPath;
    const lang = basename.endsWith('.py') ? 'python' : basename.endsWith('.sh') ? 'bash' : 'javascript';
    let lines = 0;
    try { lines = fs.readFileSync(absPath, 'utf-8').split('\n').length; } catch {}
    resolved.push({ path: relPath, absPath, name: basename, lang, lines });
  }
  return resolved;
}

let _cronCache = null;
let _cronCacheTs = 0;
const CRON_CACHE_TTL = 15000; // 15 seconds

function _loadCronsFromOpenClaw() {
  const now = Date.now();
  if (_cronCache && (now - _cronCacheTs) < CRON_CACHE_TTL) return _cronCache;
  try {
    const ocBin = fs.existsSync('/opt/homebrew/bin/openclaw') ? '/opt/homebrew/bin/openclaw' : 'openclaw';
    const raw = execSync(`${ocBin} cron list --json 2>/dev/null`, { timeout: 10000, encoding: 'utf-8', env: { ...process.env, PATH: (process.env.PATH || '') + ':/opt/homebrew/bin:/usr/local/bin' } });
    _cronCache = JSON.parse(raw).jobs || [];
    _cronCacheTs = now;
    return _cronCache;
  } catch (e) {
    if (_cronCache) return _cronCache; // stale cache better than nothing
    return [];
  }
}

function loadRecurringTasks(slug) {
  const clients = loadClients();
  const crons = _loadCronsFromOpenClaw();
  const tasks = [];

  for (const cron of crons) {
    // Determine which client this cron belongs to
    let cronSlug = _extractSlugFromCron(cron.name, clients);
    // If prompt mentions a brand/{slug}/ path, extract
    if (!cronSlug) {
      const promptMatch = (cron.payload?.message || '').match(/brand\/([a-z0-9_-]+)\//i);
      if (promptMatch) {
        // Validate it's an actual client slug, not a subdirectory
        const candidateSlug = promptMatch[1];
        if (clients.some(c => c.slug === candidateSlug)) cronSlug = candidateSlug;
      }
    }

    const category = _detectCronCategory(cron.name, cron.payload?.message);

    // Filter: if slug specified, only that client's crons (by name or prompt mention)
    // If no slug, return all
    const isSystem = category === 'system' || !cronSlug;
    if (slug) {
      const prompt = (cron.payload?.message || '').toLowerCase();
      const nameMatch = cronSlug === slug;
      const promptMentions = prompt.includes(slug.toLowerCase());
      if (!nameMatch && !promptMentions) continue;
    }

    const sched = cron.schedule || {};
    const state = cron.state || {};

    tasks.push({
      id: cron.id,
      name: cron.name || '—',
      task_type: category,
      schedule: _humanizeCron(sched),
      schedule_raw: sched,
      status: cron.enabled ? 'active' : 'paused',
      last_run_at: state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null,
      next_run_at: state.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null,
      last_status: state.lastStatus || null,
      last_duration_ms: state.lastDurationMs || null,
      consecutive_errors: state.consecutiveErrors || 0,
      ideas_generated: 0, // TODO: count from idea_bank
      agent: cron.agentId || 'sancho',
      model: cron.payload?.model || '—',
      prompt: cron.payload?.message || '',
      description: cron.description || '',
      scripts: _extractScripts(cron.payload?.message || ''),
      client_slug: cronSlug || null,
      _source: 'openclaw-cron',
      created_at: cron.createdAtMs ? new Date(cron.createdAtMs).toISOString() : null,
    });
  }

  // Also merge any local recurring-tasks.json entries (manual tasks not yet synced to crons)
  const file = path.join(BASE, 'brand', slug || '_global', 'idea-generation', 'recurring-tasks.json');
  try {
    const local = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const t of local) {
      if (!tasks.find(c => c.id === t.id)) {
        tasks.push({ ...t, _source: 'local-json' });
      }
    }
  } catch {}

  return tasks;
}

function saveRecurringTasks(slug, tasks) {
  // Save only local-json tasks; cron-sourced tasks are managed via openclaw cron
  const localTasks = tasks.filter(t => t._source !== 'openclaw-cron');
  const dir = path.join(BASE, 'brand', slug, 'idea-generation');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'recurring-tasks.json'), JSON.stringify(localTasks, null, 2));
}

function loadCronJobs() {
  try {
    const output = execSync('openclaw cron list --json', { timeout: 15000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } });
    return (JSON.parse(output).jobs || []);
  } catch (e) { console.error('loadCronJobs error:', e.message); return []; }
}

function enrichCronJob(job, clients) {
  const name = (job.name || '').toLowerCase();
  const msg = ((job.payload || {}).message || '').toLowerCase();
  let clientSlug = null;
  for (const c of clients) {
    const s = (c.slug || '').toLowerCase(), n2 = (c.name || '').toLowerCase();
    if (name.includes(s) || msg.includes(s) || name.includes(n2)) { clientSlug = c.slug; break; }
  }
  let category = 'other';
  if (/metric|morning|analytics/.test(name)) category = 'metrics';
  else if (/pulse|meeting|synthesis|intelligence|thief/.test(name)) category = 'intelligence';
  else if (/lead|outreach|call prep|prospecting/.test(name)) category = 'outreach';
  else if (/content|blog|social|idea.gen/.test(name)) category = 'content';
  else if (/backup|health|cost|update|watchdog|memory|regenerar|changelog|skill|mejora|image-opt|token.audit|activity|observa/.test(name)) category = 'system';
  const st = job.state || {};
  return {
    id: job.id, name: job.name, enabled: job.enabled !== false,
    schedule: job.schedule, agent: job.agentId,
    model: (job.payload || {}).model || null,
    client_slug: clientSlug, category,
    last_run: st.lastRunAtMs ? new Date(st.lastRunAtMs).toISOString() : null,
    next_run: st.nextRunAtMs ? new Date(st.nextRunAtMs).toISOString() : null,
    last_status: st.lastRunStatus || null,
    duration_ms: st.lastDurationMs || null,
    consecutive_errors: st.consecutiveErrors || 0,
  };
}

function getAdminToken() {
  return loadClientsData().adminToken || null;
}

function isValidAdmin(token) {
  const adminToken = getAdminToken();
  return adminToken && token === adminToken;
}

// Rewrite /mc/ links to admin-scoped when in admin mode
function adminRewrite(html, req) {
  if (!req || !req._adminBase) return html;
  return html.replace(/\/mc\/(?!admin\/|portal\/)/g, req._adminBase + '/');
}

function landingPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SanchoCMO</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',sans-serif;background:#F5F0E6;color:#1A1A2E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
@media(prefers-color-scheme:dark){body{background:#1A1A2E;color:#FDF8EF;}.box{background:#2D2D44;border-color:#FDF8EF;box-shadow:3px 3px 0 #FDF8EF;}}
.box{text-align:center;padding:48px 56px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:8px;box-shadow:3px 3px 0 #1A1A2E;max-width:440px;}
h1{font-family:'Space Grotesk',sans-serif;color:#C45D35;font-size:2.2em;margin:0 0 8px;}
.sub{color:#5D5348;font-size:15px;margin:0 0 24px;}
.info{color:#5D5348;font-size:14px;line-height:1.6;margin:0;}
.logo{font-size:48px;margin-bottom:12px;}
</style></head><body>
<div class="box">
  <div class="logo">🏇</div>
  <h1>SanchoCMO</h1>
  <p class="sub">Mission Control</p>
  <p class="info">Usa el enlace de acceso que te proporcionó tu equipo de Growth.<br/><br/>Si no tienes enlace, contacta con tu gestor.</p>
</div>
</body></html>`;
}

function findClientByToken(token) {
  if (!token || token.length < 16) return null;
  return loadClients().find(c => c.mcToken === token) || null;
}

// ========== PROJECTS PAGE ==========

// Resolve a project folder from projectsDir given a projectId.
// Scans for directory starting with projectId- (e.g. "P01-seo-bofu" from "P01").
function resolveProjectDir(projectsDir, projectId) {
  if (!projectId) return null;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    const match = dirs.find(d => d.isDirectory() && d.name.startsWith(projectId + '-'));
    if (match) return path.join(projectsDir, match.name);
    // Try exact match (e.g. projectId itself is the full folder name)
    const exact = dirs.find(d => d.isDirectory() && d.name === projectId);
    if (exact) return path.join(projectsDir, exact.name);
  } catch {}
  return null;
}

// Filesystem-only project loading. No registry.json needed.
// Scans brand/{slug}/projects/ for P* directories and reads project.json + tasks.json.
function loadProjectsData(slug) {
  const projectsDir = path.join(BASE, 'brand', slug, 'projects');
  const results = [];
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory() || !d.name.match(/^P\d+/)) continue;
      const dirPath = path.join(projectsDir, d.name);
      let project = { id: d.name.split('-')[0], slug: d.name, name: d.name };
      let tasks = [];
      try { project = { ...project, ...JSON.parse(fs.readFileSync(path.join(dirPath, 'project.json'), 'utf-8')) }; } catch {}
      try {
        const td = JSON.parse(fs.readFileSync(path.join(dirPath, 'tasks.json'), 'utf-8'));
        tasks = Array.isArray(td) ? td : (td.tasks || []);
      } catch {}
      results.push({ ...project, tasks });
    }
  } catch {}
  return results;
}

// Compute next project ID by scanning existing P{XX} directories.
function getNextProjectId(slug) {
  const projectsDir = path.join(BASE, 'brand', slug, 'projects');
  let maxId = 0;
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const d of dirs) {
      const match = d.name.match(/^P(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  } catch {}
  return maxId + 1;
}

// === Idea Bank — Unified Ideas, Contacts & Recommendations Page ===
function buildIdeaBankPage(slug, baseUrl, clientName) {
  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Load ideas
  const brandDir = path.join(BASE, 'brand', slug);
  let ideas = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(brandDir, 'ideas.json'), 'utf-8'));
    ideas = raw.ideas || [];
  } catch {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(brandDir, 'idea-generation', 'ideas.json'), 'utf-8'));
      ideas = Array.isArray(raw) ? raw : raw.ideas || [];
    } catch {}
  }

  const contentIdeas = ideas.filter(i => i.type !== 'contact');

  // Load contacts from contacts.json (separate BD)
  let contacts = [];
  try {
    const cRaw = JSON.parse(fs.readFileSync(path.join(brandDir, 'contacts.json'), 'utf-8'));
    contacts = cRaw.companies || [];
  } catch {}
  const totalContacts = contacts.reduce((sum, c) => sum + (c.contacts || []).length, 0);

  // Load projects for task creation modal
  let projects = [];
  try {
    const projDir = path.join(brandDir, 'projects');
    if (fs.existsSync(projDir)) {
      projects = fs.readdirSync(projDir).filter(d => fs.statSync(path.join(projDir, d)).isDirectory() && d.startsWith('P')).map(d => {
        let name = d;
        try { const pj = JSON.parse(fs.readFileSync(path.join(projDir, d, 'project.json'), 'utf-8')); name = pj.name || d; } catch {}
        return { id: d, name };
      });
    }
  } catch {}

  // Load recommendations count (aggregated)
  let recCount = 0;
  const pendingFiles = ['atalaya/profiles-pending.json','atalaya/competitors-pending.json','atalaya/ads-pending.json','atalaya/pending-ideas.json','monitoring/pending-recommendations.json'];
  for (const pf of pendingFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(brandDir, pf), 'utf-8'));
      const items = Array.isArray(raw) ? raw : raw.ideas || raw.ideas_generated || raw.recommendations || [];
      recCount += items.filter(i => !i.status || i.status === 'pending').length;
    } catch {}
  }
  // Trust engine
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(brandDir, 'trust-engine', 'recommendations.json'), 'utf-8'));
    const items = raw.recommendations || raw.data?.recommendations || [];
    recCount += items.filter(i => !i.status || i.status === 'pending' || i.status === 'Pendiente').length;
  } catch {}

  const STATUS_COLORS = { 'new': '#3498DB', 'approved': '#27AE60', 'rejected': '#E74C3C', 'executed': '#7F8C8D', 'pool': '#95A5A6' };
  const SOURCE_LABELS = { 'trust_engine': 'Trust Engine', 'seo_geo': 'SEO/GEO', 'signal': 'Signal', 'competitor': 'Competitor', 'meeting': 'Meeting', 'manual': 'Manual', 'atalaya': 'Atalaya', 'performance-analysis': 'Performance' };

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>💡 Idea Bank — ${escHtml(clientName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#FFFDF9;--card:#FFFFFF;--border:#E8E2D9;--rust:#C45D35;--rust-light:#F5E6DF;--navy:#2C3E50;--text:#2C3E50;--muted:#7F8C8D;--green:#27AE60;--green-light:#E8F8F0;--blue:#3498DB;--blue-light:#EBF5FB;--yellow:#F39C12;--yellow-light:#FEF9E7;--red:#E74C3C;--red-light:#FDEDEC;--shadow:0 1px 3px rgba(0,0,0,0.06);--radius:10px;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);line-height:1.5;padding:0;margin:0;}
.page-header{padding:28px 32px 0;}
.page-title{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:var(--navy);}
.page-sub{font-size:14px;color:var(--muted);margin-top:2px;}
.tabs{display:flex;gap:0;padding:20px 32px 0;border-bottom:1px solid var(--border);}
.tab{padding:10px 20px;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;border:1px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;background:transparent;transition:all .15s;display:flex;align-items:center;gap:8px;position:relative;bottom:-1px;}
.tab:hover{color:var(--navy);background:rgba(0,0,0,0.02);}
.tab.active{color:var(--rust);background:var(--card);border-color:var(--border);font-weight:600;}
.badge{background:var(--rust);color:#fff;font-size:11px;padding:1px 7px;border-radius:10px;font-weight:600;}
.badge-green{background:var(--green);}
.content{padding:24px 32px;}
.tab-content{display:none;}.tab-content.active{display:block;}
.stats-row{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:120px;text-align:center;box-shadow:var(--shadow);}
.stat-num{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;color:var(--navy);}
.stat-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;}
.filters{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;}
.filter-pill{padding:5px 14px;font-size:12px;font-weight:600;border-radius:20px;cursor:pointer;border:1px solid var(--border);background:#fff;color:var(--muted);transition:all .15s;}
.filter-pill:hover{border-color:var(--navy);color:var(--navy);}
.filter-pill.active{background:var(--navy);color:#fff;border-color:var(--navy);}
.idea-table{width:100%;border-collapse:collapse;}
.idea-table th{text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:8px 12px;border-bottom:2px solid var(--border);font-weight:600;}
.idea-table td{padding:10px 12px;border-bottom:1px solid #F5F2ED;font-size:13px;vertical-align:middle;}
.idea-table tr:hover{background:#FDFCFA;}
.idea-title-cell{font-weight:600;color:var(--navy);max-width:300px;}
.idea-desc{font-size:11px;color:var(--muted);margin-top:2px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.status-badge{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;}
.source-badge{display:inline-block;font-size:10px;padding:2px 6px;border-radius:4px;background:#F0EDE8;color:var(--muted);}
.channel-pill{display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;background:var(--blue-light);color:var(--blue);margin-right:3px;}
.btn-sm{padding:4px 10px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;border:1px solid;transition:all .12s;}
.btn-approve{background:var(--green);color:#fff;border-color:var(--green);}.btn-approve:hover{background:#219A52;}
.btn-reject{background:#fff;color:var(--red);border-color:var(--red);}.btn-reject:hover{background:var(--red-light);}
.btn-action{background:#fff;color:var(--navy);border-color:var(--border);}.btn-action:hover{background:var(--rust-light);border-color:var(--rust);}
/* Recommendations */
.rec-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:flex-start;gap:12px;}
.rec-card:hover{box-shadow:0 2px 8px rgba(0,0,0,0.08);}
.rec-icon{font-size:20px;flex-shrink:0;margin-top:2px;}
.rec-body{flex:1;min-width:0;}
.rec-title{font-size:14px;font-weight:600;color:var(--navy);}
.rec-meta{font-size:11px;color:var(--muted);margin-top:2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.rec-desc{font-size:12px;color:var(--text);margin-top:6px;line-height:1.4;}
.rec-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
.priority-high{color:var(--rust);}.priority-medium{color:var(--yellow);}.priority-low{color:var(--blue);}
.empty-state{text-align:center;padding:48px 0;color:var(--muted);}
.idea-table input[type="checkbox"]{accent-color:var(--rust);width:16px;height:16px;cursor:pointer;}
.select-bar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:12px 24px;border-radius:12px;z-index:200;display:none;align-items:center;gap:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-size:14px;}
.select-bar button{padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;border:none;}
.select-bar .btn-create{background:var(--rust);color:#fff;}.select-bar .btn-create:hover{background:#A84D2D;}
.select-bar .btn-cancel{background:transparent;color:#fff;border:1px solid #fff !important;}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:300;}
.modal-box{background:#fff;border-radius:12px;padding:24px;width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);}
.modal-title{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--navy);margin-bottom:16px;}
.modal-field{margin-bottom:14px;}
.modal-field label{display:block;font-size:12px;font-weight:600;color:var(--navy);margin-bottom:4px;}
.modal-field input,.modal-field select{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:'Nunito',sans-serif;box-sizing:border-box;}
.modal-field input:focus,.modal-field select:focus{border-color:var(--rust);outline:none;}
.modal-radio{display:flex;gap:16px;margin-bottom:14px;}
.modal-radio label{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:500;}
.modal-radio input[type="radio"]{accent-color:var(--rust);}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}
.modal-actions button{padding:8px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Nunito',sans-serif;}
.modal-actions .btn-primary{background:var(--rust);color:#fff;border:none;}.modal-actions .btn-primary:hover{background:#A84D2D;}
.modal-actions .btn-secondary{background:#fff;border:1px solid var(--border);color:var(--navy);}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.cal-header{background:var(--navy);color:#fff;padding:6px;text-align:center;font-size:11px;font-weight:600;}
.cal-day{background:var(--card);min-height:80px;padding:4px;font-size:11px;vertical-align:top;}
.cal-day.other-month{background:#F8F6F2;opacity:0.5;}
.cal-day.today{background:#FFF7ED;}
.cal-day-num{font-weight:700;color:var(--navy);margin-bottom:4px;font-size:12px;}
.cal-item{padding:2px 4px;margin-bottom:2px;border-radius:3px;font-size:10px;line-height:1.3;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cal-item.status-new{background:var(--blue-light);color:var(--blue);border-left:2px solid var(--blue);}
.cal-item.status-scheduled{background:var(--yellow-light);color:#B8860B;border-left:2px solid var(--yellow);}
.cal-item.status-published,.cal-item.status-executed{background:var(--green-light);color:var(--green);border-left:2px solid var(--green);}
.cal-item.status-approved{background:#E8F8F0;color:var(--green);border-left:2px solid var(--green);}
.cal-item.status-assigned{background:var(--rust-light);color:var(--rust);border-left:2px solid var(--rust);}
.cal-nav{display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:12px;}
.cal-nav button{background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px;}
.cal-nav button:hover{background:var(--rust-light);}
.cal-nav span{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;color:var(--navy);min-width:180px;text-align:center;}
@media(max-width:900px){.stats-row{flex-direction:column;}.idea-table{font-size:12px;}.cal-day{min-height:60px;}}
</style>
</head><body>
<div class="page-header">
  <div class="page-title">&#128161; Idea Bank</div>
  <div class="page-sub">${escHtml(clientName)} &mdash; Ideas, contactos y recomendaciones</div>
</div>
<div class="tabs">
  <div class="tab active" onclick="showTab('ideas')">&#128221; Ideas <span class="badge">${contentIdeas.length}</span></div>
  <div class="tab" onclick="showTab('contacts')">&#128101; Contactos <span class="badge">${contacts.length} emp / ${totalContacts} ct</span></div>
  <div class="tab" onclick="showTab('insights')">&#128270; Insights</div>
  <div class="tab" onclick="showTab('recommendations')">&#128300; Recomendaciones ${recCount > 0 ? `<span class="badge badge-green">${recCount}</span>` : ''}</div>
</div>
<div class="content">

<!-- IDEAS TAB -->
<div id="tab-ideas" class="tab-content active">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${contentIdeas.length}</div><div class="stat-lbl">Total</div></div>
    <div class="stat-card"><div class="stat-num">${contentIdeas.filter(i=>i.status==='new'||i.status==='pool').length}</div><div class="stat-lbl">Pendientes</div></div>
    <div class="stat-card"><div class="stat-num">${contentIdeas.filter(i=>i.status==='approved').length}</div><div class="stat-lbl">Aprobadas</div></div>
    <div class="stat-card"><div class="stat-num">${contentIdeas.filter(i=>i.status==='executed').length}</div><div class="stat-lbl">Publicadas</div></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
    <div class="filters" style="margin-bottom:0;flex:1;">
      <span class="filter-pill active" onclick="filterIdeas(this,'all')">Todas</span>
      <span class="filter-pill" onclick="filterIdeas(this,'new')">Nuevas</span>
      <span class="filter-pill" onclick="filterIdeas(this,'approved')">Aprobadas</span>
      <span class="filter-pill" onclick="filterIdeas(this,'executed')">Publicadas</span>
      <span class="filter-pill" onclick="filterIdeas(this,'rejected')">Descartadas</span>
    </div>
    <div style="display:flex;gap:2px;border:1px solid var(--border);border-radius:6px;overflow:hidden;">
      <button onclick="switchView('list')" id="view-list" style="padding:5px 12px;font-size:12px;border:none;cursor:pointer;background:var(--navy);color:#fff;font-weight:600;">&#9776; Lista</button>
      <button onclick="switchView('calendar')" id="view-cal" style="padding:5px 12px;font-size:12px;border:none;cursor:pointer;background:#fff;color:var(--muted);font-weight:600;">&#128197; Calendario</button>
    </div>
  </div>
  <div id="ideas-calendar" style="display:none;"></div>
  <table class="idea-table" id="ideas-list-view">
    <thead><tr><th style="width:30px;"><input type="checkbox" onchange="toggleAllIdeas(this,'ideas')"></th><th>Idea</th><th>Score</th><th>Canales</th><th>Fuente</th><th>Status</th><th>Acciones</th></tr></thead>
    <tbody id="ideas-tbody">
      ${contentIdeas.length === 0 ? '<tr><td colspan="7" class="empty-state">Sin ideas de contenido. Lanza un scan desde Atalaya.</td></tr>' : ''}
      ${contentIdeas.map(idea => {
        const statusColor = STATUS_COLORS[idea.status] || '#95A5A6';
        const channels = (idea.channels || idea.channels_suggested || []).map(c => `<span class="channel-pill">${escHtml(c)}</span>`).join('');
        const sourceLabel = SOURCE_LABELS[idea.source] || idea.source || '—';
        return `<tr data-status="${escHtml(idea.status||'new')}" data-id="${escHtml(idea.id||'')}" data-type="content">
          <td><input type="checkbox" class="idea-check" value="${escHtml(idea.id||'')}" onchange="updateSelection()"></td>
          <td><div class="idea-title-cell">${escHtml(idea.title||'—')}</div><div class="idea-desc">${escHtml(idea.description||idea.notes||'')}</div></td>
          <td>${idea.priority_score||'—'}</td>
          <td>${channels||'—'}</td>
          <td><span class="source-badge">${escHtml(sourceLabel)}</span></td>
          <td><span class="status-badge" style="background:${statusColor}20;color:${statusColor};">${escHtml(idea.status||'new')}</span></td>
          <td style="white-space:nowrap;">
            ${idea.status!=='approved'?`<button class="btn-sm btn-approve" onclick="ideaAction('${escHtml(idea.id||'')}','approve')">&#10003;</button>`:''}
            ${idea.status!=='rejected'?`<button class="btn-sm btn-reject" onclick="ideaAction('${escHtml(idea.id||'')}','reject')">&#10005;</button>`:''}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>

<!-- CONTACTS TAB -->
<div id="tab-contacts" class="tab-content">
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${contacts.length}</div><div class="stat-lbl">Empresas</div></div>
    <div class="stat-card"><div class="stat-num">${totalContacts}</div><div class="stat-lbl">Contactos</div></div>
  </div>
  ${contacts.length === 0 ? '<div class="empty-state" style="padding:40px 0;">Sin empresas ni contactos. Lanza un scan desde Atalaya o usa el pipeline de outreach.</div>' : ''}
  ${contacts.map(comp => {
    return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-weight:600;color:var(--navy);font-size:14px;">${escHtml(comp.name||'—')}</span>
        ${comp.web ? `<a href="${escHtml(comp.web)}" target="_blank" style="font-size:11px;color:var(--rust);">&#8599;</a>` : ''}
        ${comp.sector ? `<span class="source-badge">${escHtml(comp.sector)}</span>` : ''}
        ${comp.ecp ? `<span class="channel-pill">${escHtml(comp.ecp)}</span>` : ''}
        ${comp.icp_score ? `<span style="font-size:10px;color:var(--muted);">Score: ${comp.icp_score}</span>` : ''}
      </div>
      ${(comp.contacts||[]).map(ct => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-top:1px solid #F5F2ED;">
        <span style="font-weight:600;">${escHtml(ct.name||'—')}</span>
        <span style="color:var(--muted);">${escHtml(ct.role||'')}</span>
        ${ct.linkedin ? `<a href="${escHtml(ct.linkedin)}" target="_blank" style="color:#0077B5;font-size:11px;">LinkedIn &#8599;</a>` : ''}
        ${ct.email ? `<span style="color:var(--muted);font-size:11px;">${escHtml(ct.email)}</span>` : ''}
        <span style="margin-left:auto;font-size:10px;padding:1px 6px;border-radius:3px;background:${ct.status==='contacted'?'#E8F8F0':'#EBF5FB'};color:${ct.status==='contacted'?'var(--green)':'var(--blue)'};">${escHtml(ct.status||'new')}</span>
      </div>`).join('')}
    </div>`;
  }).join('')}
</div>

<!-- INSIGHTS TAB -->
<div id="tab-insights" class="tab-content">
  <div class="filters" id="insights-filters">
    <span class="filter-pill active" onclick="filterInsights(this,'all')">Todas</span>
    <span class="filter-pill" onclick="filterInsights(this,'anomaly')">&#9888; Anomalias</span>
    <span class="filter-pill" onclick="filterInsights(this,'opportunity')">&#127942; Oportunidades</span>
    <span class="filter-pill" onclick="filterInsights(this,'decision')">&#9989; Decisiones</span>
    <span class="filter-pill" onclick="filterInsights(this,'action')">&#9654; Acciones</span>
    <span style="margin-left:auto;font-size:12px;color:var(--muted);">Fuente:</span>
    <span class="filter-pill" onclick="filterInsightSource(this,'performance')">Performance</span>
    <span class="filter-pill" onclick="filterInsightSource(this,'daily-pulse')">Daily Pulse</span>
    <span class="filter-pill" onclick="filterInsightSource(this,'meeting')">Meetings</span>
  </div>
  <div id="insights-list">
    <div class="empty-state">Cargando insights...</div>
  </div>
</div>

<!-- RECOMMENDATIONS TAB -->
<div id="tab-recommendations" class="tab-content">
  <div class="filters" id="rec-filters">
    <span class="filter-pill active" onclick="filterRecs(this,'all')">Todas</span>
    <span class="filter-pill" onclick="filterRecs(this,'content_task')">&#128221; Content</span>
    <span class="filter-pill" onclick="filterRecs(this,'outreach_task')">&#128101; Outreach</span>
    <span class="filter-pill" onclick="filterRecs(this,'operational')">&#9881; Operativas</span>
    <span style="margin-left:auto;font-size:12px;color:var(--muted);">Fuente:</span>
    <span class="filter-pill" onclick="filterRecSource(this,'atalaya')">Atalaya</span>
    <span class="filter-pill" onclick="filterRecSource(this,'trust-engine')">Trust Engine</span>
    <span class="filter-pill" onclick="filterRecSource(this,'performance')">Performance</span>
  </div>
  <div id="recs-list">
    <div class="empty-state">Cargando recomendaciones...</div>
  </div>
</div>

<!-- Selection bar -->
<div class="select-bar" id="select-bar">
  <span id="select-count">0 seleccionadas</span>
  <button class="btn-create" onclick="showCreateTaskModal()">&#128736; Crear tarea</button>
  <button class="btn-cancel" onclick="clearSelection()">Cancelar</button>
</div>

</div><!-- /content -->

<!-- Create Task Modal -->
<div class="modal-overlay" id="task-modal" style="display:none;" onclick="if(event.target===this)this.style.display='none'">
  <div class="modal-box">
    <div class="modal-title">&#128736; Crear tarea</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:16px;" id="modal-selected-info">0 ideas seleccionadas</div>
    <div class="modal-radio">
      <label><input type="radio" name="task-dest" value="existing" checked onchange="toggleTaskDest()"> Proyecto existente</label>
      <label><input type="radio" name="task-dest" value="new" onchange="toggleTaskDest()"> Proyecto nuevo</label>
    </div>
    <div id="dest-existing" class="modal-field">
      <label>Proyecto</label>
      <select id="task-project">
        ${projects.map(p => `<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div id="dest-new" style="display:none;">
      <div class="modal-field">
        <label>Nombre del proyecto</label>
        <input type="text" id="new-project-name" placeholder="Ej: Content LinkedIn Abril">
      </div>
    </div>
    <div class="modal-field">
      <label>Nombre de la tarea</label>
      <input type="text" id="task-name" placeholder="Ej: Publicar 5 posts sobre growth">
    </div>
    <div class="modal-field">
      <label>Tipo</label>
      <select id="task-type">
        <option value="content">Content</option>
        <option value="outreach">Outreach</option>
        <option value="research">Research</option>
        <option value="execution">Execution</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="document.getElementById('task-modal').style.display='none'">Cancelar</button>
      <button class="btn-primary" onclick="createTask()">Crear tarea</button>
    </div>
  </div>
</div>

<script>
const SLUG = '${escHtml(slug)}';
const _mc = '/m' + 'c';
const _p = window.location.pathname;
const _adminMatch = _p.match(new RegExp(_mc + '/admin/[^/]+'));
const API_BASE = _adminMatch ? _adminMatch[0] : (_p.includes(_mc + '/') ? _mc : '');

// Ideas data for calendar view
const ALL_IDEAS = ${JSON.stringify(contentIdeas.map(i => ({ id: i.id, title: i.title, status: i.status, channel: (i.channels||[])[0]||i.channel||'', scheduled_date: i.scheduled_date||i.created_at||'', source: i.source })))};

let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();

function switchView(view) {
  const listEl = document.getElementById('ideas-list-view');
  const calEl = document.getElementById('ideas-calendar');
  const btnList = document.getElementById('view-list');
  const btnCal = document.getElementById('view-cal');
  if (view === 'calendar') {
    if (listEl) listEl.style.display = 'none';
    if (calEl) calEl.style.display = '';
    btnList.style.background = '#fff'; btnList.style.color = 'var(--muted)';
    btnCal.style.background = 'var(--navy)'; btnCal.style.color = '#fff';
    renderCalendar();
  } else {
    if (listEl) listEl.style.display = '';
    if (calEl) calEl.style.display = 'none';
    btnList.style.background = 'var(--navy)'; btnList.style.color = '#fff';
    btnCal.style.background = '#fff'; btnCal.style.color = 'var(--muted)';
  }
}

function renderCalendar() {
  const el = document.getElementById('ideas-calendar');
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DAYS = ['Lun','Mar','Mie','Jue','Vie','Sab','Dom'];

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  let startDay = firstDay.getDay() - 1; if (startDay < 0) startDay = 6;
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);

  let html = '<div class="cal-nav">';
  html += '<button onclick="calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();">&larr;</button>';
  html += '<span>' + MONTHS[calMonth] + ' ' + calYear + '</span>';
  html += '<button onclick="calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();">&rarr;</button>';
  html += '</div>';
  html += '<div class="cal-grid">';
  for (const d of DAYS) html += '<div class="cal-header">' + d + '</div>';

  // Fill empty days before month starts
  for (let i = 0; i < startDay; i++) html += '<div class="cal-day other-month"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const isToday = dateStr === todayStr;
    const dayIdeas = ALL_IDEAS.filter(idea => {
      const d = (idea.scheduled_date || '').slice(0,10);
      return d === dateStr;
    });
    html += '<div class="cal-day' + (isToday ? ' today' : '') + '">';
    html += '<div class="cal-day-num">' + day + '</div>';
    for (const idea of dayIdeas.slice(0,3)) {
      html += '<div class="cal-item status-' + (idea.status||'new') + '" title="' + (idea.title||'').replace(/"/g,'') + '">' + (idea.channel ? idea.channel.slice(0,2).toUpperCase() + ' ' : '') + (idea.title||'').slice(0,25) + '</div>';
    }
    if (dayIdeas.length > 3) html += '<div style="font-size:9px;color:var(--muted);">+' + (dayIdeas.length-3) + ' mas</div>';
    html += '</div>';
  }

  // Fill empty days after month ends
  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) html += '<div class="cal-day other-month"></div>';

  html += '</div>';
  el.innerHTML = html;
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'insights') loadInsights();
  if (name === 'recommendations') loadRecs();
}

function filterIdeas(el, status) {
  el.closest('.filters').querySelectorAll('.filter-pill').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#ideas-tbody tr').forEach(tr => {
    tr.style.display = (status === 'all' || tr.dataset.status === status) ? '' : 'none';
  });
}

async function ideaAction(ideaId, action) {
  const status = action === 'approve' ? 'approved' : 'rejected';
  try {
    await fetch(API_BASE + '/api/ideas/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: SLUG, ideaId, status }) });
    location.reload();
  } catch(e) { console.error(e); }
}

// Insights
let _insightsData = [];
let _insTypeFilter = 'all';
let _insSourceFilter = '';

async function loadInsights() {
  try {
    const res = await fetch(API_BASE + '/api/insights?slug=' + SLUG);
    const data = await res.json();
    _insightsData = data.insights || [];
    renderInsights();
  } catch(e) { console.error(e); document.getElementById('insights-list').innerHTML = '<div class="empty-state">Error cargando insights</div>'; }
}

function renderInsights() {
  let filtered = _insightsData;
  if (_insTypeFilter !== 'all') filtered = filtered.filter(r => r.type === _insTypeFilter);
  if (_insSourceFilter) filtered = filtered.filter(r => r.source.startsWith(_insSourceFilter));

  const el = document.getElementById('insights-list');
  if (filtered.length === 0) { el.innerHTML = '<div class="empty-state">Sin insights disponibles</div>'; return; }

  const SEV_COLORS = { RED: '#E74C3C', YELLOW: '#F39C12', GREEN: '#27AE60', GREEN_OPPORTUNITY: '#27AE60', high: '#E74C3C', medium: '#F39C12', low: '#3498DB' };
  const TYPE_ICONS = { anomaly: '&#9888;', opportunity: '&#127942;', decision: '&#9989;', action: '&#9654;', insight: '&#128161;', observation: '&#128065;', strategic: '&#127919;', market: '&#128200;', operational: '&#9881;' };
  const SRC_LABELS = { 'performance-analysis': 'Performance', 'daily-pulse': 'Daily Pulse', 'meeting-intelligence': 'Meeting' };

  el.innerHTML = filtered.map(ins => {
    const icon = TYPE_ICONS[ins.type] || '&#128270;';
    const sevColor = SEV_COLORS[ins.severity] || '#7F8C8D';
    const srcLabel = SRC_LABELS[ins.source] || ins.source;
    return '<div class="rec-card"><div class="rec-icon" style="color:' + sevColor + '">' + icon + '</div><div class="rec-body"><div class="rec-title">' + (ins.title||'—') + '</div><div class="rec-meta"><span class="source-badge">' + srcLabel + '</span><span style="font-size:10px;color:' + sevColor + ';font-weight:700;">' + (ins.severity||'') + '</span>' + (ins.date ? '<span style="font-size:10px;color:var(--muted);">' + ins.date + '</span>' : '') + (ins.metric ? '<span style="font-size:10px;color:var(--muted);">' + ins.metric + '</span>' : '') + '</div>' + (ins.description && ins.description !== ins.title ? '<div class="rec-desc">' + ins.description.slice(0,200) + '</div>' : '') + '</div></div>';
  }).join('');
}

function filterInsights(el, type) {
  el.closest('.filters').querySelectorAll('.filter-pill').forEach(f => { if (!f.style.marginLeft) f.classList.remove('active'); });
  el.classList.add('active');
  _insTypeFilter = type;
  renderInsights();
}
function filterInsightSource(el, src) {
  const wasActive = el.classList.contains('active');
  document.querySelectorAll('#insights-filters .filter-pill').forEach(f => { if (f.style.marginLeft !== 'auto' && f.textContent.match(/Performance|Daily|Meeting/)) f.classList.remove('active'); });
  if (!wasActive) { el.classList.add('active'); _insSourceFilter = src; } else { _insSourceFilter = ''; }
  renderInsights();
}

// Recommendations
let _recsData = [];
let _recTypeFilter = 'all';
let _recSourceFilter = '';

async function loadRecs() {
  try {
    const res = await fetch(API_BASE + '/api/recommendations?slug=' + SLUG + '&status=pending');
    const data = await res.json();
    _recsData = data.recommendations || [];
    renderRecs();
  } catch(e) { console.error(e); document.getElementById('recs-list').innerHTML = '<div class="empty-state">Error cargando recomendaciones</div>'; }
}

function renderRecs() {
  let filtered = _recsData;
  if (_recTypeFilter !== 'all') filtered = filtered.filter(r => r.type === _recTypeFilter);
  if (_recSourceFilter) filtered = filtered.filter(r => r.source.startsWith(_recSourceFilter));

  const el = document.getElementById('recs-list');
  if (filtered.length === 0) { el.innerHTML = '<div class="empty-state">Sin recomendaciones pendientes</div>'; return; }

  const TYPE_ICONS = { content_task: '&#128221;', outreach_task: '&#128101;', content_idea: '&#128221;', contact: '&#128101;', operational: '&#9881;', optimize: '&#128295;', investigate: '&#128269;', launch: '&#128640;', pause: '&#9208;', escalate: '&#9889;' };
  const PRIO_CLASS = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };
  const TASK_LABELS = { content: 'Content', outreach: 'Outreach', research: 'Research', execution: 'Execution' };

  el.innerHTML = filtered.map(r => {
    const icon = TYPE_ICONS[r.type] || TYPE_ICONS[r.task_type] || '&#128300;';
    const prioClass = PRIO_CLASS[r.priority] || '';
    const ideaCount = (r.idea_ids || []).length;
    const isGroupedTask = ideaCount > 0;
    const taskLabel = TASK_LABELS[r.task_type] || r.task_type || '';
    const projLabel = r.suggested_project || '';

    const approveAction = "recAction('" + r.id + "','approve')";
    const dismissAction = "recAction('" + r.id + "','dismiss')";

    let html = '<div class="rec-card"><div class="rec-icon">' + icon + '</div><div class="rec-body">';
    html += '<div class="rec-title">' + (r.title||'—') + '</div>';
    html += '<div class="rec-meta">';
    html += '<span class="source-badge">' + (r.source||'—') + '</span>';
    html += '<span class="' + prioClass + '" style="font-weight:700;font-size:11px;">' + (r.priority||'') + '</span>';
    if (taskLabel) html += '<span class="channel-pill">' + taskLabel + '</span>';
    if (projLabel) html += '<span style="font-size:10px;color:var(--muted);">→ ' + projLabel + '</span>';
    html += '</div>';
    if (r.description) html += '<div class="rec-desc">' + r.description.slice(0,200) + '</div>';
    if (isGroupedTask) html += '<div style="font-size:11px;color:var(--muted);margin-top:4px;">&#128221; ' + ideaCount + ' ideas vinculadas</div>';
    // For operational recs (Performance Analysis)
    if (r.operational?.suggested_action) html += '<div style="font-size:11px;color:var(--navy);margin-top:4px;"><strong>Accion:</strong> ' + r.operational.suggested_action.slice(0,150) + '</div>';
    html += '<div class="rec-actions">';
    html += '<button class="btn-sm btn-approve" onclick="' + approveAction + '">&#10003; Crear tarea</button>';
    html += '<button class="btn-sm btn-reject" onclick="' + dismissAction + '">Descartar</button>';
    html += '</div></div></div>';
    return html;
  }).join('');
}

function filterRecs(el, type) {
  el.closest('.filters').querySelectorAll('.filter-pill').forEach(f => { if (!f.style.marginLeft) f.classList.remove('active'); });
  el.classList.add('active');
  _recTypeFilter = type;
  renderRecs();
}
function filterRecSource(el, src) {
  const wasActive = el.classList.contains('active');
  document.querySelectorAll('#rec-filters .filter-pill').forEach(f => { if (f.style.marginLeft !== 'auto' && f.textContent.match(/Atalaya|Trust|Performance/)) f.classList.remove('active'); });
  if (!wasActive) { el.classList.add('active'); _recSourceFilter = src; } else { _recSourceFilter = ''; }
  renderRecs();
}

async function recAction(recId, action) {
  try {
    await fetch(API_BASE + '/api/recommendations/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: SLUG, id: recId, action }) });
    loadRecs();
  } catch(e) { console.error(e); }
}

// === Selection + Create Task ===
function getSelectedIds() {
  return Array.from(document.querySelectorAll('.idea-check:checked')).map(cb => cb.value);
}
function updateSelection() {
  const selected = getSelectedIds();
  const bar = document.getElementById('select-bar');
  if (selected.length > 0) {
    bar.style.display = 'flex';
    document.getElementById('select-count').textContent = selected.length + ' seleccionada' + (selected.length > 1 ? 's' : '');
  } else {
    bar.style.display = 'none';
  }
}
function toggleAllIdeas(masterCb, tabId) {
  const tbody = document.getElementById(tabId + '-tbody');
  if (!tbody) return;
  tbody.querySelectorAll('.idea-check').forEach(cb => { if (cb.closest('tr').style.display !== 'none') cb.checked = masterCb.checked; });
  updateSelection();
}
function clearSelection() {
  document.querySelectorAll('.idea-check').forEach(cb => cb.checked = false);
  document.querySelectorAll('thead input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateSelection();
}
function showCreateTaskModal() {
  const selected = getSelectedIds();
  document.getElementById('modal-selected-info').textContent = selected.length + ' idea' + (selected.length > 1 ? 's' : '') + ' seleccionada' + (selected.length > 1 ? 's' : '');
  // Auto-detect type from first selected
  const firstRow = document.querySelector('.idea-check:checked')?.closest('tr');
  const type = firstRow?.dataset.type === 'contact' ? 'outreach' : 'content';
  document.getElementById('task-type').value = type;
  document.getElementById('task-modal').style.display = 'flex';
}
function toggleTaskDest() {
  const isNew = document.querySelector('input[name="task-dest"]:checked').value === 'new';
  document.getElementById('dest-existing').style.display = isNew ? 'none' : '';
  document.getElementById('dest-new').style.display = isNew ? '' : 'none';
}
async function createTask() {
  const selected = getSelectedIds();
  if (selected.length === 0) return;
  const isNew = document.querySelector('input[name="task-dest"]:checked').value === 'new';
  const taskName = document.getElementById('task-name').value.trim();
  const taskType = document.getElementById('task-type').value;
  if (!taskName) { alert('Nombre de tarea requerido'); return; }

  const payload = {
    slug: SLUG,
    ideaIds: selected,
    taskName,
    taskType,
  };
  if (isNew) {
    payload.newProjectName = document.getElementById('new-project-name').value.trim();
    if (!payload.newProjectName) { alert('Nombre del proyecto requerido'); return; }
  } else {
    payload.projectId = document.getElementById('task-project').value;
  }

  try {
    const res = await fetch(API_BASE + '/api/ideas/create-task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) {
      document.getElementById('task-modal').style.display = 'none';
      location.reload();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'Unknown'));
    }
  } catch(e) { console.error(e); alert('Error creating task'); }
}
</script>
</body></html>`;
}

// === Atalaya (Watchtower) — Competitive Intelligence Page ===
function buildAtalayaPage(slug, baseUrl, clientName) {
  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  const atalayaDir = path.join(BASE, 'brand', slug, 'atalaya');
  const competitorsDir = path.join(BASE, 'brand', slug, 'market-and-us', 'competitors');

  // Load config
  const DEFAULT_CATEGORIES = ['Growth','Founder','SEO','AI','Marketing'];
  let config = { channels_to_monitor: [], followed_profiles: { linkedin: [], twitter: [], instagram: [] }, competitor_overrides: {}, categories: DEFAULT_CATEGORIES, max_results_per_channel: 30 };
  try { config = { ...config, ...JSON.parse(fs.readFileSync(path.join(atalayaDir, 'config.json'), 'utf-8')) }; } catch {}

  // Load pending ideas
  let pendingIdeas = [];
  try { pendingIdeas = JSON.parse(fs.readFileSync(path.join(atalayaDir, 'pending-ideas.json'), 'utf-8')); } catch {}
  if (!Array.isArray(pendingIdeas)) pendingIdeas = pendingIdeas.ideas_generated || pendingIdeas.ideas || [];

  // Load per-type pending ideas
  let profilesPending = [];
  try { const raw = JSON.parse(fs.readFileSync(path.join(atalayaDir, 'profiles-pending.json'), 'utf-8')); profilesPending = Array.isArray(raw) ? raw : raw.ideas || raw.ideas_generated || []; } catch {}
  let compPending = [];
  try { const raw = JSON.parse(fs.readFileSync(path.join(atalayaDir, 'competitors-pending.json'), 'utf-8')); compPending = Array.isArray(raw) ? raw : raw.ideas || raw.ideas_generated || []; } catch {}
  let adsPending = [];
  try { const raw = JSON.parse(fs.readFileSync(path.join(atalayaDir, 'ads-pending.json'), 'utf-8')); adsPending = Array.isArray(raw) ? raw : raw.ideas || raw.ideas_generated || []; } catch {}

  // Load reports list (YYYY-MM-DD.json files)
  let reports = [];
  try {
    reports = fs.readdirSync(atalayaDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort().reverse()
      .map(f => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(atalayaDir, f), 'utf-8'));
          return { date: f.replace('.json',''), trigger: d.trigger || 'cron', competitors: (d.competitors_analyzed||[]).length, items: 0, ideas: (d.ideas_generated||[]).length, status: 'complete' };
        } catch { return { date: f.replace('.json',''), status: 'error' }; }
      });
  } catch {}

  // Load competitors from Foundation — sources.json is the primary source
  let competitors = [];
  try {
    const sourcesPath = path.join(competitorsDir, 'sources.json');
    const sourcesData = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
    const allComps = [
      ...((sourcesData.competitors?.direct || []).map(c => ({ ...c, type: 'Direct' }))),
      ...((sourcesData.competitors?.indirect || []).map(c => ({ ...c, type: 'Indirect' }))),
      ...((sourcesData.competitors?.emerging || []).map(c => ({ ...c, type: 'Emerging' }))),
    ];
    competitors = allComps.map(c => {
      const compSlug = c.slug || c.name?.toLowerCase().replace(/\s+/g, '-') || '';
      const overrides = config.competitor_overrides?.[compSlug];
      const channels = overrides?.channels || config.channels_to_monitor || [];
      // Extract social URLs from company and founder(s)
      const co = c.company || c;
      const socials = {};
      if (co.web) socials.web = co.web;
      if (co.linkedin) socials.linkedin = co.linkedin;
      if (co.twitter) socials.twitter = co.twitter;
      if (co.instagram) socials.instagram = co.instagram;
      if (co.facebook) socials.facebook = co.facebook;
      if (co.youtube) socials.youtube = co.youtube;
      return { slug: compSlug, name: c.name || compSlug, type: c.type, tier: c.tier || '—', channels, socials, founders: c.founders || (c.founder ? [c.founder] : []) };
    });
  } catch {
    // Fallback: read subdirectories if sources.json doesn't exist
    try {
      const compFolders = fs.readdirSync(competitorsDir).filter(f => {
        try { return fs.statSync(path.join(competitorsDir, f)).isDirectory() && !['chat','_qa','sources'].includes(f); } catch { return false; }
      });
      competitors = compFolders.map(folder => {
        let name = folder.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        let type = 'Direct';
        try {
          const bc = fs.readFileSync(path.join(competitorsDir, folder, 'current.md'), 'utf-8');
          const nameMatch = bc.match(/^#\s+(.+)/m);
          if (nameMatch) name = nameMatch[1].replace(/[*_]/g,'').replace(/^Competitor Deep Dive:\s*/i,'').replace(/\s*\(.+\)\s*$/,'').trim();
          if (/emerging/i.test(bc)) type = 'Emerging';
          if (/indirect/i.test(bc)) type = 'Indirect';
        } catch {}
        const overrides = config.competitor_overrides?.[folder];
        const channels = overrides?.channels || config.channels_to_monitor || [];
        return { slug: folder, name, type, tier: '—', channels, socials: {}, founders: [] };
      });
    } catch {}
  }

  // Load client-config.json for cron schedule
  let cronSchedule = '0 8 * * 3';
  let cronTz = 'Europe/Madrid';
  try {
    const sources = JSON.parse(fs.readFileSync(path.join(BASE, 'brand', slug, 'client-config.json'), 'utf-8'));
    const atCron = sources.crons?.atalaya || sources.crons?.thief_marketer || {};
    if (atCron.schedule) cronSchedule = atCron.schedule;
    if (atCron.tz) cronTz = atCron.tz;
  } catch {}

  const categories = config.categories || DEFAULT_CATEGORIES;
  const catOptions = categories.map(c => `<option>${escHtml(c)}</option>`).join('');
  const profiles = config.followed_profiles || { linkedin: [], twitter: [], instagram: [] };
  const linkedinCount = (profiles.linkedin||[]).length;
  const twitterCount = (profiles.twitter||[]).length;
  const instagramCount = (profiles.instagram||[]).length;
  const totalProfiles = linkedinCount + twitterCount + instagramCount;
  const lastScan = config.last_scan || null;
  const highPriority = pendingIdeas.filter(i => i.adapted_idea?.priority === 'high').length;

  // Channel label helper
  const CH_LABELS = { meta_ads: 'Meta Ads', google_ads: 'Google Ads', blog: 'Blog', linkedin: 'LinkedIn', instagram: 'Instagram', twitter: 'Twitter / X' };
  const ALL_CHANNELS = ['meta_ads','google_ads','blog','linkedin','instagram','twitter'];

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>🏰 Atalaya — ${escHtml(clientName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#FFFDF9;--card:#FFFFFF;--border:#E8E2D9;--rust:#C45D35;--rust-light:#F5E6DF;--navy:#2C3E50;--text:#2C3E50;--muted:#7F8C8D;--green:#27AE60;--green-light:#E8F8F0;--green-bg:#D5F5E3;--blue:#3498DB;--blue-light:#EBF5FB;--yellow:#F39C12;--yellow-light:#FEF9E7;--red:#E74C3C;--red-light:#FDEDEC;--shadow:0 1px 3px rgba(0,0,0,0.06);--shadow-hover:0 4px 12px rgba(0,0,0,0.1);--radius:10px;--radius-sm:6px;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);line-height:1.5;padding:0;margin:0;}
.page-header{padding:28px 32px 0;}
.page-title{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:var(--navy);}
.page-sub{font-size:14px;color:var(--muted);margin-top:2px;}
.tabs{display:flex;gap:0;padding:20px 32px 0;border-bottom:1px solid var(--border);}
.tab{padding:10px 20px;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;border:1px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;background:transparent;transition:all .15s;display:flex;align-items:center;gap:8px;position:relative;bottom:-1px;}
.tab:hover{color:var(--navy);background:rgba(0,0,0,0.02);}
.tab.active{color:var(--rust);background:var(--card);border-color:var(--border);font-weight:600;}
.badge{background:var(--rust);color:#fff;font-size:11px;padding:1px 7px;border-radius:10px;font-weight:600;}
.content{padding:24px 32px;}
.tab-content{display:none;}.tab-content.active{display:block;}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);transition:box-shadow .2s;}
.card:hover{box-shadow:var(--shadow-hover);}
.card-title{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--navy);margin-bottom:12px;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.scan-section{background:linear-gradient(135deg,var(--rust-light) 0%,#FFF 100%);border:1px solid var(--rust);border-radius:var(--radius);padding:28px;text-align:center;margin-bottom:20px;}
.btn-scan{background:var(--rust);color:#fff;border:none;padding:12px 32px;font-family:'Space Grotesk',sans-serif;font-size:15px;font-weight:600;border-radius:8px;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:8px;}
.btn-scan:hover{background:#A84D2D;transform:translateY(-1px);box-shadow:0 4px 12px rgba(196,93,53,0.3);}
.scan-desc{font-size:13px;color:var(--muted);margin-top:8px;}
.stat-value{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:var(--navy);}
.stat-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}
.stat-detail{font-size:13px;color:var(--muted);margin-top:8px;}
.link-arrow{display:inline-flex;align-items:center;gap:4px;color:var(--rust);font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;margin-top:12px;}
.link-arrow:hover{text-decoration:underline;}
.cron-bar{background:var(--blue-light);border:1px solid #BDD7EE;border-radius:var(--radius-sm);padding:12px 16px;font-size:13px;color:var(--navy);display:flex;align-items:center;gap:8px;margin-top:20px;flex-wrap:wrap;}
.idea-item{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F0EDE8;}
.idea-item:last-child{border-bottom:none;}
.idea-title{font-size:13px;font-weight:600;color:var(--navy);}
.idea-source{font-size:11px;color:var(--muted);margin-top:2px;}
.idea-priority{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;}
.p-high{background:var(--rust-light);color:var(--rust);}.p-medium{background:var(--yellow-light);color:var(--yellow);}.p-low{background:var(--blue-light);color:var(--blue);}
.btn-approve{background:var(--green);color:#fff;border:none;padding:5px 12px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;}
.btn-approve:hover{background:#219A52;}
.btn-approve-all{background:transparent;color:var(--green);border:1px solid var(--green);padding:8px 16px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;margin-top:0;}
.btn-approve-all:hover{background:var(--green-light);}
.ideas-block{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-top:20px;}
.ideas-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--navy);}
/* Competitor cards */
.comp-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);}
.comp-header{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
.comp-avatar{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;color:#fff;}
.comp-name{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;color:var(--navy);}
.comp-type{display:inline-block;font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px;margin-top:2px;}
.type-direct{background:var(--rust-light);color:var(--rust);}
.type-emerging{background:var(--yellow-light);color:var(--yellow);}
.type-indirect{background:var(--blue-light);color:var(--blue);}
.channels-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin:14px 0;}
.channel-item{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text);}
.channel-item input[type="checkbox"]{accent-color:var(--rust);width:15px;height:15px;}
.comp-footer{padding-top:12px;border-top:1px solid #F0EDE8;font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px;}
.social-links{margin:10px 0;display:flex;flex-wrap:wrap;gap:6px;}
.social-link{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;color:var(--navy);text-decoration:none;padding:4px 10px;border:1px solid var(--border);border-radius:6px;transition:all .12s;line-height:1;}
.social-link:hover{background:var(--rust-light);border-color:var(--rust);color:var(--rust);}
.social-link svg{flex-shrink:0;}
.social-link span{white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;}
.founders-section{padding-top:10px;border-top:1px solid #F0EDE8;}
.founder-row{display:flex;align-items:center;gap:8px;padding:5px 0;flex-wrap:wrap;}
.founder-name{font-size:13px;font-weight:600;color:var(--navy);}
.founder-role{font-size:11px;color:var(--muted);}
.founder-socials{display:flex;gap:4px;margin-left:auto;}
.founder-socials .social-link{padding:3px 6px;border:none;}
/* Profile subtabs */
.subtabs{display:flex;gap:8px;margin-bottom:20px;}
.subtab{padding:8px 18px;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;border-radius:8px;background:transparent;border:1px solid var(--border);transition:all .15s;display:flex;align-items:center;gap:6px;}
.subtab:hover{border-color:var(--navy);color:var(--navy);}
.subtab.active{background:var(--navy);color:#fff;border-color:var(--navy);}
.add-form{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;display:flex;align-items:flex-end;gap:12px;margin-bottom:16px;box-shadow:var(--shadow);}
.add-form label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin-bottom:4px;}
.add-form input,.add-form select{border:1px solid var(--border);border-radius:6px;padding:9px 14px;font-family:'Nunito',sans-serif;font-size:14px;color:var(--text);outline:none;width:100%;}
.add-form input:focus{border-color:var(--rust);}
.add-form input::placeholder{color:#BDC3C7;}
.add-form select{background:#fff;cursor:pointer;min-width:120px;}
.btn-add{background:var(--green);color:#fff;border:none;width:38px;height:38px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s;}
.btn-add:hover{background:#219A52;transform:scale(1.05);}
.cat-filters{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;}
.cat-filter{padding:5px 14px;font-size:12px;font-weight:600;border-radius:20px;cursor:pointer;border:1px solid var(--border);background:#fff;color:var(--muted);transition:all .15s;}
.cat-filter:hover{border-color:var(--navy);color:var(--navy);}
.cat-filter.active{background:var(--navy);color:#fff;border-color:var(--navy);}
.profile-list{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.profile-item{display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid #F5F2ED;transition:background .1s;}
.profile-item:last-child{border-bottom:none;}
.profile-item:hover{background:#FDFCFA;}
.toggle{position:relative;width:40px;height:22px;flex-shrink:0;margin-right:14px;}
.toggle input{opacity:0;width:0;height:0;}
.toggle-slider{position:absolute;inset:0;background:#D5D8DC;border-radius:11px;cursor:pointer;transition:.2s;}
.toggle-slider::before{content:'';position:absolute;width:16px;height:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s;}
.toggle input:checked+.toggle-slider{background:var(--green);}
.toggle input:checked+.toggle-slider::before{transform:translateX(18px);}
.profile-name{font-size:14px;font-weight:600;color:var(--navy);flex:1;}
.profile-meta{font-size:11px;color:var(--muted);margin-top:1px;}
.profile-category{display:inline-block;font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px;margin-left:10px;}
.cat-select{font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text);cursor:pointer;margin-left:10px;outline:none;transition:border-color .15s;}
.cat-select:hover{border-color:var(--rust);}
.cat-select:focus{border-color:var(--rust);box-shadow:0 0 0 2px var(--rust-light);}
.cat-manager{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px 20px;margin-bottom:16px;box-shadow:var(--shadow);}
.cat-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.cat-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;font-size:12px;font-weight:600;border-radius:16px;background:var(--blue-light);color:var(--navy);border:1px solid var(--border);}
.cat-chip .remove{cursor:pointer;font-size:14px;color:var(--muted);margin-left:2px;line-height:1;}
.cat-chip .remove:hover{color:var(--red);}
.cat-add-row{display:flex;gap:8px;align-items:center;margin-top:10px;}
.cat-add-row input{border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;font-family:'Nunito',sans-serif;outline:none;width:180px;}
.cat-add-row input:focus{border-color:var(--rust);}
.cat-add-btn{background:var(--green);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;}
.cat-add-btn:hover{background:#219A52;}
.cat-growth{background:var(--green-bg);color:var(--green);}.cat-founder{background:var(--blue-light);color:var(--blue);}.cat-seo{background:var(--yellow-light);color:#D68910;}.cat-ai{background:#F4ECF7;color:#8E44AD;}.cat-marketing{background:var(--rust-light);color:var(--rust);}
.profile-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:14px;color:#fff;margin-right:12px;flex-shrink:0;}
.profile-actions{display:flex;gap:8px;margin-left:auto;padding-left:16px;}
.btn-icon{background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted);padding:4px;border-radius:4px;transition:all .1s;}
.btn-icon:hover{color:var(--navy);background:rgba(0,0,0,0.04);}
.btn-icon.delete:hover{color:var(--red);background:var(--red-light);}
.subtab-content{display:none;}.subtab-content.active{display:block;}
.chat-hint{background:#F8F6F2;border:1px dashed var(--border);border-radius:var(--radius-sm);padding:10px 14px;font-size:12px;color:var(--muted);margin-top:16px;display:flex;align-items:center;gap:8px;}
.empty-state{text-align:center;padding:48px 0;color:var(--muted);}
.empty-state .icon{font-size:48px;margin-bottom:12px;}
.empty-state .title{font-size:15px;font-weight:600;color:var(--navy);}
.empty-state .desc{font-size:13px;margin-top:4px;}
@media(max-width:900px){.grid-2,.grid-3{grid-template-columns:1fr;}.tabs{flex-wrap:wrap;}.add-form{flex-wrap:wrap;}}
</style>
</head><body>
<div class="page-header">
  <div class="page-title">&#127984; Atalaya</div>
  <div class="page-sub">Monitoriza competidores y perfiles &rarr; Genera ideas de contenido</div>
</div>
<div class="tabs">
  <div class="tab active" onclick="showTab('competitors')">&#127919; Competidores <span class="badge">${competitors.length}</span></div>
  <div class="tab" onclick="showTab('profiles')">&#128101; Perfiles <span class="badge">${totalProfiles}</span></div>
  <div class="tab" onclick="showTab('ads')">&#128226; Ads Library</div>
</div>
<div class="content">

<!-- COMPETITORS TAB -->
<div id="tab-competitors" class="tab-content active">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
    <button class="btn-scan" onclick="launchCompScan()">&#128640; Lanzar scan</button>
    <button onclick="openCompChat()" style="padding:8px 16px;font-size:13px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:500;color:var(--navy);transition:all .12s;" onmouseover="this.style.borderColor='var(--rust)'" onmouseout="this.style.borderColor='var(--border)'">&#128172; Chat</button>
    <a href="#" onclick="goToFoundationDoc('market-and-us/competitors');return false;" style="color:var(--rust);font-size:13px;font-weight:600;margin-left:auto;">Editar en Documents &#8599;</a>
  </div>
  <div class="grid-3">
    ${competitors.map((c,i) => {
      const colors = ['#3498DB','#E67E22','#9B59B6','#27AE60','#E74C3C','#1ABC9C','#2980B9','#D35400'];
      const color = colors[i % colors.length];
      const initial = (c.name||'?')[0].toUpperCase();
      const SOCIAL_ICONS = {
        web:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        linkedin:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>',
        twitter:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
        instagram:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>',
        facebook:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
        youtube:'<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
      };
      function socialIcon(k, url) {
        const icon = SOCIAL_ICONS[k] || SOCIAL_ICONS.web;
        const handle = k === 'twitter' ? (url.match(/@?([^/]+)$/) || ['',''])[1] : k === 'instagram' ? (url.match(/@?([^/]+)\/?$/) || ['',''])[1] : '';
        const cleanUrl = url.replace('https://','').replace('http://',''); const label = handle ? '@' + handle.replace('@','') : (k === 'web' ? (cleanUrl.endsWith('/') ? cleanUrl.slice(0,-1) : cleanUrl) : k);
        return '<a href="' + escHtml(url) + '" target="_blank" class="social-link" title="' + escHtml(k) + '">' + icon + ' <span>' + escHtml(label) + '</span></a>';
      }
      const socialLinksList = Object.entries(c.socials||{}).filter(([k,v]) => v && typeof v === 'string').map(([k,v]) => socialIcon(k, v)).join('');
      const founderItems = (c.founders||[]).filter(f=>f.name).map(f => {
        const fLinks = [];
        if (f.linkedin) fLinks.push('<a href="' + escHtml(f.linkedin) + '" target="_blank" class="social-link" title="LinkedIn">' + SOCIAL_ICONS.linkedin + '</a>');
        if (f.twitter) fLinks.push('<a href="' + escHtml(f.twitter) + '" target="_blank" class="social-link" title="Twitter">' + SOCIAL_ICONS.twitter + '</a>');
        return '<div class="founder-row"><span class="founder-name">' + escHtml(f.name) + '</span>' + (f.role ? '<span class="founder-role">' + escHtml(f.role) + '</span>' : '') + '<span class="founder-socials">' + fLinks.join('') + '</span></div>';
      }).join('');
      return '<div class="comp-card"><div class="comp-header"><div class="comp-avatar" style="background:' + color + ';">' + initial + '</div><div><div class="comp-name">' + escHtml(c.name) + '</div><span class="comp-type type-' + c.type.toLowerCase() + '">' + escHtml(c.type) + '</span> <span style="font-size:10px;color:var(--muted);margin-left:4px;">Tier ' + escHtml(c.tier) + '</span></div></div>' + (socialLinksList ? '<div class="social-links">' + socialLinksList + '</div>' : '<div style="font-size:12px;color:var(--muted);padding:8px 0;">Sin canales registrados</div>') + (founderItems ? '<div class="founders-section">' + founderItems + '</div>' : '') + '</div>';
    }).join('')}
  </div>
  ${competitors.length === 0 ? '<div class="empty-state"><div class="icon">&#127919;</div><div class="title">No hay competidores definidos</div><div class="desc">Define competidores en Foundation &rarr; Competitor Analysis</div></div>' : ''}
  ${compPending.length > 0 ? `<div class="ideas-block"><div class="ideas-header"><span>&#128161; ${compPending.length} ideas de competidores</span><button class="btn-approve-all" onclick="approveAll('competitors')">Aprobar todas &rarr; Idea Bank</button></div>${compPending.slice(0,10).map(idea => `<div class="idea-item"><div><div class="idea-title">${escHtml(idea.title||idea.adapted_idea?.title||'—')}</div><div class="idea-source">${escHtml(idea.source||idea.source_name||'')} &middot; ${escHtml(idea.source_channel||'')}</div></div><div style="display:flex;align-items:center;gap:6px;"><span class="idea-priority p-${(idea.priority||idea.adapted_idea?.priority||'medium')}">${escHtml(idea.priority||idea.adapted_idea?.priority||'med')}</span><button class="btn-approve" onclick="approveIdea('${escHtml(idea.id||'')}','competitors')">Aprobar</button></div></div>`).join('')}</div>` : ''}
</div>

<!-- PROFILES TAB -->
<div id="tab-profiles" class="tab-content">
  <div class="cat-manager">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:13px;font-weight:600;color:var(--navy);">Categorias</span>
    </div>
    <div class="cat-chips" id="cat-chips">
      ${categories.map(c => `<span class="cat-chip">${escHtml(c)} <span class="remove" onclick="removeCategory('${escHtml(c)}')">&times;</span></span>`).join('')}
    </div>
    <div class="cat-add-row">
      <input type="text" id="new-cat-input" placeholder="Nueva categoria..." onkeydown="if(event.key==='Enter')addCategory()">
      <button class="cat-add-btn" onclick="addCategory()">+ Anadir</button>
    </div>
  </div>
  <div class="subtabs">
    <div class="subtab active" onclick="showSubtab('linkedin')">&#128279; LinkedIn (${linkedinCount})</div>
    <div class="subtab" onclick="showSubtab('twitter')">&#120143; Twitter (${twitterCount})</div>
    <div class="subtab" onclick="showSubtab('instagram')">&#128248; Instagram (${instagramCount})</div>
  </div>
  ${['linkedin','twitter','instagram'].map(platform => {
    const pList = profiles[platform] || [];
    const cats = {};
    pList.forEach(p => { const c = p.category||'Otros'; cats[c] = (cats[c]||0) + 1; });
    const placeholder = platform === 'linkedin' ? 'https://linkedin.com/in/...' : '@usuario';
    const labelField = platform === 'linkedin' ? 'URL de LinkedIn' : platform === 'twitter' ? 'Handle de X' : 'Handle de Instagram';
    const platformLabel = platform === 'linkedin' ? 'LinkedIn' : platform === 'twitter' ? 'Twitter/X' : 'Instagram';
    return `<div id="subtab-${platform}" class="subtab-content ${platform==='linkedin'?'active':''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <button class="btn-scan" style="padding:8px 16px;font-size:13px;" onclick="launchPlatformScan('${platform}')">&#128640; Scan ${platformLabel}</button>
        <button onclick="openPlatformChat('${platform}')" style="padding:8px 16px;font-size:13px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:500;color:var(--navy);transition:all .12s;" onmouseover="this.style.borderColor='var(--rust)'" onmouseout="this.style.borderColor='var(--border)'">&#128172; Chat</button>
        <span style="font-size:12px;color:var(--muted);margin-left:auto;">${pList.filter(p=>p.active!==false).length} perfiles activos</span>
      </div>
      <div class="add-form">
        <div style="flex:1;"><label>${labelField}</label><input type="text" id="add-${platform}-url" placeholder="${placeholder}"></div>
        <div><label>Categoria</label><select id="add-${platform}-cat">${catOptions}</select></div>
        <button class="btn-add" onclick="addProfile('${platform}')">+</button>
      </div>
      <div class="cat-filters"><span class="cat-filter active" onclick="filterCat(this,'${platform}','all')">Todos (${pList.length})</span>${Object.entries(cats).map(([c,n]) => `<span class="cat-filter" onclick="filterCat(this,'${platform}','${escHtml(c)}')">${escHtml(c)} (${n})</span>`).join('')}</div>
      <div class="profile-list" id="profiles-${platform}">
        ${pList.length === 0 ? `<div class="empty-state"><div class="icon">${platform==='linkedin'?'&#128279;':platform==='twitter'?'&#120143;':'&#128248;'}</div><div class="title">No hay perfiles de ${platform}</div><div class="desc">Usa el chat o el formulario para anadir perfiles</div></div>` : ''}
        ${pList.map(p => {
          const catClass = 'cat-' + (p.category||'growth').toLowerCase();
          const initial = (p.name||p.url||'?')[0].toUpperCase();
          const avatarColor = {'Growth':'#27AE60','Founder':'#3498DB','SEO':'#D68910','AI':'#8E44AD','Marketing':'#C45D35'}[p.category] || '#95A5A6';
          const catSelectOptions = categories.map(c => `<option${c===p.category?' selected':''}>${escHtml(c)}</option>`).join('');
          return `<div class="profile-item" data-cat="${escHtml(p.category||'')}">${platform==='linkedin'?`<div class="profile-avatar" style="background:${avatarColor};">${initial}</div>`:''}<label class="toggle"><input type="checkbox" ${p.active!==false?'checked':''} onchange="toggleProfile('${platform}','${escHtml(p.id)}',this.checked)"><span class="toggle-slider"></span></label><div><div class="profile-name">${escHtml(p.name||p.url||'—')}</div>${platform==='linkedin'?`<div class="profile-meta">${escHtml(p.url||'')} &middot; ${p.posts_monitored||0} posts monitorizados</div>`:''}</div><select class="cat-select" onchange="changeCategory('${platform}','${escHtml(p.id)}',this.value)">${catSelectOptions}</select><div class="profile-actions">${platform==='linkedin'?'<button class="btn-icon" title="Abrir perfil" onclick="window.open(\''+escHtml(p.url||'')+'\')">&#8599;</button>':''}<button class="btn-icon delete" title="Eliminar" onclick="deleteProfile('${platform}','${escHtml(p.id)}')">&#128465;</button></div></div>`;
        }).join('')}
      </div>
      <div class="chat-hint" onclick="openChat()" style="cursor:pointer;">&#128172; Chat: Thread <strong>atalaya:${platform}:${escHtml(slug)}</strong> &rarr; Click para abrir</div>
    </div>`;
  }).join('')}
  ${profilesPending.length > 0 ? `<div class="ideas-block"><div class="ideas-header"><span>&#128161; ${profilesPending.length} ideas de perfiles</span><button class="btn-approve-all" onclick="approveAll('profiles')">Aprobar todas &rarr; Idea Bank</button></div>${profilesPending.slice(0,10).map(idea => `<div class="idea-item"><div><div class="idea-title">${escHtml(idea.title||idea.adapted_idea?.title||'—')}</div><div class="idea-source">${escHtml(idea.source||idea.source_name||'')} &middot; ${escHtml(idea.source_channel||idea.source_platform||'')}</div></div><div style="display:flex;align-items:center;gap:6px;"><span class="idea-priority p-${(idea.priority||idea.adapted_idea?.priority||'medium')}">${escHtml(idea.priority||idea.adapted_idea?.priority||'med')}</span><button class="btn-approve" onclick="approveIdea('${escHtml(idea.id||'')}','profiles')">Aprobar</button></div></div>`).join('')}</div>` : ''}
</div>

<!-- ADS TAB -->
<div id="tab-ads" class="tab-content">
  <div class="subtabs">
    <div class="subtab active" onclick="showSubtab('meta-ads')">&#128266; Meta Ads Library</div>
    <div class="subtab" onclick="showSubtab('google-ads')">&#127760; Google Ads Library</div>
  </div>

  <div id="subtab-meta-ads" class="subtab-content active">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn-scan" onclick="launchAdsScan('meta')">&#128640; Scan Meta Ads</button>
      <button onclick="openAdsChat('meta')" style="padding:8px 16px;font-size:13px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:500;color:var(--navy);">&#128172; Chat</button>
      <span style="font-size:13px;color:var(--muted);">Busca anuncios activos de tus competidores en Facebook/Instagram Ads Library</span>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
      <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:8px;">Competidores a escanear</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${competitors.map(c => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--navy);">${escHtml(c.name)}</span>`).join('')}
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--muted);">El scan buscara anuncios activos de cada competidor en Meta Ads Library. Extraera copy completo, headlines, CTAs, y duracion de cada anuncio.</div>
    </div>
  </div>

  <div id="subtab-google-ads" class="subtab-content">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn-scan" onclick="launchAdsScan('google')">&#128640; Scan Google Ads</button>
      <button onclick="openAdsChat('google')" style="padding:8px 16px;font-size:13px;border:1px solid var(--border);border-radius:8px;background:var(--card);cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:500;color:var(--navy);">&#128172; Chat</button>
      <span style="font-size:13px;color:var(--muted);">Busca anuncios de tus competidores en Google Ads Transparency Center</span>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
      <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:8px;">Competidores a escanear</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${competitors.map(c => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--navy);">${escHtml(c.name)}</span>`).join('')}
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--muted);">El scan buscara anuncios de cada competidor en Google Ads Transparency Center. Extraera headlines, descriptions y formatos.</div>
    </div>
  </div>
  ${adsPending.length > 0 ? `<div class="ideas-block"><div class="ideas-header"><span>&#128161; ${adsPending.length} ideas de ads</span><button class="btn-approve-all" onclick="approveAll('ads')">Aprobar todas &rarr; Idea Bank</button></div>${adsPending.slice(0,10).map(idea => `<div class="idea-item"><div><div class="idea-title">${escHtml(idea.title||idea.adapted_idea?.title||'—')}</div><div class="idea-source">${escHtml(idea.source||idea.source_name||'')}</div></div><div style="display:flex;align-items:center;gap:6px;"><span class="idea-priority p-${(idea.priority||idea.adapted_idea?.priority||'medium')}">${escHtml(idea.priority||idea.adapted_idea?.priority||'med')}</span><button class="btn-approve" onclick="approveIdea('${escHtml(idea.id||'')}','ads')">Aprobar</button></div></div>`).join('')}</div>` : ''}
</div>

</div><!-- /content -->

<script>
const SLUG = '${escHtml(slug)}';
// Compute API base that survives admin path normalization
const _p = window.location.pathname;
const _adminMatch = _p.match(/\\/mc\\/admin\\/[^/]+/);
const API_BASE = _adminMatch ? _adminMatch[0] : (_p.includes('/mc/') ? '/mc' : '');

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}
function showSubtab(name) {
  document.querySelectorAll('.subtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.subtab-content').forEach(t => t.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('subtab-' + name).classList.add('active');
}

function _launchScanChat(threadId, threadName, skill, msg, btn) {
  btn.innerHTML = '&#9203; Lanzando...';
  btn.style.background = '#95A5A6';
  btn.disabled = true;
  // Open chat in parent MC
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'settings-open-chat', slug: SLUG, threadId, threadName, initialMessage: msg, skill }, '*');
  }
  fetch(API_BASE + '/api/mc-chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, threadId, threadName, text: msg, userName: 'Mission Control', skill })
  }).then(() => {
    btn.innerHTML = '&#9989; Scan lanzado';
    btn.style.background = '#27AE60';
    setTimeout(() => { btn.innerHTML = '&#128640; Lanzar scan'; btn.style.background = '#C45D35'; btn.disabled = false; }, 4000);
  }).catch(e => { console.error(e); btn.innerHTML = '&#10060; Error'; btn.style.background = '#E74C3C'; setTimeout(() => { btn.innerHTML = '&#128640; Lanzar scan'; btn.style.background = '#C45D35'; btn.disabled = false; }, 3000); });
}
function launchCompScan() {
  _launchScanChat(
    SLUG + ':competitor-scan',
    'Competitor Scan — ' + SLUG,
    'atalaya-competitors',
    'Lanza el scan de competidores. Lee brand/' + SLUG + '/market-and-us/competitors/sources.json para la lista de competidores y sus canales. Scrapea cada competidor (web, blog, LinkedIn, Meta Ads, Google Ads, Instagram, Twitter). Genera informe completo con contenido escrapeado y extrae ideas de contenido adaptadas a nuestra marca.',
    event.currentTarget
  );
}
function launchPlatformScan(platform) {
  const labels = {linkedin:'LinkedIn',twitter:'Twitter/X',instagram:'Instagram'};
  _launchScanChat(
    SLUG + ':' + platform + '-scan',
    labels[platform] + ' Scan — ' + SLUG,
    'atalaya-' + platform,
    'Lanza el scan de perfiles de ' + labels[platform] + '. Lee brand/' + SLUG + '/atalaya/config.json para la lista de perfiles seguidos. Scrapea los ultimos posts de cada perfil activo en ' + labels[platform] + '. Genera informe con contenido completo y extrae ideas de contenido adaptadas a nuestra marca.',
    event.currentTarget
  );
}
function launchAdsScan(adType) {
  const labels = {meta:'Meta Ads Library',google:'Google Ads Transparency'};
  _launchScanChat(
    SLUG + ':' + adType + '-ads-scan',
    labels[adType] + ' Scan — ' + SLUG,
    'atalaya-' + adType + '-ads',
    'Lanza el scan de ' + labels[adType] + '. Lee brand/' + SLUG + '/market-and-us/competitors/sources.json para la lista de competidores. Busca anuncios activos de cada competidor. Extrae copy completo, headlines, CTAs, creatividades. Genera ideas de ads adaptadas a nuestra marca y posicionamiento.',
    event.currentTarget
  );
}

function apiUrl(endpoint) { return API_BASE + '/api/atalaya-' + endpoint + '?slug=' + SLUG; }

async function approveIdea(ideaId, sourceType) {
  try {
    const res = await fetch(apiUrl('approve-idea'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId, sourceType: sourceType || 'pending' }) });
    if (res.ok) location.reload();
  } catch(e) { console.error(e); }
}
async function approveAll(sourceType) {
  try {
    const res = await fetch(apiUrl('approve-all'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType: sourceType || 'pending' }) });
    if (res.ok) location.reload();
  } catch(e) { console.error(e); }
}

async function addProfile(platform) {
  const url = document.getElementById('add-' + platform + '-url').value.trim();
  const category = document.getElementById('add-' + platform + '-cat').value;
  if (!url) return;
  try {
    const res = await fetch(apiUrl('profiles'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, url, category }) });
    if (res.ok) location.reload();
  } catch(e) { console.error(e); }
}
async function toggleProfile(platform, id, active) {
  try { await fetch(apiUrl('profiles-update'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, id, active }) }); } catch(e) { console.error(e); }
}
async function deleteProfile(platform, id) {
  if (!confirm('Eliminar este perfil?')) return;
  try { const res = await fetch(apiUrl('profiles-delete'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, id }) }); if (res.ok) location.reload(); } catch(e) { console.error(e); }
}
async function toggleChannel(compSlug, channel, enabled) {
  try { await fetch(apiUrl('channel'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ competitorSlug: compSlug, channel, enabled }) }); } catch(e) { console.error(e); }
}

async function addCategory() {
  const input = document.getElementById('new-cat-input');
  const cat = input.value.trim();
  if (!cat) return;
  try {
    const res = await fetch(apiUrl('categories'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', category: cat }) });
    if (res.ok) location.reload();
  } catch(e) { console.error(e); }
}
async function removeCategory(cat) {
  if (!confirm('Eliminar categoria "' + cat + '"?')) return;
  try {
    const res = await fetch(apiUrl('categories'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', category: cat }) });
    if (res.ok) location.reload();
  } catch(e) { console.error(e); }
}
async function changeCategory(platform, id, newCat) {
  try {
    await fetch(apiUrl('profiles-update'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, id, category: newCat }) });
    // Visual feedback
    const sel = event?.target;
    if (sel) { sel.style.borderColor = '#27AE60'; setTimeout(() => sel.style.borderColor = '', 1000); }
  } catch(e) { console.error(e); }
}

function filterCat(el, platform, cat) {
  el.closest('.cat-filters').querySelectorAll('.cat-filter').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#profiles-' + platform + ' .profile-item').forEach(item => {
    item.style.display = (cat === 'all' || item.dataset.cat === cat) ? '' : 'none';
  });
}

// Chat integration — sends postMessage to parent MC to open sidebar
let currentTab = 'overview';
let currentSubtab = 'linkedin';
const _origShowTab = showTab;
showTab = function(name) {
  currentTab = name;
  _origShowTab.call(this, name);
};
const _origShowSubtab = showSubtab;
showSubtab = function(name) {
  currentSubtab = name;
  _origShowSubtab.call(this, name);
};

function goToFoundationDoc(docPath) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'atalaya-navigate', page: 'foundation', docPath: docPath }, '*');
  }
}

function _openChatThread(threadId, threadName, skill) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'settings-open-chat', slug: SLUG, threadId, threadName, skill }, '*');
  }
}
function openPlatformChat(platform) {
  const labels = {linkedin:'LinkedIn',twitter:'Twitter/X',instagram:'Instagram'};
  _openChatThread('atalaya:' + platform + ':' + SLUG, 'Atalaya ' + labels[platform] + ' — ' + SLUG, 'find-' + platform + '-profiles');
}
function openCompChat() {
  _openChatThread(SLUG + ':competitor-analysis', 'Competitor Analysis — ' + SLUG, 'competitor-intelligence');
}
function openAdsChat(adType) {
  const labels = {meta:'Meta Ads',google:'Google Ads'};
  _openChatThread(SLUG + ':' + adType + '-ads', labels[adType] + ' — ' + SLUG, 'atalaya-' + adType + '-ads');
}

function openChat() {
  let threadId, threadName, skill;
  if (currentTab === 'competitors') {
    threadId = SLUG + ':competitor-analysis';
    threadName = 'Competitor Analysis — ' + SLUG;
    skill = 'competitor-intelligence';
  } else if (currentTab === 'profiles') {
    threadId = 'atalaya:' + currentSubtab + ':' + SLUG;
    threadName = 'Atalaya ' + currentSubtab + ' — ' + SLUG;
    skill = 'find-' + currentSubtab + '-profiles';
  } else if (currentTab === 'ads') {
    threadId = SLUG + ':' + currentSubtab;
    threadName = currentSubtab + ' — ' + SLUG;
    skill = 'atalaya-' + currentSubtab;
  } else {
    threadId = 'atalaya:' + SLUG;
    threadName = 'Atalaya — ' + SLUG;
    skill = 'atalaya';
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'settings-open-chat', slug: SLUG, threadId, threadName, skill }, '*');
  }
}
</script>
</body></html>`;
}

function buildTrustEnginePage(slug, baseUrl, clientName) {
  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  const teDir = path.join(BASE, 'brand', slug, 'trust-engine');

  // Load run-state
  let runState = { modules: {} };
  try { runState = JSON.parse(fs.readFileSync(path.join(teDir, 'run-state.json'), 'utf-8')); } catch {}

  // Module definitions
  const MODULE_DEFS = [
    { id: 'foundation-import', name: 'Foundation Import', icon: '📋', cmd: 'trust-engine init' },
    { id: 'seo-audit', name: 'SEO Audit', icon: '🔍', cmd: 'trust-engine seo-audit' },
    { id: 'own-media-audit', name: 'Own Media', icon: '🌐', cmd: 'trust-engine own-media' },
    { id: 'geo-analysis', name: 'GEO Analysis', icon: '🤖', cmd: 'trust-engine geo' },
    { id: 'serp-analysis', name: 'SERP Analysis', icon: '📊', cmd: 'trust-engine serp' },
    { id: 'gap-analysis', name: 'Gap Analysis', icon: '🔗', cmd: 'trust-engine gaps' },
    { id: 'recommendations', name: 'Recommendations', icon: '✅', cmd: 'trust-engine recs' },
    { id: 'keywords', name: 'Keywords', icon: '🔑', cmd: 'trust-engine keywords' },
    { id: 'influencers', name: 'Influencers', icon: '🎯', cmd: 'trust-engine influencers' },
  ];

  // Load module data files
  const moduleFiles = {
    'seo-audit': 'seo-audit.json',
    'own-media-audit': 'own-media-audit.json',
    'geo-analysis': 'geo-analysis.json',
    'serp-analysis': 'serp-analysis.json',
    'gap-analysis': 'gap-analysis.json',
    'recommendations': 'recommendations.json',
    'keywords': 'keywords.json',
    'influencers': 'influencers.json',
    'foundation-import': 'config.json',
  };

  const moduleData = {};
  for (const [modId, fname] of Object.entries(moduleFiles)) {
    try { moduleData[modId] = JSON.parse(fs.readFileSync(path.join(teDir, fname), 'utf-8')); } catch { moduleData[modId] = null; }
  }

  // Determine effective status for each module
  function getEffectiveStatus(modId) {
    const mod = runState.modules[modId];
    if (!mod) return 'pending';
    if (mod.status === 'completed' || mod.status === 'running' || mod.status === 'error') return mod.status;
    // Check if locked by dependencies
    const deps = mod.depends_on || [];
    for (const dep of deps) {
      const depMod = runState.modules[dep];
      if (!depMod || depMod.status !== 'completed') return 'locked';
    }
    return mod.status || 'pending';
  }

  const STATUS_ICONS = { pending: '⬚', locked: '🔒', running: '⏳', completed: '✅', error: '❌' };
  const STATUS_COLORS = { pending: '#5D5348', locked: '#5D5348', running: '#F2C94C', completed: '#4A5D23', error: '#C0392B' };
  const STATUS_LABELS = { pending: 'Pendiente', locked: 'Bloqueado', running: 'Ejecutando...', completed: 'Completado', error: 'Error' };

  // Get summary for completed modules
  function getModuleSummary(modId) {
    const data = moduleData[modId];
    if (!data) return '';
    switch (modId) {
      case 'foundation-import':
        return data.project ? `${(data.niches||[]).length} niches, ${(data.competitors||[]).length} competidores` : '';
      case 'seo-audit': {
        const d = data.data || data;
        const score = d.lighthouse?.seo || d.score || '—';
        const issues = (d.issues||[]).length;
        return `Score: ${score}/100 · ${issues} issues`;
      }
      case 'own-media-audit': {
        const d = data.data || data;
        const score = d.scores?.overall || d.overall_score || '—';
        return `Score: ${score}/100`;
      }
      case 'geo-analysis': {
        const d = data.data || data;
        const vis = d.summary?.client_visibility?.mentioned_in_pct;
        return vis != null ? `Visibility: ${vis}%` : '';
      }
      case 'serp-analysis': {
        const d = data.data || data;
        const n = (d.queries||[]).length;
        return n ? `${n} keywords analizadas` : '';
      }
      case 'gap-analysis': {
        const d = data.data || data;
        const n = d.summary?.total_gaps || (d.gaps||[]).length;
        return n ? `${n} gaps encontrados` : '';
      }
      case 'recommendations': {
        const d = data.data || data;
        const n = (d.recommendations||[]).length;
        return n ? `${n} recomendaciones` : '';
      }
      case 'keywords': {
        const d = data.data || data;
        const n = (d.keywords||[]).length;
        return n ? `${n} keywords` : '';
      }
      case 'influencers': {
        const d = data.data || data;
        const n = (d.influencers||[]).length;
        return n ? `${n} influencers` : '';
      }
      default: return '';
    }
  }

  // Build module cards grid
  const completedCount = MODULE_DEFS.filter(m => getEffectiveStatus(m.id) === 'completed').length;
  const totalCount = MODULE_DEFS.length;

  const moduleCards = MODULE_DEFS.map(mod => {
    const status = getEffectiveStatus(mod.id);
    const icon = STATUS_ICONS[status];
    const color = STATUS_COLORS[status];
    const label = STATUS_LABELS[status];
    const summary = status === 'completed' ? getModuleSummary(mod.id) : '';
    const deps = (runState.modules[mod.id]?.depends_on || []).filter(d => {
      const ds = runState.modules[d];
      return !ds || ds.status !== 'completed';
    });
    const depsText = status === 'locked' ? `<div style="font-size:11px;color:#5D5348;margin-top:6px;">Necesita: ${deps.join(', ')}</div>` : '';

    let buttons = '';
    if (status === 'pending') {
      buttons = `<div style="margin-top:12px;display:flex;gap:6px;">
        <button onclick="launchModule('${escHtml(mod.id)}','${escHtml(slug)}')" class="te-btn te-btn-primary">▶ Lanzar</button>
      </div>`;
    } else if (status === 'completed') {
      buttons = `<div style="margin-top:12px;display:flex;gap:6px;">
        <button onclick="showModuleDetail('${escHtml(mod.id)}')" class="te-btn te-btn-secondary">👁 Ver</button>
        <button onclick="launchModule('${escHtml(mod.id)}','${escHtml(slug)}')" class="te-btn te-btn-outline">🔄 Rerun</button>
      </div>`;
    } else if (status === 'error') {
      buttons = `<div style="margin-top:12px;display:flex;gap:6px;">
        <button onclick="launchModule('${escHtml(mod.id)}','${escHtml(slug)}')" class="te-btn te-btn-primary">🔄 Reintentar</button>
      </div>`;
    } else if (status === 'locked') {
      buttons = `<div style="margin-top:12px;"><button disabled class="te-btn te-btn-disabled">🔒 Bloqueado</button></div>`;
    }

    return `<div class="te-module-card te-status-${status}" id="mod-${mod.id}">
      <div class="te-module-header">
        <span class="te-module-icon">${mod.icon}</span>
        <span class="te-module-status" style="color:${color};">${icon} ${label}</span>
      </div>
      <div class="te-module-name">${escHtml(mod.name)}</div>
      ${summary ? `<div class="te-module-summary">${escHtml(summary)}</div>` : ''}
      ${depsText}
      ${buttons}
    </div>`;
  }).join('');

  // Build detail views for completed modules
  function buildSeoDetail() {
    const data = moduleData['seo-audit'];
    if (!data) return '';
    const d = data.data || data;
    const lh = d.lighthouse || {};
    const cwv = lh.core_web_vitals || {};
    const ratingColor = r => r === 'good' ? '#4A5D23' : r === 'needs-improvement' ? '#F2C94C' : '#C0392B';

    let cwvHtml = '';
    if (cwv.lcp || cwv.tbt || cwv.cls) {
      cwvHtml = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:12px 0;">
        ${['lcp','tbt','cls','fcp','speed_index'].map(k => {
          const v = cwv[k];
          if (!v) return `<div class="te-metric-box"><div class="te-metric-value">—</div><div class="te-metric-label">${k.toUpperCase()}</div></div>`;
          return `<div class="te-metric-box" style="border-color:${ratingColor(v.rating)}">
            <div class="te-metric-value">${v.value}${v.unit || ''}</div>
            <div class="te-metric-label">${k.toUpperCase()}</div>
            <div style="font-size:10px;color:${ratingColor(v.rating)}">${v.rating || ''}</div>
          </div>`;
        }).join('')}
      </div>`;
    }

    let issuesHtml = '<div class="te-empty">Sin issues.</div>';
    if ((d.issues || []).length) {
      const sevIcon = s => ({ critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[s] || '⚪');
      const rows = d.issues.map(iss => `<tr>
        <td>${sevIcon(iss.severity)} ${escHtml(iss.severity||'')}</td>
        <td>${escHtml(iss.title||'')}</td>
        <td>${escHtml(iss.description||'').substring(0,100)}${(iss.description||'').length>100?'...':''}</td>
        <td>${iss.expected_impact_pct ? iss.expected_impact_pct + '%' : '—'}</td>
      </tr>`).join('');
      issuesHtml = `<table class="te-tbl"><thead><tr><th>Sev</th><th>Issue</th><th>Descripción</th><th>Impacto</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    let hcHtml = '';
    if ((d.health_checks || []).length) {
      const hcIcon = s => ({ pass: '✅', fail: '❌', warning: '⚠️' }[s] || '❓');
      const rows = d.health_checks.map(hc => `<tr>
        <td>${hcIcon(hc.status)}</td><td>${escHtml(hc.name||'')}</td><td>${escHtml(hc.details||'')}</td>
      </tr>`).join('');
      hcHtml = `<h3 style="margin-top:16px;">Health Checks</h3><table class="te-tbl"><thead><tr><th></th><th>Check</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<div id="detail-seo-audit" class="te-detail" style="display:none;">
      <button onclick="hideDetail('seo-audit')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">🔍 SEO Audit — Detalle</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0;">
        <div class="te-score-box"><div class="te-score-value">${lh.performance||'—'}</div><div class="te-score-label">Performance</div></div>
        <div class="te-score-box"><div class="te-score-value">${lh.accessibility||'—'}</div><div class="te-score-label">Accessibility</div></div>
        <div class="te-score-box"><div class="te-score-value">${lh.best_practices||'—'}</div><div class="te-score-label">Best Practices</div></div>
        <div class="te-score-box"><div class="te-score-value">${lh.seo||'—'}</div><div class="te-score-label">SEO</div></div>
      </div>
      ${cwvHtml}
      <h3>Issues</h3>
      ${issuesHtml}
      ${hcHtml}
    </div>`;
  }

  function buildOwnMediaDetail() {
    const data = moduleData['own-media-audit'];
    if (!data) return '';
    const d = data.data || data;
    const blog = d.blog || {};
    const social = d.social || {};
    const schemas = d.schemas || {};
    const tech = d.tech || {};
    const scores = d.scores || {};

    const platforms = (social.platforms || []).map(p =>
      `<span class="te-tag">${escHtml(p.platform)} ${p.url ? '✓' : '✗'}</span>`
    ).join(' ') || '<span class="te-tag">Ninguno detectado</span>';

    const foundSchemas = (schemas.found || []).map(s => `<span class="te-tag te-tag-green">${escHtml(s)}</span>`).join(' ');
    const missingSchemas = (schemas.missing_recommended || []).map(s => `<span class="te-tag te-tag-red">${escHtml(s)}</span>`).join(' ');

    return `<div id="detail-own-media-audit" class="te-detail" style="display:none;">
      <button onclick="hideDetail('own-media-audit')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">🌐 Own Media — Detalle</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0;">
        <div class="te-score-box"><div class="te-score-value">${scores.content||'—'}</div><div class="te-score-label">Content (35%)</div></div>
        <div class="te-score-box"><div class="te-score-value">${scores.social||'—'}</div><div class="te-score-label">Social (30%)</div></div>
        <div class="te-score-box"><div class="te-score-value">${scores.technical||'—'}</div><div class="te-score-label">Technical (35%)</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
        <div class="te-section">
          <h3>📝 Blog</h3>
          <div class="te-kv"><span>Detectado:</span><span>${blog.detected ? '✅ Sí' : '❌ No'}</span></div>
          ${blog.url ? `<div class="te-kv"><span>URL:</span><span><a href="${escHtml(blog.url)}" target="_blank">${escHtml(blog.url)}</a></span></div>` : ''}
          <div class="te-kv"><span>Frecuencia:</span><span>${escHtml(blog.frequency||'—')}</span></div>
          <div class="te-kv"><span>Posts estimados:</span><span>${blog.post_count_estimated||'—'}</span></div>
        </div>
        <div class="te-section">
          <h3>📱 Social</h3>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">${platforms}</div>
        </div>
        <div class="te-section">
          <h3>🔧 Tech</h3>
          <div class="te-kv"><span>CMS:</span><span>${escHtml(tech.cms||'—')}</span></div>
          <div class="te-kv"><span>Analytics:</span><span>${(tech.analytics||[]).join(', ')||'—'}</span></div>
          <div class="te-kv"><span>CDN:</span><span>${escHtml(tech.cdn||'—')}</span></div>
          <div class="te-kv"><span>SSL:</span><span>${tech.ssl ? '✅' : '❌'}</span></div>
        </div>
        <div class="te-section">
          <h3>📋 Schemas</h3>
          <div>Found: ${foundSchemas || 'Ninguno'}</div>
          <div style="margin-top:6px;">Missing: ${missingSchemas || '—'}</div>
        </div>
      </div>
    </div>`;
  }

  function buildGeoDetail() {
    const data = moduleData['geo-analysis'];
    if (!data) return '';
    const d = data.data || data;
    const summary = d.summary || {};
    const runs = d.runs || [];
    const cv = summary.client_visibility || {};

    let competitorTable = '';
    if ((summary.competitor_visibility||[]).length) {
      const rows = summary.competitor_visibility.map(c => `<tr>
        <td>${escHtml(c.brand||'')}</td><td>${c.mentioned_in_pct != null ? c.mentioned_in_pct + '%' : '—'}</td><td>${c.avg_position||'—'}</td>
      </tr>`).join('');
      competitorTable = `<table class="te-tbl"><thead><tr><th>Competidor</th><th>Visibility</th><th>Pos Avg</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    let citedDomains = '';
    if ((summary.top_cited_domains||[]).length) {
      citedDomains = summary.top_cited_domains.slice(0, 10).map(d =>
        `<span class="te-tag">${escHtml(d.domain)} (${d.count})</span>`
      ).join(' ');
    }

    return `<div id="detail-geo-analysis" class="te-detail" style="display:none;">
      <button onclick="hideDetail('geo-analysis')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">🤖 GEO Analysis — Detalle</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0;">
        <div class="te-score-box"><div class="te-score-value">${cv.mentioned_in_pct != null ? cv.mentioned_in_pct + '%' : '—'}</div><div class="te-score-label">Visibility</div></div>
        <div class="te-score-box"><div class="te-score-value">${cv.avg_position||'—'}</div><div class="te-score-label">Pos. Media</div></div>
        <div class="te-score-box"><div class="te-score-value">${runs.length}</div><div class="te-score-label">Prompts</div></div>
      </div>
      <h3>Competidores</h3>
      ${competitorTable || '<div class="te-empty">Sin datos de competidores.</div>'}
      <h3 style="margin-top:16px;">Dominios más citados</h3>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">${citedDomains || '<span class="te-empty">—</span>'}</div>
    </div>`;
  }

  function buildGapDetail() {
    const data = moduleData['gap-analysis'];
    if (!data) return '';
    const d = data.data || data;
    const gaps = d.gaps || [];
    const summary = d.summary || {};

    let gapTable = '<div class="te-empty">Sin gaps.</div>';
    if (gaps.length) {
      const rows = gaps.slice(0, 20).map(g => {
        const typeIcon = { geo_only: '🤖', serp_only: '🔍', both: '⚡' }[g.type] || '';
        return `<tr>
          <td>${typeIcon} ${escHtml(g.type||'')}</td>
          <td><a href="${escHtml(g.url||'')}" target="_blank" style="color:#C45D35;">${escHtml((g.domain||g.url||'').substring(0,40))}</a></td>
          <td>${escHtml((g.competitors_present||[]).join(', '))}</td>
          <td style="font-weight:700;">${g.opportunity_score||'—'}</td>
        </tr>`;
      }).join('');
      gapTable = `<table class="te-tbl"><thead><tr><th>Tipo</th><th>Dominio/URL</th><th>Competidores</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<div id="detail-gap-analysis" class="te-detail" style="display:none;">
      <button onclick="hideDetail('gap-analysis')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">🔗 Gap Analysis — Detalle</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0;">
        <div class="te-score-box"><div class="te-score-value">${summary.total_gaps||gaps.length}</div><div class="te-score-label">Total Gaps</div></div>
        <div class="te-score-box"><div class="te-score-value">${summary.high_opportunity||gaps.filter(g=>(g.opportunity_score||0)>=70).length}</div><div class="te-score-label">High Opportunity</div></div>
        <div class="te-score-box"><div class="te-score-value">${summary.by_type?.both||gaps.filter(g=>g.type==='both').length}</div><div class="te-score-label">SEO+GEO</div></div>
      </div>
      ${gapTable}
    </div>`;
  }

  function buildRecsDetail() {
    const data = moduleData['recommendations'];
    if (!data) return '';
    const d = data.data || data;
    const recs = d.recommendations || [];

    let recsTable = '<div class="te-empty">Sin recomendaciones.</div>';
    if (recs.length) {
      const sevIcon = s => ({ critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[s] || '⚪');
      const rows = recs.map(r => `<tr>
        <td>${sevIcon(r.severity)} ${escHtml(r.severity||'')}</td>
        <td>${escHtml(r.title||'')}</td>
        <td>${escHtml(r.category||'')}</td>
        <td>${r.expected_impact_pct ? r.expected_impact_pct + '%' : '—'}</td>
        <td>${escHtml(r.effort||'—')}</td>
        <td><select onchange="updateRecStatus('${escHtml(r.id||'')}',this.value)" style="padding:4px;border:1px solid #D4C9B8;border-radius:4px;font-size:12px;background:#F5F0E6;color:#1A1A2E;">
          <option value="pending" ${(r.status||'pending')==='pending'?'selected':''}>Pendiente</option>
          <option value="in-progress" ${r.status==='in-progress'?'selected':''}>En progreso</option>
          <option value="done" ${r.status==='done'?'selected':''}>Hecho</option>
          <option value="dismissed" ${r.status==='dismissed'?'selected':''}>Descartado</option>
        </select></td>
      </tr>`).join('');
      recsTable = `<table class="te-tbl"><thead><tr><th>Sev</th><th>Recomendación</th><th>Categoría</th><th>Impacto</th><th>Esfuerzo</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<div id="detail-recommendations" class="te-detail" style="display:none;">
      <button onclick="hideDetail('recommendations')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">✅ Recommendations — Detalle</h2>
      ${recsTable}
    </div>`;
  }

  function buildKeywordsDetail() {
    const data = moduleData['keywords'];
    if (!data) return '';
    const d = data.data || data;
    const kws = d.keywords || [];

    let kwTable = '<div class="te-empty">Sin keywords.</div>';
    if (kws.length) {
      const rows = kws.sort((a,b) => (b.opportunity_score||0) - (a.opportunity_score||0)).slice(0, 30).map(k => `<tr>
        <td>${escHtml(k.keyword||'')}</td>
        <td>${escHtml(k.category||'')}</td>
        <td>${k.volume != null ? k.volume.toLocaleString() : '—'}</td>
        <td>${k.cpc != null ? '€' + k.cpc.toFixed(2) : '—'}</td>
        <td>${k.kd != null ? k.kd : '—'}</td>
        <td style="font-weight:700;">${k.opportunity_score != null ? (k.opportunity_score * 100).toFixed(0) : '—'}</td>
        <td><select onchange="updateKwStatus('${escHtml(k.id||'')}',this.value)" style="padding:4px;border:1px solid #D4C9B8;border-radius:4px;font-size:12px;background:#F5F0E6;color:#1A1A2E;">
          <option value="suggested" ${(k.status||'suggested')==='suggested'?'selected':''}>Sugerida</option>
          <option value="approved" ${k.status==='approved'?'selected':''}>Aprobada</option>
          <option value="rejected" ${k.status==='rejected'?'selected':''}>Rechazada</option>
          <option value="content-created" ${k.status==='content-created'?'selected':''}>Contenido creado</option>
        </select></td>
      </tr>`).join('');
      kwTable = `<table class="te-tbl"><thead><tr><th>Keyword</th><th>Categoría</th><th>Volume</th><th>CPC</th><th>KD</th><th>Score</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<div id="detail-keywords" class="te-detail" style="display:none;">
      <button onclick="hideDetail('keywords')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">🔑 Keywords — Detalle</h2>
      ${kwTable}
    </div>`;
  }

  function buildInfluencersDetail() {
    const data = moduleData['influencers'];
    if (!data) return '';
    const d = data.data || data;
    const infs = d.influencers || [];

    let infTable = '<div class="te-empty">Sin influencers.</div>';
    if (infs.length) {
      const rows = infs.sort((a,b) => (b.relevance_score||0) - (a.relevance_score||0)).map(inf => `<tr>
        <td>${escHtml(inf.name||'')}</td>
        <td>${escHtml(inf.platform||'')}</td>
        <td><a href="${escHtml(inf.url||'')}" target="_blank" style="color:#C45D35;">Perfil →</a></td>
        <td>${inf.subscribers ? inf.subscribers.toLocaleString() : '—'}</td>
        <td style="font-weight:700;">${inf.relevance_score||'—'}</td>
        <td><select onchange="updateInfStatus('${escHtml(inf.id||'')}',this.value)" style="padding:4px;border:1px solid #D4C9B8;border-radius:4px;font-size:12px;background:#F5F0E6;color:#1A1A2E;">
          <option value="discovered" ${(inf.contact_status||'discovered')==='discovered'?'selected':''}>Descubierto</option>
          <option value="contacted" ${inf.contact_status==='contacted'?'selected':''}>Contactado</option>
          <option value="responded" ${inf.contact_status==='responded'?'selected':''}>Respondió</option>
          <option value="partner" ${inf.contact_status==='partner'?'selected':''}>Partner</option>
        </select></td>
      </tr>`).join('');
      infTable = `<table class="te-tbl"><thead><tr><th>Nombre</th><th>Plataforma</th><th>Perfil</th><th>Seguidores</th><th>Relevancia</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<div id="detail-influencers" class="te-detail" style="display:none;">
      <button onclick="hideDetail('influencers')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">🎯 Influencers — Detalle</h2>
      ${infTable}
    </div>`;
  }

  function buildSerpDetail() {
    const data = moduleData['serp-analysis'];
    if (!data) return '';
    const d = data.data || data;
    const queries = d.queries || [];

    let serpTable = '<div class="te-empty">Sin datos SERP.</div>';
    if (queries.length) {
      const rows = queries.slice(0, 20).map(q => {
        const ownPos = (q.results||[]).find(r => r.domain_type === 'own');
        return `<tr>
          <td>${escHtml(q.keyword||'')}</td>
          <td>${q.volume != null ? q.volume.toLocaleString() : '—'}</td>
          <td>${ownPos ? '#' + ownPos.position : '—'}</td>
          <td>${(q.results||[]).filter(r => r.domain_type === 'competitor').length}</td>
        </tr>`;
      }).join('');
      serpTable = `<table class="te-tbl"><thead><tr><th>Keyword</th><th>Volume</th><th>Tu posición</th><th>Competidores en top 10</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `<div id="detail-serp-analysis" class="te-detail" style="display:none;">
      <button onclick="hideDetail('serp-analysis')" class="te-btn te-btn-outline" style="margin-bottom:12px;">← Volver</button>
      <h2 style="font-family:'Space Grotesk',sans-serif;color:#1E3A5F;">📊 SERP Analysis — Detalle</h2>
      ${serpTable}
    </div>`;
  }

  // Assemble all detail views
  const detailViews = [
    buildSeoDetail(),
    buildOwnMediaDetail(),
    buildGeoDetail(),
    buildSerpDetail(),
    buildGapDetail(),
    buildRecsDetail(),
    buildKeywordsDetail(),
    buildInfluencersDetail(),
  ].join('\n');

  // Progress bar
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const content = `
<a class="back" href="${baseUrl}/">← Mission Control</a>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
  <div>
    <h1 style="font-family:'Space Grotesk',sans-serif;font-size:28px;color:#1E3A5F;margin:0;">🔍 Trust Engine</h1>
    <div style="color:#5D5348;font-size:14px;">${escHtml(clientName)}</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:14px;color:#5D5348;">${completedCount}/${totalCount} módulos</div>
    <div style="width:200px;height:8px;background:#D4C9B8;border-radius:4px;margin-top:4px;overflow:hidden;">
      <div style="width:${progressPct}%;height:100%;background:#4A5D23;border-radius:4px;transition:width .3s;"></div>
    </div>
  </div>
</div>

<div id="te-dashboard" class="te-module-grid">
  ${moduleCards}
</div>

${detailViews}

<div id="te-launch-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;align-items:center;justify-content:center;">
  <div style="background:#FDF8EF;border:3px solid #1A1A2E;border-radius:12px;padding:28px;width:480px;max-width:90vw;box-shadow:6px 6px 0 #1A1A2E;">
    <h3 style="font-family:'Space Grotesk',sans-serif;margin-bottom:12px;color:#1E3A5F;">▶ Módulo en ejecución</h3>
    <p style="font-size:14px;color:#5D5348;margin-bottom:16px;">Sancho está ejecutando el módulo. La página se recargará automáticamente en 30 segundos.</p>
    <pre id="te-launch-cmd" style="background:#F5F0E6;padding:16px;border-radius:8px;font-size:14px;border:2px solid #D4C9B8;white-space:pre-wrap;">...</pre>
    <p style="font-size:12px;color:#5D5348;margin-top:8px;">⏳ Recargando en 30s...</p>
    <div style="display:flex;justify-content:flex-end;margin-top:16px;">
      <button onclick="document.getElementById('te-launch-modal').style.display='none'" class="te-btn te-btn-outline">Cerrar</button>
    </div>
  </div>
</div>
`;

  const styles = `<style>
:root { --bg:#F5F0E6; --card:#FDF8EF; --border:#D4C9B8; --text:#1A1A2E; --muted:#5D5348; --ink:#1A1A2E; --green:#4A5D23; --yellow:#F2C94C; --red:#C0392B; --blue:#3B82F6; --rust:#C45D35; --navy:#1E3A5F; --sage:#4A5D23; --aged:#E8DCC8; }
.te-module-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; margin-top:20px; }
.te-module-card { background:#FDF8EF !important; border:3px solid #1A1A2E !important; border-radius:10px !important; padding:18px !important; box-shadow:4px 4px 0 #1A1A2E !important; transition:all 0.2s; }
.te-module-card:hover { transform:translateY(-2px); box-shadow:6px 6px 0 #1A1A2E; }
.te-status-completed { border-left:5px solid #4A5D23 !important; }
.te-status-running { border-left:5px solid #F2C94C; }
.te-status-error { border-left:5px solid #C0392B; }
.te-status-locked { opacity:0.6 !important; }
.te-module-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.te-module-icon { font-size:24px; }
.te-module-status { font-size:12px; font-weight:600; }
.te-module-name { font-family:'Space Grotesk',sans-serif; font-size:16px; font-weight:600; color:#1E3A5F; }
.te-module-summary { font-size:13px; color:#5D5348; margin-top:4px; }
.te-btn { padding:6px 14px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; border:2px solid #1A1A2E; transition:all .15s; }
.te-btn-primary { background:#C45D35 !important; color:#fff !important; box-shadow:2px 2px 0 #1A1A2E !important; padding:8px 16px !important; }
.te-btn-primary:hover { transform:translateY(-1px); box-shadow:3px 3px 0 #1A1A2E; }
.te-btn-secondary { background:#1E3A5F !important; color:#fff !important; box-shadow:2px 2px 0 #1A1A2E !important; padding:8px 16px !important; }
.te-btn-outline { background:#FDF8EF; color:#1A1A2E; }
.te-btn-outline:hover { background:#F5F0E6; }
.te-btn-disabled { background:#D4C9B8 !important; color:#5D5348 !important; cursor:not-allowed !important; border-color:#D4C9B8 !important; }
.te-detail { margin-top:20px; }
.te-score-box { background:#F5F0E6; padding:16px; border-radius:10px; border:2px solid #D4C9B8; text-align:center; }
.te-score-value { font-family:'Space Grotesk',sans-serif; font-size:28px; font-weight:800; color:#1E3A5F; }
.te-score-label { font-size:12px; color:#5D5348; margin-top:2px; }
.te-metric-box { background:#F5F0E6; padding:10px; border-radius:8px; border:2px solid #D4C9B8; text-align:center; }
.te-metric-value { font-family:'Space Grotesk',sans-serif; font-size:18px; font-weight:700; color:#1E3A5F; }
.te-metric-label { font-size:10px; color:#5D5348; text-transform:uppercase; letter-spacing:0.5px; }
.te-empty { text-align:center; padding:24px; color:#5D5348; font-size:14px; }
.te-tbl { width:100%; border-collapse:collapse; font-size:13px; }
.te-tbl th { padding:8px; border-bottom:2px solid #D4C9B8; text-align:left; font-weight:600; color:#5D5348; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; }
.te-tbl td { padding:8px; border-bottom:1px solid #D4C9B8; }
.te-tbl tr:hover td { background:#F5F0E6; }
.te-tag { display:inline-block; background:#F5F0E6; padding:2px 10px; border-radius:6px; font-size:12px; border:1px solid #D4C9B8; margin:2px; }
.te-tag-green { background:rgba(74,93,35,0.1); border-color:#4A5D23; color:#4A5D23; }
.te-tag-red { background:rgba(192,57,43,0.1); border-color:#C0392B; color:#C0392B; }
.te-section { background:#F5F0E6; padding:16px; border-radius:10px; border:2px solid #D4C9B8; }
.te-section h3 { font-family:'Space Grotesk',sans-serif; font-size:14px; color:#1E3A5F; margin-bottom:8px; }
.te-kv { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; border-bottom:1px solid #D4C9B8; }
.te-kv:last-child { border-bottom:none; }
</style>
<script>
const TE_CMDS = ${JSON.stringify(Object.fromEntries(MODULE_DEFS.map(m => [m.id, m.cmd])))};
async function launchModule(modId, slug) {
  const cmd = (TE_CMDS[modId] || 'trust-engine') + ' ' + slug;
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Lanzando...'; }
  try {
    const idx = window.location.pathname.indexOf('/trust-engine/');
    const basePath = idx > 0 ? window.location.pathname.substring(0, idx) : '';
    const res = await fetch(basePath + '/api/mc-chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: slug,
        threadId: 'trust-engine-' + slug,
        threadName: 'Trust Engine — ' + slug,
        text: cmd,
        userName: 'Mission Control',
        skill: 'trust-engine'
      })
    });
    if (res.ok) {
      if (btn) { btn.textContent = '✅ Lanzado'; btn.style.background = '#4A5D23'; }
      // Show status message
      const modal = document.getElementById('te-launch-modal');
      document.getElementById('te-launch-cmd').textContent = '✅ Módulo "' + modId + '" enviado a Sancho. Ejecutándose en background...';
      modal.style.display = 'flex';
      // Auto-reload after 30s to check for updates
      setTimeout(() => location.reload(), 30000);
    } else {
      throw new Error('HTTP ' + res.status);
    }
  } catch (e) {
    console.error('Launch error:', e);
    if (btn) { btn.textContent = '❌ Error'; btn.disabled = false; }
    // Fallback: show command to copy
    document.getElementById('te-launch-cmd').textContent = cmd;
    document.getElementById('te-launch-modal').style.display = 'flex';
  }
}
function showModuleDetail(modId) {
  document.getElementById('te-dashboard').style.display = 'none';
  const det = document.getElementById('detail-' + modId);
  if (det) det.style.display = 'block';
}
function hideDetail(modId) {
  const det = document.getElementById('detail-' + modId);
  if (det) det.style.display = 'none';
  document.getElementById('te-dashboard').style.display = 'grid';
}
function updateRecStatus(id, val) { saveTEField('recommendations', 'recommendations', id, 'status', val); }
function updateKwStatus(id, val) { saveTEField('keywords', 'keywords', id, 'status', val); }
function updateInfStatus(id, val) { saveTEField('influencers', 'influencers', id, 'contact_status', val); }
async function saveTEField(module, arrayKey, itemId, field, value) {
  try {
    const res = await fetch(window.location.pathname.replace(/\\/$/, '') + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, arrayKey, itemId, field, value })
    });
    if (res.ok) {
      const el = event?.target;
      if (el) { el.style.borderColor = '#4A5D23'; setTimeout(() => el.style.borderColor = '#D4C9B8', 1000); }
    }
  } catch (e) { console.error('Save error:', e); }
}
document.getElementById('te-launch-modal')?.addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});
</script>`;

  return page('Trust Engine — ' + clientName, '', styles + content);
}


function buildProjectsPage(slug, baseUrl, clientName, guildId) {
  const projects = loadProjectsData(slug);

  const total = projects.length;
  const totalTasks = projects.reduce((s, p) => s + p.tasks.length, 0);
  const doneTasks = projects.reduce((s, p) => s + p.tasks.filter(t => ['completed','done'].includes(t.status)).length, 0);
  const activePrj = projects.filter(p => p.status === 'active').length;
  const blockedPrj = projects.filter(p => p.status === 'blocked').length;

  const statusLabel = s => ({ active:'Activo', blocked:'Bloqueado', completed:'Completado', reviewed:'Revisado', paused:'Pausado', proposed:'Propuesto', todo:'Por hacer', pending:'Por hacer', 'in-progress':'En progreso', done:'Hecho', cancelled:'Cancelado' }[s] || s);
  const statusColor = s => ({ active:'#3B82F6', blocked:'#C0392B', completed:'#4A5D23', reviewed:'#4A5D23', paused:'#F2C94C', proposed:'#9333ea', todo:'#888', pending:'#888', 'in-progress':'#3B82F6', done:'#4A5D23', cancelled:'#666' }[s] || '#888');
  const phaseLabel = p => ({ 0:'Fase 0 — Prerequisitos', 1:'Fase 1 — Ejecución', 2:'Fase 2 — Escalado' }[p] || `Fase ${p}`);
  const channelIcon = c => ({ web:'🌐', content:'📝', 'paid-ads':'📢', prospecting:'📤', partners:'🤝', creatives:'🎨', research:'🔍', brand:'🏷️', intelligence:'📡', learning:'📚', onboarding:'👋', projects:'📋' }[c] || '#');
  const channelLabel = c => ({ web:'web', content:'content', 'paid-ads':'paid-ads', prospecting:'prospecting', partners:'partners', creatives:'creatives', research:'research', brand:'brand', intelligence:'intelligence', learning:'learning', onboarding:'onboarding', projects:'projects' }[c] || c || '—');
  const CHANNEL_OPTIONS = ['web','content','paid-ads','prospecting','partners','creatives','research','brand','intelligence','learning'];

  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ============ VIEW 1: BY PROJECT ============
  const projectRows = projects.map(p => {
    const obj = typeof p.objective === 'string' ? p.objective : (p.objective ? p.objective.description || '' : '');
    const metrics = p.objective && typeof p.objective === 'object' && p.objective.metric
      ? `${p.objective.baseline}${p.objective.unit||''} → ${p.objective.target}${p.objective.unit||''}` : '';
    const tasksDone = p.tasks.filter(t => ['completed','done'].includes(t.status)).length;
    const pct = p.tasks.length > 0 ? Math.round((tasksDone / p.tasks.length) * 100) : 0;
    const discordLink = (p.discord && p.discord.project_thread_id && guildId)
      ? `<a href="https://discord.com/channels/${guildId}/${p.discord.project_thread_id}" target="_blank" class="discord-link" title="Abrir en Discord">💬</a>` : '';

    const taskItems = p.tasks.map(t => {
      const tDiscord = (t.discord_thread_id && guildId)
        ? `<a href="https://discord.com/channels/${guildId}/${t.discord_thread_id}" target="_blank" class="discord-link">💬</a>` : '';
      const ownerBadge = t.owner && t.owner !== 'Sancho' ? `<span class="owner-badge">👤 ${escHtml(t.owner)}</span>` : '';
      const ch = t.channel || t.skill || '';
      const chBadge = ch ? `<span class="channel-badge">${channelIcon(ch)} ${channelLabel(ch)}</span>` : '';
      const isDone = ['completed','done'].includes(t.status);
      const prjSelOpts = ['todo','in-progress','blocked','completed'].map(s => {
        const lab = {todo:'📋 Por hacer','in-progress':'🔧 En progreso',blocked:'⛔ Bloqueado',completed:'✅ Completado'}[s];
        const sel = (s === t.status || (s === 'todo' && t.status === 'pending')) ? ' selected' : '';
        return '<option value="' + s + '"' + sel + '>' + lab + '</option>';
      }).join('');
      return `<div class="prj-task ${isDone ? 'done' : ''}" data-task-id="${escHtml(t.id)}">
        <div class="prj-task-main">
          <span class="pill-sm"  style="background:${statusColor(t.status)}20;color:${statusColor(t.status)}">${statusLabel(t.status)}</span>
          <span class="prj-task-name">${escHtml(t.name)}</span>
          <span class="prj-task-meta">${chBadge}${ownerBadge}${tDiscord}
            <select class="mobile-status" onchange="mobileStatusChange(this)" onclick="event.stopPropagation();" data-task-id="${escHtml(t.id)}">${prjSelOpts}</select>
            <button class="edit-btn" onclick="editTask('${escHtml(t.id)}','${escHtml(t.name)}','${escHtml((t.description||'').replace(/'/g,"&#39;"))}','${escHtml(t.owner||'Sancho')}','${escHtml(t.channel||'')}','${escHtml(t.status)}')">✏️</button>
          </span>
        </div>
        ${t.description ? `<div class="prj-task-desc">${escHtml(t.description)}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="prj-card" id="prj-${p.id}">
      <div class="prj-header" onclick="togglePrj('${p.id}')">
        <div class="prj-left">
          <span class="prj-id">${escHtml(p.id)}</span>
          <span class="prj-name">${escHtml(p.name)}</span>
          <span class="pill-sm" style="background:${statusColor(p.status)}20;color:${statusColor(p.status)}">${statusLabel(p.status)}</span>
          ${p.blocked_by ? `<span class="prj-blocked">⛔ por ${escHtml(p.blocked_by)}</span>` : ''}
        </div>
        <div class="prj-right">
          <span class="prj-phase">${phaseLabel(p.phase !== undefined ? p.phase : 1)}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
          <span class="prj-count">${tasksDone}/${p.tasks.length}</span>
          ${discordLink}
          <button class="edit-btn" onclick="event.stopPropagation();editProject('${escHtml(p.id)}','${escHtml(p.name)}','${escHtml(obj.replace(/'/g,"&#39;"))}','${escHtml(p.status)}','${escHtml(p.strategy||'')}','${escHtml(p.review_date||'')}')" title="Editar proyecto">✏️</button>
          <span class="chevron">▸</span>
        </div>
      </div>
      <div class="prj-body" style="display:none;">
        <div class="prj-info">
          ${obj ? `<div class="prj-obj"><strong>🎯 Objetivo:</strong> ${escHtml(obj)}</div>` : ''}
          ${metrics ? `<div class="prj-metrics"><strong>📊 Métrica:</strong> ${escHtml(metrics)}</div>` : ''}
          ${p.strategy ? `<div><strong>📋 Estrategia:</strong> ${escHtml(p.strategy)}</div>` : ''}
          ${p.review_date ? `<div><strong>📅 Review:</strong> ${p.review_date}</div>` : ''}
        </div>
        <div class="prj-tasks">${taskItems || '<p class="empty-msg">Sin tareas.</p>'}</div>
      </div>
    </div>`;
  }).join('');

  // ============ VIEW 2: KANBAN BY TASK ============
  const columns = [
    { key: 'todo', label: 'Por hacer', statuses: ['todo','pending'], icon: '📋' },
    { key: 'in-progress', label: 'En progreso', statuses: ['in-progress'], icon: '🔧' },
    { key: 'blocked', label: 'Bloqueado', statuses: ['blocked'], icon: '⛔' },
    { key: 'done', label: 'Completado', statuses: ['completed','done','reviewed'], icon: '✅' },
  ];

  const allTasks = [];
  projects.forEach(p => {
    const projectBlocked = p.status === 'blocked';
    p.tasks.forEach(t => {
      let effectiveStatus = t.status;
      if (projectBlocked && ['todo','pending'].includes(t.status)) effectiveStatus = 'blocked';
      allTasks.push({ ...t, effectiveStatus, projectId: p.id, projectName: p.name,
        projectDiscord: (p.discord && p.discord.project_thread_id && guildId) ? `https://discord.com/channels/${guildId}/${p.discord.project_thread_id}` : null,
        taskDiscord: (t.discord_thread_id && guildId) ? `https://discord.com/channels/${guildId}/${t.discord_thread_id}` : null,
      });
    });
  });

  const buildKanbanCard = (t) => {
    const discordBtn = t.taskDiscord
      ? `<a href="${t.taskDiscord}" target="_blank" class="discord-link">💬</a>`
      : (t.projectDiscord ? `<a href="${t.projectDiscord}" target="_blank" class="discord-link">💬</a>` : '');
    const ownerBadge = t.owner && t.owner !== 'Sancho' ? `<span class="owner-badge">👤 ${escHtml(t.owner)}</span>` : '';
    const ch = t.channel || t.skill || '';
    const chBadge = ch ? `<span class="channel-badge">${channelIcon(ch)} ${channelLabel(ch)}</span>` : '';
    const desc = t.description ? `<div class="task-desc">${escHtml(t.description)}</div>` : '';
    const selOpts = ['todo','in-progress','blocked','completed'].map(s => {
      const lab = {todo:'📋 Por hacer','in-progress':'🔧 En progreso',blocked:'⛔ Bloqueado',completed:'✅ Completado'}[s];
      const sel = (s === t.effectiveStatus || (s === 'todo' && t.effectiveStatus === 'pending')) ? ' selected' : '';
      return '<option value="' + s + '"' + sel + '>' + lab + '</option>';
    }).join('');
    return `<div class="task-card" draggable="true" data-task-id="${escHtml(t.id)}" data-slug="${escHtml(slug)}" data-status="${escHtml(t.effectiveStatus)}">
      <div class="task-card-header drag-handle">
        <span class="task-id" onclick="showDetail('${escHtml(t.projectId)}')">${escHtml(t.projectId)}</span>
        <span class="task-actions"><span class="task-code">${escHtml(t.id)}</span>${chBadge}${ownerBadge}${discordBtn}${desc ? '<span class="expand-btn" onclick="toggleTaskDesc(this.closest(&quot;.task-card&quot;))">▾</span>' : ''}</span>
      </div>
      <div class="task-name">${escHtml(t.name)}</div>
      ${desc}
      <div class="task-footer">
        <span class="task-project">${escHtml(t.projectName)}</span>
        <span><select class="mobile-status" onchange="mobileStatusChange(this)" onclick="event.stopPropagation();" data-task-id="${escHtml(t.id)}">${selOpts}</select>
        <button class="edit-btn" onclick="editTask('${escHtml(t.id)}','${escHtml(t.name)}','${escHtml((t.description||'').replace(/'/g,"&#39;"))}','${escHtml(t.owner||'Sancho')}','${escHtml(t.channel||'')}','${escHtml(t.effectiveStatus)}')" title="Editar">✏️</button></span>
      </div>
    </div>`;
  };

  const columnHtml = columns.map(col => {
    const colTasks = allTasks.filter(t => col.statuses.includes(t.effectiveStatus));
    return `<div class="kanban-col" data-col="${col.key}">
      <div class="col-header"><span>${col.icon} ${col.label}</span><span class="col-count">${colTasks.length}</span></div>
      <div class="col-body" data-col="${col.key}">${colTasks.map(buildKanbanCard).join('')}</div>
    </div>`;
  }).join('');

  // Project detail sidebar (for kanban view)
  const projectPanels = projects.map(p => {
    const obj = typeof p.objective === 'string' ? p.objective : (p.objective ? p.objective.description || '' : '');
    const metrics = p.objective && typeof p.objective === 'object' && p.objective.metric
      ? `<div class="detail-metric"><strong>${p.objective.metric}</strong>: ${p.objective.baseline}${p.objective.unit||''} → ${p.objective.target}${p.objective.unit||''}</div>` : '';
    const tasksDone = p.tasks.filter(t => ['completed','done'].includes(t.status)).length;
    const pct = p.tasks.length > 0 ? Math.round((tasksDone / p.tasks.length) * 100) : 0;
    return `<div class="project-detail" id="detail-${p.id}" style="display:none;">
      <div class="detail-header"><h3>${escHtml(p.id)} — ${escHtml(p.name)}</h3><button class="close-detail" onclick="closeDetail('${p.id}')">&times;</button></div>
      <div class="detail-body">
        ${obj ? `<p class="detail-obj"><strong>Objetivo:</strong> ${escHtml(obj)}</p>` : ''}
        ${metrics}
        ${p.strategy ? `<p><strong>Estrategia:</strong> ${escHtml(p.strategy)}</p>` : ''}
        <p><strong>Fase:</strong> ${phaseLabel(p.phase)}</p>
        <p><strong>Estado:</strong> ${statusLabel(p.status)}${p.blocked_by ? ` — Bloqueado por ${p.blocked_by}` : ''}</p>
        ${p.review_date ? `<p><strong>Review:</strong> ${p.review_date}</p>` : ''}
        <div class="detail-progress"><div class="detail-progress-fill" style="width:${pct}%;"></div></div>
        <p class="detail-progress-text">${tasksDone}/${p.tasks.length} tareas (${pct}%)</p>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>📋 Proyectos — ${escHtml(clientName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--navy:#1E3A5F;--green:#4A5D23;--blue:#3B82F6;--red:#C0392B;}
@media(prefers-color-scheme:dark){:root{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--navy:#60a5fa;--green:#6B8E23;--blue:#60a5fa;--red:#E74C3C;}}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);padding:24px 32px;overflow-x:auto;}
h1{font-family:'Space Grotesk',sans-serif;color:var(--navy);font-size:28px;margin-bottom:4px;}
.top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;}
.top-left{display:flex;align-items:baseline;gap:16px;}
.subtitle{color:var(--muted);font-size:14px;}
.back{color:var(--muted);text-decoration:none;font-size:14px;display:inline-block;margin-bottom:12px;}
.back:hover{color:var(--rust);}
.stats{display:flex;gap:10px;flex-wrap:wrap;}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 16px;text-align:center;min-width:90px;}
.stat-val{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:600;color:var(--navy);}
.stat-label{font-size:11px;color:var(--muted);}

/* Tabs */
.view-tabs{display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border);}
.view-tab{padding:10px 20px;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;}
.view-tab:hover{color:var(--text);}
.view-tab.active{color:var(--rust);border-bottom-color:var(--rust);}
.view-panel{display:none;}
.view-panel.active{display:block;}

/* === PROJECT VIEW === */
.prj-card{background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;}
.prj-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;cursor:pointer;gap:12px;}
.prj-header:hover{background:color-mix(in srgb,var(--bg) 50%,transparent);}
.prj-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}
.prj-right{display:flex;align-items:center;gap:12px;flex-shrink:0;}
.prj-id{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--rust);font-size:14px;}
.prj-name{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.prj-phase{font-size:11px;color:var(--muted);white-space:nowrap;}
.prj-count{font-size:13px;color:var(--muted);white-space:nowrap;font-weight:600;}
.prj-blocked{font-size:11px;color:var(--red);}
.pill-sm{display:inline-block;padding:1px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap;}
.progress-bar{width:70px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;}
.progress-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s;}
.chevron{font-size:14px;color:var(--muted);transition:transform .2s;display:inline-block;}
.prj-card.open .chevron{transform:rotate(90deg);}
.prj-body{padding:0 18px 16px;}
.prj-info{display:flex;flex-direction:column;gap:6px;padding:10px 0 14px;font-size:13px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:10px;}
.prj-obj{font-size:14px;color:var(--text);}
.prj-tasks{display:flex;flex-direction:column;gap:4px;}
.prj-task{padding:10px 12px;border-radius:6px;background:color-mix(in srgb,var(--bg) 60%,transparent);transition:background .15s;}
.prj-task:hover{background:color-mix(in srgb,var(--bg) 80%,var(--card));}
.prj-task.done{opacity:0.6;}
.prj-task.done .prj-task-name{text-decoration:line-through;}
.prj-task-main{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.prj-task-name{font-size:14px;font-weight:500;flex:1;min-width:0;}
.prj-task-meta{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.prj-task-desc{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4;padding-left:4px;}
.channel-badge{font-size:10px;background:color-mix(in srgb,var(--navy) 10%,transparent);color:var(--navy);padding:1px 6px;border-radius:4px;white-space:nowrap;}
.owner-badge{font-size:10px;background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);padding:1px 6px;border-radius:4px;white-space:nowrap;}
.discord-link{text-decoration:none;font-size:14px;opacity:0.7;transition:opacity .15s;}
.discord-link:hover{opacity:1;}
.empty-msg{color:var(--muted);font-size:13px;padding:8px 0;}

/* === KANBAN VIEW === */
.kanban{display:flex;gap:14px;align-items:flex-start;min-height:calc(100vh - 240px);overflow-x:auto;padding-bottom:20px;}
.kanban-col{flex:1;min-width:260px;max-width:340px;background:color-mix(in srgb,var(--bg) 80%,var(--card));border-radius:12px;display:flex;flex-direction:column;max-height:calc(100vh - 240px);}
.col-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--text);border-bottom:1px solid var(--border);}
.col-count{background:var(--border);color:var(--text);font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;}
.col-body{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:60px;}
.col-body.drag-over{background:color-mix(in srgb,var(--blue) 10%,transparent);border-radius:0 0 12px 12px;}
.task-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px;transition:box-shadow .15s,transform .15s;}
.task-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08);transform:translateY(-1px);}
.task-card.dragging{opacity:0.5;transform:rotate(2deg);}
.task-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;cursor:grab;user-select:none;-webkit-user-select:none;}
.task-name,.task-desc,.task-project,.task-footer{user-select:text;-webkit-user-select:text;cursor:text;}
.expand-btn{cursor:pointer;font-size:14px;color:var(--muted);padding:0 4px;transition:transform .2s;display:inline-block;user-select:none;}
.expand-btn:hover{color:var(--rust);}
.task-card.show-desc .expand-btn{transform:rotate(180deg);}
.task-id{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;color:var(--rust);background:color-mix(in srgb,var(--rust) 10%,transparent);padding:1px 8px;border-radius:4px;cursor:pointer;}
.task-id:hover{background:color-mix(in srgb,var(--rust) 20%,transparent);}
.task-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.task-name{font-size:14px;font-weight:600;line-height:1.35;margin-bottom:4px;}
.task-project{font-size:12px;color:var(--muted);}
.task-code{font-family:'Space Grotesk',sans-serif;font-size:10px;color:var(--muted);opacity:0.6;}
.task-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.task-desc{font-size:12px;color:var(--muted);line-height:1.4;margin:6px 0 4px;padding:6px 8px;background:color-mix(in srgb,var(--bg) 60%,transparent);border-radius:4px;display:none;}
.task-card.show-desc .task-desc{display:block;}
.mobile-status{display:none;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;max-width:140px;}
@media(max-width:768px){
  .mobile-status{display:block;}
  .task-card{cursor:pointer;}
  .kanban{flex-direction:column;}
  .kanban-col{max-width:100%;min-width:0;max-height:none;}
}

/* Project detail sidebar */
.project-detail{position:fixed;top:0;right:0;width:380px;height:100vh;background:var(--card);border-left:2px solid var(--border);box-shadow:-4px 0 20px rgba(0,0,0,.1);z-index:100;overflow-y:auto;padding:24px;}
.detail-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;}
.detail-header h3{font-family:'Space Grotesk',sans-serif;color:var(--navy);font-size:18px;line-height:1.3;}
.close-detail{background:none;border:none;font-size:24px;cursor:pointer;color:var(--muted);padding:0 4px;}
.close-detail:hover{color:var(--text);}
.detail-body p{font-size:14px;margin-bottom:8px;line-height:1.5;}
.detail-obj{font-size:15px!important;}
.detail-metric{background:color-mix(in srgb,var(--green) 10%,transparent);padding:8px 12px;border-radius:6px;font-size:14px;margin-bottom:10px;}
.detail-progress{width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-top:12px;}
.detail-progress-fill{height:100%;background:var(--green);border-radius:4px;}
.detail-progress-text{font-size:12px;color:var(--muted);margin-top:4px;}

.toast{position:fixed;bottom:20px;right:20px;background:var(--green);color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;display:none;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.2);}
.toast.error{background:var(--red);}
.toast.show{display:block;animation:fadeIn .2s ease;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
/* Edit modal */
.edit-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:200;display:none;align-items:center;justify-content:center;}
.edit-overlay.open{display:flex;}
.edit-modal{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;width:90%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2);}
.edit-modal h3{font-family:'Space Grotesk',sans-serif;color:var(--navy);margin-bottom:16px;font-size:18px;}
.edit-field{margin-bottom:12px;}
.edit-field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;}
.edit-field input,.edit-field textarea,.edit-field select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;}
.edit-field textarea{min-height:80px;resize:vertical;}
.edit-field select{appearance:auto;}
.edit-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}
.edit-actions button{padding:8px 16px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;}
.btn-save{background:var(--green);color:#fff;border-color:var(--green)!important;}
.btn-save:hover{opacity:0.9;}
.btn-cancel{background:var(--card);color:var(--muted);}
.btn-cancel:hover{background:var(--bg);}
.edit-btn{background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted);padding:2px 4px;opacity:0.5;transition:opacity .15s;}
.edit-btn:hover{opacity:1;color:var(--rust);}

/* Sidebar nav */
.sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:var(--card);border-right:2px solid var(--border);padding:20px 16px;z-index:100;overflow-y:auto;display:flex;flex-direction:column;}
.sidebar .logo{font-family:'Space Grotesk',sans-serif;font-size:22px;color:var(--rust);margin-bottom:2px;}
.sidebar .logo-sub{font-size:12px;color:var(--muted);margin-bottom:14px;}
.sidebar .ns{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin:14px 0 6px 12px;font-weight:600;}
.sidebar a{display:block;padding:8px 12px;color:var(--muted);text-decoration:none;font-size:14px;border-radius:8px;margin-bottom:1px;transition:all .15s;font-weight:400;}
.sidebar a:hover{background:var(--bg);color:var(--text);}
.sidebar a.active{background:var(--bg);color:var(--rust);font-weight:600;}
.sidebar .nav-footer{margin-top:auto;padding-top:16px;border-top:1px solid var(--border);}
.sidebar .theme-toggle{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;color:var(--muted);cursor:pointer;border-radius:8px;}
.sidebar .theme-toggle:hover{background:var(--bg);color:var(--text);}
.main-content{margin-left:220px;padding:24px 32px;overflow-x:auto;}
@media(max-width:768px){
  .sidebar{display:none;}
  .main-content{margin-left:0;}
}

.empty{text-align:center;padding:60px 20px;color:var(--muted);}
.empty h2{font-family:'Space Grotesk',sans-serif;color:var(--navy);margin-bottom:8px;}
</style></head><body>
<div class="sidebar">
  <div class="logo">SanchoCMO</div>
  <div class="logo-sub">Mission Control</div>
  <div class="ns">${escHtml(clientName)}</div>
  <a href="${baseUrl}/">📊 Dashboard</a>
  <a href="${baseUrl}/docs/brand/${slug}/">📂 Documentos</a>
  <a href="#" class="active">📋 Proyectos</a>
  <a href="${baseUrl}/trust-engine/">🔍 Trust Engine</a>
  <a href="${baseUrl}/settings/">⚙️ Settings</a>
  <div class="ns">Vista</div>
  <a href="#" onclick="switchView('projects',this);return false;" id="nav-projects" class="active">📂 Por Proyecto</a>
  <a href="#" onclick="switchView('kanban',this);return false;" id="nav-kanban">📋 Kanban</a>
  <div class="nav-footer">
    <div class="theme-toggle" onclick="document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'':'dark'">🌗 Tema</div>
  </div>
</div>
<div class="main-content">
<div class="top-bar">
  <div class="top-left">
    <h1>📋 Proyectos</h1>
    <span class="subtitle">${escHtml(clientName)}</span>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${activePrj}</div><div class="stat-label">Activos</div></div>
    <div class="stat"><div class="stat-val">${blockedPrj}</div><div class="stat-label">Bloqueados</div></div>
    <div class="stat"><div class="stat-val">${doneTasks}/${totalTasks}</div><div class="stat-label">Tareas</div></div>
    <div class="stat"><div class="stat-val">${totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0}%</div><div class="stat-label">Progreso</div></div>
  </div>
</div>

<div class="view-tabs">
  <div class="view-tab active" onclick="switchView('projects',this)">📂 Por Proyecto</div>
  <div class="view-tab" onclick="switchView('kanban',this)">📋 Por Tarea (Kanban)</div>
</div>

${total === 0 ? '<div class="empty"><h2>Sin proyectos</h2><p>Ejecuta el strategic plan para generar proyectos.</p></div>' : `
<div class="view-panel active" id="view-projects">${projectRows}</div>
<div class="view-panel" id="view-kanban"><div class="kanban">${columnHtml}</div></div>
`}

${projectPanels}

<div class="edit-overlay" id="editOverlay" onclick="if(event.target===this)closeEdit()">
  <div class="edit-modal" id="editModal"></div>
</div>

<div class="toast" id="toast"></div>

<script>
const SLUG = '${slug}';
const CHANNELS = ${JSON.stringify(['web','content','paid-ads','prospecting','partners','creatives','research','brand','intelligence','learning'])};
const API_BASE = window.location.pathname.replace(/\\/projects\\/?$/, '');

function switchView(view, tab) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  tab.classList.add('active');
}

// === Edit functions ===
function closeEdit() { document.getElementById('editOverlay').classList.remove('open'); }

function editTask(taskId, name, desc, owner, channel, status) {
  const chOpts = CHANNELS.map(c => '<option value="' + c + '"' + (c===channel?' selected':'') + '>#' + c + '</option>').join('');
  const stOpts = ['todo','in-progress','blocked','completed'].map(s => {
    const lab = {todo:'Por hacer','in-progress':'En progreso',blocked:'Bloqueado',completed:'Completado'}[s];
    return '<option value="' + s + '"' + (s===status?' selected':'') + '>' + lab + '</option>';
  }).join('');
  document.getElementById('editModal').innerHTML = 
    '<h3>✏️ Editar tarea ' + taskId + '</h3>' +
    '<div class="edit-field"><label>Nombre</label><input id="ef-name" value="' + name.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Descripción</label><textarea id="ef-desc">' + desc.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="edit-field"><label>Canal</label><select id="ef-channel"><option value="">— Sin canal —</option>' + chOpts + '</select></div>' +
    '<div class="edit-field"><label>Owner</label><input id="ef-owner" value="' + owner.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Estado</label><select id="ef-status">' + stOpts + '</select></div>' +
    '<div class="edit-actions"><button class="btn-cancel" onclick="closeEdit()">Cancelar</button><button class="btn-save" onclick="saveTask(\\'' + taskId + '\\')">Guardar</button></div>';
  document.getElementById('editOverlay').classList.add('open');
}

function saveTask(taskId) {
  const fields = {
    name: document.getElementById('ef-name').value,
    description: document.getElementById('ef-desc').value,
    channel: document.getElementById('ef-channel').value,
    owner: document.getElementById('ef-owner').value,
    status: document.getElementById('ef-status').value,
  };
  fetch(API_BASE + '/api/projects/task-update', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ slug: SLUG, taskId, fields })
  }).then(r => r.json()).then(d => {
    if (d.ok) { showToast('✅ ' + taskId + ' actualizado'); closeEdit(); setTimeout(() => location.reload(), 600); }
    else showToast('Error: ' + (d.error||''), true);
  }).catch(() => showToast('Error de conexión', true));
}

function editProject(projId, name, objective, status, strategy, reviewDate) {
  const stOpts = ['active','blocked','paused','completed'].map(s => {
    const lab = {active:'Activo',blocked:'Bloqueado',paused:'Pausado',completed:'Completado'}[s];
    return '<option value="' + s + '"' + (s===status?' selected':'') + '>' + lab + '</option>';
  }).join('');
  document.getElementById('editModal').innerHTML = 
    '<h3>✏️ Editar proyecto ' + projId + '</h3>' +
    '<div class="edit-field"><label>Nombre</label><input id="ef-pname" value="' + name.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Objetivo</label><textarea id="ef-pobj">' + objective.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="edit-field"><label>Estrategia</label><input id="ef-pstrat" value="' + strategy.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Estado</label><select id="ef-pstatus">' + stOpts + '</select></div>' +
    '<div class="edit-field"><label>Review date</label><input id="ef-preview" type="date" value="' + reviewDate + '"/></div>' +
    '<div class="edit-actions"><button class="btn-cancel" onclick="closeEdit()">Cancelar</button><button class="btn-save" onclick="saveProject(\\'' + projId + '\\')">Guardar</button></div>';
  document.getElementById('editOverlay').classList.add('open');
}

function saveProject(projId) {
  const fields = {
    name: document.getElementById('ef-pname').value,
    objective: document.getElementById('ef-pobj').value,
    status: document.getElementById('ef-pstatus').value,
    strategy: document.getElementById('ef-pstrat').value,
    review_date: document.getElementById('ef-preview').value,
  };
  fetch(API_BASE + '/api/projects/project-update', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ slug: SLUG, projectId: projId, fields })
  }).then(r => r.json()).then(d => {
    if (d.ok) { showToast('✅ ' + projId + ' actualizado'); closeEdit(); setTimeout(() => location.reload(), 600); }
    else showToast('Error: ' + (d.error||''), true);
  }).catch(() => showToast('Error de conexión', true));
}

function togglePrj(id) {
  const card = document.getElementById('prj-' + id);
  if (!card) return;
  const body = card.querySelector('.prj-body');
  const isOpen = card.classList.contains('open');
  card.classList.toggle('open');
  body.style.display = isOpen ? 'none' : 'block';
}

function toggleTaskDesc(card) {
  if (event && (event.target.closest('a') || event.target.closest('.task-id'))) return;
  card.classList.toggle('show-desc');
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 2500);
}

function updateTaskStatus(taskId, newStatus) {
  return fetch(API_BASE + '/api/projects/task-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, taskId, status: newStatus })
  }).then(r => r.json());
}

function showDetail(projectId) {
  document.querySelectorAll('.project-detail').forEach(d => d.style.display = 'none');
  const panel = document.getElementById('detail-' + projectId);
  if (panel) panel.style.display = 'block';
}
function closeDetail(projectId) {
  const panel = document.getElementById('detail-' + projectId);
  if (panel) panel.style.display = 'none';
}

// Mobile status change
function mobileStatusChange(sel) {
  const card = sel.closest('.task-card');
  const taskId = sel.dataset.taskId;
  const newStatus = sel.value;
  const labels = {todo:'Por hacer','in-progress':'En progreso',blocked:'Bloqueado',completed:'Completado'};
  updateTaskStatus(taskId, newStatus).then(d => {
    if (d.ok) {
      showToast(taskId + ' → ' + (labels[newStatus] || newStatus));
      setTimeout(() => location.reload(), 600);
    } else {
      showToast('Error: ' + (d.error || ''), true);
    }
  }).catch(() => showToast('Error de conexión', true));
}

// Drag and drop (kanban) — only drag from header (drag-handle)
const statusMap = { 'todo': 'todo', 'in-progress': 'in-progress', 'blocked': 'blocked', 'done': 'completed' };
let draggedCard = null;
let dragAllowed = false;

// Track mousedown: only allow drag if started on the header
document.addEventListener('mousedown', function(e) {
  dragAllowed = !!e.target.closest('.drag-handle');
});

document.querySelectorAll('.task-card[draggable]').forEach(card => {
  card.addEventListener('dragstart', function(e) {
    if (!dragAllowed) { e.preventDefault(); return; }
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.taskId);
  });
  card.addEventListener('dragend', function() {
    if (draggedCard) draggedCard.classList.remove('dragging');
    draggedCard = null;
    dragAllowed = false;
    document.querySelectorAll('.col-body').forEach(c => c.classList.remove('drag-over'));
  });
});
document.querySelectorAll('.col-body').forEach(col => {
  col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', e => {
    e.preventDefault(); col.classList.remove('drag-over');
    if (!draggedCard) return;
    const taskId = draggedCard.dataset.taskId;
    const newCol = col.dataset.col;
    const newStatus = statusMap[newCol] || newCol;
    col.appendChild(draggedCard);
    draggedCard.dataset.status = newStatus;
    document.querySelectorAll('.kanban-col').forEach(c => {
      c.querySelector('.col-count').textContent = c.querySelector('.col-body').children.length;
    });
    updateTaskStatus(taskId, newStatus).then(d => {
      if (d.ok) showToast(taskId + ' → ' + ({"todo":"Por hacer","in-progress":"En progreso","blocked":"Bloqueado","completed":"Completado"}[newStatus] || newStatus));
      else { showToast('Error: ' + (d.error || ''), true); setTimeout(() => location.reload(), 1000); }
    }).catch(() => { showToast('Error de conexión', true); setTimeout(() => location.reload(), 1000); });
  });
});

// Sidebar view toggle sync
function switchView(view, tab) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  // Update tab
  document.querySelectorAll('.view-tab').forEach(t => { if(t.textContent.toLowerCase().includes(view === 'projects' ? 'proyecto' : 'kanban')) t.classList.add('active'); });
  // Update sidebar
  document.getElementById('nav-projects').classList.toggle('active', view === 'projects');
  document.getElementById('nav-kanban').classList.toggle('active', view === 'kanban');
}
</script>
</div>
</body></html>`;
}

function buildSettingsPage(slug, baseUrl, clientName, guildId) {
  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Read dispatch-map.json
  let dispatchData = {};
  try { dispatchData = JSON.parse(fs.readFileSync(path.join(BASE, 'dispatch-map.json'), 'utf-8')); } catch {}

  // Read agent .md files (NO openclaw.json — contains secrets)
  const agentsDataObj = {};
  for (const agentSlug of ['cervantes', 'sancho', 'rocinante', 'escudero']) {
    const agentDir = path.join('/Users/ragi/.openclaw', 'workspace-' + agentSlug);
    const files = {};
    try {
      const entries = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
      for (const f of entries) {
        try { files[f] = fs.readFileSync(path.join(agentDir, f), 'utf-8'); } catch {}
      }
    } catch {}
    agentsDataObj[agentSlug] = { name: agentSlug.charAt(0).toUpperCase() + agentSlug.slice(1), files };
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>⚙️ Settings — ${escHtml(clientName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<script src="${baseUrl}/mc-data.js"><\/script>
<script src="${baseUrl}/skills-data.js"><\/script>
<style>
:root{--bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--navy:#1E3A5F;--green:#4A5D23;--blue:#3B82F6;--red:#C0392B;--yellow:#F2C94C;--bg-alt:#F0EDE8;--cyan:#3B9EBF;--orange:#F2994A;}
[data-theme=dark]{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--navy:#60a5fa;--green:#6B8E23;--blue:#60a5fa;--red:#E74C3C;--yellow:#F2C94C;--bg-alt:#252538;--cyan:#22d3ee;--orange:#fb923c;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);line-height:1.5;min-height:100vh;}
.sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:var(--card);border-right:2px solid var(--border);display:flex;flex-direction:column;padding:16px 12px;z-index:50;overflow-y:auto;}
.sidebar .logo{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;color:var(--rust);}
.sidebar .logo-sub{font-size:11px;color:var(--muted);margin-bottom:14px;letter-spacing:1px;text-transform:uppercase;}
.sidebar .ns{font-size:12px;color:var(--muted);margin-bottom:10px;padding:6px 0;font-weight:600;}
.sidebar a{display:block;padding:8px 12px;font-size:13px;color:var(--text);text-decoration:none;border-radius:8px;margin-bottom:2px;transition:all .12s;}
.sidebar a:hover{background:var(--bg);color:var(--rust);}
.sidebar a.active{background:var(--bg);color:var(--rust);font-weight:600;}
.sidebar .nav-footer{margin-top:auto;padding-top:16px;border-top:1px solid var(--border);}
.sidebar .theme-toggle{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;color:var(--muted);cursor:pointer;border-radius:8px;}
.sidebar .theme-toggle:hover{background:var(--bg);color:var(--text);}
.main-content{margin-left:220px;padding:24px 32px;overflow-x:auto;}
@media(max-width:768px){.sidebar{display:none;}.main-content{margin-left:0;}}

/* Settings tabs */
.settings-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:20px;border-bottom:2px solid var(--border);padding-bottom:10px;}
.settings-tab{padding:8px 16px;border-radius:8px 8px 0 0;font-size:13px;cursor:pointer;background:var(--bg);border:1px solid var(--border);border-bottom:none;color:var(--muted);font-weight:500;transition:all .12s;}
.settings-tab:hover{border-color:var(--rust);color:var(--rust);}
.settings-tab.active{background:var(--card);color:var(--rust);font-weight:700;border-color:var(--rust);border-bottom:2px solid var(--card);margin-bottom:-2px;}
.settings-panel{display:none;}
.settings-panel.active{display:block;}

/* Card & Grid */
.card{background:var(--card);border:2px solid var(--ink);border-radius:8px;padding:16px;margin-bottom:12px;box-shadow:3px 3px 0 var(--ink);}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;}

/* Buttons */
.btn{padding:8px 20px;border:2px solid var(--ink);border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;box-shadow:3px 3px 0 var(--ink);transition:all .2s cubic-bezier(.16,1,.3,1);}
.btn:hover{box-shadow:4px 4px 0 var(--ink);transform:translate(-1px,-1px);}
.btn:active{box-shadow:1px 1px 0 var(--ink);transform:translate(1px,1px);}
.btn-primary{background:linear-gradient(135deg,#C45D35,#D4734F);color:#fff;}
.btn-primary:hover{background:linear-gradient(135deg,#A34A28,#C45D35);}
.btn-secondary{background:var(--border);color:var(--text);margin-left:6px;}
.btn-sm{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;color:var(--text);transition:all .15s;}
.btn-sm:hover{border-color:var(--rust);background:var(--rust);color:#fff;}

/* Status dots */
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted);}
.dot.g{background:var(--green);}
.dot.y{background:var(--yellow);}
.dot.x{background:var(--red);}

/* Tabs & Skills */
.tabs{display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap;}
.tab{padding:5px 14px;border-radius:8px;font-size:12px;cursor:pointer;background:var(--bg);border:1px solid var(--border);color:var(--muted);}
.tab:hover{border-color:var(--rust);}
.tab.active{background:var(--rust);color:#fff;border-color:var(--ink);font-weight:600;}
.tab-content{display:none;}
.tab-content.active{display:block;}
.skill-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;}
.skill-item{background:var(--bg);border:2px solid var(--ink);border-radius:6px;padding:10px 12px;font-size:13px;cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);}
.skill-item:hover{border-color:var(--rust);box-shadow:3px 3px 0 var(--ink);transform:translate(-1px,-1px);}
.skill-item .sn{font-weight:600;}
.skill-item .sd{color:var(--muted);font-size:11px;margin-top:2px;}

/* DAG */
.dag-container{padding:20px;}
.dag-layer{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.dag-label{min-width:60px;font-size:12px;font-weight:700;color:var(--muted);text-align:center;}
.dag-nodes{display:flex;flex-wrap:wrap;gap:8px;}
.dag-node{padding:8px 14px;background:var(--bg);border:2px solid var(--ink);border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;}
.dag-node:hover{border-color:var(--rust);}
.dag-node.done{border-color:var(--green);color:var(--green);}
.dag-node.locked{opacity:.4;}
.dag-arrow{text-align:center;color:var(--muted);font-size:18px;margin:4px 0;padding-left:60px;}

/* Agents */
.agent-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px;}
.agent-row:last-child{border-bottom:none;}
.agent-tab{padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer;background:var(--bg);border:1px solid var(--border);color:var(--muted);}
.agent-tab.active{background:var(--rust);color:#fff;border-color:var(--rust);}

/* Strategies */
.str-filter{padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;background:var(--bg);border:1px solid var(--border);color:var(--muted);transition:all .12s;}
.str-filter:hover{border-color:var(--rust);}
.str-filter.active{background:var(--rust);color:#fff;border-color:var(--rust);font-weight:600;}
.str-row{border-bottom:1px solid var(--border);}
.str-row:last-child{border-bottom:none;}
.str-header{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;transition:background .1s;font-size:13px;}
.str-header:hover{background:var(--bg-alt);}
.str-header .str-id{font-weight:700;color:var(--rust);min-width:28px;font-family:'Space Grotesk',monospace;}
.str-header .str-name{font-weight:600;flex:1;}
.str-header .str-badges{display:flex;gap:4px;align-items:center;}
.str-header .str-badge{font-size:10px;padding:1px 6px;border-radius:3px;background:var(--bg);border:1px solid var(--border);}
.str-header .str-badge-active{background:rgba(76,175,80,0.1);border-color:var(--green);color:var(--green);font-weight:700;}
.str-header .str-chevron{transition:transform .2s;font-size:10px;color:var(--muted);}
.str-row.open .str-chevron{transform:rotate(90deg);}
.str-body{display:none;padding:0 12px 14px 50px;font-size:13px;line-height:1.7;}
.str-row.open .str-body{display:block;}
.str-props{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:10px;}
.str-props div{font-size:12px;}
.str-props strong{color:var(--text);}
.str-props code{background:var(--bg);padding:1px 4px;border-radius:3px;font-size:11px;}
.strategy-score{background:var(--green);color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;}
.hormozi-matrix{display:grid;grid-template-columns:auto 1fr 1fr;gap:1px;background:var(--border);border-radius:8px;overflow:hidden;}
.hm-header{background:var(--bg-alt);padding:8px 12px;font-weight:700;font-size:12px;text-align:center;}
.hm-row-label{background:var(--bg-alt);padding:8px 12px;font-weight:700;font-size:12px;display:flex;align-items:center;}
.hm-cell{background:var(--card);padding:10px;}
.hm-strat{display:inline-block;padding:3px 8px;margin:2px;border-radius:4px;font-size:11px;cursor:pointer;background:var(--bg);border:1px solid var(--border);transition:border-color .15s;}
.hm-strat:hover{border-color:var(--rust);}
.hm-strat.active{border-color:var(--green);background:rgba(76,175,80,0.1);font-weight:700;}
.hm-transversal{padding:10px;margin-top:8px;font-size:12px;text-align:center;}

/* Strategy editor */
.se-lbl{display:block;font-weight:600;font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:2px;margin-top:4px;}
.se-input{width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);font-size:12px;box-sizing:border-box;color:var(--text);}
.se-mono{font-family:monospace;font-size:11px;}

/* Recurring tasks table */
.idea-table{width:100%;border-collapse:collapse;font-size:13px;}
.idea-table th,.idea-table td{padding:8px;}
.idea-table th{text-align:left;background:var(--bg);}
.idea-table tr{border-bottom:1px solid var(--border);}

/* Dispatch */
.dispatch-group{margin-bottom:20px;}
.dispatch-group h3{font-family:'Space Grotesk',sans-serif;font-size:16px;color:var(--rust);margin-bottom:8px;}
.dispatch-channel{padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:13px;}
.dispatch-channel strong{color:var(--navy);}
.dispatch-rule{color:var(--muted);font-size:12px;margin-top:2px;}
.persona-card{background:var(--bg);border:2px solid var(--ink);border-radius:8px;padding:12px;margin-bottom:8px;}
.persona-card h4{font-family:'Space Grotesk',sans-serif;font-size:14px;margin-bottom:4px;}

/* Preferences form */
.pref-field{margin-bottom:16px;}
.pref-field label{display:block;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.pref-field input,.pref-field select{width:100%;max-width:300px;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-size:14px;font-family:inherit;}
.pref-field input:focus,.pref-field select:focus{outline:none;border-color:var(--rust);}

/* Toast */
.toast{position:fixed;bottom:20px;right:20px;background:var(--green);color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;display:none;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.2);}
.toast.error{background:var(--red);}
.toast.show{display:block;animation:fadeIn .2s ease;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
</style>
<script>
const IS_EMBED = new URLSearchParams(window.location.search).has('embed');
if (IS_EMBED) document.documentElement.classList.add('embed');
</script>
<style>
.embed .sidebar{display:none !important;}
.embed .main-content{margin-left:0 !important;padding:16px 24px !important;}
</style>
</head><body>
<div class="sidebar">
  <div class="logo">SanchoCMO</div>
  <div class="logo-sub">Mission Control</div>
  <div class="ns">Overview</div>
  <a href="${baseUrl}/">📊 Dashboard</a>
  <div class="ns">${escHtml(clientName)}</div>
  <a href="${baseUrl}/docs/brand/${slug}/">📂 Documents</a>
  <div class="ns">Trabajo</div>
  <a href="${baseUrl}/projects/">📋 Proyectos</a>
  <a href="${baseUrl}/">💡 Idea Bank</a>
  <a href="${baseUrl}/">🔄 Recurrentes</a>
  <a href="${baseUrl}/">📈 Métricas</a>
  <a href="${baseUrl}/trust-engine/">🔍 Trust Engine</a>
  <div class="ns">Sistema</div>
  <a href="${baseUrl}/">📡 Activity</a>
  <a href="#" class="active">⚙️ Settings</a>
  <div class="nav-footer">
    <div class="theme-toggle" onclick="toggleTheme()">🌗 Tema</div>
  </div>
</div>
<div class="main-content">
<h1 style="font-family:'Space Grotesk',sans-serif;font-size:24px;margin-bottom:4px;">⚙️ Settings</h1>
<p style="color:var(--muted);font-size:13px;margin-bottom:16px;">${escHtml(clientName)} — Configuración del sistema</p>

<!-- Settings Tabs -->
<div class="settings-tabs">
  <div class="settings-tab active" onclick="switchSettingsTab('apis')">🔌 APIs</div>
  <div class="settings-tab" onclick="switchSettingsTab('agents')">🤖 Agentes</div>
  <div class="settings-tab" onclick="switchSettingsTab('skills')">🧰 Skills</div>
  <div class="settings-tab" onclick="switchSettingsTab('dispatch')">📡 Dispatch</div>
  <div class="settings-tab" onclick="switchSettingsTab('strategies')">🎯 Estrategias</div>
  <div class="settings-tab" onclick="switchSettingsTab('recurring')">🔄 Recurrentes</div>
  <div class="settings-tab" onclick="switchSettingsTab('preferences')">⚙️ Preferencias</div>
</div>

<!-- Tab 1: APIs -->
<div id="panel-apis" class="settings-panel active">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;margin-bottom:12px;">🔌 APIs & Servicios</h2>
  <div id="apis-global-view">
    <div style="margin-bottom:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="verifyAllApis()" id="btn-client-check-all">🔄 Verificar Todo</button>
      <button class="btn btn-secondary" onclick="restartGateway()" id="btn-restart-gw" style="display:none;">🔁 Restart Gateway</button>
      <span id="client-api-check-status" style="color:var(--muted);font-size:12px;margin-left:4px;"></span>
    </div>
    <div id="client-apis-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;"></div>
    <div id="client-apis-datasources"></div>
    <div id="client-apis-overrides" style="margin-top:24px;"></div>
  </div>
</div>

<!-- Tab 2: Agents -->
<div id="panel-agents" class="settings-panel">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;margin-bottom:4px;">🤖 Agentes</h2>
  <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">4 agentes — Cervantes, Sancho, Rocinante, Escudero</p>
  <div id="agents-list"></div>
  <div id="agent-file-viewer" class="card" style="display:none;margin-top:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h2 id="agent-viewer-title" style="font-size:15px;margin:0;"></h2>
      <button class="btn-sm" onclick="closeAgentViewer()">✕ Cerrar</button>
    </div>
    <div id="agent-file-tabs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;"></div>
    <pre id="agent-file-content" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:12px;line-height:1.6;max-height:500px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0;"></pre>
    <div style="margin-top:10px;display:flex;gap:6px;">
      <button class="btn btn-secondary" onclick="copyAgentPath()" style="font-size:12px;padding:6px 14px;">📋 Copiar ruta</button>
    </div>
  </div>
</div>

<!-- Tab 3: Skills -->
<div id="panel-skills" class="settings-panel">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;margin-bottom:4px;">🧰 Skills</h2>
  <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">38 skills — catálogo completo</p>
  <div class="card">
    <div class="tabs">
      <div class="tab active" onclick="showTab(this,'foundation')">Foundation (16)</div>
      <div class="tab" onclick="showTab(this,'decide')">Decide (3)</div>
      <div class="tab" onclick="showTab(this,'intel')">Intelligence (5)</div>
      <div class="tab" onclick="showTab(this,'content')">Content (7)</div>
      <div class="tab" onclick="showTab(this,'outreach')">Outreach (3)</div>
      <div class="tab" onclick="showTab(this,'utils')">Utilities (4)</div>
      <div class="tab" onclick="showTab(this,'dag')">🔗 Dependencies</div>
    </div>
    <div id="tab-foundation" class="tab-content active"><div class="skill-grid" id="sg-foundation"></div></div>
    <div id="tab-decide" class="tab-content"><div class="skill-grid" id="sg-decide"></div></div>
    <div id="tab-intel" class="tab-content"><div class="skill-grid" id="sg-intel"></div></div>
    <div id="tab-content" class="tab-content"><div class="skill-grid" id="sg-content"></div></div>
    <div id="tab-outreach" class="tab-content"><div class="skill-grid" id="sg-outreach"></div></div>
    <div id="tab-utils" class="tab-content"><div class="skill-grid" id="sg-utils"></div></div>
    <div id="tab-dag" class="tab-content"><div class="dag-container" id="skill-dag"></div></div>
  </div>
</div>

<!-- Tab 4: Dispatch -->
<div id="panel-dispatch" class="settings-panel">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;margin-bottom:4px;">📡 Dispatch & Personas</h2>
  <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">Reglas de despacho por canal y personas del sistema</p>
  <div id="dispatch-content"></div>
</div>

<!-- Tab 5: Strategies -->
<div id="panel-strategies" class="settings-panel">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
    <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;margin:0;">🎯 Estrategias GTM</h2>
    <button class="btn btn-primary" onclick="openStrategyNew()" style="font-size:12px;padding:6px 14px;margin-left:auto;">+ Nueva estrategia</button>
  </div>
  <p style="color:var(--muted);font-size:13px;margin-bottom:12px;" id="strategies-sub">25 estrategias — Catálogo Hormozi Core Four</p>
  <div class="card" style="margin-bottom:14px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;">Core Four Matrix</div>
    <div id="hormozi-grid"></div>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;" id="str-filters">
    <button class="str-filter active" onclick="filterStrategies('all',this)">Todas</button>
    <button class="str-filter" onclick="filterStrategies('1to1-organic',this)">🤝 1:1 Organic</button>
    <button class="str-filter" onclick="filterStrategies('1toN-organic',this)">📢 1:Many Organic</button>
    <button class="str-filter" onclick="filterStrategies('1to1-paid',this)">💰 1:1 Paid</button>
    <button class="str-filter" onclick="filterStrategies('1toN-paid',this)">💳 1:Many Paid</button>
    <button class="str-filter" onclick="filterStrategies('transversal',this)">⚙️ Transversal</button>
    <span style="width:1px;background:var(--border);margin:0 4px;"></span>
    <button class="str-filter" onclick="filterStrategies('rapido',this)">⚡ Rápido</button>
    <button class="str-filter" onclick="filterStrategies('medio',this)">🕐 Medio</button>
    <button class="str-filter" onclick="filterStrategies('lento',this)">🐢 Lento</button>
    <span style="width:1px;background:var(--border);margin:0 4px;"></span>
    <button class="str-filter" onclick="filterStrategies('active',this)">🟢 Activas cliente</button>
  </div>
  <div id="strategies-list"></div>
</div>

<!-- Strategy Editor — fullscreen -->
<div id="strategy-editor-fs" style="display:none;position:fixed;inset:0;z-index:999;flex-direction:column;background:var(--card);">
  <div style="display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg-alt);flex-shrink:0;">
    <span id="se-fs-title" style="font-size:16px;font-weight:700;">🎯 Nueva Estrategia</span>
    <div style="margin-left:auto;display:flex;gap:6px;">
      <button id="se-delete-btn" class="btn" onclick="deleteStrategy()" style="font-size:12px;padding:5px 12px;color:#E53935;display:none;">🗑️ Eliminar</button>
      <button class="btn btn-primary" onclick="saveStrategy()" style="font-size:12px;padding:5px 12px;">💾 Guardar</button>
      <button class="btn btn-secondary" onclick="closeStrategyEdit()" style="font-size:12px;padding:5px 12px;">✕ Cerrar</button>
    </div>
  </div>
  <div style="flex:1;display:flex;overflow:hidden;">
    <div style="flex:1;overflow-y:auto;padding:16px 20px;" id="se-form-pane">
      <div style="max-width:700px;">
        <div id="se-info-panel" style="margin-bottom:16px;padding:14px;background:rgba(196,93,53,0.06);border:1px solid rgba(196,93,53,0.15);border-radius:8px;font-size:13px;line-height:1.6;display:none;">
          <div style="font-weight:700;margin-bottom:6px;">📋 Cómo crear una estrategia</div>
          <div>Rellena los campos y guarda. Puedes usar el catálogo Hormozi Core Four como referencia.</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
          <div><label class="se-lbl">ID</label><input id="se-id" class="se-input"></div>
          <div><label class="se-lbl">Nombre</label><input id="se-name" class="se-input"></div>
          <div><label class="se-lbl">Cuadrante</label><select id="se-quadrant" class="se-input"><option value="1to1-organic">1:1 Organic</option><option value="1toN-organic">1:Many Organic</option><option value="1to1-paid">1:1 Paid</option><option value="1toN-paid">1:Many Paid</option><option value="transversal">Transversal</option></select></div>
          <div><label class="se-lbl">Velocidad</label><select id="se-velocidad" class="se-input"><option value="rapido">⚡ Rápido</option><option value="medio">🕐 Medio</option><option value="lento">🐢 Lento</option></select></div>
          <div><label class="se-lbl">B2B</label><select id="se-b2b" class="se-input"><option value="core">✅ Core</option><option value="adaptacion">⚠️ Con adaptación</option><option value="no">❌ No aplica</option></select></div>
          <div><label class="se-lbl">B2C</label><select id="se-b2c" class="se-input"><option value="core">✅ Core</option><option value="adaptacion">⚠️ Con adaptación</option><option value="no">❌ No aplica</option></select></div>
          <div style="grid-column:1/-1;"><label class="se-lbl">Objetivo medible</label><textarea id="se-objetivo" rows="2" class="se-input" style="resize:vertical;"></textarea></div>
          <div style="grid-column:1/-1;"><label class="se-lbl">Prerequisitos</label><textarea id="se-prerequisitos" rows="2" class="se-input" style="resize:vertical;"></textarea></div>
          <div><label class="se-lbl">Tiempo al resultado</label><input id="se-tiempo" class="se-input"></div>
          <div><label class="se-lbl">Sectores (comma)</label><input id="se-sectores" class="se-input"></div>
          <div style="grid-column:1/-1;"><label class="se-lbl">Skills de Sancho (comma)</label><input id="se-skills" class="se-input"></div>
          <div style="grid-column:1/-1;"><label class="se-lbl">Objetivos</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-awareness"> Awareness</label>
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-lead-gen"> Lead Gen</label>
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-conversion"> Conversión</label>
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-autoridad"> Autoridad</label>
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-retencion"> Retención</label>
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-expansion"> Expansión</label>
            <label style="font-size:12px;"><input type="checkbox" id="se-obj-comunidad"> Comunidad</label>
          </div></div>
        </div>
        <div style="margin-top:14px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;">Workflow (markdown)</div>
          <label class="se-lbl">🎯 0) Objetivo y por qué</label><textarea id="se-wf-objetivo" rows="3" class="se-input se-mono" style="resize:vertical;margin-bottom:6px;"></textarea>
          <label class="se-lbl">💡 1) Ideación</label><textarea id="se-wf-ideacion" rows="3" class="se-input se-mono" style="resize:vertical;margin-bottom:6px;"></textarea>
          <label class="se-lbl">🔨 2) Creación</label><textarea id="se-wf-creacion" rows="3" class="se-input se-mono" style="resize:vertical;margin-bottom:6px;"></textarea>
          <label class="se-lbl">🚀 3) Ejecución</label><textarea id="se-wf-ejecucion" rows="3" class="se-input se-mono" style="resize:vertical;margin-bottom:6px;"></textarea>
          <label class="se-lbl">📊 4) Medición</label><textarea id="se-wf-medicion" rows="3" class="se-input se-mono" style="resize:vertical;margin-bottom:6px;"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
          <div><label class="se-lbl">✅ Cuándo usar (1/línea)</label><textarea id="se-cuando-si" rows="3" class="se-input" style="resize:vertical;"></textarea></div>
          <div><label class="se-lbl">❌ Cuándo NO usar (1/línea)</label><textarea id="se-cuando-no" rows="3" class="se-input" style="resize:vertical;"></textarea></div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Tab 6: Recurring Tasks -->
<div id="panel-recurring" class="settings-panel">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
    <div>
      <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;">🔄 Tareas Recurrentes</h2>
      <p style="color:var(--muted);font-size:13px;">Crons de OpenClaw — fuente de verdad</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <button onclick="showCreateRecurringTaskForm()" style="padding:8px 14px;border:2px solid var(--border);border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;background:var(--rust);color:#fff;">+ Nueva tarea</button>
    </div>
  </div>
  <div id="recurring-tasks-content"></div>
</div>

<!-- Prompt Modal -->
<div id="prompt-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;align-items:center;justify-content:center;" onclick="if(event.target===this)closePromptModal()">
  <div style="background:var(--card);border:2px solid var(--border);border-radius:12px;max-width:800px;width:90%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);">
      <div>
        <div id="prompt-modal-title" style="font-weight:700;font-size:16px;"></div>
        <div id="prompt-modal-meta" style="font-size:12px;color:var(--muted);margin-top:2px;"></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="prompt-modal-edit-btn" onclick="togglePromptEdit()" style="padding:5px 14px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;color:var(--text);">✏️ Editar</button>
        <button onclick="closePromptModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">✕</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px;">
      <pre id="prompt-modal-view" style="white-space:pre-wrap;word-wrap:break-word;font-size:13px;line-height:1.6;font-family:'Nunito',sans-serif;color:var(--text);margin:0;"></pre>
      <textarea id="prompt-modal-editor" style="display:none;width:100%;min-height:300px;padding:12px;background:var(--bg);border:2px solid var(--border);border-radius:8px;font-size:13px;line-height:1.6;font-family:'Space Grotesk',monospace;color:var(--text);resize:vertical;box-sizing:border-box;"></textarea>
    </div>
    <div id="prompt-modal-actions" style="display:none;padding:12px 20px;border-top:1px solid var(--border);text-align:right;">
      <button onclick="cancelPromptEdit()" style="padding:6px 16px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;color:var(--text);margin-right:8px;">Cancelar</button>
      <button onclick="savePromptEdit()" style="padding:6px 16px;background:var(--green);color:#fff;border:2px solid var(--ink);border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">💾 Guardar</button>
    </div>
  </div>
</div>

<!-- Script Modal -->
<div id="script-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;align-items:center;justify-content:center;" onclick="if(event.target===this)closeScriptModal()">
  <div style="background:#1e1e2e;border:2px solid #3D3D5C;border-radius:12px;max-width:900px;width:95%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #3D3D5C;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span id="script-modal-lang-badge" style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;"></span>
        <span id="script-modal-title" style="font-weight:700;font-size:15px;color:#cdd6f4;"></span>
        <span id="script-modal-lines" style="font-size:11px;color:#666;"></span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="script-modal-edit-btn" onclick="toggleScriptEdit()" style="padding:5px 14px;background:#313244;border:1px solid #3D3D5C;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;color:#cdd6f4;">✏️ Editar</button>
        <button onclick="closeScriptModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">✕</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:0;">
      <pre id="script-modal-view" style="margin:0;padding:20px;white-space:pre;overflow-x:auto;font-size:12px;line-height:1.6;font-family:'JetBrains Mono','Fira Code','SF Mono',monospace;color:#cdd6f4;background:#1e1e2e;tab-size:4;"></pre>
      <textarea id="script-modal-editor" style="display:none;width:100%;min-height:500px;padding:20px;background:#11111b;border:none;font-size:12px;line-height:1.6;font-family:'JetBrains Mono','Fira Code','SF Mono',monospace;color:#cdd6f4;resize:vertical;box-sizing:border-box;tab-size:4;" spellcheck="false"></textarea>
    </div>
    <div id="script-modal-actions" style="display:none;padding:12px 20px;border-top:1px solid #3D3D5C;justify-content:space-between;align-items:center;">
      <span id="script-modal-status" style="font-size:11px;color:#666;"></span>
      <div style="display:flex;gap:8px;">
        <button onclick="cancelScriptEdit()" style="padding:6px 16px;background:#313244;border:1px solid #3D3D5C;border-radius:6px;font-size:12px;cursor:pointer;color:#cdd6f4;">Cancelar</button>
        <button onclick="saveScriptEdit()" id="script-save-btn" style="padding:6px 16px;background:#22A06B;color:#fff;border:2px solid #1e1e2e;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">💾 Guardar</button>
      </div>
    </div>
  </div>
</div>

<!-- Tab 7: Preferences -->
<div id="panel-preferences" class="settings-panel">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:18px;margin-bottom:12px;">⚙️ Preferencias</h2>
  <div class="card">
    <div class="pref-field">
      <label>Nombre de usuario</label>
      <input type="text" id="pref-username" placeholder="Tu nombre" onchange="savePref('mc-user-name',this.value)">
    </div>
    <div class="pref-field">
      <label>Idioma</label>
      <select id="pref-lang" onchange="savePref('mc-lang',this.value)">
        <option value="es">🇪🇸 Español</option>
        <option value="en">🇬🇧 English</option>
      </select>
    </div>
    <div class="pref-field">
      <label>Tema</label>
      <select id="pref-theme" onchange="applyTheme(this.value)">
        <option value="auto">🌗 Auto (sistema)</option>
        <option value="light">☀️ Claro</option>
        <option value="dark">🌙 Oscuro</option>
      </select>
    </div>
    <p style="color:var(--muted);font-size:12px;margin-top:16px;">Las preferencias se guardan localmente en el navegador.</p>
  </div>
</div>

</div><!-- end main-content -->

<div id="toast" class="toast"></div>

<script>
// === Constants ===
const SLUG = '${slug}';
const API_BASE = '${escHtml(baseUrl)}';
const D = typeof MC_DATA !== 'undefined' ? MC_DATA : null;
const S = typeof SKILLS_DATA !== 'undefined' ? SKILLS_DATA : {};

const AGENTS = [
  {name:"Cervantes",ch:"Webchat + #admin",model:"Opus 4.6",role:"Arquitecto del sistema",emoji:"✒️"},
  {name:"Sancho",ch:"Todos los canales Discord (default)",model:"Opus 4.6",role:"CMO Estratega / Orchestrator",emoji:"🐴"},
  {name:"Rocinante",ch:"Invocado por Sancho (QA)",model:"Sonnet 4.5",role:"QA & Brand Check",emoji:"🐎"},
  {name:"Escudero",ch:"Invocado por Sancho (ejecución)",model:"Sonnet 4.5",role:"Ejecución de tareas",emoji:"⚔️"},
];

const AGENTS_DATA = ${JSON.stringify(agentsDataObj).replace(/<\//g, '<\\/')};

const DISPATCH_DATA = ${JSON.stringify(dispatchData).replace(/<\//g, '<\\/')};

const SKILL_CATS = {
  foundation: [
    {id:"company-context",sd:"L0 · Qué es la empresa"},{id:"budget-constraints",sd:"L0 · Presupuesto y recursos"},
    {id:"business-model-audit",sd:"L1 · Modelo de negocio"},{id:"self-intelligence",sd:"L1 · Análisis propio"},
    {id:"competitor-intelligence",sd:"L2 · Battle cards"},{id:"market-intelligence",sd:"L2 · TAM, tendencias"},
    {id:"existing-customer-data",sd:"L1 · Opcional · CRM"},{id:"swot-analysis",sd:"L2 · SWOT + TOWS"},
    {id:"niche-discovery-100x",sd:"L3 · ECPs y nichos"},{id:"ecp-validation",sd:"L4 · Validar ECPs"},
    {id:"positioning-messaging",sd:"L4 · Posicionamiento"},{id:"pricing-hooks",sd:"L4 · Hooks de precio"},
    {id:"brand-voice",sd:"L5 · Voz de marca"},{id:"visual-identity",sd:"L5 · Identidad visual"},
    {id:"foundation-orchestrator",sd:"Meta · Orquesta Foundation v2.0 (6 layers)"},{id:"phase-0-diagnostic",sd:"Meta · Entry point"},
  ],
  decide: [{id:"channel-prioritization",sd:"Qué canales (Core Four)"},{id:"content-calendar-planner",sd:"Calendario editorial"},{id:"outreach-sequence-builder",sd:"Cold outreach"}],
  intel: [{id:"daily-pulse",sd:"Pulso diario"},{id:"meeting-intelligence",sd:"Intel de reuniones"},{id:"content-miner",sd:"Ideas de contenido"},{id:"pattern-detector",sd:"Patrones cross-canal"},{id:"signal-definition",sd:"Señales de compra"}],
  content: [{id:"keyword-research",sd:"SEO research"},{id:"seo-content",sd:"Artículos SEO"},{id:"content-atomizer",sd:"Multi-plataforma"},{id:"direct-response-copy",sd:"Copy persuasivo"},{id:"lead-magnet",sd:"Lead magnets"},{id:"email-sequences",sd:"Email nurture"},{id:"newsletter",sd:"Newsletters"}],
  outreach: [{id:"company-finder",sd:"Buscar empresas"},{id:"decision-maker-finder",sd:"Encontrar decisores"},{id:"contact-enrichment",sd:"Waterfall enrichment"}],
  utils: [{id:"insight-to-content-mapper",sd:"Insight → brief"},{id:"thief-marketers",sd:"Robar ideas"},{id:"social-media-extractor",sd:"Extract social data"},{id:"youtube-transcript",sd:"Transcripts YouTube"}],
};

const SKILL_DEPS = {
  "company-context": [],
  "business-model-audit": ["company-context"],
  "budget-constraints": ["business-model-audit"],
  "market-intelligence": ["company-context","business-model-audit","budget-constraints"],
  "competitor-intelligence": ["company-context","business-model-audit","budget-constraints"],
  "self-intelligence": ["company-context","business-model-audit","budget-constraints"],
  "swot-analysis": ["market-intelligence","competitor-intelligence","self-intelligence"],
  "niche-discovery-100x": ["swot-analysis"],
  "existing-customer-data": ["company-context"],
  "positioning-messaging": ["niche-discovery-100x"],
  "pricing-strategy": ["niche-discovery-100x"],
  "ecp-validation": ["niche-discovery-100x"],
  "brand-voice": ["positioning-messaging"],
  "visual-identity": ["brand-voice"],
};

const DAG_LAYERS = [
  {label:"📋 Company Brief (L0)",nodes:["company-context","business-model-audit","budget-constraints"]},
  {label:"📊 Research (L1)",nodes:["market-intelligence","competitor-intelligence","self-intelligence"]},
  {label:"🔄 Synthesis (L2)",nodes:["swot-analysis"]},
  {label:"👥 Discovery (L3)",nodes:["niche-discovery-100x","existing-customer-data"]},
  {label:"🎯 Activation (L4)",nodes:["positioning-messaging","pricing-strategy","ecp-validation"]},
  {label:"🎨 Brand (L5)",nodes:["brand-voice","visual-identity"]},
];

const API_META = {
  anthropic:{icon:'🧠',name:'Anthropic',desc:'Claude API — modelos de lenguaje',cat:'LLM'},
  openrouter:{icon:'🔀',name:'OpenRouter',desc:'Multi-model routing API',cat:'LLM'},
  openai:{icon:'💚',name:'OpenAI',desc:'GPT + DALL-E + Whisper',cat:'LLM'},
  gemini:{icon:'💎',name:'Gemini',desc:'Google AI — modelos Gemini',cat:'LLM'},
  xai:{icon:'𝕏',name:'xAI (Grok)',desc:'Grok API',cat:'LLM'},
  minimax:{icon:'🔷',name:'MiniMax',desc:'MiniMax API — M1/M2 models',cat:'LLM'},
  brave:{icon:'🦁',name:'Brave Search',desc:'Web search API',cat:'Data'},
  apify:{icon:'🕷️',name:'Apify',desc:'Web scraping & automation',cat:'Data'},
  firecrawl:{icon:'🔥',name:'Firecrawl',desc:'Web scraping API',cat:'Data'},
  serper:{icon:'🔍',name:'Serper',desc:'Google SERP API',cat:'Data'},
  dataforseo:{icon:'📊',name:'DataForSEO',desc:'SEO data API',cat:'Data'},
  notion:{icon:'📝',name:'Notion',desc:'Workspace & docs API',cat:'Infra'},
  supabase:{icon:'⚡',name:'Supabase',desc:'Database & auth',cat:'Infra'},
  gog:{icon:'📧',name:'Google Workspace',desc:'Gmail, Calendar, Drive (gog CLI)',cat:'Infra'},
  discord:{icon:'💬',name:'Discord Bot',desc:'Bot SanchoCMO',cat:'Infra'},
  openclaw:{icon:'🐾',name:'OpenClaw Gateway',desc:'Agent orchestration platform',cat:'Infra'},
  nanobanana:{icon:'🍌',name:'Nano Banana Pro',desc:'Gemini image generation (skill)',cat:'Media'},
  fal:{icon:'🎨',name:'FAL.ai',desc:'Image/video generation',cat:'Media'},
  wavespeed:{icon:'🌊',name:'WaveSpeed',desc:'AI media generation',cat:'Media'},
  remotion:{icon:'🎬',name:'Remotion',desc:'Programmatic video rendering',cat:'Media'},
  dumpling:{icon:'🥟',name:'Dumpling',desc:'Document processing API',cat:'Media'},
  instantly:{icon:'⚡',name:'Instantly.ai',desc:'Cold email outreach',cat:'Marketing'},
  metricool:{icon:'📈',name:'Metricool',desc:'Social media scheduling & analytics',cat:'Marketing'},
};

const SERVICE_ENV_MAP_FE = {
  anthropic:['ANTHROPIC_API_KEY'], openrouter:['OPENROUTER_API_KEY'], openai:['OPENAI_API_KEY'],
  gemini:['GEMINI_API_KEY'], xai:['XAI_API_KEY'], minimax:['MINIMAX_API_KEY'], brave:['BRAVE_API_KEY'],
  apify:['APIFY_API_KEY'], firecrawl:['FIRECRAWL_API_KEY'], serper:['SERPER_API_KEY'],
  dataforseo:['DATAFORSEO_LOGIN','DATAFORSEO_PASSWORD'], notion:['NOTION_API_KEY'],
  supabase:['SUPABASE_URL','SUPABASE_ANON_KEY'], fal:['FAL_API_KEY'], wavespeed:['WAVESPEED_API_KEY'],
  dumpling:['DUMPLING_API_KEY'], slack:['SLACK_BOT_TOKEN'], instantly:['INSTANTLY_API_KEY'], metricool:['METRICOOL_API_KEY'],
};

// === Theme ===
function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? '' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('mc-theme', next || 'auto');
}
function applyTheme(val) {
  if (val === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (val === 'light') document.documentElement.dataset.theme = '';
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('mc-theme', val);
}
(function(){
  const t = localStorage.getItem('mc-theme');
  if (t === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (t === 'light') document.documentElement.dataset.theme = '';
})();

// === Toast ===
function showToast(msg, duration) {
  duration = duration || 3000;
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  t.style.opacity = '1';
  setTimeout(function(){ t.style.opacity='0'; setTimeout(function(){ t.style.display='none'; }, 300); }, duration);
}

// === Tab switching ===
function switchSettingsTab(tabId) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-' + tabId);
  if (panel) panel.classList.add('active');
  // Activate the matching tab button
  document.querySelectorAll('.settings-tab').forEach(t => {
    if (t.textContent.toLowerCase().includes(tabId.substring(0,3)) ||
        (tabId === 'apis' && t.textContent.includes('APIs')) ||
        (tabId === 'agents' && t.textContent.includes('Agentes')) ||
        (tabId === 'skills' && t.textContent.includes('Skills')) ||
        (tabId === 'dispatch' && t.textContent.includes('Dispatch')) ||
        (tabId === 'strategies' && t.textContent.includes('Estrategias')) ||
        (tabId === 'recurring' && t.textContent.includes('Recurrentes')) ||
        (tabId === 'preferences' && t.textContent.includes('Preferencias'))
    ) t.classList.add('active');
  });
  localStorage.setItem('mc-settings-tab', tabId);
}

// === Skills tab switching (inside skills card) ===
function showTab(el, name) {
  const card = el.closest('.card');
  card.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  card.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  card.querySelector('#tab-' + name).classList.add('active');
  el.classList.add('active');
}

// ============ TAB 1: APIs ============
function apiStatusBadge(status) {
  const map = {
    'ok': { dot: 'g', label: 'Conectado', color: 'var(--green)' },
    'error': { dot: 'x', label: 'Error', color: 'var(--red)' },
    'not-configured': { dot: '', label: 'No configurado', color: 'var(--muted)' },
    'unchecked': { dot: 'y', label: 'Sin verificar', color: 'var(--yellow)' },
  };
  return map[status] || { dot: 'y', label: status, color: 'var(--muted)' };
}

function clientApiStatusBadge(status) {
  const map = {
    'connected': { dot: 'g', label: 'Conectado', color: 'var(--green)', border: 'var(--green)' },
    'error': { dot: 'x', label: 'Error', color: 'var(--red)', border: 'var(--red)' },
    'expired': { dot: 'x', label: 'Expirado', color: 'var(--red)', border: 'var(--red)' },
    'pending': { dot: 'y', label: 'Pendiente', color: 'var(--yellow)', border: 'var(--yellow)' },
    'testing': { dot: 'y', label: 'Verificando...', color: 'var(--yellow)', border: 'var(--yellow)' },
    'not_configured': { dot: '', label: 'No configurado', color: 'var(--muted)', border: 'var(--muted)' },
  };
  return map[status] || { dot: '', label: status || 'No configurado', color: 'var(--muted)', border: 'var(--muted)' };
}

let envDataCache = null;
async function loadEnvData() {
  try { const res = await fetch(API_BASE + '/api/env'); envDataCache = await res.json(); } catch { envDataCache = {}; }
}

let clientApiCatalog = null;
let clientApiData = {};

async function loadApiCatalog() {
  if (clientApiCatalog) return clientApiCatalog;
  try { const res = await fetch(API_BASE + '/api/client-integrations/catalog'); clientApiCatalog = await res.json(); return clientApiCatalog; } catch(e) { console.error('Failed to load API catalog:', e); return null; }
}

function renderApis() {
  renderClientApisView(SLUG || '_global');
}

async function renderClientApisView(slug) {
  if (!slug) return;
  const isGlobal = slug === '_global';
  const catalog = await loadApiCatalog();
  if (!catalog || !catalog.categories) return;

  let allClientData = {};
  if (isGlobal) {
    const health = (D && D.apiHealth) ? D.apiHealth.services || {} : {};
    for (const [healthId, svc] of Object.entries(health)) {
      allClientData[healthId] = {
        status: svc.status === 'ok' ? 'connected' : svc.status === 'not-configured' ? 'not_configured' : svc.status === 'error' ? 'error' : 'not_configured',
        config: {}, envVars: [],
        lastTestedAt: svc.lastCheck || null, lastError: svc.details?.error || null,
        notes: svc.details?.account || svc.details?.username || svc.details?.botName || null,
      };
    }
  } else {
    let intData;
    try { const res = await fetch(API_BASE + '/api/client-integrations?slug=' + slug); intData = await res.json(); clientApiData[slug] = intData; } catch { intData = { dataSources: {}, systemOverrides: {} }; }
    const ds = intData.dataSources || {};
    const so = intData.systemOverrides || {};
    allClientData = { ...ds, ...so };
  }

  let connected = 0, pending = 0, errored = 0, notConfigured = 0;
  for (const [, catData] of Object.entries(catalog.categories)) {
    for (const [apiId, apiMeta] of Object.entries(catData.apis || {})) {
      const own = apiMeta.ownership || 'system';
      const clientStatus = allClientData[apiId];
      const st = clientStatus ? clientStatus.status : 'not_configured';
      if (isGlobal && own === 'client') continue;
      if (own === 'system' && st === 'not_configured' && !isGlobal) { connected++; }
      else if (st === 'connected') { connected++; }
      else if (st === 'pending' || st === 'testing') { pending++; }
      else if (st === 'error' || st === 'expired') { errored++; }
      else { notConfigured++; }
    }
  }

  document.getElementById('client-apis-stats').innerHTML =
    '<div class="card" style="flex:1;min-width:100px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:800;color:var(--green);">' + connected + '</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">🟢 Conectados</div></div>' +
    '<div class="card" style="flex:1;min-width:100px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:800;color:var(--yellow);">' + pending + '</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">🟡 Pendientes</div></div>' +
    '<div class="card" style="flex:1;min-width:100px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:800;color:var(--red);">' + errored + '</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">🔴 Errores</div></div>' +
    '<div class="card" style="flex:1;min-width:100px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:800;color:var(--muted);">' + notConfigured + '</div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">⚫ Sin configurar</div></div>';

  let html = '';
  for (const [catKey, catData] of Object.entries(catalog.categories)) {
    const apis = catData.apis || {};
    if (Object.keys(apis).length === 0) continue;
    html += '<div style="margin-top:20px;margin-bottom:8px;"><h2 style="font-family:\\'Space Grotesk\\',sans-serif;font-size:1.1em;color:var(--rust);">' + catData.label + '</h2></div><div class="grid">';
    for (const [apiId, apiMeta] of Object.entries(apis)) {
      const ownership = apiMeta.ownership || 'system';
      const isSystem = ownership === 'system';
      const clientStatus = allClientData[apiId] || { status: 'not_configured' };
      const isOverridden = isSystem && clientStatus.status === 'connected';
      const isUsingSystemKey = isSystem && !isOverridden;
      let badge, borderStyle;
      if (isGlobal && !isSystem) { badge = { dot: '', label: 'Por cliente', color: 'var(--muted)' }; borderStyle = 'border-left:4px solid var(--border);opacity:0.6;'; }
      else if (isUsingSystemKey) { badge = { dot: 'g', label: 'Key sistema', color: 'var(--blue)' }; borderStyle = 'border-left:4px solid var(--blue);'; }
      else if (clientStatus.status === 'connected') { badge = { dot: 'g', label: isSystem ? 'Key propia' : 'Conectado', color: 'var(--green)' }; borderStyle = 'border-left:4px solid var(--green);'; }
      else if (clientStatus.status === 'error' || clientStatus.status === 'expired') { badge = clientApiStatusBadge(clientStatus.status); borderStyle = 'border-left:4px solid var(--red);'; }
      else if (clientStatus.status === 'pending' || clientStatus.status === 'testing') { badge = clientApiStatusBadge(clientStatus.status); borderStyle = 'border-left:4px solid var(--yellow);'; }
      else { badge = clientApiStatusBadge('not_configured'); borderStyle = isSystem ? 'border-left:4px solid var(--blue);' : 'border-left:4px solid var(--muted);opacity:0.7;'; }
      const lastTested = clientStatus.lastTestedAt ? new Date(clientStatus.lastTestedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '';
      const ownerBadge = isSystem ? '<span style="font-size:10px;background:var(--blue);color:#fff;padding:1px 6px;border-radius:4px;font-weight:600;">SISTEMA</span>' : '<span style="font-size:10px;background:var(--rust);color:#fff;padding:1px 6px;border-radius:4px;font-weight:600;">CLIENTE</span>';
      let notesHtml = '';
      if (clientStatus.notes) notesHtml += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">📝 ' + clientStatus.notes + '</div>';
      if (clientStatus.lastError) notesHtml += '<div style="font-size:12px;color:var(--red);margin-top:4px;word-break:break-word;">❌ ' + (clientStatus.lastError||'').slice(0, 120) + '</div>';
      html += '<div class="card" style="' + borderStyle + '" id="capi-card-' + apiId + '"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div style="font-size:18px;font-weight:700;">' + apiMeta.icon + ' ' + apiMeta.provider + '</div><div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (apiMeta.desc || '') + ' ' + ownerBadge + '</div></div><div style="text-align:right;"><div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;"><span class="dot ' + badge.dot + '"></span><span style="font-size:13px;font-weight:600;color:' + badge.color + ';">' + badge.label + '</span></div>' + (lastTested ? '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + lastTested + '</div>' : '') + '</div></div>' + notesHtml + '<div style="margin-top:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">';
      if (isGlobal && isSystem) {
        html += '<button class="btn-sm" onclick="runSingleHealthCheck(\\'' + apiId + '\\')" id="btn-check-' + apiId + '">🔄 Verificar</button>';
        if (SERVICE_ENV_MAP_FE[apiId]) html += '<button class="btn-sm" onclick="toggleApiSetup(\\'' + apiId + '\\')" id="btn-setup-' + apiId + '">⚙️ ' + (clientStatus.status === 'not_configured' ? 'Configurar' : 'Editar key') + '</button>';
      } else if (!isGlobal && isSystem) {
        if (isOverridden) {
          html += '<a href="' + API_BASE + '/connect/' + slug + '/' + apiId + '" target="_blank" class="btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;">⚙️ Editar key propia</a>';
          html += '<button class="btn-sm" onclick="testClientIntegration(\\'' + apiId + '\\')" id="btn-capi-test-' + apiId + '">🔄 Verificar</button>';
        } else {
          html += '<a href="' + API_BASE + '/connect/' + slug + '/' + apiId + '" target="_blank" class="btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;">🔑 Usar key propia</a>';
        }
      } else if (!isGlobal && !isSystem) {
        html += '<a href="' + API_BASE + '/connect/' + slug + '/' + apiId + '" target="_blank" class="btn-sm" style="text-decoration:none;display:inline-flex;align-items:center;" id="btn-capi-setup-' + apiId + '">⚙️ ' + (clientStatus.status === 'not_configured' ? 'Configurar' : 'Editar') + '</a>';
        html += '<button class="btn-sm" onclick="testClientIntegration(\\'' + apiId + '\\')" id="btn-capi-test-' + apiId + '">🔄 Verificar</button>';
      }
      if (apiMeta.docs) html += '<a href="' + apiMeta.docs + '" target="_blank" style="font-size:11px;color:var(--muted);">📖 Docs</a>';
      html += '</div>';
      if (isGlobal && isSystem) {
        html += '<div id="api-setup-' + apiId + '" style="display:none;margin-top:10px;padding:12px;background:var(--bg);border:2px solid var(--border);border-radius:6px;"><div id="api-setup-fields-' + apiId + '"></div><div style="display:flex;gap:6px;align-items:center;margin-top:8px;"><button class="btn btn-primary" onclick="saveApiKey(\\'' + apiId + '\\')" style="font-size:12px;padding:6px 14px;" id="btn-save-' + apiId + '">💾 Guardar</button><button class="btn-sm" onclick="toggleApiSetup(\\'' + apiId + '\\')">✕ Cerrar</button><span id="api-save-status-' + apiId + '" style="font-size:12px;color:var(--muted);"></span></div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }
  document.getElementById('client-apis-datasources').innerHTML = html;
  const ov = document.getElementById('client-apis-overrides');
  if (ov) ov.innerHTML = '';
}

async function runSingleHealthCheck(serviceId) {
  const btn = document.getElementById('btn-check-' + serviceId);
  if (!btn) return;
  const origText = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳...';
  try {
    const res = await fetch(API_BASE + '/api/health-check?service=' + serviceId);
    const data = await res.json();
    if (data.results && data.results[serviceId]) {
      if (!D.apiHealth) D.apiHealth = { lastCheck: null, services: {} };
      D.apiHealth.services[serviceId] = data.results[serviceId];
      D.apiHealth.lastCheck = data.lastCheck;
      renderApis();
    }
  } catch (e) { console.error('Health check failed:', e); }
  btn.disabled = false; btn.textContent = origText;
}

async function restartGateway() {
  const btn = document.getElementById('btn-restart-gw');
  const status = document.getElementById('client-api-check-status');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Reiniciando...'; }
  if (status) { status.textContent = 'Reiniciando gateway...'; status.style.color = 'var(--muted)'; }
  try {
    const res = await fetch(API_BASE + '/api/restart-gateway');
    const data = await res.json();
    if (data.ok) { if (status) { status.textContent = '✅ Gateway reiniciado.'; status.style.color = 'var(--green)'; } }
    else { if (status) { status.textContent = '⚠️ ' + (data.error||'Error'); status.style.color = 'var(--yellow)'; } }
  } catch (e) { if (status) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--red)'; } }
  if (btn) { btn.disabled = false; btn.textContent = '🔁 Restart Gateway'; }
}

async function toggleApiSetup(serviceId) {
  const panel = document.getElementById('api-setup-' + serviceId);
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? 'block' : 'none';
  if (!isHidden) return;
  const fieldsDiv = document.getElementById('api-setup-fields-' + serviceId);
  if (!fieldsDiv) return;
  fieldsDiv.innerHTML = '<span style="font-size:12px;color:var(--muted);">Cargando...</span>';
  try {
    const res = await fetch(API_BASE + '/api/env?service=' + serviceId);
    const data = await res.json();
    let h = '';
    for (const [key, info] of Object.entries(data)) {
      h += '<div style="margin-bottom:8px;"><label style="display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">' + info.label + ' <code style="font-size:10px;">' + key + '</code></label><div style="display:flex;gap:6px;align-items:center;"><input type="text" id="env-input-' + key + '" placeholder="' + (info.placeholder || key) + '" style="flex:1;padding:6px 10px;background:var(--card);border:2px solid var(--border);border-radius:6px;font-family:\\'Nunito\\',monospace;font-size:13px;color:var(--text);">' + (info.hasValue ? '<span style="font-size:11px;color:var(--muted);" title="' + info.masked + '">✅ ' + info.masked + '</span>' : '<span style="font-size:11px;color:var(--yellow);">⚠️ vacío</span>') + '</div></div>';
    }
    fieldsDiv.innerHTML = h || '<span style="font-size:12px;color:var(--muted);">Este servicio no usa API keys configurables.</span>';
  } catch (e) { fieldsDiv.innerHTML = '<span style="font-size:12px;color:var(--red);">Error: ' + (e.message || '') + '</span>'; }
}

async function saveApiKey(serviceId) {
  const btn = document.getElementById('btn-save-' + serviceId);
  const status = document.getElementById('api-save-status-' + serviceId);
  const fields = SERVICE_ENV_MAP_FE[serviceId] || [];
  if (!fields.length) return;
  const vars = {};
  let hasAny = false;
  for (const key of fields) {
    const input = document.getElementById('env-input-' + key);
    if (input && input.value.trim()) { vars[key] = input.value.trim(); hasAny = true; }
  }
  if (!hasAny) { status.textContent = '⚠️ Escribe al menos un valor'; status.style.color = 'var(--yellow)'; return; }
  btn.disabled = true; btn.textContent = '⏳ Guardando...';
  status.textContent = '';
  try {
    const res = await fetch(API_BASE + '/api/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: serviceId, vars }) });
    const data = await res.json();
    if (data.ok) {
      status.textContent = '✅ Guardado. ' + (data.healthCheck?.results?.[serviceId]?.status === 'ok' ? 'Health check: OK ✅' : 'Health check: ' + (data.healthCheck?.results?.[serviceId]?.status || '?'));
      status.style.color = 'var(--green)';
      if (data.healthCheck?.results?.[serviceId]) {
        if (!D.apiHealth) D.apiHealth = { lastCheck: null, services: {} };
        D.apiHealth.services[serviceId] = data.healthCheck.results[serviceId];
        D.apiHealth.lastCheck = data.healthCheck.lastCheck;
      }
      for (const key of fields) { const input = document.getElementById('env-input-' + key); if (input) input.value = ''; }
      setTimeout(() => { renderApis(); }, 1500);
    } else { status.textContent = '❌ ' + (data.error || 'Error'); status.style.color = 'var(--red)'; }
  } catch (e) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--red)'; }
  btn.disabled = false; btn.textContent = '💾 Guardar';
}

async function testClientIntegration(apiId) {
  const btn = document.getElementById('btn-capi-test-' + apiId) || document.getElementById('btn-capi-test-ov-' + apiId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    const res = await fetch(API_BASE + '/api/client-integrations/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: SLUG, source: apiId }) });
    const data = await res.json();
    if (data.ok) setTimeout(() => renderApis(), 500);
  } catch (e) { console.error('Test failed:', e); }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar'; }
}

async function verifyAllApis() {
  const isGlobal = !SLUG;
  const btn = document.getElementById('btn-client-check-all');
  const status = document.getElementById('client-api-check-status');
  if (isGlobal) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Verificando...'; }
    if (status) { status.textContent = 'Verificando APIs del sistema...'; status.style.color = 'var(--muted)'; }
    try {
      const res = await fetch(API_BASE + '/api/health-check?service=all');
      const data = await res.json();
      if (!data.error) {
        if (!D.apiHealth) D.apiHealth = { lastCheck: null, services: {} };
        D.apiHealth.lastCheck = data.lastCheck;
        for (const [k, v] of Object.entries(data.results)) D.apiHealth.services[k] = v;
        if (status) { status.textContent = '✅ Verificación completa'; status.style.color = 'var(--green)'; }
        renderClientApisView('_global');
      } else { if (status) { status.textContent = '❌ ' + data.error; status.style.color = 'var(--red)'; } }
    } catch (e) { if (status) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--red)'; } }
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar Todo'; }
  } else {
    testAllClientIntegrations();
  }
}

async function testAllClientIntegrations() {
  const btn = document.getElementById('btn-client-check-all');
  const status = document.getElementById('client-api-check-status');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Verificando...'; }
  if (status) status.textContent = 'Verificando todas las integraciones...';
  try {
    const res = await fetch(API_BASE + '/api/client-integrations/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: SLUG, all: true }) });
    const data = await res.json();
    if (data.ok) { if (status) { status.textContent = '✅ Verificación completa'; status.style.color = 'var(--green)'; } setTimeout(() => renderApis(), 500); }
    else { if (status) { status.textContent = '❌ ' + (data.error || 'Error'); status.style.color = 'var(--red)'; } }
  } catch (e) { if (status) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--red)'; } }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Verificar Todo'; }
}

// ============ TAB 2: Agents ============
let _agentSlug = '', _agentFile = '';
function renderAgents() {
  const slugMap = {'Cervantes':'cervantes','Sancho':'sancho','Rocinante':'rocinante','Escudero':'escudero'};
  document.getElementById('agents-list').innerHTML = AGENTS.map(a => {
    const slug = slugMap[a.name] || '';
    const ad = AGENTS_DATA[slug];
    const fileCount = ad ? Object.keys(ad.files).length : 0;
    return '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="openAgentViewer(\\'' + slug + '\\')"><div class="agent-row"><span class="dot g"></span><span style="font-weight:600;min-width:150px;">' + a.emoji + ' ' + a.name + '</span><span style="color:var(--blue);font-size:13px;">' + a.ch + '</span><span style="color:var(--muted);font-size:12px;margin-left:auto;">' + a.model + ' · ' + a.role + ' · ' + fileCount + ' archivos</span></div></div>';
  }).join('');
}

function openAgentViewer(slug) {
  const ad = AGENTS_DATA[slug];
  if (!ad || !ad.files) return;
  const viewer = document.getElementById('agent-file-viewer');
  document.getElementById('agent-viewer-title').textContent = ad.name;
  const files = Object.keys(ad.files);
  const defaultFile = files.includes('SOUL.md') ? 'SOUL.md' : files[0];
  document.getElementById('agent-file-tabs').innerHTML = files.map(f =>
    '<button class="btn-sm agent-tab ' + (f===defaultFile?'active':'') + '" onclick="showAgentFile(\\'' + slug + '\\',\\'' + f + '\\',this)">' + f + '</button>'
  ).join('');
  document.getElementById('agent-file-content').textContent = ad.files[defaultFile] || '';
  _agentSlug = slug; _agentFile = defaultFile;
  viewer.style.display = 'block';
  viewer.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function showAgentFile(slug, fname, el) {
  const ad = AGENTS_DATA[slug];
  document.getElementById('agent-file-content').textContent = ad.files[fname] || '';
  _agentSlug = slug; _agentFile = fname;
  el.parentElement.querySelectorAll('.agent-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function copyAgentPath() {
  const p = '~/.openclaw/workspace-' + _agentSlug + '/' + _agentFile;
  navigator.clipboard.writeText(p).then(() => showToast('📋 Ruta copiada: ' + p));
}

function closeAgentViewer() { document.getElementById('agent-file-viewer').style.display = 'none'; }

// ============ TAB 3: Skills ============
function renderSkills() {
  for (const [cat, skills] of Object.entries(SKILL_CATS)) {
    const el = document.getElementById('sg-' + cat);
    if (!el) continue;
    el.innerHTML = skills.map(s => '<div class="skill-item"><div class="sn">' + s.id + '</div><div class="sd">' + s.sd + '</div></div>').join('');
  }
  // DAG
  const dagEl = document.getElementById('skill-dag');
  const fClients = D ? (D.foundation?.clients || {}) : {};
  const fc = fClients[SLUG] || {};
  const pillarStatuses = {};
  if (fc.sections) {
    for (const sec of Object.values(fc.sections)) {
      if (sec.pillars) { for (const [pn, pv] of Object.entries(sec.pillars)) pillarStatuses[pn] = pv.status; }
    }
  }
  dagEl.innerHTML = DAG_LAYERS.map((layer, i) =>
    (i > 0 ? '<div class="dag-arrow">↓</div>' : '') +
    '<div class="dag-layer"><div class="dag-label" style="color:var(--rust);">' + layer.label + '</div><div class="dag-nodes">' + layer.nodes.map(n => {
      const done = pillarStatuses[n] === 'approved';
      const locked = !done && SKILL_DEPS[n]?.some(dep => pillarStatuses[dep] !== 'approved') && SKILL_DEPS[n]?.length > 0;
      return '<div class="dag-node ' + (done?'done':'') + (locked?' locked':'') + '">' + (done?'✅':'') + (locked?'🔒':'') + ' ' + n + '</div>';
    }).join('') + '</div></div>'
  ).join('');
}

// ============ TAB 4: Dispatch ============
function renderDispatch() {
  const dd = DISPATCH_DATA;
  const el = document.getElementById('dispatch-content');
  if (!el || !dd.channel_roles) { if (el) el.innerHTML = '<div class="card"><p style="color:var(--muted);">No hay datos de dispatch disponibles.</p></div>'; return; }

  let html = '<h3 style="font-family:\\'Space Grotesk\\',sans-serif;font-size:16px;margin-bottom:12px;">📡 Channel Roles</h3>';
  const roleIcons = { decision: '🧭', execution: '⚡', intelligence: '🔍', support: '🛟' };
  for (const [role, data] of Object.entries(dd.channel_roles)) {
    html += '<div class="card dispatch-group"><h3>' + (roleIcons[role]||'') + ' ' + role.charAt(0).toUpperCase() + role.slice(1) + '</h3>';
    html += '<p style="color:var(--muted);font-size:12px;margin-bottom:8px;">' + (data.description || '') + '</p>';
    if (data.channels) {
      for (const ch of data.channels) {
        const rule = data.rules ? data.rules[ch] : '';
        html += '<div class="dispatch-channel"><strong>#' + ch + '</strong>' + (rule ? '<div class="dispatch-rule">' + rule + '</div>' : '') + '</div>';
      }
    }
    html += '</div>';
  }

  if (dd.personas && Array.isArray(dd.personas)) {
    html += '<h3 style="font-family:\\'Space Grotesk\\',sans-serif;font-size:16px;margin:20px 0 12px;">👥 Personas</h3>';
    html += '<div class="grid">';
    for (const p of dd.personas) {
      html += '<div class="persona-card"><h4>' + (p.emoji||'') + ' ' + (p.name||'') + '</h4>';
      if (p.skills) html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;"><strong>Skills:</strong> ' + (Array.isArray(p.skills) ? p.skills.join(', ') : p.skills) + '</div>';
      if (p.brand_context) html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;"><strong>Brand:</strong> ' + p.brand_context + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  if (dd.flow) {
    html += '<div class="card" style="margin-top:16px;"><h3>🔄 Flow</h3><p style="font-size:13px;margin-top:4px;">' + dd.flow + '</p></div>';
  }

  el.innerHTML = html;
}

// ============ TAB 5: Strategies ============
let _strFilter = 'all';
async function renderStrategies() {
  try {
    const res = await fetch(API_BASE + '/api/strategies-catalog');
    window.STRATEGIES_DATA = await res.json();
  } catch { return; }
  if (!STRATEGIES_DATA || !STRATEGIES_DATA.strategies) return;
  renderStrategyList();
}

function renderStrategyList() {
  const clientStrats = (SLUG && STRATEGIES_DATA.clientStrategies?.[SLUG]) || null;
  const clientMap = {};
  if (clientStrats) clientStrats.forEach(cs => clientMap[cs.id] = cs);

  let strats = STRATEGIES_DATA.strategies;
  if (_strFilter === 'active') strats = strats.filter(s => clientMap[s.id]);
  else if (['rapido','medio','lento'].includes(_strFilter)) strats = strats.filter(s => s.velocidad === _strFilter);
  else if (_strFilter !== 'all') strats = strats.filter(s => s.quadrant === _strFilter);

  const listEl = document.getElementById('strategies-list');
  listEl.innerHTML = strats.map(s => {
    const cd = clientMap[s.id];
    const speedIcon = s.velocidad === 'rapido' ? '⚡' : s.velocidad === 'medio' ? '🕐' : '🐢';
    const q = STRATEGIES_DATA.quadrants.find(q => q.id === s.quadrant);
    const scoreBadge = cd ? '<span class="strategy-score">' + cd.score.toFixed(2) + '</span>' : '';
    const activeBadge = cd ? ' str-badge-active' : '';
    const b2bLabel = s.b2b === 'core' ? '✅ Core' : s.b2b === 'adaptacion' ? '⚠️ Adaptación' : '❌ No';
    const b2cLabel = s.b2c === 'core' ? '✅ Core' : s.b2c === 'adaptacion' ? '⚠️ Adaptación' : '❌ No';
    const b2bIcon = s.b2b === 'core' ? '✅' : s.b2b === 'adaptacion' ? '⚠️' : '❌';
    const b2cIcon = s.b2c === 'core' ? '✅' : s.b2c === 'adaptacion' ? '⚠️' : '❌';

    let body = '<div style="display:flex;gap:6px;margin-bottom:10px;"><button class="btn btn-primary" onclick="event.stopPropagation();openStrategyEdit(\\'' + s.id + '\\')" style="font-size:11px;padding:4px 10px;">✏️ Editar</button></div>';
    body += '<div class="str-props"><div><strong>Objetivo:</strong> ' + (s.objetivo||'') + '</div><div><strong>Cuadrante:</strong> ' + (q ? q.icon + ' ' + q.label : '') + '</div><div><strong>Prerequisitos:</strong> ' + (s.prerequisitos||'') + '</div><div><strong>Tiempo:</strong> ' + (s.tiempoResultado||'') + '</div><div><strong>B2B:</strong> ' + b2bLabel + ' · <strong>B2C:</strong> ' + b2cLabel + '</div><div><strong>Sectores:</strong> ' + (s.sectores||[]).join(', ') + '</div><div style="grid-column:1/-1;"><strong>Skills:</strong> ' + (s.skills||[]).map(sk => '<code>' + sk + '</code>').join(' → ') + '</div><div style="grid-column:1/-1;"><strong>Objetivos:</strong> ' + (s.objetivos||[]).map(o => '<span class="str-badge">' + o + '</span>').join(' ') + '</div></div>';
    if (s.workflow) {
      const wf = [{key:'objetivo',label:'0) Objetivo y por qué',icon:'🎯'},{key:'ideacion',label:'1) Ideación',icon:'💡'},{key:'creacion',label:'2) Creación',icon:'🔨'},{key:'ejecucion',label:'3) Ejecución',icon:'🚀'},{key:'medicion',label:'4) Medición',icon:'📊'}];
      for (const sec of wf) { if (!s.workflow[sec.key]) continue; body += '<details style="margin-bottom:4px;"><summary style="cursor:pointer;font-weight:600;font-size:12px;padding:4px 0;">' + sec.icon + ' ' + sec.label + '</summary><div style="padding:6px 10px;background:var(--bg);border-radius:6px;font-size:12px;line-height:1.7;">' + _mdToHtml(s.workflow[sec.key]) + '</div></details>'; }
    }
    if (s.cuandoUsar?.length || s.cuandoNoUsar?.length) {
      body += '<div style="display:flex;gap:8px;margin-top:8px;">';
      if (s.cuandoUsar?.length) body += '<div style="flex:1;padding:6px;background:rgba(76,175,80,0.06);border:1px solid rgba(76,175,80,0.15);border-radius:6px;font-size:11px;"><strong>✅ Usar</strong><ul style="margin:2px 0 0;padding-left:14px;">' + s.cuandoUsar.map(c=>'<li>'+c+'</li>').join('') + '</ul></div>';
      if (s.cuandoNoUsar?.length) body += '<div style="flex:1;padding:6px;background:rgba(244,67,54,0.06);border:1px solid rgba(244,67,54,0.15);border-radius:6px;font-size:11px;"><strong>❌ No usar</strong><ul style="margin:2px 0 0;padding-left:14px;">' + s.cuandoNoUsar.map(c=>'<li>'+c+'</li>').join('') + '</ul></div>';
      body += '</div>';
    }
    if (cd) { body += '<div style="margin-top:8px;padding:8px;border-left:3px solid var(--green);background:rgba(76,175,80,0.04);border-radius:4px;font-size:12px;"><strong>📊 Score ' + cd.score.toFixed(2) + '</strong> — ' + cd.justification + '</div>'; }

    return '<div class="str-row" id="str-row-' + s.id + '"><div class="str-header" onclick="toggleStrategyRow(\\'' + s.id + '\\')"><span class="str-chevron">▶</span><span class="str-id">#' + s.id + '</span><span class="str-name">' + s.name + '</span><span class="str-badges">' + scoreBadge + '<span class="str-badge' + activeBadge + '">' + (q?q.icon:'') + '</span><span class="str-badge">' + speedIcon + '</span><span class="str-badge">B2B' + b2bIcon + '</span><span class="str-badge">B2C' + b2cIcon + '</span></span></div><div class="str-body">' + body + '</div></div>';
  }).join('');

  document.getElementById('strategies-sub').textContent = strats.length + ' estrategias' + (_strFilter !== 'all' ? ' (filtradas)' : '') + ' — Catálogo Hormozi Core Four';
  renderHormoziGrid(clientMap);
}

function renderHormoziGrid(clientMap) {
  const grid = document.getElementById('hormozi-grid');
  if (!grid) return;
  const strats = STRATEGIES_DATA.strategies;
  function cellHtml(qid) {
    return '<div class="hm-cell">' + strats.filter(s => s.quadrant === qid).map(s => {
      const act = clientMap[s.id] ? ' active' : '';
      return '<span class="hm-strat' + act + '" onclick="toggleStrategyRow(\\'' + s.id + '\\')" title="' + s.name + '">#' + s.id + '</span>';
    }).join('') + '</div>';
  }
  grid.innerHTML = '<div class="hormozi-matrix"><div class="hm-header"></div><div class="hm-header">Organic (tiempo)</div><div class="hm-header">Paid (dinero)</div><div class="hm-row-label">ONE-TO-ONE</div>' + cellHtml('1to1-organic') + cellHtml('1to1-paid') + '<div class="hm-row-label">ONE-TO-MANY</div>' + cellHtml('1toN-organic') + cellHtml('1toN-paid') + '</div><div class="hm-transversal"><strong>Transversal:</strong> ' + strats.filter(s => s.quadrant === 'transversal').map(s => {
    const act = clientMap[s.id] ? ' active' : '';
    return '<span class="hm-strat' + act + '" onclick="toggleStrategyRow(\\'' + s.id + '\\')">#' + s.id + ' ' + s.name + '</span>';
  }).join(' · ') + '</div>';
}

function toggleStrategyRow(id) { const row = document.getElementById('str-row-' + id); if (row) row.classList.toggle('open'); }

function filterStrategies(filter, el) {
  _strFilter = filter;
  document.querySelectorAll('#str-filters .str-filter').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderStrategyList();
}

function _mdToHtml(md) {
  if (!md) return '';
  return md.replace(/\\n\\n/g,'<br><br>').replace(/\\n- /g,'<br>• ').replace(/\\n/g,'<br>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/\`([^\`]+)\`/g,'<code>$1</code>');
}

// Strategy Editor
let _strategyEditId = null;

function openStrategyEdit(id) {
  const s = id ? STRATEGIES_DATA.strategies.find(x => x.id === id) : null;
  _strategyEditId = id || null;
  const isNew = !s;
  document.getElementById('se-fs-title').textContent = s ? '✏️ Editar #' + s.id + ' ' + s.name : '🎯 Nueva Estrategia';
  document.getElementById('se-info-panel').style.display = isNew ? 'block' : 'none';
  document.getElementById('se-delete-btn').style.display = s ? 'inline-block' : 'none';
  document.getElementById('se-id').value = s ? s.id : '';
  document.getElementById('se-name').value = s ? s.name : '';
  document.getElementById('se-quadrant').value = s ? s.quadrant : '1to1-organic';
  document.getElementById('se-objetivo').value = s ? s.objetivo : '';
  document.getElementById('se-prerequisitos').value = s ? s.prerequisitos : '';
  document.getElementById('se-tiempo').value = s ? s.tiempoResultado : '';
  document.getElementById('se-b2b').value = s ? s.b2b : 'core';
  document.getElementById('se-b2c').value = s ? s.b2c : 'no';
  document.getElementById('se-velocidad').value = s ? s.velocidad : 'medio';
  document.getElementById('se-sectores').value = s ? s.sectores.join(', ') : '';
  document.getElementById('se-skills').value = s ? s.skills.join(', ') : '';
  ['awareness','lead-gen','conversion','autoridad','retencion','expansion','comunidad'].forEach(o => {
    const cb = document.getElementById('se-obj-' + o);
    if (cb) cb.checked = s ? s.objetivos.includes(o) : false;
  });
  document.getElementById('se-wf-objetivo').value = s?.workflow?.objetivo || '';
  document.getElementById('se-wf-ideacion').value = s?.workflow?.ideacion || '';
  document.getElementById('se-wf-creacion').value = s?.workflow?.creacion || '';
  document.getElementById('se-wf-ejecucion').value = s?.workflow?.ejecucion || '';
  document.getElementById('se-wf-medicion').value = s?.workflow?.medicion || '';
  document.getElementById('se-cuando-si').value = s ? s.cuandoUsar.join('\\n') : '';
  document.getElementById('se-cuando-no').value = s ? s.cuandoNoUsar.join('\\n') : '';
  // Open chat in parent MC via postMessage
  const threadId = SLUG + ':strategy:' + (id || 'new-' + Date.now());
  const threadName = s ? '#' + s.id + ' ' + s.name : 'Nueva Estrategia';
  const chatMsg = isNew
    ? 'Quiero crear una nueva estrategia GTM. Comprueba duplicados con las existentes, investiga tendencias, y guíame para completar los campos.'
    : 'Estoy editando la estrategia #' + s.id + ' ' + s.name + '. ¿Qué quieres modificar?';
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'settings-open-chat', slug: SLUG, threadId, threadName, initialMessage: chatMsg, skill: 'new-strategy' }, '*');
  }
  document.getElementById('strategy-editor-fs').style.display = 'flex';
}

function openStrategyNew() { openStrategyEdit(null); }

async function saveStrategy() {
  const id = document.getElementById('se-id').value.trim();
  if (!id) { showToast('ID es obligatorio'); return; }
  const objetivos = [];
  ['awareness','lead-gen','conversion','autoridad','retencion','expansion','comunidad'].forEach(o => {
    if (document.getElementById('se-obj-' + o)?.checked) objetivos.push(o);
  });
  const entry = {
    id, name: document.getElementById('se-name').value.trim(),
    quadrant: document.getElementById('se-quadrant').value,
    objetivo: document.getElementById('se-objetivo').value.trim(),
    prerequisitos: document.getElementById('se-prerequisitos').value.trim(),
    tiempoResultado: document.getElementById('se-tiempo').value.trim(),
    b2b: document.getElementById('se-b2b').value, b2c: document.getElementById('se-b2c').value,
    sectores: document.getElementById('se-sectores').value.split(',').map(s=>s.trim()).filter(Boolean),
    velocidad: document.getElementById('se-velocidad').value,
    objetivos,
    skills: document.getElementById('se-skills').value.split(',').map(s=>s.trim()).filter(Boolean),
    workflow: { objetivo: document.getElementById('se-wf-objetivo').value, ideacion: document.getElementById('se-wf-ideacion').value, creacion: document.getElementById('se-wf-creacion').value, ejecucion: document.getElementById('se-wf-ejecucion').value, medicion: document.getElementById('se-wf-medicion').value },
    cuandoUsar: document.getElementById('se-cuando-si').value.split('\\n').map(s=>s.trim()).filter(Boolean),
    cuandoNoUsar: document.getElementById('se-cuando-no').value.split('\\n').map(s=>s.trim()).filter(Boolean)
  };
  const idx = STRATEGIES_DATA.strategies.findIndex(s => s.id === _strategyEditId);
  if (idx >= 0) STRATEGIES_DATA.strategies[idx] = entry;
  else STRATEGIES_DATA.strategies.push(entry);
  try {
    const res = await fetch(API_BASE + '/api/strategies-catalog', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(STRATEGIES_DATA) });
    const r = await res.json();
    if (r.ok) { showToast('💾 Estrategia guardada'); closeStrategyEdit(); renderStrategies(); }
    else showToast('Error: ' + (r.error || 'desconocido'));
  } catch(e) { showToast('Error: ' + e.message); }
}

async function deleteStrategy() {
  if (!_strategyEditId) return;
  if (!confirm('¿Eliminar estrategia #' + _strategyEditId + '?')) return;
  STRATEGIES_DATA.strategies = STRATEGIES_DATA.strategies.filter(s => s.id !== _strategyEditId);
  try {
    await fetch(API_BASE + '/api/strategies-catalog', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(STRATEGIES_DATA) });
    showToast('🗑️ Estrategia eliminada');
    closeStrategyEdit();
    renderStrategies();
  } catch(e) { showToast('Error: ' + e.message); }
}

function closeStrategyEdit() { document.getElementById('strategy-editor-fs').style.display = 'none'; }

// ============ TAB 6: Recurring Tasks ============
let _recurringTasksCache = {};
let _allRecurringTasks = [];
let _availableTemplates = [];

async function loadRecurringTasksData() {
  const url = SLUG ? API_BASE + '/api/recurring-tasks?slug=' + SLUG : API_BASE + '/api/recurring-tasks';
  try {
    const res = await fetch(url);
    const data = await res.json();
    _availableTemplates = data._available_templates || [];
    delete data._available_templates;
    if (typeof data === 'object' && !Array.isArray(data)) {
      const flat = [];
      for (const [clientSlug, tasks] of Object.entries(data)) { if (Array.isArray(tasks)) { for (const t of tasks) { t._slug = clientSlug; flat.push(t); } } }
      _recurringTasksCache = flat;
    } else { _recurringTasksCache = data || []; }
  } catch (e) { _recurringTasksCache = []; _availableTemplates = []; }
  renderRecurringTasksPage();
}

function renderRecurringTasksPage() {
  _allRecurringTasks = [];
  const crons = _recurringTasksCache || [];
  const el = document.getElementById('recurring-tasks-content');
  if (!el) return;
  if (crons.length === 0) { el.innerHTML = '<div class="card"><div style="text-align:center;padding:40px;color:var(--muted);">No hay tareas recurrentes para este cliente.</div></div>'; return; }

  for (const c of crons) {
    c.category = c.task_type || c.category || 'other';
    c.enabled = c.status === 'active';
    c.last_run = c.last_run_at;
    c.next_run = c.next_run_at;
    c.duration_ms = c.last_duration_ms;
    c.schedule = c.schedule_raw || c.schedule;
  }

  const CAT = { intelligence:{icon:'🧠',label:'Intelligence'}, metrics:{icon:'📊',label:'Métricas'}, outreach:{icon:'📨',label:'Outreach'}, content:{icon:'✍️',label:'Contenido'}, system:{icon:'⚙️',label:'Sistema'}, other:{icon:'📋',label:'Otros'} };
  function cronToHuman(schedule) {
    if (typeof schedule === 'string') return schedule;
    if (!schedule || (!schedule.expr && !schedule.kind)) return '—';
    if (schedule.kind === 'every') { const hrs = Math.floor(schedule.everyMs / 3600000); if (hrs >= 1) return 'Cada ' + hrs + 'h'; return 'Cada ' + Math.floor(schedule.everyMs / 60000) + ' min'; }
    const e = schedule.expr; if (!e) return '—';
    if (e === '0 9 * * 1-5') return 'L-V 9:00'; if (e === '0 18 * * 1-5') return 'L-V 18:00';
    const m1 = e.match(/^(\\d+) (\\d+) \\* \\* \\*$/); if (m1) return 'Cada día ' + m1[2] + ':' + m1[1].padStart(2,'0');
    return e;
  }
  function relTime(iso) {
    if (!iso) return 'Nunca';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) { const f = -ms; if (f<3600000) return 'En '+Math.floor(f/60000)+' min'; if (f<86400000) return 'En '+Math.floor(f/3600000)+'h'; return 'En '+Math.floor(f/86400000)+'d'; }
    if (ms < 60000) return 'Hace <1 min'; if (ms < 3600000) return 'Hace ' + Math.floor(ms/60000) + ' min';
    if (ms < 86400000) return 'Hace ' + Math.floor(ms/3600000) + 'h'; return 'Hace ' + Math.floor(ms/86400000) + 'd';
  }
  function fmtDur(ms) { if (!ms) return '—'; if (ms < 1000) return ms + 'ms'; if (ms < 60000) return Math.round(ms/1000) + 's'; return Math.floor(ms/60000) + 'm ' + Math.round((ms%60000)/1000) + 's'; }
  function statusDot(s) { const colors = { ok: '#4A5D23', error: '#C0392B', idle: '#888' }; const c = colors[s] || '#888'; return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+c+';margin-right:4px;" title="'+(s||'idle')+'"></span>'; }

  const groups = {};
  const catOrder = ['intelligence','metrics','outreach','content','system','other'];
  for (const c of crons) { const cat = c.category || 'other'; if (!groups[cat]) groups[cat] = []; groups[cat].push(c); }
  const slugs = new Set(crons.map(c => c.client_slug).filter(Boolean));
  const showClient = slugs.size > 1;

  let html = '';
  let first = true;
  for (const cat of catOrder) {
    const items = groups[cat];
    if (!items || items.length === 0) continue;
    const cfg = CAT[cat] || CAT.other;
    const gid = 'cron-' + cat;
    html += '<div style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:2px solid var(--border);margin-top:' + (first ? '0' : '16') + 'px;" onclick="toggleIdeaGroup(\\'' + gid + '\\')">';
    html += '<span id="chevron-' + gid + '" style="font-size:12px;">' + (first ? '▾' : '▸') + '</span>';
    html += '<span style="font-family:\\'Space Grotesk\\';font-size:16px;font-weight:600;color:var(--navy);">' + cfg.icon + ' ' + cfg.label + ' (' + items.length + ')</span></div>';
    html += '<div id="group-' + gid + '" style="' + (first ? '' : 'max-height:0px;overflow:hidden;') + 'transition:max-height 0.3s;">';
    html += '<table class="idea-table"><thead><tr style="background:var(--bg);"><th style="width:30px;"></th><th>Nombre</th>';
    if (showClient) html += '<th>Cliente</th>';
    html += '<th>Frecuencia</th><th style="text-align:center;">Último run</th><th style="text-align:center;">Próximo</th><th style="text-align:center;">Duración</th><th style="text-align:center;">Acciones</th><th style="text-align:center;">Activo</th></tr></thead><tbody>';
    for (const c of items) {
      const isOn = c.enabled;
      const hasPrompt = c.prompt && c.prompt.length > 0;
      const hasScripts = c.scripts && c.scripts.length > 0;
      const globalIdx = _allRecurringTasks.length;
      _allRecurringTasks.push(c);
      html += '<tr style="border-bottom:1px solid var(--border);' + (!isOn ? 'opacity:0.5;' : '') + '">';
      html += '<td style="text-align:center;">' + statusDot(c.last_status) + '</td>';
      html += '<td style="font-weight:600;">' + (c.name || '—') + (c.consecutive_errors > 0 ? ' <span style="color:#C0392B;font-size:11px;">(' + c.consecutive_errors + ' errores)</span>' : '') + '</td>';
      if (showClient) html += '<td style="color:var(--muted);">' + (c.client_slug || '—') + '</td>';
      html += '<td style="color:var(--muted);">' + cronToHuman(c.schedule) + '</td>';
      html += '<td style="text-align:center;font-size:12px;color:var(--muted);">' + relTime(c.last_run) + '</td>';
      html += '<td style="text-align:center;font-size:12px;color:var(--muted);">' + relTime(c.next_run) + '</td>';
      html += '<td style="text-align:center;font-size:12px;color:var(--muted);">' + fmtDur(c.duration_ms) + '</td>';
      html += '<td style="text-align:center;display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">';
      if (hasPrompt) html += '<button onclick="openPromptModal(' + globalIdx + ')" style="background:none;border:1px solid var(--border);color:var(--text);padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;" title="Ver/editar prompt">📜</button>';
      if (hasScripts) { for (let si = 0; si < c.scripts.length; si++) { const s = c.scripts[si]; html += '<button onclick="openScriptModal(' + globalIdx + ',' + si + ')" style="background:none;border:1px solid #C45D35;color:#C45D35;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;" title="' + s.name + ' (' + s.lines + ' líneas)">📄 ' + s.name + '</button>'; } }
      html += '</td>';
      html += '<td style="text-align:center;"><label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;"><input type="checkbox" ' + (isOn ? 'checked' : '') + ' onchange="toggleCronJob(\\'' + c.id + '\\',this.checked)" style="opacity:0;width:0;height:0;"><span style="position:absolute;inset:0;background:' + (isOn ? '#4A5D23' : 'var(--border)') + ';border-radius:22px;transition:.3s;"></span><span style="position:absolute;top:2px;left:' + (isOn ? '20px' : '2px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,.3);"></span></label></td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    first = false;
  }
  // Available templates section
  if (_availableTemplates && _availableTemplates.length > 0) {
    html += '<div style="margin-top:24px;padding-top:16px;border-top:2px solid var(--border);">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="font-size:16px;">⏸</span><span style="font-family:\\'Space Grotesk\\',sans-serif;font-size:16px;font-weight:600;color:var(--navy);">Disponibles (' + _availableTemplates.length + ')</span></div>';
    html += '<p style="color:var(--muted);font-size:13px;margin-bottom:16px;">Estas tareas recurrentes se pueden activar cuando configures las integraciones necesarias.</p>';
    for (const tmpl of _availableTemplates) {
      html += '<div class="card" style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;">';
      html += '<div>';
      html += '<div style="font-weight:600;font-size:14px;">' + (tmpl.name || tmpl.template_key).replace('{NAME}', SLUG ? _recurringTasksCache[0]?._slug || '' : '') + '</div>';
      if (tmpl.description) html += '<div style="color:var(--muted);font-size:12px;margin-top:2px;">' + tmpl.description + '</div>';
      if (tmpl.requires) html += '<div style="font-size:12px;margin-top:4px;"><strong>Requiere:</strong> ' + tmpl.requires + '</div>';
      if (tmpl.p00_task) html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">→ Tarea: ' + tmpl.p00_task + '</div>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

function toggleIdeaGroup(groupId) {
  const content = document.getElementById('group-' + groupId);
  const chevron = document.getElementById('chevron-' + groupId);
  if (!content || !chevron) return;
  if (content.style.maxHeight && content.style.maxHeight !== '0px') { content.style.maxHeight = '0px'; content.style.overflow = 'hidden'; chevron.textContent = '▸'; }
  else { content.style.maxHeight = content.scrollHeight + 'px'; content.style.overflow = 'visible'; chevron.textContent = '▾'; }
}

async function toggleCronJob(cronId, enable) {
  try { await fetch(API_BASE + '/api/crons/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cronId, enable }) }); await loadRecurringTasksData(); } catch (e) { console.error('Error toggling cron:', e); }
}

function showCreateRecurringTaskForm() {
  const threadId = SLUG + ':recurring:new-' + Date.now();
  // Tell parent MC to open the chat sidebar with this thread
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'settings-open-chat',
      slug: SLUG,
      threadId: threadId,
      threadName: 'Nueva tarea recurrente',
      initialMessage: 'Quiero crear una nueva tarea recurrente. Pregúntame qué quiero automatizar y ayúdame a definir: nombre, categoría, frecuencia, agente y prompt. Cuando tengamos todo claro, crea la tarea.',
      skill: 'recurring-tasks'
    }, '*');
    showToast('💬 Abriendo chat con Sancho...');
  } else {
    showToast('Chat no disponible en modo standalone');
  }
}

// Prompt Modal
let _promptModalTask = null, _promptModalIdx = -1, _promptEditing = false;
function openPromptModal(taskIdx) {
  const task = _allRecurringTasks[taskIdx]; if (!task) return;
  _promptModalTask = task; _promptModalIdx = taskIdx; _promptEditing = false;
  document.getElementById('prompt-modal-title').textContent = task.name || '—';
  document.getElementById('prompt-modal-meta').textContent = (task.agent||'sancho') + ' · ' + (task.model||'—') + ' · ' + (task.schedule||'—') + ' · ' + (task._slug||'sistema');
  document.getElementById('prompt-modal-view').textContent = task.prompt || '(sin prompt)';
  document.getElementById('prompt-modal-editor').value = task.prompt || '';
  document.getElementById('prompt-modal-view').style.display = '';
  document.getElementById('prompt-modal-editor').style.display = 'none';
  document.getElementById('prompt-modal-actions').style.display = 'none';
  document.getElementById('prompt-modal-edit-btn').style.display = '';
  document.getElementById('prompt-modal-overlay').style.display = 'flex';
}
function closePromptModal() { document.getElementById('prompt-modal-overlay').style.display = 'none'; _promptModalTask = null; _promptEditing = false; }
function togglePromptEdit() {
  _promptEditing = !_promptEditing;
  document.getElementById('prompt-modal-view').style.display = _promptEditing ? 'none' : '';
  document.getElementById('prompt-modal-editor').style.display = _promptEditing ? '' : 'none';
  document.getElementById('prompt-modal-actions').style.display = _promptEditing ? '' : 'none';
  document.getElementById('prompt-modal-edit-btn').textContent = _promptEditing ? '👁️ Vista previa' : '✏️ Editar';
  if (_promptEditing) { const editor = document.getElementById('prompt-modal-editor'); editor.focus(); editor.setSelectionRange(0, 0); }
}
function cancelPromptEdit() { document.getElementById('prompt-modal-editor').value = _promptModalTask?.prompt || ''; togglePromptEdit(); }
async function savePromptEdit() {
  if (!_promptModalTask) return;
  const newPrompt = document.getElementById('prompt-modal-editor').value.trim();
  if (!newPrompt) { alert('El prompt no puede estar vacío'); return; }
  const btn = document.querySelector('#prompt-modal-actions button:last-child');
  btn.textContent = '⏳ Guardando...'; btn.disabled = true;
  try {
    const res = await fetch(API_BASE + '/api/recurring-tasks/update-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: _promptModalTask.id, prompt: newPrompt }) });
    const data = await res.json();
    if (data.ok) { _promptModalTask.prompt = newPrompt; document.getElementById('prompt-modal-view').textContent = newPrompt; togglePromptEdit(); loadRecurringTasksData(); }
    else { alert('Error: ' + (data.error || 'No se pudo guardar')); }
  } catch (e) { alert('Error de red: ' + e.message); } finally { btn.textContent = '💾 Guardar'; btn.disabled = false; }
}

// Script Modal
let _scriptModalTask = null, _scriptModalScript = null, _scriptEditing = false, _scriptOriginalContent = '';
async function openScriptModal(taskIdx, scriptIdx) {
  const task = _allRecurringTasks[taskIdx]; if (!task || !task.scripts || !task.scripts[scriptIdx]) return;
  _scriptModalTask = task; _scriptModalScript = task.scripts[scriptIdx]; _scriptEditing = false;
  const s = _scriptModalScript;
  const langColors = { python: '#3776AB', bash: '#4EAA25', javascript: '#F7DF1E' };
  document.getElementById('script-modal-title').textContent = s.name;
  document.getElementById('script-modal-lines').textContent = s.lines + ' líneas';
  const badge = document.getElementById('script-modal-lang-badge');
  badge.textContent = s.lang; badge.style.background = langColors[s.lang] || '#666'; badge.style.color = s.lang === 'javascript' ? '#000' : '#fff';
  document.getElementById('script-modal-view').textContent = '⏳ Cargando...';
  document.getElementById('script-modal-editor').style.display = 'none';
  document.getElementById('script-modal-actions').style.display = 'none';
  document.getElementById('script-modal-edit-btn').textContent = '✏️ Editar';
  document.getElementById('script-modal-overlay').style.display = 'flex';
  try {
    const res = await fetch(API_BASE + '/api/recurring-tasks/script?path=' + encodeURIComponent(s.path));
    const data = await res.json();
    if (data.ok) { _scriptOriginalContent = data.content; document.getElementById('script-modal-view').textContent = data.content; document.getElementById('script-modal-editor').value = data.content; document.getElementById('script-modal-lines').textContent = data.lines + ' líneas'; }
    else { document.getElementById('script-modal-view').textContent = '❌ Error: ' + (data.error || 'No se pudo cargar'); }
  } catch (e) { document.getElementById('script-modal-view').textContent = '❌ Error de red: ' + e.message; }
}
function closeScriptModal() { document.getElementById('script-modal-overlay').style.display = 'none'; _scriptModalTask = null; _scriptModalScript = null; _scriptEditing = false; }
function toggleScriptEdit() {
  _scriptEditing = !_scriptEditing;
  document.getElementById('script-modal-view').style.display = _scriptEditing ? 'none' : '';
  document.getElementById('script-modal-editor').style.display = _scriptEditing ? '' : 'none';
  document.getElementById('script-modal-actions').style.display = _scriptEditing ? 'flex' : 'none';
  document.getElementById('script-modal-edit-btn').textContent = _scriptEditing ? '👁️ Vista previa' : '✏️ Editar';
  document.getElementById('script-modal-status').textContent = _scriptModalScript ? _scriptModalScript.path : '';
  if (_scriptEditing) { document.getElementById('script-modal-editor').focus(); }
  else { document.getElementById('script-modal-view').textContent = document.getElementById('script-modal-editor').value; }
}
function cancelScriptEdit() { document.getElementById('script-modal-editor').value = _scriptOriginalContent; if (_scriptEditing) toggleScriptEdit(); }
async function saveScriptEdit() {
  if (!_scriptModalScript) return;
  const newContent = document.getElementById('script-modal-editor').value;
  if (!newContent.trim()) { alert('El script no puede estar vacío'); return; }
  const btn = document.getElementById('script-save-btn');
  btn.textContent = '⏳ Guardando...'; btn.disabled = true;
  try {
    const res = await fetch(API_BASE + '/api/recurring-tasks/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: _scriptModalScript.path, content: newContent }) });
    const data = await res.json();
    if (data.ok) { _scriptOriginalContent = newContent; document.getElementById('script-modal-view').textContent = newContent; document.getElementById('script-modal-lines').textContent = data.lines + ' líneas'; document.getElementById('script-modal-status').textContent = '✅ Guardado (backup creado)'; toggleScriptEdit(); loadRecurringTasksData(); }
    else { alert('Error: ' + (data.error || 'No se pudo guardar')); }
  } catch (e) { alert('Error de red: ' + e.message); } finally { btn.textContent = '💾 Guardar'; btn.disabled = false; }
}

// ============ TAB 7: Preferences ============
function loadPreferences() {
  const name = localStorage.getItem('mc-user-name') || '';
  const lang = localStorage.getItem('mc-lang') || 'es';
  const theme = localStorage.getItem('mc-theme') || 'auto';
  document.getElementById('pref-username').value = name;
  document.getElementById('pref-lang').value = lang;
  document.getElementById('pref-theme').value = theme;
}

function savePref(key, value) {
  localStorage.setItem(key, value);
  showToast('✅ Preferencia guardada');
}

// ============ INIT ============
const urlTab = new URLSearchParams(window.location.search).get('tab');
const savedTab = urlTab || localStorage.getItem('mc-settings-tab') || 'apis';
switchSettingsTab(savedTab);
renderApis();
renderAgents();
renderSkills();
renderDispatch();
renderStrategies();
loadRecurringTasksData();
loadPreferences();
<\/script>
</body></html>`;
}

function portalPage(title, clientName, content) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — ${clientName}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--green:#4A5D23;}
@media(prefers-color-scheme:dark){:root{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--green:#6B8E23;}}
*{box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);max-width:1200px;margin:0 auto;padding:24px 40px;line-height:1.85;font-size:17px;}
h1{font-family:'Space Grotesk',sans-serif;color:var(--rust);font-size:2em;margin-bottom:4px;}
h2{font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:24px 0 12px;font-size:1.4em;}
h3{color:var(--rust);}
a{color:var(--rust);text-decoration:none;font-weight:700;}a:hover{text-decoration:underline;}
.card{margin:8px 0;padding:10px 14px;background:var(--card);border:2px solid var(--ink);border-radius:6px;box-shadow:3px 3px 0 var(--ink);}
.card a{font-size:16px;}.card .meta{color:var(--muted);font-size:13px;margin-top:2px;}
.back{font-size:14px;color:var(--muted);font-weight:400;}
.header-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid var(--border);}
.client-badge{font-family:'Space Grotesk',sans-serif;font-size:13px;padding:4px 12px;background:var(--ink);color:var(--card);border-radius:20px;}
table{border-collapse:collapse;width:100%;margin:12px 0;}
th,td{border:2px solid var(--ink);padding:10px 14px;text-align:left;font-size:16px;}
th{background:var(--ink);color:var(--card);font-family:'Space Grotesk',sans-serif;}
tr:nth-child(even){background:var(--card);}
code{background:var(--card);padding:2px 6px;border-radius:4px;font-size:13px;border:1px solid var(--border);}
pre{background:var(--card);padding:12px;border:2px solid var(--ink);border-radius:6px;overflow-x:auto;font-size:13px;}
blockquote{border-left:4px solid var(--rust);margin:12px 0;padding:8px 16px;background:var(--card);font-style:italic;}
</style>
</head><body>
<div class="header-bar">
  <h1>${clientName}</h1>
  <span class="client-badge">Portal del Cliente</span>
</div>
${content}
</body></html>`;
}

function portalForbiddenPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Acceso denegado</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&family=Nunito:wght@400;600&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',sans-serif;background:#F5F0E6;color:#1A1A2E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{text-align:center;padding:48px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:8px;box-shadow:3px 3px 0 #1A1A2E;max-width:400px;}
h1{font-family:'Space Grotesk',sans-serif;color:#C45D35;font-size:2em;margin:0 0 12px;}
p{color:#5D5348;font-size:16px;margin:0;}
</style></head><body>
<div class="box"><h1>🔒 Acceso denegado</h1><p>El enlace no es válido o ha expirado.<br/>Contacta a tu equipo de Growth para obtener acceso.</p></div>
</body></html>`;
}

// ========== End Portal Helpers ==========

// ========== MC-CHAT CHANNEL: Message store + endpoints ==========
// Stores bot responses from the mc-chat plugin callback and provides
// endpoints for the frontend to send messages and poll for responses.

const MC_CHAT_SECRET = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(BASE, '..', 'openclaw.json'), 'utf-8'));
    return cfg.channels?.['mc-chat']?.sharedSecret || '';
  } catch { return ''; }
})();
const MC_CHAT_GATEWAY = 'http://127.0.0.1:18789';

// Disk-backed message store per thread
// Threads stored at brand/{slug}/chat/{shortId}.json
// In-memory cache for fast reads, flushed to disk on every write
const mcChatCache = new Map();
const mcChatStatusCache = new Map(); // threadId → { text, agent, ts } — live status from gateway
const mcChatCancelledThreads = new Set(); // threads cancelled by user — discard next bot response
const MC_CHAT_MAX_MSGS = 200; // max messages per thread

function mcChatThreadPath(threadId) {
  // threadId format: "slug:shortId" or "slug:type:id"
  const colonIdx = threadId.indexOf(':');
  if (colonIdx < 0) return null;
  const slug = threadId.slice(0, colonIdx);
  const shortId = threadId.slice(colonIdx + 1);
  // Sanitize shortId for filesystem (replace : with -, remove dangerous chars)
  const safeId = shortId.replace(/:/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
  const dir = path.join(BASE, 'brand', slug, 'chat');
  return { dir, file: path.join(dir, safeId + '.json'), slug, shortId: safeId };
}

function mcChatLoadThread(threadId) {
  // Check cache first
  if (mcChatCache.has(threadId)) return mcChatCache.get(threadId);
  // Try disk
  const p = mcChatThreadPath(threadId);
  if (!p) return { messages: [], updatedAt: Date.now() };
  try {
    if (fs.existsSync(p.file)) {
      const data = JSON.parse(fs.readFileSync(p.file, 'utf-8'));
      mcChatCache.set(threadId, data);
      return data;
    }
  } catch (e) { console.error('[mc-chat] Load error:', p.file, e.message); }
  return { messages: [], updatedAt: Date.now(), discordThreadId: null, discordChannelId: null };
}

function mcChatSaveThread(threadId, thread) {
  const p = mcChatThreadPath(threadId);
  if (!p) return;
  try {
    if (!fs.existsSync(p.dir)) fs.mkdirSync(p.dir, { recursive: true });
    fs.writeFileSync(p.file, JSON.stringify(thread, null, 2));
    mcChatCache.set(threadId, thread);
  } catch (e) { console.error('[mc-chat] Save error:', p.file, e.message); }
}

function mcChatGetThread(threadId) {
  return mcChatLoadThread(threadId);
}

// ========== PROJECT NOTIFICATIONS ==========
// Fire-and-forget notification when task/project status changes
function notifyProjectChange(slug, change) {
  // change: { type: 'task'|'project', id, name, oldStatus, newStatus, projectId?, projectName?, outputFiles? }
  const clients = loadClients();
  const client = clients.find(c => c.slug === slug);
  if (!client) return;

  const mcToken = client.mcToken;
  const mcBase = `https://sancho-cmo.taild48df2.ts.net/mc/portal/${mcToken}`;
  const statusEmoji = { completed:'✅', done:'✅', archived:'📦', cancelled:'❌', blocked:'⛔', 'in-progress':'🔧', todo:'📋', ready:'📋' };
  const statusLabel = { completed:'Completado', done:'Completado', archived:'Archivado', cancelled:'Cancelado', blocked:'Bloqueado', 'in-progress':'En progreso', todo:'Por hacer', ready:'Listo' };

  let notifText = '';
  if (change.type === 'task' && (change.newStatus === 'completed' || change.newStatus === 'done')) {
    // Task completed — include links to output files
    const projectsDir = path.join(BASE, 'brand', slug, 'projects');
    const projId = change.id.split('-').slice(0, 1).join('-');
    const taskNum = change.id.split('-').slice(1).join('-');
    // Check if task has a playbook
    let playbookLink = '';
    try {
      const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      const pf = dirs.find(d => d.isDirectory() && d.name.startsWith(projId + '-'));
      if (pf) {
        const taskDir = path.join(projectsDir, pf.name, taskNum);
        if (fs.existsSync(path.join(taskDir, 'playbook.md'))) {
          playbookLink = `\n📖 **Playbook:** <${mcBase}/docs/brand/${slug}/projects/${pf.name}/${taskNum}/playbook.md>`;
        }
      }
    } catch {}
    notifText = `${statusEmoji[change.newStatus] || '🔔'} **${change.id}** — ${change.name || 'Tarea'} → ${statusLabel[change.newStatus] || change.newStatus}${playbookLink}\n🔗 **Proyectos:** <${mcBase}/projects/>`;
  } else if (change.type === 'project') {
    notifText = `${statusEmoji[change.newStatus] || '🔔'} **${change.id}** — ${change.name || 'Proyecto'} → ${statusLabel[change.newStatus] || change.newStatus}\n🔗 **Proyectos:** <${mcBase}/projects/>`;
  } else {
    // Other status changes
    notifText = `${statusEmoji[change.newStatus] || '🔔'} **${change.id}** → ${statusLabel[change.newStatus] || change.newStatus}`;
  }

  // 1. Notify MC Chat thread — use sourceThread if provided, otherwise find most recent active thread
  const sourceThread = change.sourceThread; // e.g. "growth4u:threads/mn58q5se-dr32"
  if (sourceThread) {
    try { mcChatAddMessage(sourceThread, 'assistant', notifText, 'sancho'); } catch {}
  } else {
    // Find most recent active chat thread for this client
    try {
      const chatDir = path.join(BASE, 'brand', slug, 'chat', 'threads');
      if (fs.existsSync(chatDir)) {
        const files = fs.readdirSync(chatDir).filter(f => f.endsWith('.json')).map(f => {
          const stat = fs.statSync(path.join(chatDir, f));
          return { file: f, mtime: stat.mtimeMs };
        }).sort((a, b) => b.mtime - a.mtime);
        if (files.length > 0) {
          const recentId = slug + ':threads/' + files[0].file.replace('.json', '');
          mcChatAddMessage(recentId, 'assistant', notifText, 'sancho');
        }
      }
    } catch {}
  }

  // 2. Resolve Discord thread ID from the task/project JSON
  let discordThreadId = null;
  try {
    const projectsDir = path.join(BASE, 'brand', slug, 'projects');
    if (change.type === 'task') {
      const projId = change.id.split('-').slice(0, 1).join('-');
      const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      const pf = dirs.find(d => d.isDirectory() && d.name.startsWith(projId + '-'));
      if (pf) {
        const tf = path.join(projectsDir, pf.name, 'tasks.json');
        const tasks = JSON.parse(fs.readFileSync(tf, 'utf-8'));
        const arr = Array.isArray(tasks) ? tasks : (tasks.tasks || []);
        const task = arr.find(t => t.id === change.id);
        discordThreadId = task?.discord_thread_id || null;
      }
    } else {
      const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      const pf = dirs.find(d => d.isDirectory() && d.name.startsWith(change.id + '-'));
      if (pf) {
        const proj = JSON.parse(fs.readFileSync(path.join(projectsDir, pf.name, 'project.json'), 'utf-8'));
        discordThreadId = proj?.discord?.project_thread_id || null;
      }
    }
  } catch {}

  // Store notification with discord_thread_id so Sancho sends to the right thread
  try {
    const queueFile = path.join(BASE, '_system', 'notification-queue.jsonl');
    const entry = JSON.stringify({ ts: new Date().toISOString(), slug, ...change, text: notifText, discordThreadId }) + '\n';
    fs.appendFileSync(queueFile, entry);
  } catch {}
}
// ========== END PROJECT NOTIFICATIONS ==========

function mcChatAddMessage(threadId, role, text, agent) {
  const thread = mcChatLoadThread(threadId);
  const msg = { role, text, agent: agent || undefined, ts: new Date().toISOString() };
  thread.messages.push(msg);
  // Trim old messages
  if (thread.messages.length > MC_CHAT_MAX_MSGS) {
    thread.messages = thread.messages.slice(-MC_CHAT_MAX_MSGS);
  }
  thread.updatedAt = Date.now();
  mcChatSaveThread(threadId, thread);
  return msg;
}

const mcServer = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.startsWith('/mc/')) url = url.slice(3);

  // Normalize admin/portal API paths early so mc-chat handlers see clean URLs
  if (url.startsWith('/admin/')) {
    const adminParts = url.replace('/admin/', '').split('/');
    const earlyToken = adminParts[0];
    if (isValidAdmin(earlyToken)) {
      req._adminToken = earlyToken;
      req._adminBase = `/mc/admin/${earlyToken}`;
    }
    const apiIdx = url.indexOf('/api/');
    const webhookIdx = url.indexOf('/webhook/');
    if (apiIdx !== -1) url = url.slice(apiIdx);
    else if (webhookIdx !== -1) url = url.slice(webhookIdx);
  }
  if (url.startsWith('/portal/')) {
    const portalParts = url.replace('/portal/', '').split('/');
    const earlyToken = portalParts[0];
    const client = findClientByToken(earlyToken);
    if (client) {
      req._portalClient = client;
      req._portalSlug = client.slug;
    }
    const apiIdx = url.indexOf('/api/');
    if (apiIdx !== -1) url = url.slice(apiIdx);
  }

  // ========== MC-CHAT WEBHOOK: Bot response callback ==========
  // Plugin sends bot responses here when Sancho replies
  if (req.method === 'POST' && (url === '/webhook/mc-chat/response' || url === '/mc/webhook/mc-chat/response')) {
    // Verify shared secret
    if (MC_CHAT_SECRET && req.headers['x-mc-secret'] !== MC_CHAT_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 500000) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, threadId, text, agent, ts, role } = JSON.parse(body);
        const tid = threadId || `${slug || 'default'}:general`;

        // Status updates: cache for polling, don't store in messages
        if (role === 'status') {
          mcChatStatusCache.set(tid, { text, agent, ts: Date.now() });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // Bot response: clear status + store message (unless cancelled)
        mcChatStatusCache.delete(tid);
        if (mcChatCancelledThreads.has(tid)) {
          mcChatCancelledThreads.delete(tid);
          console.log(`[mc-chat] Bot response discarded (cancelled): ${tid}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, cancelled: true }));
          return;
        }
        mcChatAddMessage(tid, 'bot', text, agent);
        console.log(`[mc-chat] Bot response → ${tid}: ${(text || '').slice(0, 60)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, messageId: `mc-${Date.now()}` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ========== MC-CHAT API: Send message from frontend ==========
  // Cancel: send /stop to gateway to abort the running agent + discard response
  if (req.method === 'POST' && (url === '/api/mc-chat/cancel' || url === '/mc/api/mc-chat/cancel')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { slug, threadId } = JSON.parse(body);
        const tid = threadId || slug;
        mcChatCancelledThreads.add(tid);
        mcChatStatusCache.delete(tid);
        console.log(`[mc-chat] Cancelling thread: ${tid}`);
        // Send /stop to gateway — OpenClaw recognizes it as abort phrase
        try {
          await fetch(`${MC_CHAT_GATEWAY}/mc-chat/inbound`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(MC_CHAT_SECRET ? { 'X-MC-Secret': MC_CHAT_SECRET } : {}),
            },
            body: JSON.stringify({ slug, threadId, text: '/stop', userName: 'Admin' }),
          });
        } catch (gwErr) {
          console.error(`[mc-chat] Gateway /stop failed: ${gwErr.message}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && (url === '/api/mc-chat/send' || url === '/mc/api/mc-chat/send')) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, threadId, threadName, text, userName, linkedTo, skill, skills, threadState, docPath } = JSON.parse(body);
        if (!slug || !text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug or text' }));
          return;
        }
        const tid = threadId || `${slug}:general`;
        // Store user message locally
        mcChatAddMessage(tid, 'user', text);
        // Determine if sender is admin (adminToken) or client (portalToken)
        const isAdmin = Boolean(req._adminToken);
        const senderRole = isAdmin ? 'admin' : 'client';
        // Forward to Gateway mc-chat plugin inbound webhook
        const payload = JSON.stringify({
          slug,
          threadId: tid,
          threadName: threadName || tid,
          text,
          userId: isAdmin ? 'mc-admin' : `mc-client-${slug}`,
          userName: userName || (isAdmin ? 'Admin' : slug),
          linkedTo: linkedTo || undefined,
          skill: skill || undefined,
          skills: skills || undefined,
          threadState: threadState || undefined,
          docPath: docPath || undefined,
          isAdmin,
          senderRole,
        });
        fetch(`${MC_CHAT_GATEWAY}/mc-chat/inbound`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(MC_CHAT_SECRET ? { 'X-MC-Secret': MC_CHAT_SECRET } : {}),
          },
          body: payload,
        }).then(r => r.json()).then(data => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, chatId: data.chatId || tid }));
        }).catch(err => {
          console.error('[mc-chat] Forward error:', err.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Gateway unreachable: ' + err.message }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ========== MC-CHAT API: Link Discord thread to MC thread ==========
  if (req.method === 'POST' && (url === '/api/mc-chat/link-discord' || url === '/mc/api/mc-chat/link-discord')) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', () => {
      try {
        const { threadId, discordThreadId, discordChannelId } = JSON.parse(body);
        if (!threadId || !discordThreadId || !discordChannelId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing threadId, discordThreadId, or discordChannelId' }));
          return;
        }
        const thread = mcChatGetThread(threadId);
        thread.discordThreadId = discordThreadId;
        thread.discordChannelId = discordChannelId;
        mcChatSaveThread(threadId, thread);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, threadId, discordThreadId, discordChannelId }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ========== DISCORD API: Create thread (via OpenClaw message tool) ==========
  if (req.method === 'POST' && (url === '/api/discord/thread-create' || url === '/mc/api/discord/thread-create')) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { guild, channel, name, message } = JSON.parse(body);
        if (!guild || !channel || !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing guild, channel, or name' }));
          return;
        }
        // Call gateway plugin endpoint to create Discord thread
        const threadRes = await fetch(`${MC_CHAT_GATEWAY}/mc-chat/create-discord-thread`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: channel,
            name,
            initialMessage: message || `🔗 Thread sincronizado con Mission Control`,
          }),
        });
        const threadData = await threadRes.json();
        if (threadData.ok && threadData.threadId) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, threadId: threadData.threadId, channelId: channel }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Thread creation failed', details: threadData }));
        }
      } catch (e) {
        console.error('[mc-server] Discord thread creation error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ========== MC-CHAT API: Find MC thread by Discord thread ID ==========
  if (req.method === 'GET' && (url.startsWith('/api/mc-chat/find-by-discord/') || url.startsWith('/mc/api/mc-chat/find-by-discord/'))) {
    const cleanUrl = url.replace('/mc/api/mc-chat/find-by-discord/', '/api/mc-chat/find-by-discord/');
    const discordThreadId = decodeURIComponent(cleanUrl.replace('/api/mc-chat/find-by-discord/', '').split('?')[0]);
    if (!discordThreadId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing discordThreadId' }));
      return;
    }
    // Search all chat files for this discordThreadId
    try {
      const clients = loadClients();
      for (const client of clients) {
        const chatDir = path.join(BASE, 'brand', client.slug, 'chat');
        if (!fs.existsSync(chatDir)) continue;
        const files = fs.readdirSync(chatDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const threadData = JSON.parse(fs.readFileSync(path.join(chatDir, file), 'utf-8'));
          if (threadData.discordThreadId === discordThreadId) {
            // Found it — reconstruct threadId from slug + filename
            const shortId = file.replace('.json', '');
            const threadId = `${client.slug}:${shortId}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, threadId, slug: client.slug }));
            return;
          }
        }
      }
      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No MC thread linked to this Discord thread' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ========== MC-CHAT API: Get raw doc content (for pinned docs) ==========
  if (req.method === 'GET' && (url.startsWith('/api/mc-chat/doc/') || url.startsWith('/mc/api/mc-chat/doc/'))) {
    const cleanUrl = url.replace('/mc/api/mc-chat/doc/', '/api/mc-chat/doc/');
    const docPath = decodeURIComponent(cleanUrl.replace('/api/mc-chat/doc/', '').split('?')[0]);
    if (!docPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path' }));
      return;
    }
    // Only allow reading from brand/ directory
    const fullPath = path.join(BASE, 'brand', docPath);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(path.join(BASE, 'brand')))) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: docPath, content }));
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    }
    return;
  }

  // ========== MC-CHAT API: List threads for a client ==========
  if (req.method === 'GET' && (url.startsWith('/api/mc-chat/threads/') || url.startsWith('/mc/api/mc-chat/threads/'))) {
    const cleanUrl = url.replace('/mc/api/mc-chat/threads/', '/api/mc-chat/threads/');
    const slug = decodeURIComponent(cleanUrl.replace('/api/mc-chat/threads/', '').split('?')[0]);
    const threads = [];
    // Read from disk
    const chatDir = path.join(BASE, 'brand', slug, 'chat');
    try {
      if (fs.existsSync(chatDir)) {
        for (const f of fs.readdirSync(chatDir).filter(f => f.endsWith('.json'))) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(chatDir, f), 'utf-8'));
            const shortId = f.replace('.json', '');
            const tid = slug + ':' + shortId;
            const msgs = data.messages || [];
            const last = msgs[msgs.length - 1];
            threads.push({
              id: tid,
              shortId,
              name: shortId.replace(/-/g, ' '),
              messageCount: msgs.length,
              updatedAt: data.updatedAt || 0,
              lastMessage: last ? { role: last.role, text: (last.text || '').slice(0, 80), ts: last.ts } : null,
            });
          } catch {}
        }
      }
    } catch {}
    threads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, slug, threads }));
    return;
  }

  // ========== MC-CHAT API: Get thread messages ==========
  if (req.method === 'GET' && (url.startsWith('/api/mc-chat/thread/') || url.startsWith('/mc/api/mc-chat/thread/'))) {
    const cleanUrl = url.replace('/mc/api/mc-chat/thread/', '/api/mc-chat/thread/');
    const threadId = decodeURIComponent(cleanUrl.replace('/api/mc-chat/thread/', '').split('?')[0]);
    if (!threadId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing threadId' }));
      return;
    }
    const thread = mcChatGetThread(threadId);
    const statusEntry = mcChatStatusCache.get(threadId) || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, threadId, messages: thread?.messages || [], status: statusEntry }));
    return;
  }

  // ========== ACCESS CONTROL ==========
  // Root / landing page (no token)
  if (url === '/' || url === '/mc') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(landingPage());
    return;
  }

  // Admin routes: /admin/{token}/... → rewrite to original MC routes
  if (url.startsWith('/admin/')) {
    const adminParts = url.replace('/admin/', '').split('/');
    const token = adminParts[0];
    if (!isValidAdmin(token)) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }
    // Rewrite URL: strip /admin/{token} prefix, pass through to existing handlers
    const rest = '/' + adminParts.slice(1).join('/');
    url = rest === '/' ? '/mission-control.html' : rest;
    // Tag the request as admin so static files and APIs work
    req._adminToken = token;
    req._adminBase = `/mc/admin/${token}`;
    // No-cache for HTML to prevent stale sidebar/JS
    if (url === '/mission-control.html' || url.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Wrap res.writeHead + res.end to auto-rewrite /mc/ links in HTML responses
    let _isHtml = false;
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function(code, headers) {
      if (headers) {
        const ct = headers['Content-Type'] || headers['content-type'] || '';
        if (ct.includes('text/html')) _isHtml = true;
      }
      return origWriteHead(code, headers);
    };
    const origEnd = res.end.bind(res);
    res.end = function(data, encoding) {
      if (data && _isHtml && req._adminBase) {
        const text = (typeof data === 'string' ? data : data.toString('utf-8'))
          .replace(/\/mc\/(?!admin\/|portal\/)/g, req._adminBase + '/')
          .replace(/href="\/mc#/g, `href="${req._adminBase}/#`)
          .replace(/href="\/mc"/g, `href="${req._adminBase}/"`);
        return origEnd(text, 'utf-8');
      }
      return origEnd(data, encoding);
    };
  }

  // Block unauthenticated access to admin assets and APIs
  // Allow: /portal/*, /admin/* (handled above), / (landing)
  // Block everything else (mission-control.html, /docs/*, /api/*, /connect/*, /brand/*)
  if (!req._adminToken && !url.startsWith('/portal/') && !url.startsWith('/connect/') && !url.startsWith('/api/') && !req._portalClient) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(portalForbiddenPage());
    return;
  }

  // ========== PORTAL ROUTES ==========
  if (url.startsWith('/portal/')) {
    const portalParts = url.replace('/portal/', '').split('/');
    const token = portalParts[0];
    const client = findClientByToken(token);

    if (!client) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }

    const slug = client.slug;
    const clientName = client.name || slug;
    const portalBase = `/mc/portal/${token}`;
    const portalPath = '/' + portalParts.slice(1).join('/'); // path after token

    // Portal: Root dashboard — serve real MC HTML with portal injection
    if (portalPath === '/' || portalPath === '') {
      try {
        let html = fs.readFileSync(path.join(BASE, 'mission-control.html'), 'utf-8');
        // Rewrite /mc/ links to portal base
        html = html.replace(/\/mc\/(?!admin\/|portal\/)/g, portalBase + '/');
        // Inject portal config before </head>
        const portalScript = `<script>
window.PORTAL_MODE = true;
window.PORTAL_SLUG = '${slug}';
window.PORTAL_CLIENT = '${clientName.replace(/'/g, "\\'")}';
window.PORTAL_BASE = '${portalBase}';
</script>
<style>
/* Portal mode: hide admin-only sections via CSS */
nav .nav-footer { display:none !important; }
</style>`;
        // Also inject a script at the end of body to auto-select client after all JS is loaded
        const portalPostScript = `<script>
(function() {
  // Hide admin-only nav links
  document.querySelectorAll('nav a').forEach(function(a) {
    var text = a.textContent.trim().toLowerCase();
    if (['agentes','skills','activity','changelog','¿cómo empezar?'].some(function(h){return text.includes(h);})) {
      a.style.display = 'none';
    }
  });
  // Hide system section headers
  document.querySelectorAll('.ns').forEach(function(el) {
    var text = el.textContent.trim().toLowerCase();
    if (text.includes('sistema') || text.includes('system') || text.includes('tools') || text.includes('herramientas')) {
      el.style.display = 'none';
    }
  });
  // Hide regenerate/wizard
  document.querySelectorAll('[onclick*="regenerate"]').forEach(function(el) { el.style.display = 'none'; });
  // Force client selection
  var sel = document.getElementById('clientSelector');
  if (sel) {
    sel.value = '${slug}';
    sel.style.display = 'none';
    if (typeof switchClient === 'function') switchClient('${slug}');
  }
})();
</script>`;
        html = html.replace('</head>', portalScript + '\n</head>');
        html = html.replace('</body>', portalPostScript + '\n</body>');
        res.writeHead(200, { 
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(html);
      } catch (e) {
        res.writeHead(500); res.end('Error loading dashboard: ' + e.message);
      }
      return;
    }

    // Portal: Serve filtered clients.js (only this client)
    if (portalPath === '/clients.js') {
      try {
        const allClients = fs.readFileSync(path.join(BASE, 'clients.js'), 'utf-8');
        // Parse the CLIENTS object, extract only this client
        const clientsData = loadClients();
        const thisClient = clientsData.find(c => c.slug === slug);
        const clientObj = {};
        if (thisClient) {
          clientObj[slug] = {
            name: thisClient.name || slug,
            emoji: thisClient.emoji || '🏢',
            url: thisClient.url || '',
            discord_guild: thisClient.guild || '',
            supabase: thisClient.supabase || {},
            workspace: thisClient.workspace || '',
            phase: thisClient.phase || 0,
          };
        }
        const js = `const CLIENTS = ${JSON.stringify(clientObj, null, 2)};`;
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(js);
      } catch (e) {
        res.writeHead(500); res.end('// error: ' + e.message);
      }
      return;
    }

    // Portal: Serve mc-data.js filtered for this client only
    if (portalPath === '/mc-data.js') {
      try {
        let js = fs.readFileSync(path.join(BASE, 'mc-data.js'), 'utf-8');
        // Parse MC_DATA, filter to only this client's data
        // mc-data.js is: const MC_DATA = { ... };
        const match = js.match(/const MC_DATA\s*=\s*(\{[\s\S]*\})\s*;/);
        if (match) {
          const data = JSON.parse(match[1]);
          // Filter foundation.clients to only this slug
          if (data.foundation && data.foundation.clients) {
            const fc = data.foundation.clients[slug];
            data.foundation.clients = fc ? { [slug]: fc } : {};
          }
          // Filter clients array if it exists
          if (Array.isArray(data.clients)) {
            data.clients = data.clients.filter(c => c.slug === slug);
          }
          // Remove cost data (admin only)
          delete data.costs;
          delete data.costsByClient;
          // Remove apiHealth details for other clients
          js = 'const MC_DATA = ' + JSON.stringify(data) + ';';
        }
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(js);
      } catch (e) {
        res.writeHead(500); res.end('// error: ' + e.message);
      }
      return;
    }

    // Portal: Serve other allowed static JS files
    if (portalPath === '/skills-data.js' || portalPath === '/agents-data.js') {
      const filePath = path.join(BASE, portalPath.slice(1));
      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(data);
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end('// not found');
      }
      return;
    }

    // Portal: Projects dashboard
    if (portalPath === '/projects' || portalPath === '/projects/') {
      const guildId = client.guild || client.discord_guild_id || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(buildProjectsPage(slug, portalBase, clientName, guildId));
      return;
    }

    // Portal: Trust Engine dashboard
    if (portalPath === '/trust-engine' || portalPath === '/trust-engine/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(buildTrustEnginePage(slug, portalBase, clientName));
      return;
    }

    // Portal: Settings dashboard
    if (portalPath === '/settings' || portalPath === '/settings/') {
      const guildId = client.guild || client.discord_guild_id || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(buildSettingsPage(slug, portalBase, clientName, guildId));
      return;
    }

    // Portal: Trust Engine save API
    if (portalPath === '/trust-engine/api/save' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { module: mod, arrayKey, itemId, field, value } = JSON.parse(body);
          const teDir = path.join(BASE, 'brand', slug, 'trust-engine');
          const fileMap = { recommendations: 'recommendations.json', keywords: 'keywords.json', influencers: 'influencers.json' };
          const fname = fileMap[mod];
          if (!fname) { res.writeHead(400); res.end(JSON.stringify({ error: 'Unknown module' })); return; }
          const fpath = path.join(teDir, fname);
          const data = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
          const arr = (data.data || data)[arrayKey] || [];
          const item = arr.find(i => i.id === itemId);
          if (item) {
            item[field] = value;
            item.edited_by_human = true;
            data.updated_at = new Date().toISOString();
            fs.writeFileSync(fpath, JSON.stringify(data, null, 2));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Item not found' }));
          }
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Portal: Docs — route through main handler with scoping
    if (portalPath.startsWith('/docs/')) {
      req._portalClient = client;
      req._portalSlug = slug;
      req._portalBase = portalBase;
      url = portalPath;
      // Fall through to main docs handler (which has portal scoping)
    }

    // Portal: Connect pages (scoped to client slug)
    else if (portalPath.startsWith('/connect/')) {
      const apiId = portalPath.replace('/connect/', '').replace(/\/$/, '');
      req._portalClient = client;
      req._portalSlug = slug;
      req._portalBase = portalBase;
      url = `/connect/${slug}/${apiId}`;
      // Wrap res to rewrite /mc/ links in connect page HTML to portal base
      const _isHtmlC = { v: false };
      const origWHC = res.writeHead.bind(res);
      res.writeHead = function(code, headers) {
        if (headers) {
          const ct = headers['Content-Type'] || headers['content-type'] || '';
          if (ct.includes('text/html')) _isHtmlC.v = true;
        }
        return origWHC(code, headers);
      };
      const origEndC = res.end.bind(res);
      res.end = function(data, encoding) {
        if (data && _isHtmlC.v && portalBase) {
          const text = (typeof data === 'string' ? data : data.toString('utf-8'))
            .replace(/\/mc\/(?!admin\/|portal\/)/g, portalBase + '/')
            .replace(/href="\/mc"/g, `href="${portalBase}/"`);
          return origEndC(text, 'utf-8');
        }
        return origEndC(data, encoding);
      };
      // Fall through to existing connect handler
    }

    // Portal: API passthrough (scoped to client)
    else if (portalPath.startsWith('/api/')) {
      req._portalClient = client;
      req._portalSlug = slug;

      // Allowed APIs for portal clients
      const allowedApis = [
        '/api/client-integrations/catalog',
        '/api/client-integrations/test',
        '/api/client-integrations',
        '/api/api-health',
        '/api/health-check',
        '/api/system-sa',
        '/api/projects/task-status',
        '/api/projects/task-update',
        '/api/projects/project-update',
        '/api/projects/project-archive',
        '/api/projects/',
        '/api/metrics',
        '/api/metrics-plan',
        '/api/metrics-chat',
        '/api/metrics-collect',
        '/api/pagespeed',
        '/api/chat/threads',
        '/api/chat/thread',
        '/api/chat/send',
        '/api/ideas',
        '/api/ideas/status',
        '/api/notifications',
        '/api/notifications/sent',
        '/api/recurring-tasks',
        '/api/recurring-tasks/toggle',
        '/api/crons',
        '/api/crons/toggle',
        '/api/cron-runs',
        '/api/monitoring',
        '/api/monitoring/recommendation-action',
      ];
      const apiPath = portalPath.split('?')[0];
      const isAllowed = allowedApis.some(a => apiPath === a || apiPath.startsWith(a + '/') || apiPath.startsWith(a + '?'));

      // Block dangerous APIs
      const blockedApis = ['/api/env', '/api/restart-gateway', '/api/integration'];
      const isBlocked = blockedApis.some(a => apiPath === a || apiPath.startsWith(a));

      if (isBlocked) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not available in portal mode' }));
        return;
      }

      if (isAllowed) {
        // Force slug parameter for client-integrations calls
        if (apiPath.startsWith('/api/client-integrations') && !apiPath.includes('catalog')) {
          const qs = req.url.includes('?') ? '&' : '?';
          req.url = req.url.replace(/slug=[^&]*/, '').replace(/[?&]$/, '') + qs + 'slug=' + slug;
        }
        url = portalPath;
        // Fall through to existing handlers
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API not found' }));
        return;
      }
    }
    else {
      // Any other portal path: 404
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalPage('No encontrado', clientName, '<p>Página no encontrada.</p><a href="' + portalBase + '/">← Volver al dashboard</a>'));
      return;
    }
  }
  // ========== END PORTAL ROUTES ==========

  // === API: Ideas (Idea Bank) ===
  // GET /api/notifications?slug=X — returns unsent notifications
  if (req.method === 'GET' && url.startsWith('/api/notifications')) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const params = new URL('http://x' + req.url).searchParams;
    const slugParam = params.get('slug');
    const result = {};
    if (slugParam) {
      const notifsFile = path.join(BASE, 'brand', slugParam, 'idea-generation', 'notifications.json');
      try { result[slugParam] = JSON.parse(fs.readFileSync(notifsFile, 'utf-8')).filter(n => !n.sent); } catch { result[slugParam] = []; }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, notifications: result }));
    return;
  }

  // POST /api/notifications/sent — mark notifications as sent { slug, ids: [...] }
  if (req.method === 'POST' && url === '/api/notifications/sent') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, ids } = JSON.parse(body);
        if (!slug || !ids || !Array.isArray(ids)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or ids array' })); return; }
        const notifsFile = path.join(BASE, 'brand', slug, 'idea-generation', 'notifications.json');
        let notifs = [];
        try { notifs = JSON.parse(fs.readFileSync(notifsFile, 'utf-8')); } catch {}
        let marked = 0;
        notifs.forEach(n => { if (ids.includes(n.id)) { n.sent = true; marked++; } });
        fs.writeFileSync(notifsFile, JSON.stringify(notifs, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, marked }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // ── Strategies Catalog API ──
  if (req.method === 'GET' && url === '/api/strategies-catalog') {
    const catalogPath = path.join(BASE, 'skills', 'strategic-plan', 'references', 'strategies-catalog.json');
    try {
      const data = fs.readFileSync(catalogPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"strategies":[],"quadrants":[],"clientStrategies":{}}');
    }
    return;
  }

  if (req.method === 'POST' && url === '/api/strategies-catalog') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const catalogPath = path.join(BASE, 'skills', 'strategic-plan', 'references', 'strategies-catalog.json');
        fs.writeFileSync(catalogPath, JSON.stringify(data, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && url.startsWith('/api/ideas')) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const params = new URL('http://x' + req.url).searchParams;
    let slugParam = params.get('slug');
    if (req._portalClient) slugParam = req._portalSlug;
    const projectFilter = params.get('project'); // filter by project ID
    const unassigned = params.get('unassigned') === 'true'; // only unassigned ideas
    let result = {};
    if (slugParam) {
      let ideas = loadIdeas(slugParam);
      if (projectFilter) ideas = ideas.filter(i => (i.project_ids || []).includes(projectFilter));
      else if (unassigned) ideas = ideas.filter(i => !i.project_ids || i.project_ids.length === 0);
      result[slugParam] = ideas;
    } else {
      const clients = loadClients();
      for (const c of clients) {
        if (c.slug) {
          let ideas = loadIdeas(c.slug);
          if (projectFilter) ideas = ideas.filter(i => (i.project_ids || []).includes(projectFilter));
          else if (unassigned) ideas = ideas.filter(i => !i.project_ids || i.project_ids.length === 0);
          result[c.slug] = ideas;
        }
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  if (req.method === 'POST' && url === '/api/ideas') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        let { slug, idea } = JSON.parse(body);
        if (!slug || !idea) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or idea' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const ideas = loadIdeas(slug);
        const existingIdx = idea.id ? ideas.findIndex(i => i.id === idea.id) : -1;
        if (existingIdx >= 0) {
          idea.updated_at = new Date().toISOString();
          Object.assign(ideas[existingIdx], idea);
          idea = ideas[existingIdx];
        } else {
          idea.id = idea.id || crypto.randomUUID();
          idea.created_at = idea.created_at || new Date().toISOString();
          idea.status = idea.status || 'pool';
          idea.project_ids = idea.project_ids || [];
          idea.pieces = idea.pieces || [];
          ideas.push(idea);
        }
        saveIdeas(slug, ideas);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, idea }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url === '/api/ideas/status') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, ideaId, status, approvedBy } = JSON.parse(body);
        if (!slug || !ideaId || !status) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug, ideaId, or status' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const ideas = loadIdeas(slug);
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Idea not found' })); return; }
        const oldStatus = idea.status;
        idea.status = status;
        if (status === 'approved') { idea.approved_at = new Date().toISOString(); idea.approved_by = approvedBy || null; }
        saveIdeas(slug, ideas);

        // Write to notification queue on approve
        if (status === 'approved') {
          const notifsFile = path.join(BASE, 'brand', slug, 'idea-generation', 'notifications.json');
          let notifs = [];
          try { notifs = JSON.parse(fs.readFileSync(notifsFile, 'utf-8')); } catch {}
          notifs.push({
            id: crypto.randomUUID(),
            type: 'idea_approved',
            ideaId: idea.id,
            ideaTitle: idea.title,
            ideaType: idea.type,
            channels: idea.channels || (idea.target_channel ? [idea.target_channel] : []),
            approvedBy: approvedBy || 'admin',
            timestamp: new Date().toISOString(),
            sent: false
          });
          const notifsDir = path.join(BASE, 'brand', slug, 'idea-generation');
          fs.mkdirSync(notifsDir, { recursive: true });
          fs.writeFileSync(notifsFile, JSON.stringify(notifs, null, 2));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ideaId, oldStatus, newStatus: status }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  // POST /api/foundation/pillar-status — update a pillar's status in foundation-state.json
  if (req.method === 'POST' && url === '/api/foundation/pillar-status') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, section, pillar, status, comment } = JSON.parse(body);
        if (!slug || !section || !pillar || !status) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug, section, pillar, or status' }));
          return;
        }
        if (req._portalClient && req._portalSlug !== slug) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
        const validStatuses = ['approved', 'pending-review', 'not-started', 'in-progress', 'generated', 'request-changes', 'request-refresh'];
        if (!validStatuses.includes(status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid status: ' + status }));
          return;
        }
        const stateFile = path.join(BASE, 'brand', slug, 'foundation-state.json');
        if (!fs.existsSync(stateFile)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'foundation-state.json not found' }));
          return;
        }
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        const sec = (state.sections || {})[section];
        if (!sec) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Section not found: ' + section }));
          return;
        }
        const pillars = sec.pillars || sec.skills || {};
        if (!pillars[pillar]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Pillar not found: ' + pillar }));
          return;
        }
        const oldStatus = pillars[pillar].status;
        pillars[pillar].status = status;
        pillars[pillar].updated_at = new Date().toISOString();
        if (comment) pillars[pillar].comment = comment;
        if (status === 'approved') pillars[pillar].approved_at = new Date().toISOString();
        safeWriteFoundationState(stateFile, state);

        // Regenerate mc-data.js
        try {
          const { execSync } = require('child_process');
          execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 });
        } catch (e) { console.error('[mc-server] regenerate after pillar status change failed:', e.message); }

        // Sync: update matching P00 foundation task status
        const PILLAR_TO_TASK = {'approved':'completed','in-progress':'in-progress','not-started':'todo','pending-review':'in-progress','generated':'in-progress'};
        const syncTaskStatus = PILLAR_TO_TASK[status] || 'todo';
        try {
          const projectsDir = path.join(BASE, 'brand', slug, 'projects');
          if (fs.existsSync(projectsDir)) {
            const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('P00'));
            for (const d of dirs) {
              const tf = path.join(projectsDir, d.name, 'tasks.json');
              if (!fs.existsSync(tf)) continue;
              const td = JSON.parse(fs.readFileSync(tf, 'utf-8'));
              const tasks = Array.isArray(td) ? td : (td.tasks || []);
              const match = tasks.find(t => t.pillar === pillar);
              if (match && match.status !== syncTaskStatus) {
                match.status = syncTaskStatus;
                if (syncTaskStatus === 'completed') match.completed = new Date().toISOString().slice(0, 10);
                const wd = Array.isArray(td) ? tasks : { ...td, tasks };
                fs.writeFileSync(tf, JSON.stringify(wd, null, 2));
              }
            }
          }
        } catch (e) { console.error('[mc-server] sync pillar→task failed:', e.message); }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, slug, section, pillar, oldStatus, newStatus: status }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'DELETE' && url === '/api/ideas') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, ideaId } = JSON.parse(body);
        if (!slug || !ideaId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or ideaId' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        let ideas = loadIdeas(slug);
        const len = ideas.length;
        ideas = ideas.filter(i => i.id !== ideaId);
        if (ideas.length === len) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Idea not found' })); return; }
        saveIdeas(slug, ideas);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /api/ideas/assign — add/remove project_ids on an idea (many-to-many)
  if (req.method === 'POST' && url === '/api/ideas/assign') {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, ideaId, addProjects, removeProjects } = JSON.parse(body);
        if (!slug || !ideaId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or ideaId' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const ideas = loadIdeas(slug);
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Idea not found' })); return; }
        if (!idea.project_ids) idea.project_ids = [];
        if (addProjects) {
          for (const pid of addProjects) {
            if (!idea.project_ids.includes(pid)) idea.project_ids.push(pid);
          }
        }
        if (removeProjects) {
          idea.project_ids = idea.project_ids.filter(pid => !removeProjects.includes(pid));
        }
        idea.updated_at = new Date().toISOString();
        saveIdeas(slug, ideas);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ideaId, project_ids: idea.project_ids }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /api/ideas/add-piece — add a piece (execution) to an idea
  if (req.method === 'POST' && url === '/api/ideas/add-piece') {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, ideaId, piece } = JSON.parse(body);
        if (!slug || !ideaId || !piece) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug, ideaId, or piece' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const ideas = loadIdeas(slug);
        const idea = ideas.find(i => i.id === ideaId);
        if (!idea) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Idea not found' })); return; }
        if (!idea.pieces) idea.pieces = [];
        piece.id = piece.id || crypto.randomUUID();
        piece.created_at = piece.created_at || new Date().toISOString();
        piece.status = piece.status || 'draft';
        idea.pieces.push(piece);
        idea.updated_at = new Date().toISOString();
        saveIdeas(slug, ideas);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, ideaId, piece }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /api/projects/create-batch — create a batch task from selected pool ideas
  if (req.method === 'POST' && url === '/api/projects/create-batch') {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, projectId, name, batchType, ideaIds } = JSON.parse(body);
        if (!slug || !projectId || !name || !ideaIds || !ideaIds.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug, projectId, name, or ideaIds' }));
          return;
        }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }

        // Find the project directory
        const projDir = path.join(BASE, 'brand', slug, 'projects');
        const resolvedDir = resolveProjectDir(projDir, projectId);
        if (!resolvedDir) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project not found: ' + projectId })); return; }

        // Load tasks and generate next task ID
        const tasksFile = path.join(resolvedDir, 'tasks.json');
        let tasks = [];
        try { tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } catch {}
        const maxNum = tasks.reduce((m, t) => {
          const match = t.id.match(/-T(\d+)$/);
          return match ? Math.max(m, parseInt(match[1])) : m;
        }, 0);
        const taskId = `${projectId}-T${String(maxNum + 1).padStart(2, '0')}`;

        // Create the batch task
        const batchTask = {
          id: taskId,
          name,
          description: `Batch con ${ideaIds.length} ideas`,
          batch_type: batchType || 'mixed',
          idea_ids: ideaIds,
          created_by: 'manual',
          status: 'todo',
          channel: batchType === 'outreach' ? 'prospecting' : 'content',
          owner: 'Sancho',
        };
        tasks.push(batchTask);
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

        // Update ideas: set status to 'assigned' and link batch_id
        const ideas = loadIdeas(slug);
        for (const idea of ideas) {
          if (ideaIds.includes(idea.id)) {
            idea.status = 'assigned';
            idea.updated_at = new Date().toISOString();
            // Also set batch_id on pieces that belong to this project
            if (idea.pieces) {
              for (const p of idea.pieces) {
                if (!p.task_id) p.task_id = taskId;
              }
            }
          }
        }
        saveIdeas(slug, ideas);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, task: batchTask, assignedCount: ideaIds.length }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /api/ideas/create-task — create task from selected ideas (existing or new project)
  if (req.method === 'POST' && url === '/api/ideas/create-task') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, ideaIds, taskName, taskType, projectId, newProjectName } = JSON.parse(body);
        if (!slug || !ideaIds?.length || !taskName) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing required fields' })); return; }

        const brandDir = path.join(BASE, 'brand', slug);
        const projsDir = path.join(brandDir, 'projects');
        let targetProjDir;
        let targetProjId;

        if (newProjectName) {
          // Create new project
          const existingProjs = fs.existsSync(projsDir) ? fs.readdirSync(projsDir).filter(d => d.startsWith('P')) : [];
          const maxNum = existingProjs.reduce((m, d) => { const n = parseInt(d.match(/^P(\d+)/)?.[1] || '0'); return Math.max(m, n); }, 0);
          targetProjId = 'P' + String(maxNum + 1).padStart(2, '0');
          const projSlug = newProjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const dirName = targetProjId + '-' + projSlug;
          targetProjDir = path.join(projsDir, dirName);
          fs.mkdirSync(targetProjDir, { recursive: true });
          fs.writeFileSync(path.join(targetProjDir, 'project.json'), JSON.stringify({
            id: targetProjId, name: newProjectName, slug: projSlug,
            type: taskType || 'content', status: 'active',
            created_at: new Date().toISOString()
          }, null, 2));
          fs.writeFileSync(path.join(targetProjDir, 'tasks.json'), JSON.stringify([], null, 2));
        } else {
          // Existing project
          targetProjId = projectId;
          const resolved = resolveProjectDir(projsDir, projectId);
          if (!resolved) { res.writeHead(404); res.end(JSON.stringify({ error: 'Project not found: ' + projectId })); return; }
          targetProjDir = resolved;
        }

        // Load tasks and generate next ID
        const tasksFile = path.join(targetProjDir, 'tasks.json');
        let tasks = [];
        try { tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } catch {}
        if (!Array.isArray(tasks)) tasks = [];
        const maxTaskNum = tasks.reduce((m, t) => { const match = (t.id||'').match(/-T(\d+)$/); return match ? Math.max(m, parseInt(match[1])) : m; }, 0);
        const taskId = targetProjId + '-T' + String(maxTaskNum + 1).padStart(2, '0');

        // Create task with ideas as pieces
        const task = {
          id: taskId, name: taskName,
          description: ideaIds.length + ' ideas seleccionadas',
          type: taskType || 'content',
          idea_ids: ideaIds,
          status: 'todo', owner: 'Sancho',
          created_at: new Date().toISOString()
        };
        tasks.push(task);
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

        // Update ideas status to assigned
        const ideas = loadIdeas(slug);
        for (const idea of ideas) {
          if (ideaIds.includes(idea.id)) {
            idea.status = 'assigned';
            idea.updated_at = new Date().toISOString();
            if (!idea.project_ids) idea.project_ids = [];
            if (!idea.project_ids.includes(targetProjId)) idea.project_ids.push(targetProjId);
          }
        }
        saveIdeas(slug, ideas);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, taskId, projectId: targetProjId }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // POST /api/projects/run-outreach-pipeline — run enrichment pipeline on outreach contacts
  if (req.method === 'POST' && url === '/api/projects/run-outreach-pipeline') {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, projectId, taskId, ideaIds } = JSON.parse(body);
        if (!slug || !taskId || !ideaIds || !ideaIds.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug, taskId, or ideaIds' }));
          return;
        }

        // Update pipeline_status on each idea to 'finding_dm' (first step)
        const ideas = loadIdeas(slug);
        let queued = 0;
        for (const idea of ideas) {
          if (ideaIds.includes(idea.id) && (!idea.pipeline_status || idea.pipeline_status === 'pending')) {
            idea.pipeline_status = 'finding_dm';
            idea.pipeline_started_at = new Date().toISOString();
            queued++;
          }
        }
        saveIdeas(slug, ideas);

        // TODO: In the future, this will trigger actual skill execution:
        // 1. Run decision-maker-finder skill for each company
        // 2. Run contact-enrichment skill for each decision maker
        // 3. Run outreach-sequence-builder for the batch
        // For now, we just set the initial status and the agent handles the rest via chat

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, queued, taskId }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Recurring Tasks ===
  // === Trust Engine API ===
  if (req.method === 'GET' && url.startsWith('/api/trust-engine/')) {
    const params = new URL('http://x' + req.url.replace(/.*?(\/api\/trust-engine\/)/, '/api/trust-engine/')).searchParams;
    const slug = params.get('slug');
    if (!slug) { res.writeHead(400); res.end(JSON.stringify({ error: 'slug required' })); return; }
    const teDir = path.join(BASE, 'brand', slug, 'trust-engine');

    if (url.startsWith('/api/trust-engine/run-state')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(teDir, 'run-state.json'), 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ modules: {} }));
      }
      return;
    }

    if (url.startsWith('/api/trust-engine/module')) {
      const file = params.get('file');
      if (!file || file.includes('..')) { res.writeHead(400); res.end(JSON.stringify({ error: 'invalid file' })); return; }
      try {
        const data = JSON.parse(fs.readFileSync(path.join(teDir, file), 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch {
        res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
      }
      return;
    }

    res.writeHead(404); res.end(JSON.stringify({ error: 'unknown endpoint' }));
    return;
  }

  if (req.method === 'GET' && url.startsWith('/api/recurring-tasks')) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const params = new URL('http://x' + url.replace(/^\/api\/recurring-tasks/, '/api/recurring-tasks')).searchParams;
    let slugParam = params.get('slug') || new URL('http://x' + req.url).searchParams.get('slug');
    if (req._portalClient) slugParam = req._portalSlug;
    let result = {};
    if (slugParam) {
      result[slugParam] = loadRecurringTasks(slugParam);
      // Also return available (not-yet-created) templates for this client
      try {
        const templatesFile = path.join(BASE, '_system', 'cron-templates.json');
        const templates = JSON.parse(fs.readFileSync(templatesFile, 'utf-8'));
        const activeCrons = result[slugParam] || [];
        const activeNames = activeCrons.map(c => (c.name || '').toLowerCase());
        const available = [];
        for (const [key, tmpl] of Object.entries(templates)) {
          if (key === '$comment') continue;
          if (tmpl.auto_onboarding) continue; // already created at onboarding
          const cronName = (tmpl.name_template || '').replace('{NAME}', '').toLowerCase().trim().replace(/\s*[—–-]\s*$/, '');
          const isActive = activeNames.some(n => n.toLowerCase().includes(cronName));
          if (!isActive) {
            available.push({
              template_key: key,
              name: tmpl.name_template || key,
              description: tmpl.description || '',
              requires: tmpl.requires || '',
              p00_task: tmpl.p00_task || null,
            });
          }
        }
        if (available.length > 0) result._available_templates = available;
      } catch {}
    } else {
      // Global view: group all crons by client
      const clients = loadClients();
      const crons = _loadCronsFromOpenClaw();
      const grouped = {};
      for (const cron of crons) {
        let cronSlug = _extractSlugFromCron(cron.name, clients);
        if (!cronSlug) {
          const promptMatch = (cron.payload?.message || '').match(/brand\/([a-z0-9_-]+)\//i);
          if (promptMatch && clients.some(c => c.slug === promptMatch[1])) cronSlug = promptMatch[1];
        }
        const key = cronSlug || '_system';
        if (!grouped[key]) grouped[key] = [];
        const category = _detectCronCategory(cron.name, cron.payload?.message);
        const sched = cron.schedule || {};
        const state = cron.state || {};
        grouped[key].push({
          id: cron.id,
          name: cron.name || '—',
          task_type: category,
          schedule: _humanizeCron(sched),
          schedule_raw: sched,
          status: cron.enabled ? 'active' : 'paused',
          last_run_at: state.lastRunAtMs ? new Date(state.lastRunAtMs).toISOString() : null,
          next_run_at: state.nextRunAtMs ? new Date(state.nextRunAtMs).toISOString() : null,
          last_status: state.lastStatus || null,
          last_duration_ms: state.lastDurationMs || null,
          consecutive_errors: state.consecutiveErrors || 0,
          ideas_generated: 0,
          agent: cron.agentId || 'sancho',
          model: cron.payload?.model || '—',
          prompt: cron.payload?.message || '',
          description: cron.description || '',
          scripts: _extractScripts(cron.payload?.message || ''),
          client_slug: cronSlug || null,
          _source: 'openclaw-cron',
          created_at: cron.createdAtMs ? new Date(cron.createdAtMs).toISOString() : null,
        });
      }
      result = grouped;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // GET /api/cron-runs — latest run output (summary) for each cron
  if (req.method === 'GET' && url.startsWith('/api/cron-runs')) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const params = new URL('http://x' + req.url).searchParams;
    let slugParam = params.get('slug');
    if (req._portalClient) slugParam = req._portalSlug;
    const limitParam = parseInt(params.get('limit') || '1', 10);
    const limit = Math.max(1, Math.min(limitParam, 20));

    const clients = loadClients();
    const crons = _loadCronsFromOpenClaw();
    const runsDir = path.join(process.env.HOME || '/tmp', '.openclaw', 'cron', 'runs');
    const runs = [];

    for (const cron of crons) {
      const cronSlug = _extractSlugFromCron(cron.name, clients);
      if (slugParam) {
        // Include if: name matches, or prompt mentions the slug (multi-client crons), or brand/ path matches
        const prompt = (cron.payload?.message || '').toLowerCase();
        const nameMatch = cronSlug === slugParam;
        const promptMentions = prompt.includes(slugParam.toLowerCase());
        const brandPathMatch = prompt.includes('brand/' + slugParam);
        if (!nameMatch && !promptMentions && !brandPathMatch) continue;
      }

      const runFile = path.join(runsDir, cron.id + '.jsonl');
      if (!fs.existsSync(runFile)) continue;

      try {
        const content = fs.readFileSync(runFile, 'utf-8').trim();
        const lines = content.split('\n').filter(Boolean);
        const lastN = lines.slice(-limit).reverse();
        for (const line of lastN) {
          try {
            const d = JSON.parse(line);
            if (d.action !== 'finished') continue;
            runs.push({
              jobId: cron.id,
              jobName: cron.name || '—',
              status: d.status || 'unknown',
              summary: d.summary || '',
              durationMs: d.durationMs || null,
              model: d.model || null,
              runAtMs: d.runAtMs || d.ts || null,
              sessionId: d.sessionId || null,
              client_slug: cronSlug || null,
              category: _detectCronCategory(cron.name, cron.payload?.message),
            });
          } catch {}
        }
      } catch {}
    }

    // Enrich summaries from saved recurring-tasks output files
    // If exact date has no output, use most recent available output for that task
    for (const run of runs) {
      run.hasOutput = false;
      const targetSlug = run.client_slug || slugParam;
      if (!targetSlug) continue;
      const taskName = slugifyCronName(run.jobName, targetSlug);
      if (!taskName) continue;
      const taskDir = path.join(BASE, 'brand', targetSlug, 'recurring-tasks', taskName);

      // Try exact date first
      const date = run.runAtMs ? new Date(run.runAtMs).toISOString().slice(0, 10) : null;
      if (date) {
        const outFile = path.join(taskDir, date + '.json');
        try {
          if (fs.existsSync(outFile)) {
            const saved = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
            if (saved.content) { run.summary = saved.content; run.hasOutput = true; continue; }
          }
        } catch {}
      }

      // Fallback: most recent output file for this task
      try {
        if (!fs.existsSync(taskDir)) continue;
        const files = fs.readdirSync(taskDir).filter(f => f.endsWith('.json')).sort().reverse();
        for (const f of files) {
          try {
            const saved = JSON.parse(fs.readFileSync(path.join(taskDir, f), 'utf-8'));
            if (saved.content) {
              run.summary = saved.content;
              run.hasOutput = true;
              if (saved.runAtMs) run.runAtMs = saved.runAtMs;
              break;
            }
          } catch {}
        }
      } catch {}
    }

    // Also scan recurring-tasks/ directory for outputs not covered by cron runs
    // (e.g. cron was recreated, old run files gone, but outputs persist)
    if (slugParam) {
      const rtDir = path.join(BASE, 'brand', slugParam, 'recurring-tasks');
      try {
        if (fs.existsSync(rtDir)) {
          const taskDirs = fs.readdirSync(rtDir).filter(d => fs.statSync(path.join(rtDir, d)).isDirectory());
          for (const taskName of taskDirs) {
            // Check if we already have runs for this task
            const alreadyCovered = runs.some(r => slugifyCronName(r.jobName, slugParam) === taskName && r.hasOutput);
            if (alreadyCovered) continue;

            // Read the most recent output files
            const taskDir = path.join(rtDir, taskName);
            const files = fs.readdirSync(taskDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit);
            for (const f of files) {
              try {
                const saved = JSON.parse(fs.readFileSync(path.join(taskDir, f), 'utf-8'));
                if (!saved.content) continue;
                // Check if this run is already in the list (by date)
                const date = f.replace('.json', '');
                const alreadyHasDate = runs.some(r => r.hasOutput && slugifyCronName(r.jobName, slugParam) === taskName && r.runAtMs && new Date(r.runAtMs).toISOString().slice(0, 10) === date);
                if (alreadyHasDate) continue;

                runs.push({
                  jobId: saved.cronId || taskName,
                  jobName: saved.cronName || taskName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                  status: saved.status || 'ok',
                  summary: saved.content,
                  durationMs: saved.durationMs || null,
                  model: saved.model || null,
                  runAtMs: saved.runAtMs || new Date(date + 'T08:00:00').getTime(),
                  sessionId: null,
                  client_slug: slugParam,
                  category: _detectCronCategory(saved.cronName || taskName, ''),
                  hasOutput: true,
                });
              } catch {}
            }
          }
        }
      } catch {}
    }

    // Sort by runAtMs descending
    runs.sort((a, b) => (b.runAtMs || 0) - (a.runAtMs || 0));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runs));
    return;
  }

  if (req.method === 'POST' && url === '/api/recurring-tasks') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, task } = JSON.parse(body);
        if (!slug || !task) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or task' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const tasks = loadRecurringTasks(slug);
        if (task.id) {
          const idx = tasks.findIndex(t => t.id === task.id);
          if (idx >= 0) { Object.assign(tasks[idx], task); } else { task.created_at = task.created_at || new Date().toISOString(); tasks.push(task); }
        } else {
          task.id = crypto.randomUUID();
          task.created_at = new Date().toISOString();
          task.status = task.status || 'active';
          task.ideas_generated = task.ideas_generated || 0;
          tasks.push(task);
        }
        saveRecurringTasks(slug, tasks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, task }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url === '/api/recurring-tasks/toggle') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, taskId } = JSON.parse(body);
        if (!slug || !taskId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or taskId' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const tasks = loadRecurringTasks(slug);
        const task = tasks.find(t => t.id === taskId);
        if (!task) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task not found' })); return; }
        const newStatus = task.status === 'active' ? 'paused' : 'active';
        // If this is an OpenClaw cron, toggle it via CLI
        if (task._source === 'openclaw-cron') {
          try {
            const cmd = newStatus === 'active' ? 'enable' : 'disable';
            execSync(`openclaw cron ${cmd} ${taskId} 2>/dev/null`, { timeout: 10000 });
            _cronCache = null; // invalidate cache
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to toggle cron: ' + e.message }));
            return;
          }
        } else {
          task.status = newStatus;
          saveRecurringTasks(slug, tasks);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, taskId, newStatus }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  // Update cron prompt via openclaw cron update
  if (req.method === 'POST' && url === '/api/recurring-tasks/update-prompt') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin only' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { taskId, prompt, name } = JSON.parse(body);
        if (!taskId || !prompt) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing taskId or prompt' })); return; }
        // Write prompt to temp file to avoid shell escaping issues
        const tmpFile = path.join(BASE, '_system', '.tmp-cron-prompt-' + taskId.slice(0,8) + '.txt');
        fs.writeFileSync(tmpFile, prompt);
        const ocBin = fs.existsSync('/opt/homebrew/bin/openclaw') ? '/opt/homebrew/bin/openclaw' : 'openclaw';
        const envOpts = { timeout: 15000, encoding: 'utf-8', env: { ...process.env, PATH: (process.env.PATH || '') + ':/opt/homebrew/bin:/usr/local/bin' } };
        try {
          // Use openclaw cron update with --prompt-file
          execSync(`${ocBin} cron update ${taskId} --prompt-file "${tmpFile}" 2>/dev/null`, envOpts);
        } catch (e1) {
          // Fallback: try with --prompt flag (older versions)
          try {
            execSync(`${ocBin} cron update ${taskId} --prompt "${tmpFile}" 2>/dev/null`, envOpts);
          } catch (e2) {
            // Last resort: delete + recreate? For now just report error
            try { fs.unlinkSync(tmpFile); } catch {}
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to update cron prompt. Use `openclaw cron update` manually.' }));
            return;
          }
        }
        try { fs.unlinkSync(tmpFile); } catch {}
        _cronCache = null; // invalidate cache
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, taskId }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  // Read script content
  if (req.method === 'GET' && url.startsWith('/api/recurring-tasks/script')) {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin only' }));
      return;
    }
    const params = new URL('http://x' + req.url).searchParams;
    const scriptPath = params.get('path');
    if (!scriptPath) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing path' })); return; }
    // Resolve path safely — only allow files under workspace
    let absPath = scriptPath;
    if (scriptPath.startsWith('~/')) absPath = scriptPath.replace('~', process.env.HOME || '/Users/ragi');
    else if (!scriptPath.startsWith('/')) absPath = path.join(BASE, scriptPath);
    try { absPath = fs.realpathSync(absPath); } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'File not found' })); return;
    }
    // Security: only allow reading under workspace dirs
    const allowedPrefixes = [BASE, path.join(process.env.HOME || '', '.openclaw')];
    if (!allowedPrefixes.some(p => absPath.startsWith(p))) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Access denied' })); return;
    }
    try {
      const content = fs.readFileSync(absPath, 'utf-8');
      const lang = absPath.endsWith('.py') ? 'python' : absPath.endsWith('.sh') ? 'bash' : 'javascript';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: scriptPath, absPath, content, lang, lines: content.split('\n').length }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // Write script content
  if (req.method === 'POST' && url === '/api/recurring-tasks/script') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin only' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { path: scriptPath, content } = JSON.parse(body);
        if (!scriptPath || content === undefined) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing path or content' })); return; }
        let absPath = scriptPath;
        if (scriptPath.startsWith('~/')) absPath = scriptPath.replace('~', process.env.HOME || '/Users/ragi');
        else if (!scriptPath.startsWith('/')) absPath = path.join(BASE, scriptPath);
        // Security: only write under workspace
        const allowedPrefixes = [BASE, path.join(process.env.HOME || '', '.openclaw')];
        const resolvedDir = path.dirname(absPath);
        if (!allowedPrefixes.some(p => absPath.startsWith(p))) {
          res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Access denied' })); return;
        }
        // Backup original
        if (fs.existsSync(absPath)) {
          const backupPath = absPath + '.bak.' + Date.now();
          fs.copyFileSync(absPath, backupPath);
        }
        fs.writeFileSync(absPath, content);
        // Preserve execute permission for .sh files
        if (absPath.endsWith('.sh')) {
          try { fs.chmodSync(absPath, 0o755); } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: scriptPath, lines: content.split('\n').length }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'DELETE' && url === '/api/recurring-tasks') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, taskId } = JSON.parse(body);
        if (!slug || !taskId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug or taskId' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        let tasks = loadRecurringTasks(slug);
        const len = tasks.length;
        tasks = tasks.filter(t => t.id !== taskId);
        if (tasks.length === len) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task not found' })); return; }
        saveRecurringTasks(slug, tasks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Monitoring (Performance Analysis) ===
  if (req.method === 'GET' && url.startsWith('/api/monitoring')) {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const params = new URL('http://x' + req.url).searchParams;
    let slugParam = params.get('slug');
    if (req._portalClient) slugParam = req._portalSlug;
    if (!slugParam) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug' })); return; }
    const monDir = path.join(BASE, 'brand', slugParam, 'monitoring');
    const result = { slug: slugParam, health_score: null, pending_recommendations: null, latest_weekly: null };
    try { result.health_score = JSON.parse(fs.readFileSync(path.join(monDir, 'health-score.json'), 'utf-8')); } catch {}
    try { result.pending_recommendations = JSON.parse(fs.readFileSync(path.join(monDir, 'pending-recommendations.json'), 'utf-8')); } catch {}
    try {
      const weeklyDir = path.join(monDir, 'weekly');
      const files = fs.readdirSync(weeklyDir).filter(f => f.endsWith('.json')).sort().reverse();
      if (files.length > 0) result.latest_weekly = JSON.parse(fs.readFileSync(path.join(weeklyDir, files[0]), 'utf-8'));
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); return;
  }
  if (req.method === 'POST' && url === '/api/monitoring/recommendation-action') {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, recommendationId, action, projectOverride } = JSON.parse(body);
        if (!slug || !recommendationId || !action) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug, recommendationId, or action' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const recFile = path.join(BASE, 'brand', slug, 'monitoring', 'pending-recommendations.json');
        if (!fs.existsSync(recFile)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No recommendations file' })); return; }
        const data = JSON.parse(fs.readFileSync(recFile, 'utf-8'));
        const rec = (data.recommendations || []).find(r => r.id === recommendationId);
        if (!rec) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Recommendation not found' })); return; }
        const now = new Date().toISOString();
        if (action === 'approve') { rec.status = 'approved'; rec.approved_at = now; rec.actioned_at = now; }
        else if (action === 'dismiss') { rec.status = 'dismissed'; rec.actioned_at = now; }
        else if (action === 'convert') {
          rec.status = 'converted';
          rec.actioned_at = now;
          // Use projectOverride if provided, else fall back to linked_project/linkedProject
          const projRef = projectOverride || rec.linked_project || rec.linkedProject;
          if (!projRef) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No linked project — assign a project first' })); return; }
          // Save the project reference back to the rec if it came from override
          if (projectOverride) { rec.linkedProject = projectOverride; }
          if (projRef) {
            const projectsDir = path.join(BASE, 'brand', slug, 'projects');
            const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
            const projDir = dirs.find(d => d.isDirectory() && d.name.startsWith(projRef));
            if (projDir) {
              const tasksFile = path.join(projectsDir, projDir.name, 'tasks.json');
              let tasks = [];
              try { const td = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); tasks = Array.isArray(td) ? td : (td.tasks || []); } catch {}
              const taskNum = tasks.length + 1;
              const taskId = `${projRef}-T${String(taskNum).padStart(2, '0')}`;
              tasks.push({
                id: taskId,
                name: rec.title,
                description: `${rec.rationale || rec.description || ''}\n\n**Accion sugerida:** ${rec.suggested_action || ''}`,
                status: 'todo',
                source: 'performance-analysis',
                created_at: now
              });
              fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
              rec.converted_to_task = taskId;
            }
          }
        } else { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid action. Use: approve, dismiss, convert' })); return; }
        data.updated_at = now;
        fs.writeFileSync(recFile, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, recommendation: rec }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  // === API: Crons (OpenClaw cron list) ===
  if (req.method === 'GET' && url.startsWith('/api/crons')) {
    if (!req._adminToken && !req._portalClient) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    const params = new URL('http://x' + req.url).searchParams;
    let slugParam = params.get('slug');
    if (req._portalClient) slugParam = req._portalSlug;
    const clients = loadClients();
    const enriched = loadCronJobs().map(j => enrichCronJob(j, clients));
    let filtered = enriched;
    if (slugParam) filtered = enriched.filter(j => j.client_slug === slugParam || (!j.client_slug && j.category === 'system'));
    if (req._portalClient) filtered = enriched.filter(j => j.client_slug === slugParam);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, crons: filtered })); return;
  }
  if (req.method === 'POST' && url === '/api/crons/toggle') {
    if (!req._adminToken) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Admin only' })); return; }
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { cronId, enable } = JSON.parse(body);
        execSync(`openclaw cron ${enable ? 'enable' : 'disable'} ${cronId}`, { timeout: 10000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, cronId, enabled: enable }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    }); return;
  }

  // ═══════════════════════════════════════════════════════════════
  // REVERSE SYNC: task completion → foundation pillar status
  // ═══════════════════════════════════════════════════════════════
  // When a task with type "foundation" completes, update the
  // corresponding pillar in foundation-state.json.
  //
  // Case 1: task has section + pillar → update specific pillar
  // Case 2: task.pillar matches a section name (e.g. "fast-foundation")
  //         → update ALL pillars in that section
  //
  // This sync also triggers regenerate.py to rebuild mc-data.js.
  // The frontend's refreshFoundationState() will pick up changes
  // within 30 seconds (or immediately after agent chat response).
  // ═══════════════════════════════════════════════════════════════
  function syncTaskToPillar(slug, task, newStatus) {
    if (!task.pillar) return;
    const TASK_TO_PILLAR = { 'completed': 'approved', 'done': 'approved', 'in-progress': 'in-progress', 'todo': 'not-started' };
    const pillarStatus = TASK_TO_PILLAR[newStatus];
    if (!pillarStatus) return;
    try {
      const stateFile = path.join(BASE, 'brand', slug, 'foundation-state.json');
      if (!fs.existsSync(stateFile)) return;
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      const sections = state.sections || {};
      let changed = false;

      // Case 1: task has section + pillar — update specific pillar
      if (task.section && sections[task.section]) {
        const pillars = sections[task.section].pillars || {};
        if (pillars[task.pillar] && pillars[task.pillar].status !== pillarStatus) {
          console.log(`[syncTaskToPillar] ${slug}: ${task.section}/${task.pillar} ${pillars[task.pillar].status} → ${pillarStatus}`);
          pillars[task.pillar].status = pillarStatus;
          pillars[task.pillar].updated_at = new Date().toISOString();
          if (pillarStatus === 'approved') pillars[task.pillar].approved_at = new Date().toISOString();
          changed = true;
        }
      }

      // Case 2: pillar name matches a section (e.g. fast-foundation) — update all pillars in that section
      if (sections[task.pillar]) {
        const secPillars = sections[task.pillar].pillars || {};
        for (const [pName, pInfo] of Object.entries(secPillars)) {
          if (pInfo.status !== pillarStatus) {
            console.log(`[syncTaskToPillar] ${slug}: ${task.pillar}/${pName} ${pInfo.status} → ${pillarStatus}`);
            pInfo.status = pillarStatus;
            pInfo.updated_at = new Date().toISOString();
            if (pillarStatus === 'approved') pInfo.approved_at = new Date().toISOString();
            changed = true;
          }
        }
      }

      if (changed) {
        safeWriteFoundationState(stateFile, state);
        try { const { execSync } = require('child_process'); execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch (e) { console.error('[syncTaskToPillar] regenerate error:', e.message); }
      }
    } catch (e) { console.error('[syncTaskToPillar] error:', e.message); }
  }

  // === API: Get next project ID for a client ===
  if (req.method === 'GET' && url.match(/^\/api\/projects\/next-id\/[a-z0-9-]+$/)) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    const slug = url.split('/').pop();
    const nextId = getNextProjectId(slug);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, slug, next_id: nextId, next_project: `P${String(nextId).padStart(2, '0')}` }));
    return;
  }

  // === API: Regenerate mc-data.js on demand ===
  if (req.method === 'POST' && url === '/api/regenerate') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    try {
      execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, regenerated: new Date().toISOString() }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // === API: Create new client (SSE streaming) ===
  if (req.method === 'POST' && url === '/api/new-client') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin only' }));
      return;
    }
    if (_clientCreationInProgress) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Client creation already in progress' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, name, guild } = JSON.parse(body);
        // Validate required fields
        if (!slug || !name || !guild) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug, name, or guild' }));
          return;
        }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid slug format (lowercase, numbers, hyphens only)' }));
          return;
        }
        if (!/^\d{17,20}$/.test(guild)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid guild ID (must be 17-20 digit Discord snowflake)' }));
          return;
        }
        // Check if brand directory already exists
        const brandDir = path.join(BASE, 'brand', slug);
        if (fs.existsSync(brandDir)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Client "${slug}" already exists` }));
          return;
        }
        // Start SSE streaming
        _clientCreationInProgress = true;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        const scriptPath = path.join(BASE, 'scripts', 'new-client.sh');
        const child = spawn('bash', [scriptPath, '--slug', slug, '--name', name, '--guild', guild], {
          cwd: BASE,
          env: { ...process.env }
        });
        const sendSSE = (data) => { res.write(`data: ${data}\n\n`); };
        let outputBuffer = '';
        const flushLines = (chunk) => {
          outputBuffer += chunk;
          const lines = outputBuffer.split('\n');
          outputBuffer = lines.pop();
          for (const line of lines) {
            sendSSE(line);
          }
        };
        child.stdout.on('data', (data) => flushLines(data.toString()));
        child.stderr.on('data', (data) => flushLines('[stderr] ' + data.toString()));
        const killTimer = setTimeout(() => {
          child.kill('SIGTERM');
          sendSSE('⏱️ Timeout — proceso terminado tras 120s');
        }, 120000);
        child.on('close', (code) => {
          clearTimeout(killTimer);
          if (outputBuffer) sendSSE(outputBuffer);
          res.write(`event: done\ndata: ${JSON.stringify({ ok: code === 0, code })}\n\n`);
          res.end();
          _clientCreationInProgress = false;
        });
        req.on('close', () => {
          child.kill('SIGTERM');
          clearTimeout(killTimer);
          _clientCreationInProgress = false;
        });
      } catch (e) {
        _clientCreationInProgress = false;
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }

  // === API: Save client sources.json ===
  if (req.method === 'POST' && url === '/api/client-sources') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Admin only' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, sources } = JSON.parse(body);
        if (!slug || !sources) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug or sources' }));
          return;
        }
        const brandDir = path.join(BASE, 'brand', slug);
        if (!fs.existsSync(brandDir)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Client "${slug}" not found` }));
          return;
        }
        fs.writeFileSync(path.join(brandDir, 'sources.json'), JSON.stringify(sources, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Projects — task status update ===
  if (req.method === 'POST' && url === '/api/projects/task-status') {
    // Requires admin or portal auth
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, taskId, status, sourceThread } = JSON.parse(body);
        if (!slug || !taskId || !status) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug, taskId, or status' }));
          return;
        }
        // Portal clients can only update their own slug
        if (req._portalClient && req._portalSlug !== slug) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
        // Find the project folder
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        const projectId = taskId.split('-').slice(0, 1).join('-'); // P01 from P01-T01
        const projDir = resolveProjectDir(projectsDir, projectId);
        if (!projDir) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found: ' + projectId }));
          return;
        }
        const tasksFile = path.join(projDir, 'tasks.json');
        let tasksData;
        try { tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'tasks.json not found' }));
          return;
        }
        const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []);
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Task not found: ' + taskId }));
          return;
        }
        const oldStatus = task.status;
        task.status = status;
        if (status === 'completed' || status === 'done') task.completed = new Date().toISOString().slice(0, 10);
        // Write back
        const writeData = Array.isArray(tasksData) ? tasks : { ...tasksData, tasks };
        fs.writeFileSync(tasksFile, JSON.stringify(writeData, null, 2));
        // Notify on status change
        if (oldStatus !== status) {
          notifyProjectChange(slug, { type: 'task', id: taskId, name: task.name, oldStatus, newStatus: status, sourceThread });
          // Reverse sync: update foundation pillar if this is a foundation task
          syncTaskToPillar(slug, task, status);
          // Warn if foundation task is missing pillar field
          if ((task.type === 'foundation' || task.batch_type === 'foundation') && !task.pillar) {
            console.warn(`[syncTaskToPillar] ⚠️ Task ${taskId} is type=foundation but has no pillar field — foundation-state.json will NOT be updated`);
          }
        }
        // Regenerate mc-data.js so MC reflects changes
        try { execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch (e) { console.error('[task-status] regenerate error:', e.message); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, taskId, oldStatus, newStatus: status }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Projects — update task fields ===
  if (req.method === 'POST' && url === '/api/projects/task-update') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, taskId, fields, sourceThread } = JSON.parse(body);
        if (!slug || !taskId || !fields) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug, taskId, or fields' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        const projectId = taskId.split('-').slice(0, 1).join('-');
        const projDir = resolveProjectDir(projectsDir, projectId);
        if (!projDir) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project not found' })); return; }
        const tasksFile = path.join(projDir, 'tasks.json');
        let tasksData;
        try { tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } catch { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'tasks.json not found' })); return; }
        const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []);
        const task = tasks.find(t => t.id === taskId);
        if (!task) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task not found' })); return; }
        const oldStatus = task.status;
        const allowed = ['name','description','deliverable','done_criteria','depends_on','owner','channel','status','type','skill','idea_ids','pillar','section','documents'];
        for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) task[k] = v; }
        if (fields.status === 'completed' || fields.status === 'done') task.completed = new Date().toISOString().slice(0, 10);
        const writeData = Array.isArray(tasksData) ? tasks : { ...tasksData, tasks };
        fs.writeFileSync(tasksFile, JSON.stringify(writeData, null, 2));
        if (fields.status && fields.status !== oldStatus) {
          notifyProjectChange(slug, { type: 'task', id: taskId, name: task.name, oldStatus, newStatus: fields.status, sourceThread });
          syncTaskToPillar(slug, task, fields.status);
          if ((task.type === 'foundation' || task.batch_type === 'foundation') && !task.pillar) {
            console.warn(`[syncTaskToPillar] ⚠️ Task ${taskId} is type=foundation but has no pillar field — foundation-state.json will NOT be updated`);
          }
        }
        // Regenerate mc-data.js so MC reflects changes
        try { execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch (e) { console.error('[task-update] regenerate error:', e.message); }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, task }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Projects — update project fields ===
  if (req.method === 'POST' && url === '/api/projects/project-update') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, projectId, fields, sourceThread } = JSON.parse(body);
        if (!slug || !projectId || !fields) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing params' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        const projDir = resolveProjectDir(projectsDir, projectId);
        if (!projDir) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project not found' })); return; }
        const projFile = path.join(projDir, 'project.json');
        let project;
        try { project = JSON.parse(fs.readFileSync(projFile, 'utf-8')); } catch { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'project.json not found' })); return; }
        const oldStatus = project.status;
        const allowed = ['name','description','approach','objective','status','review_date','strategy'];
        for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) project[k] = v; }
        fs.writeFileSync(projFile, JSON.stringify(project, null, 2));
        // Notify on status change
        if (fields.status && fields.status !== oldStatus) {
          notifyProjectChange(slug, { type: 'project', id: projectId, name: project.name, oldStatus, newStatus: fields.status, sourceThread });
        }
        // Regenerate mc-data.js so MC reflects changes
        try { execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch (e) { console.error('[project-update] regenerate error:', e.message); }
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, project }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Projects — archive project (with reason + strategic plan update) ===
  if (req.method === 'POST' && url === '/api/projects/project-archive') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, projectId, reason } = JSON.parse(body);
        if (!slug || !projectId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing params' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        // Update project.json
        const projDir = resolveProjectDir(projectsDir, projectId);
        if (projDir) {
          const projFile = path.join(projDir, 'project.json');
          try {
            const proj = JSON.parse(fs.readFileSync(projFile, 'utf-8'));
            proj.status = 'archived';
            proj.archived_at = new Date().toISOString().slice(0, 10);
            proj.archive_reason = reason || 'Archivado por el cliente';
            fs.writeFileSync(projFile, JSON.stringify(proj, null, 2));
          } catch {}
        }
        // Append to strategic-plan/current.md if it exists
        const planFile = path.join(BASE, 'brand', slug, 'strategic-plan', 'current.md');
        try {
          if (fs.existsSync(planFile)) {
            const plan = fs.readFileSync(planFile, 'utf-8');
            // Find "Proyectos completados" or "Proyectos archivados" section, or append
            const archiveEntry = `\n| ${projectId} | Archivado | ${reason || 'Archivado por el cliente'} | ${new Date().toISOString().slice(0, 10)} |`;
            if (plan.includes('## Proyectos archivados')) {
              fs.writeFileSync(planFile, plan.replace('## Proyectos archivados', '## Proyectos archivados' + archiveEntry));
            } else {
              fs.appendFileSync(planFile, '\n\n## Proyectos archivados\n\n| ID | Estado | Motivo | Fecha |\n|---|---|---|---|' + archiveEntry + '\n');
            }
          }
        } catch {}
        // Notify
        const projName = projFolder ? projFolder.name.replace(/^P\d+-/, '') : projectId;
        notifyProjectChange(slug, { type: 'project', id: projectId, name: projName, oldStatus: 'active', newStatus: 'archived' });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, projectId, status: 'archived', reason }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Projects — get all projects data ===
  if (req.method === 'GET' && url.startsWith('/api/projects/') && !url.includes('task-status')) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const slug = url.replace('/api/projects/', '').replace(/\/$/, '');
    if (req._portalClient && req._portalSlug !== slug) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const projects = loadProjectsData(slug);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, slug, projects }));
    return;
  }

  // === Projects page (admin mode) ===
  if (url.startsWith('/projects/') || url === '/projects') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }
    const slug = url.replace('/projects/', '').replace(/\/$/, '') || null;
    if (!slug) {
      // List all clients with projects link
      const clients = loadClients();
      const links = clients.map(c => `<div class="card"><a href="${req._adminBase}/projects/${c.slug}/">${c.emoji || '🏢'} ${c.name || c.slug}</a></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(page('Proyectos', `<a class="back" href="${req._adminBase}/">← Mission Control</a>`, `<h1>📋 Proyectos por cliente</h1>${links}`));
      return;
    }
    const client = loadClients().find(c => c.slug === slug);
    const clientName = client ? (client.name || slug) : slug;
    const guildId = client ? (client.guild || client.discord_guild_id || '') : '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(buildProjectsPage(slug, req._adminBase, clientName, guildId));
    return;
  }

  // === Trust Engine save API (admin mode) ===
  if (req.method === 'POST' && url.match(/^\/trust-engine\/([^/]+)\/api\/save$/)) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const teSlug = url.match(/^\/trust-engine\/([^/]+)\/api\/save$/)[1];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { module: mod, arrayKey, itemId, field, value } = JSON.parse(body);
        const teDir = path.join(BASE, 'brand', teSlug, 'trust-engine');
        const fileMap = { recommendations: 'recommendations.json', keywords: 'keywords.json', influencers: 'influencers.json' };
        const fname = fileMap[mod];
        if (!fname) { res.writeHead(400); res.end(JSON.stringify({ error: 'Unknown module' })); return; }
        const fpath = path.join(teDir, fname);
        const data = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
        const arr = (data.data || data)[arrayKey] || [];
        const item = arr.find(i => i.id === itemId);
        if (item) {
          item[field] = value;
          item.edited_by_human = true;
          data.updated_at = new Date().toISOString();
          fs.writeFileSync(fpath, JSON.stringify(data, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404); res.end(JSON.stringify({ error: 'Item not found' }));
        }
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === Atalaya API endpoints (use /api/atalaya-* pattern to survive admin path normalization) ===
  function atalayaSlug() {
    const params = new URL('http://x' + req.url).searchParams;
    return params.get('slug') || '';
  }
  function atalayaConfigPath(s) {
    return path.join(BASE, 'brand', s, 'atalaya', 'config.json');
  }
  function atalayaLoadConfig(s) {
    const defaults = { channels_to_monitor: [], followed_profiles: { linkedin: [], twitter: [], instagram: [] }, competitor_overrides: {}, categories: ['Growth','Founder','SEO','AI','Marketing'] };
    try { return { ...defaults, ...JSON.parse(fs.readFileSync(atalayaConfigPath(s), 'utf-8')) }; } catch { return defaults; }
  }
  function atalayaSaveConfig(s, config) {
    const dir = path.join(BASE, 'brand', s, 'atalaya');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(atalayaConfigPath(s), JSON.stringify(config, null, 2));
  }

  if (req.method === 'POST' && url === '/api/atalaya-categories') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { action, category } = JSON.parse(body);
        const config = atalayaLoadConfig(atSlug);
        if (!config.categories) config.categories = ['Growth','Founder','SEO','AI','Marketing'];
        if (action === 'add' && category && !config.categories.includes(category)) {
          config.categories.push(category);
        } else if (action === 'remove' && category) {
          config.categories = config.categories.filter(c => c !== category);
        }
        atalayaSaveConfig(atSlug, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, categories: config.categories }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && (url === '/api/atalaya-profiles' || url === '/api/atalaya-profiles-add')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { platform, url: profileUrl, category, name } = JSON.parse(body);
        const config = atalayaLoadConfig(atSlug);
        if (!config.followed_profiles[platform]) config.followed_profiles[platform] = [];
        const id = 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
        const profileName = name || (platform === 'linkedin' ? profileUrl.split('/in/')[1]?.replace(/\/$/, '') || profileUrl : profileUrl);
        config.followed_profiles[platform].push({ id, name: profileName, url: profileUrl, category: category || 'Growth', active: true, added_at: new Date().toISOString(), posts_monitored: 0 });
        atalayaSaveConfig(atSlug, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url.startsWith('/api/atalaya-profiles-update')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { platform, id: profileId, active, category } = JSON.parse(body);
        const config = atalayaLoadConfig(atSlug);
        const list = config.followed_profiles?.[platform] || [];
        const item = list.find(p => p.id === profileId);
        if (item) {
          if (active !== undefined) item.active = active;
          if (category !== undefined) item.category = category;
          atalayaSaveConfig(atSlug, config);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else { res.writeHead(404); res.end(JSON.stringify({ error: 'Profile not found' })); }
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url.startsWith('/api/atalaya-profiles-delete')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { platform, id: profileId } = JSON.parse(body);
        const config = atalayaLoadConfig(atSlug);
        if (config.followed_profiles?.[platform]) {
          config.followed_profiles[platform] = config.followed_profiles[platform].filter(p => p.id !== profileId);
          atalayaSaveConfig(atSlug, config);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url.startsWith('/api/atalaya-channel')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { competitorSlug, channel, enabled } = JSON.parse(body);
        const config = atalayaLoadConfig(atSlug);
        if (!config.competitor_overrides) config.competitor_overrides = {};
        if (!config.competitor_overrides[competitorSlug]) {
          config.competitor_overrides[competitorSlug] = { channels: [...(config.channels_to_monitor || [])] };
        }
        const chList = config.competitor_overrides[competitorSlug].channels;
        if (enabled && !chList.includes(channel)) chList.push(channel);
        if (!enabled) config.competitor_overrides[competitorSlug].channels = chList.filter(c => c !== channel);
        atalayaSaveConfig(atSlug, config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url.startsWith('/api/atalaya-approve-idea')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { ideaId, sourceType } = JSON.parse(body);
        const pendingFiles = { profiles: 'profiles-pending.json', competitors: 'competitors-pending.json', ads: 'ads-pending.json', pending: 'pending-ideas.json' };
        const pendingPath = path.join(BASE, 'brand', atSlug, 'atalaya', pendingFiles[sourceType] || 'pending-ideas.json');
        const ideasPath = path.join(BASE, 'brand', atSlug, 'ideas.json');
        let pending = [];
        try { const raw = JSON.parse(fs.readFileSync(pendingPath, 'utf-8')); pending = Array.isArray(raw) ? raw : raw.ideas_generated || []; } catch {}
        const idea = pending.find(i => i.id === ideaId);
        if (!idea) { res.writeHead(404); res.end(JSON.stringify({ error: 'Idea not found' })); return; }
        let ideas = { ideas: [] };
        try { ideas = JSON.parse(fs.readFileSync(ideasPath, 'utf-8')); } catch {}
        if (!ideas.ideas) ideas.ideas = [];
        ideas.ideas.push({
          id: idea.id, type: 'content', status: 'new', title: idea.adapted_idea?.title || idea.title || '', description: idea.adapted_idea?.description || '',
          category: idea.pattern_identified || '', source: 'atalaya', channels_suggested: idea.adapted_idea?.recommended_channels || [],
          priority_score: idea.adapted_idea?.priority === 'high' ? 80 : idea.adapted_idea?.priority === 'medium' ? 50 : 20,
          created_at: new Date().toISOString(), notes: 'Fuente: ' + (idea.source_name||'') + ' (' + (idea.source_channel||'') + ')'
        });
        fs.writeFileSync(ideasPath, JSON.stringify(ideas, null, 2));
        pending = pending.filter(i => i.id !== ideaId);
        fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  if (req.method === 'POST' && url.startsWith('/api/atalaya-approve-all')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    let body2 = '';
    req.on('data', chunk => body2 += chunk);
    req.on('end', () => {
    try {
      const { sourceType: st } = JSON.parse(body2 || '{}');
      const pendingFiles2 = { profiles: 'profiles-pending.json', competitors: 'competitors-pending.json', ads: 'ads-pending.json', pending: 'pending-ideas.json' };
      const pendingPath = path.join(BASE, 'brand', atSlug, 'atalaya', pendingFiles2[st] || 'pending-ideas.json');
      const ideasPath = path.join(BASE, 'brand', atSlug, 'ideas.json');
      let pending = [];
      try { const raw = JSON.parse(fs.readFileSync(pendingPath, 'utf-8')); pending = Array.isArray(raw) ? raw : raw.ideas_generated || raw.ideas || []; } catch {}
      let ideas = { ideas: [] };
      try { ideas = JSON.parse(fs.readFileSync(ideasPath, 'utf-8')); } catch {}
      if (!ideas.ideas) ideas.ideas = [];
      for (const idea of pending) {
        ideas.ideas.push({
          id: idea.id, type: 'content', status: 'new', title: idea.adapted_idea?.title || idea.title || '', description: idea.adapted_idea?.description || idea.description || '',
          category: idea.pattern_identified || idea.category || '', source: 'atalaya', channels_suggested: idea.adapted_idea?.recommended_channels || [],
          priority_score: idea.adapted_idea?.priority === 'high' ? 80 : idea.adapted_idea?.priority === 'medium' ? 50 : 20,
          created_at: new Date().toISOString(), notes: 'Fuente: ' + (idea.source_name||'') + ' (' + (idea.source_channel||'') + ')'
        });
      }
      fs.writeFileSync(ideasPath, JSON.stringify(ideas, null, 2));
      fs.writeFileSync(pendingPath, JSON.stringify([], null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: pending.length }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === Insights API (aggregates from Performance, Daily Pulse, Meeting Intelligence) ===
  if (url.startsWith('/api/insights') && req.method === 'GET') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const params = new URL('http://x' + req.url).searchParams;
    const iSlug = params.get('slug') || '';
    try {
      const brandDir = path.join(BASE, 'brand', iSlug);
      let allInsights = [];

      // Source 1: Performance Analysis weekly reports — anomalies + opportunities
      try {
        const weeklyDir = path.join(brandDir, 'monitoring', 'weekly');
        if (fs.existsSync(weeklyDir)) {
          const files = fs.readdirSync(weeklyDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 4);
          for (const f of files) {
            const report = JSON.parse(fs.readFileSync(path.join(weeklyDir, f), 'utf-8'));
            const date = f.replace('.json', '');
            for (const a of (report.anomalies || [])) {
              allInsights.push({ id: 'pa-' + date + '-' + (a.metric||'').replace(/\./g,'-'), source: 'performance-analysis', type: a.severity === 'GREEN_OPPORTUNITY' ? 'opportunity' : 'anomaly', severity: a.severity || 'YELLOW', title: (a.metric || '') + ' — ' + (a.message || a.severity || ''), description: a.message || '', date, metric: a.metric });
            }
            for (const o of (report.opportunities || [])) {
              allInsights.push({ id: 'pa-opp-' + date + '-' + (o.metric||'').replace(/\./g,'-'), source: 'performance-analysis', type: 'opportunity', severity: 'GREEN', title: (o.title || o.metric || '') + (o.description ? ' — ' + o.description : ''), description: o.description || o.message || '', date, metric: o.metric });
            }
          }
        }
      } catch {}

      // Source 2: Daily Pulse insights
      try {
        const pulseDir = path.join(brandDir, 'daily-pulse');
        if (fs.existsSync(pulseDir)) {
          const files = fs.readdirSync(pulseDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 7);
          for (const f of files) {
            const pulse = JSON.parse(fs.readFileSync(path.join(pulseDir, f), 'utf-8'));
            const date = f.replace('.json', '');
            for (const ins of (pulse.insights || [])) {
              allInsights.push({ id: 'dp-' + date + '-' + Math.random().toString(36).slice(2,6), source: 'daily-pulse', type: ins.category || 'observation', severity: ins.priority || 'medium', title: ins.title || ins.summary || '', description: ins.summary || ins.title || '', date });
            }
          }
        }
      } catch {}

      // Source 3: Meeting Intelligence
      try {
        const mtgDir = path.join(brandDir, 'intelligence', 'meetings');
        if (fs.existsSync(mtgDir)) {
          const files = fs.readdirSync(mtgDir).filter(f => f.endsWith('.json') || f.endsWith('.md')).sort().reverse().slice(0, 5);
          for (const f of files) {
            if (f.endsWith('.json')) {
              try {
                const mtg = JSON.parse(fs.readFileSync(path.join(mtgDir, f), 'utf-8'));
                const meetings = mtg.meetings || (Array.isArray(mtg) ? mtg : [mtg]);
                for (const m of meetings) {
                  const date = m.date || f.replace('.json', '');
                  for (const d of (m.decisions || [])) { allInsights.push({ id: 'mi-' + date + '-' + Math.random().toString(36).slice(2,6), source: 'meeting-intelligence', type: 'decision', severity: 'high', title: typeof d === 'string' ? d : d.decision || d.title || '', description: '', date }); }
                  for (const a of (m.actions || m.action_items || [])) { allInsights.push({ id: 'mi-' + date + '-' + Math.random().toString(36).slice(2,6), source: 'meeting-intelligence', type: 'action', severity: 'medium', title: typeof a === 'string' ? a : a.action || a.title || '', description: typeof a === 'string' ? '' : a.owner || '', date }); }
                  for (const i of (m.insights || [])) { allInsights.push({ id: 'mi-' + date + '-' + Math.random().toString(36).slice(2,6), source: 'meeting-intelligence', type: 'insight', severity: 'medium', title: typeof i === 'string' ? i : i.insight || i.title || '', description: '', date }); }
                }
              } catch {}
            }
          }
        }
      } catch {}

      // Sort by date desc
      allInsights.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ insights: allInsights, total: allInsights.length }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // === Universal Recommendations API (aggregates from all sources) ===
  if (url.startsWith('/api/recommendations') && req.method === 'GET') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const params = new URL('http://x' + req.url).searchParams;
    const rSlug = params.get('slug') || '';
    const filterType = params.get('type') || '';
    const filterSource = params.get('source') || '';
    const filterStatus = params.get('status') || 'pending';
    try {
      const brandDir = path.join(BASE, 'brand', rSlug);
      let allRecs = [];

      // Source 1: Grouped task recommendations (from recommendations.json)
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(brandDir, 'recommendations.json'), 'utf-8'));
        const items = raw.recommendations || [];
        for (const item of items) {
          allRecs.push({
            id: item.id || '',
            source: item.source || 'atalaya',
            type: item.type || 'content_task',
            priority: item.priority || 'medium',
            title: item.title || '',
            description: item.description || '',
            idea_ids: item.idea_ids || [],
            suggested_project: item.suggested_project || '',
            task_type: item.task_type || 'content',
            status: item.status || 'pending',
            created_at: item.created_at || '',
            _file: 'recommendations.json'
          });
        }
      } catch {}

      // Source 2: Performance Analysis
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(brandDir, 'monitoring', 'pending-recommendations.json'), 'utf-8'));
        const items = Array.isArray(raw) ? raw : raw.recommendations || [];
        for (const item of items) {
          allRecs.push({
            id: item.id || '',
            source: 'performance-analysis',
            type: item.type === 'content_idea' ? 'content_idea' : 'operational',
            priority: item.priority || 'medium',
            title: item.title || '',
            description: item.description || item.rationale || '',
            rationale: item.rationale || '',
            operational: { linked_project: item.linked_project || item.linkedProject || null, linked_metric: item.linked_metric || item.linkedMetric || null, suggested_action: item.suggested_action || item.suggestedAction || '' },
            status: item.status || 'pending',
            created_at: item.created_at || item.createdAt || '',
            converted_to: item.converted_to_task ? 'task:' + item.converted_to_task : null,
            _file: 'monitoring/pending-recommendations.json'
          });
        }
      } catch {}

      // Source 3: Trust Engine recommendations
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(brandDir, 'trust-engine', 'recommendations.json'), 'utf-8'));
        const items = raw.recommendations || raw.data?.recommendations || [];
        for (const item of items) {
          allRecs.push({
            id: item.rec_id || item.id || '',
            source: 'trust-engine',
            type: item.type || 'content_idea',
            priority: item.priority || item.severity || 'medium',
            title: item.title || '',
            description: item.rationale || item.description || '',
            rationale: item.rationale || '',
            status: item.status || 'pending',
            created_at: item.created_at || '',
            _file: 'trust-engine/recommendations.json'
          });
        }
      } catch {}

      // Apply filters
      if (filterStatus && filterStatus !== 'all') allRecs = allRecs.filter(r => r.status === filterStatus);
      if (filterType) allRecs = allRecs.filter(r => r.type === filterType);
      if (filterSource) allRecs = allRecs.filter(r => r.source.startsWith(filterSource));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recommendations: allRecs, total: allRecs.length }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (url === '/api/recommendations/action' && req.method === 'POST') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { slug: rSlug, id: recId, action, convertTo, projectId, sourceFile } = JSON.parse(body);
        const brandDir = path.join(BASE, 'brand', rSlug);

        // Find the recommendation in its source file
        function findAndUpdate(filePath, updateFn) {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          let items = Array.isArray(raw) ? raw : raw.ideas || raw.ideas_generated || raw.recommendations || [];
          const idx = items.findIndex(i => (i.id || i.rec_id) === recId);
          if (idx === -1) return false;
          updateFn(items, idx);
          if (Array.isArray(raw)) { fs.writeFileSync(filePath, JSON.stringify(items, null, 2)); }
          else { fs.writeFileSync(filePath, JSON.stringify(raw, null, 2)); }
          return true;
        }

        // Search in all possible files
        const searchFiles = [
          path.join(brandDir, 'atalaya', 'profiles-pending.json'),
          path.join(brandDir, 'atalaya', 'competitors-pending.json'),
          path.join(brandDir, 'atalaya', 'ads-pending.json'),
          path.join(brandDir, 'atalaya', 'pending-ideas.json'),
          path.join(brandDir, 'monitoring', 'pending-recommendations.json'),
          path.join(brandDir, 'trust-engine', 'recommendations.json'),
        ];

        let found = false;
        for (const fp of searchFiles) {
          if (!fs.existsSync(fp)) continue;
          try {
            found = findAndUpdate(fp, (items, idx) => {
              const item = items[idx];
              if (action === 'dismiss') {
                item.status = 'dismissed';
                item.actioned_at = new Date().toISOString();
              } else if (action === 'approve') {
                // Move to ideas.json
                const ideasPath = path.join(brandDir, 'ideas.json');
                let ideas = { ideas: [] };
                try { ideas = JSON.parse(fs.readFileSync(ideasPath, 'utf-8')); } catch {}
                if (!ideas.ideas) ideas.ideas = [];
                const isContact = (item.type === 'contact' || item.contact);
                ideas.ideas.push({
                  id: item.id || recId,
                  type: isContact ? 'contact' : 'content',
                  status: 'new',
                  title: item.title || item.adapted_idea?.title || '',
                  description: item.description || item.adapted_idea?.description || '',
                  source: item.source || 'atalaya',
                  list: isContact ? (item.contact?.target_channel || 'outreach') : (item.content?.list || 'keywords'),
                  channels: item.content?.channels || item.adapted_idea?.recommended_channels || [],
                  target_channel: item.contact?.target_channel || '',
                  priority_score: item.priority === 'high' ? 80 : item.priority === 'medium' ? 50 : 20,
                  created_at: new Date().toISOString(),
                  notes: item.rationale || ''
                });
                fs.writeFileSync(ideasPath, JSON.stringify(ideas, null, 2));
                item.status = 'approved';
                item.actioned_at = new Date().toISOString();
                item.converted_to = 'idea:' + (item.id || recId);
              } else if (action === 'convert') {
                // Convert to task in project
                const pId = projectId || item.operational?.linked_project || item.linked_project || item.linkedProject;
                if (!pId) { throw new Error('No project specified'); }
                const projectsDir = path.join(brandDir, 'projects');
                const projDirs = fs.readdirSync(projectsDir).filter(d => d.startsWith(pId));
                if (projDirs.length === 0) throw new Error('Project not found: ' + pId);
                const tasksPath = path.join(projectsDir, projDirs[0], 'tasks.json');
                let tasks = [];
                try { tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf-8')); } catch {}
                if (!Array.isArray(tasks)) tasks = tasks.tasks || [];
                const taskId = projDirs[0] + '-T' + String(tasks.length + 1).padStart(2, '0');
                tasks.push({
                  id: taskId,
                  name: item.title || '',
                  description: (item.rationale || '') + (item.operational?.suggested_action ? '\n\n**Accion sugerida:** ' + item.operational.suggested_action : ''),
                  status: 'todo',
                  source: item.source || 'recommendation',
                  created_at: new Date().toISOString()
                });
                fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
                item.status = 'converted';
                item.actioned_at = new Date().toISOString();
                item.converted_to = 'task:' + taskId;
                item.converted_to_task = taskId;
              }
            });
            if (found) break;
          } catch {}
        }

        if (found) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Recommendation not found' }));
        }
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === Competitors sources.json API ===
  if (url === '/api/competitors-sources' && req.method === 'GET') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const cSlug = new URL('http://x' + req.url).searchParams.get('slug') || '';
    try {
      const srcPath = path.join(BASE, 'brand', cSlug, 'market-and-us', 'competitors', 'sources.json');
      const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ competitors: { direct: [], indirect: [] } }));
    }
    return;
  }
  if (url === '/api/competitors-sources' && req.method === 'POST') {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const cSlug = new URL('http://x' + req.url).searchParams.get('slug') || '';
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const srcDir = path.join(BASE, 'brand', cSlug, 'market-and-us', 'competitors');
        if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });
        const srcPath = path.join(srcDir, 'sources.json');
        // Preserve confirmed_at/confirmed_by from existing file
        let existing = {};
        try { existing = JSON.parse(fs.readFileSync(srcPath, 'utf-8')); } catch {}
        data.confirmed_at = existing.confirmed_at || data.confirmed_at;
        data.confirmed_by = existing.confirmed_by || data.confirmed_by;
        data.updated_at = new Date().toISOString();
        fs.writeFileSync(srcPath, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  if (url.startsWith('/api/atalaya-overview')) {
    if (!req._adminToken) { res.writeHead(403); res.end('Forbidden'); return; }
    const atSlug = atalayaSlug();
    try {
      const pendingPath = path.join(BASE, 'brand', atSlug, 'atalaya', 'pending-ideas.json');
      let pending = [];
      try { const raw = JSON.parse(fs.readFileSync(pendingPath, 'utf-8')); pending = Array.isArray(raw) ? raw : raw.ideas_generated || []; } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ pendingCount: pending.length }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // === Idea Bank page (admin mode) ===
  if (url.startsWith('/idea-bank/') || url === '/idea-bank') {
    if (!req._adminToken) { res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(portalForbiddenPage()); return; }
    const slug = url.replace('/idea-bank/', '').replace(/\/api\/.*/, '').replace(/\/$/, '') || null;
    if (!slug) {
      const clients = loadClients();
      const links = clients.map(c => `<div class="card"><a href="${req._adminBase}/idea-bank/${c.slug}/">${c.emoji || '🏢'} ${c.name || c.slug}</a></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(page('Idea Bank', `<a class="back" href="${req._adminBase}/">← Mission Control</a>`, `<h1>💡 Idea Bank por cliente</h1>${links}`));
      return;
    }
    const client = loadClients().find(c => c.slug === slug);
    const clientName = client ? (client.name || slug) : slug;
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(buildIdeaBankPage(slug, req._adminBase, clientName));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Idea Bank Error', '', `<h1>Error</h1><pre>${err.stack}</pre>`));
    }
    return;
  }

  // === Atalaya page (admin mode) ===
  if (url.startsWith('/atalaya/') || url === '/atalaya') {
    if (!req._adminToken) { res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(portalForbiddenPage()); return; }
    const slug = url.replace('/atalaya/', '').replace(/\/api\/.*/, '').replace(/\/$/, '') || null;
    if (!slug) {
      const clients = loadClients();
      const links = clients.map(c => `<div class="card"><a href="${req._adminBase}/atalaya/${c.slug}/">${c.emoji || '🏢'} ${c.name || c.slug}</a></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(page('Atalaya', `<a class="back" href="${req._adminBase}/">← Mission Control</a>`, `<h1>🏰 Atalaya por cliente</h1>${links}`));
      return;
    }
    const client = loadClients().find(c => c.slug === slug);
    const clientName = client ? (client.name || slug) : slug;
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(buildAtalayaPage(slug, req._adminBase, clientName));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Atalaya Error', '', `<h1>Error</h1><pre>${err.stack}</pre>`));
    }
    return;
  }

  // === Trust Engine page (admin mode) ===
  if (url.startsWith('/trust-engine/') || url === '/trust-engine') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }
    const slug = url.replace('/trust-engine/', '').replace(/\/$/, '') || null;
    if (!slug) {
      const clients = loadClients();
      const links = clients.map(c => `<div class="card"><a href="${req._adminBase}/trust-engine/${c.slug}/">${c.emoji || '🏢'} ${c.name || c.slug}</a></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(page('Trust Engine', `<a class="back" href="${req._adminBase}/">← Mission Control</a>`, `<h1>🔍 Trust Engine por cliente</h1>${links}`));
      return;
    }
    const client = loadClients().find(c => c.slug === slug);
    const clientName = client ? (client.name || slug) : slug;
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(buildTrustEnginePage(slug, req._adminBase, clientName));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Trust Engine Error', '', `<h1>Error</h1><pre>${err.stack}</pre>`));
    }
    return;
  }

  // === Settings page (admin mode) ===
  if (url.startsWith('/settings/') || url === '/settings') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }
    const slug = url.replace('/settings/', '').replace(/\/$/, '') || null;
    if (!slug) {
      const clients = loadClients();
      const links = clients.map(c => `<div class="card"><a href="${req._adminBase}/settings/${c.slug}/">${c.emoji || '🏢'} ${c.name || c.slug}</a></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(page('Settings', `<a class="back" href="${req._adminBase}/">← Mission Control</a>`, `<h1>⚙️ Settings por cliente</h1>${links}`));
      return;
    }
    const client = loadClients().find(c => c.slug === slug);
    const clientName = client ? (client.name || slug) : slug;
    const guildId = client ? (client.guild || client.discord_guild_id || '') : '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(buildSettingsPage(slug, req._adminBase, clientName, guildId));
    return;
  }

  // === API: Google Workspace OAuth (gog auth) — Step 1: Generate auth URL ===
  if (req.method === 'POST' && url === '/api/gog-auth-start') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { email, services } = JSON.parse(body);
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email inválido' }));
          return;
        }
        const svcList = services || 'gmail,calendar,drive,contacts,sheets';
        const { execSync } = require('child_process');
        const gogPath = '/opt/homebrew/bin/gog';
        const output = execSync(
          `${gogPath} auth add "${email}" --remote --step 1 --services "${svcList}" --force-consent --plain 2>&1`,
          { timeout: 15000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } }
        );
        // Parse auth_url from output
        const urlMatch = output.match(/auth_url\t(https:\/\/[^\s]+)/);
        if (urlMatch) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, authUrl: urlMatch[1], email }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No se pudo generar la URL de autorización', output: output.slice(0, 500) }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Google Workspace OAuth (gog auth) — Step 2: Exchange code ===
  if (req.method === 'POST' && url === '/api/gog-auth-complete') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { email, authUrl } = JSON.parse(body);
        if (!email || !authUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Falta email o authUrl (redirect URL)' }));
          return;
        }
        const { execSync } = require('child_process');
        const gogPath = '/opt/homebrew/bin/gog';
        const output = execSync(
          `${gogPath} auth add "${email}" --remote --step 2 --auth-url "${authUrl}" --plain 2>&1`,
          { timeout: 30000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } }
        );
        if (output.includes('stored') || output.includes('success') || output.includes('token')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: output.trim() }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: output.trim() }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Google Workspace — List connected accounts ===
  if (req.method === 'GET' && url === '/api/gog-accounts') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('/opt/homebrew/bin/gog auth list --json 2>&1', { timeout: 10000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(output);
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // === API: Get system service account email ===
  if (req.method === 'GET' && url === '/api/system-sa') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const saPath = path.join(BASE, '.secrets', 'google-service-account.json');
    try {
      const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ configured: true, email: sa.client_email, projectId: sa.project_id }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ configured: false }));
    }
    return;
  }

  // === API: Save system service account ===
  if (req.method === 'POST' && url === '/api/system-sa') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const sa = JSON.parse(body);
        if (!sa.client_email || !sa.private_key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid service account JSON: missing client_email or private_key' }));
          return;
        }
        const secretsDir = path.join(BASE, '.secrets');
        if (!fs.existsSync(secretsDir)) fs.mkdirSync(secretsDir, { recursive: true });
        fs.writeFileSync(path.join(secretsDir, 'google-service-account.json'), JSON.stringify(sa, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, email: sa.client_email, projectId: sa.project_id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }

  // === System Service Account Config Page ===
  if (url === '/connect/system/google-sa') {
    const saPath = path.join(BASE, '.secrets', 'google-service-account.json');
    let currentEmail = null;
    let currentProject = null;
    try {
      const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
      currentEmail = sa.client_email;
      currentProject = sa.project_id;
    } catch {}

    const statusHtml = currentEmail
      ? `<div style="background:#E8F8E8;border:2px solid #4A5D23;border-radius:6px;padding:12px 16px;margin:16px 0;">
           <strong>✅ Service Account configurado</strong><br/>
           Email: <code style="user-select:all;">${currentEmail}</code><br/>
           Proyecto: <code>${currentProject || 'N/A'}</code>
         </div>`
      : `<div style="background:#FFF8E1;border:2px solid #E5A100;border-radius:6px;padding:12px 16px;margin:16px 0;">
           <strong>⚠️ No configurado</strong> — Pega el JSON de tu Service Account abajo.
         </div>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Service Account de Google — Sistema</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { --bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--green:#4A5D23; }
  @media(prefers-color-scheme:dark){:root{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--green:#6B8E23;}}
  *{box-sizing:border-box;}body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);max-width:600px;margin:40px auto;padding:0 24px;line-height:1.7;}
  h1{font-family:'Space Grotesk',sans-serif;color:var(--rust);font-size:1.8em;}
  .card{background:var(--card);border:2px solid var(--ink);border-radius:8px;padding:24px;box-shadow:3px 3px 0 var(--ink);}
  .btn{padding:12px 28px;border:2px solid var(--ink);border-radius:6px;font-family:'Nunito',sans-serif;font-weight:700;font-size:16px;cursor:pointer;box-shadow:2px 2px 0 var(--ink);background:var(--rust);color:#fff;}
  .btn:disabled{opacity:0.5;cursor:not-allowed;}
  .back{color:var(--muted);text-decoration:none;font-size:14px;}.back:hover{color:var(--rust);}
  textarea{width:100%;min-height:200px;font-family:monospace;font-size:13px;padding:12px;border:2px solid var(--ink);border-radius:6px;background:var(--card);color:var(--text);resize:vertical;box-sizing:border-box;}
  #result{margin-top:16px;padding:12px 16px;border-radius:6px;display:none;font-size:14px;}
</style></head><body>
  <a class="back" href="/mc">← Mission Control</a>
  <h1>🔑 Service Account de Google</h1>
  <p style="color:var(--muted);">Configuración global del sistema. Este Service Account se usa para <strong>todos los clientes</strong> en Google Analytics, Search Console, y otros servicios de Google.</p>
  ${statusHtml}
  <div class="card">
    <p style="font-weight:700;">Pega aquí el contenido completo del archivo JSON del Service Account:</p>
    <p style="font-size:13px;color:var(--muted);">Es el archivo <code>.json</code> que descargaste de Google Cloud Console → IAM → Cuentas de servicio → Claves.</p>
    <textarea id="saJson" placeholder='{"type": "service_account", "project_id": "...", "client_email": "...", ...}'></textarea>
    <div style="margin-top:16px;">
      <button class="btn" onclick="saveSA()">💾 Guardar Service Account</button>
    </div>
    <div id="result"></div>
  </div>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);">
    <strong>🔒 Seguridad:</strong> El JSON se guarda en <code>.secrets/google-service-account.json</code> en el servidor local. Nunca pasa por Discord ni servicios externos. Solo accesible vía Tailscale HTTPS.
  </div>
<script>
async function saveSA() {
  const btn = document.querySelector('.btn');
  const result = document.getElementById('result');
  const text = document.getElementById('saJson').value.trim();
  if (!text) { result.style.display='block'; result.style.background='#FDE8E8'; result.style.border='2px solid #C0392B'; result.style.color='#C0392B'; result.innerHTML='❌ Pega el JSON primero.'; return; }
  btn.disabled = true; btn.textContent = '⏳ Guardando...';
  result.style.display='block'; result.style.background='#FFF8E1'; result.style.border='2px solid #E5A100'; result.style.color='#8B6914'; result.innerHTML='⏳ Validando y guardando...';
  try {
    const parsed = JSON.parse(text);
    if (!parsed.client_email || !parsed.private_key) throw new Error('Falta client_email o private_key');
    const res = await fetch('/mc/api/system-sa', { method:'POST', headers:{'Content-Type':'application/json'}, body: text });
    const data = await res.json();
    if (data.ok) {
      result.style.background='#E8F8E8'; result.style.border='2px solid #4A5D23'; result.style.color='#2D5A1E';
      result.innerHTML='✅ <strong>¡Guardado!</strong> Email: <code>'+data.email+'</code><br/>Ya puedes usar las páginas de conexión de GA4 y GSC. <a href="/mc/connect/hospital-capilar/ga4">Probar GA4 →</a>';
    } else {
      result.style.background='#FDE8E8'; result.style.border='2px solid #C0392B'; result.style.color='#C0392B';
      result.innerHTML='❌ '+data.error;
    }
  } catch(e) {
    result.style.display='block'; result.style.background='#FDE8E8'; result.style.border='2px solid #C0392B'; result.style.color='#C0392B';
    result.innerHTML='❌ JSON inválido: '+e.message;
  }
  btn.disabled=false; btn.textContent='💾 Guardar Service Account';
}
</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(html);
    return;
  }

  // === Connect Page: /connect/{slug}/{apiId} ===
  if (url.startsWith('/connect/')) {
    const parts = url.replace('/connect/', '').split('/').filter(Boolean);
    const slug = parts[0];
    const apiId = parts[1];

    if (!slug || !apiId) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Falta slug o apiId</h1><p>Usa: /connect/{slug}/{apiId}</p>');
      return;
    }

    // Load catalog + setup guides
    let catalog = {};
    let setupGuides = {};
    try {
      const catalogPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'api-catalog.json');
      catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    } catch (e) {
      res.writeHead(500); res.end('Failed to load API catalog'); return;
    }
    try {
      const guidesPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'setup-guides.json');
      setupGuides = JSON.parse(fs.readFileSync(guidesPath, 'utf-8'));
    } catch {}

    // Find the API in any category
    let apiMeta = null;
    let categoryLabel = '';
    for (const [catKey, catData] of Object.entries(catalog.categories || {})) {
      if (catData.apis && catData.apis[apiId]) {
        apiMeta = catData.apis[apiId];
        categoryLabel = catData.label || catKey;
        break;
      }
    }

    if (!apiMeta) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>API "${apiId}" no encontrada en el catálogo</h1>`);
      return;
    }

    // Load current integration status for this client
    let currentStatus = 'not_configured';
    let currentConfig = {};
    let lastTestedAt = null;
    let lastError = null;
    try {
      const intPath = path.join(BASE, 'brand', slug, 'integrations.json');
      const intData = JSON.parse(fs.readFileSync(intPath, 'utf-8'));
      const entry = (intData.dataSources || {})[apiId] || (intData.systemOverrides || {})[apiId];
      if (entry) {
        currentStatus = entry.status || 'not_configured';
        currentConfig = entry.config || {};
        lastTestedAt = entry.lastTestedAt || null;
        lastError = entry.lastError || null;
      }
    } catch {}

    // Load client name
    let clientName = slug;
    try {
      const clientsData = JSON.parse(fs.readFileSync(path.join(BASE, 'clients.json'), 'utf-8'));
      const client = clientsData.clients.find(c => c.slug === slug);
      if (client) clientName = client.name;
    } catch {}

    const credentials = apiMeta.credentials || [];
    const configFields = apiMeta.config || [];
    const allFields = [...credentials, ...configFields];
    const ownership = apiMeta.ownership || 'system';
    const guide = setupGuides[apiId] || null;

    const statusBadge = currentStatus === 'connected'
      ? '<span style="background:#4A5D23;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">✅ Conectado</span>'
      : currentStatus === 'error'
        ? '<span style="background:#C0392B;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">❌ Error</span>'
        : currentStatus === 'pending'
          ? '<span style="background:#E5A100;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">⏳ Pendiente</span>'
          : '<span style="background:#5D5348;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">⬜ No configurado</span>';

    const lastTestedHtml = lastTestedAt
      ? `<p style="font-size:13px;color:var(--muted);">Último test: ${new Date(lastTestedAt).toLocaleString('es-ES')}</p>`
      : '';
    const lastErrorHtml = lastError
      ? `<div style="background:#FDE8E8;border:2px solid #C0392B;border-radius:6px;padding:10px 14px;margin:10px 0;font-size:14px;color:#C0392B;"><strong>Último error:</strong> ${lastError.replace(/</g,'&lt;')}</div>`
      : '';

    // Build form fields
    let fieldsHtml = '';
    for (const field of allFields) {
      const isSensitive = field.sensitive !== false;
      const inputType = isSensitive ? 'password' : 'text';
      const currentVal = (!isSensitive && currentConfig[field.key]) ? ` value="${String(currentConfig[field.key]).replace(/"/g,'&quot;')}"` : '';
      const helpText = field.help ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${field.help}</div>` : '';
      const eyeBtn = isSensitive ? `<button type="button" onclick="toggleVis(this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;padding:4px;" title="Mostrar/ocultar">👁️</button>` : '';

      fieldsHtml += `
        <div style="margin-bottom:16px;">
          <label style="font-weight:700;font-size:15px;display:block;margin-bottom:4px;">${field.label}</label>
          ${helpText}
          <div style="position:relative;margin-top:6px;">
            <input name="${field.key}" type="${inputType}" placeholder="${field.placeholder || ''}"${currentVal}
              style="width:100%;padding:10px 14px;${isSensitive ? 'padding-right:44px;' : ''}border:2px solid var(--ink);border-radius:6px;font-size:15px;font-family:'Nunito',sans-serif;background:var(--card);color:var(--text);box-sizing:border-box;"
              data-sensitive="${isSensitive}" />
            ${eyeBtn}
          </div>
        </div>`;
    }

    // Custom OAuth page for Google Workspace (gog CLI)
    const isGogOAuth = apiMeta.customOAuth === 'gog';

    // OAuth instruction for special APIs
    let oauthNote = '';
    if (['ga4', 'gsc', 'google_ads'].includes(apiId)) {
      oauthNote = `
        <div style="background:#E8F4FD;border:2px solid #3B82F6;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <strong>💡 OAuth API</strong> — Esta API usa OAuth. Necesitarás autorizar acceso desde Google Cloud Console.
          <br/>Si ya tienes un Service Account o refresh token, pégalo abajo. Si no, sigue las instrucciones del enlace de documentación.
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Conectar ${apiMeta.provider} — ${clientName}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F5F0E6; --card: #FDF8EF; --border: #D4C9B8; --text: #1A1A2E; --muted: #5D5348;
    --ink: #1A1A2E; --rust: #C45D35; --green: #4A5D23; --blue: #3B82F6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1A1A2E; --card: #2D2D44; --border: #3D3D5C; --text: #FDF8EF; --muted: #A09890;
      --ink: #FDF8EF; --rust: #D4734F; --green: #6B8E23; --blue: #60a5fa;
    }
  }
  * { box-sizing: border-box; }
  body { font-family: 'Nunito', sans-serif; background: var(--bg); color: var(--text); max-width: 600px; margin: 40px auto; padding: 0 24px; line-height: 1.7; }
  h1 { font-family: 'Space Grotesk', sans-serif; color: var(--rust); font-size: 1.8em; margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: 15px; margin-bottom: 24px; }
  .card { background: var(--card); border: 2px solid var(--ink); border-radius: 8px; padding: 24px; box-shadow: 3px 3px 0 var(--ink); }
  .btn { padding: 12px 28px; border: 2px solid var(--ink); border-radius: 6px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 2px 2px 0 var(--ink); transition: all 0.15s; }
  .btn:hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--ink); }
  .btn-primary { background: var(--rust); color: #fff; }
  .btn-secondary { background: var(--card); color: var(--text); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .back { color: var(--muted); text-decoration: none; font-size: 14px; }
  .back:hover { color: var(--rust); }
  .meta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
  #result { margin-top: 16px; padding: 12px 16px; border-radius: 6px; display: none; font-size: 14px; }
  .tag { font-size: 12px; padding: 2px 10px; border-radius: 20px; border: 1px solid var(--border); color: var(--muted); }
</style>
</head>
<body>
  <a class="back" href="/mc">← Mission Control</a>

  <h1>${apiMeta.icon || '🔌'} Conectar ${apiMeta.provider}</h1>
  <p class="subtitle">${apiMeta.desc} · Para <strong>${clientName}</strong></p>

  <div class="meta-row">
    ${statusBadge}
    <span class="tag">${ownership === 'system' ? '🔧 Sistema' : '👤 Cliente'}</span>
    ${apiMeta.docs ? `<a href="${apiMeta.docs}" target="_blank" style="color:var(--blue);font-size:14px;font-weight:700;">📖 Documentación →</a>` : ''}
  </div>
  ${lastTestedHtml}
  ${lastErrorHtml}
  ${oauthNote}

  ${guide && guide.systemServiceAccountNote ? `<div id="sa-info" style="display:none;background:var(--card);border:2px solid var(--ink);border-radius:8px;padding:14px 18px;margin-top:16px;font-size:14px;box-shadow:3px 3px 0 var(--ink);"></div>` : ''}

  ${guide ? `
  <div class="card" style="margin-top:20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:0;font-size:1.3em;">📋 Instrucciones paso a paso</h2>
      <div style="display:flex;gap:8px;">
        ${guide.difficulty ? `<span class="tag" style="background:${guide.difficulty === 'baja' ? 'var(--green)' : guide.difficulty === 'media' ? '#E5A100' : '#C0392B'};color:#fff;border:none;">Dificultad: ${guide.difficulty}</span>` : ''}
        ${guide.time ? `<span class="tag">⏱️ ${guide.time}</span>` : ''}
      </div>
    </div>
    ${guide.warning ? `<div style="background:#FFF8E1;border:2px solid #E5A100;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:14px;color:#8B6914;">${guide.warning}</div>` : ''}
    <div class="steps-container">
      ${guide.steps.map((step, i) => `
        <div class="step" id="step-${i}">
          <div class="step-header" onclick="toggleStep(${i})" style="cursor:pointer;display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
            <div class="step-number" style="min-width:32px;height:32px;background:var(--rust);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:'Space Grotesk',sans-serif;font-size:14px;">${i + 1}</div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:15px;">${step.title}</div>
            </div>
            <span class="step-toggle" id="toggle-${i}" style="font-size:18px;color:var(--muted);transition:transform 0.2s;">▶</span>
          </div>
          <div class="step-body" id="body-${i}" style="display:none;padding:12px 0 12px 44px;font-size:14px;line-height:1.8;color:var(--text);">
            ${step.instructions}
          </div>
        </div>
      `).join('')}
    </div>
    <button type="button" class="btn btn-secondary" onclick="expandAll()" style="margin-top:12px;font-size:13px;padding:6px 16px;">
      📖 Expandir todo
    </button>
  </div>
  ` : ''}

  ${isGogOAuth ? `
  <div class="card" style="margin-top:20px;">
    <h2 style="font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:0 0 16px 0;font-size:1.3em;">🔌 Conectar cuenta de Google</h2>

    <div id="gog-step1">
      <div style="margin-bottom:16px;">
        <label style="font-weight:700;font-size:15px;display:block;margin-bottom:4px;">Email de la cuenta de Google</label>
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">La cuenta de Gmail o Google Workspace que quieres conectar</div>
        <input id="gog-email" type="email" placeholder="info@suempresa.com"
          style="width:100%;padding:10px 14px;border:2px solid var(--ink);border-radius:6px;font-size:15px;font-family:'Nunito',sans-serif;background:var(--card);color:var(--text);box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:700;font-size:14px;display:block;margin-bottom:4px;">Servicios a autorizar</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:14px;">
          <label><input type="checkbox" class="gog-svc" value="gmail" checked> 📧 Gmail</label>
          <label><input type="checkbox" class="gog-svc" value="calendar" checked> 📅 Calendar</label>
          <label><input type="checkbox" class="gog-svc" value="drive" checked> 📁 Drive</label>
          <label><input type="checkbox" class="gog-svc" value="contacts" checked> 👤 Contacts</label>
          <label><input type="checkbox" class="gog-svc" value="sheets"> 📊 Sheets</label>
          <label><input type="checkbox" class="gog-svc" value="docs"> 📝 Docs</label>
        </div>
      </div>
      <button class="btn btn-primary" onclick="gogStep1()">🔗 Generar link de autorización</button>
      <div id="gog-result1" style="margin-top:12px;display:none;"></div>
    </div>

    <div id="gog-step2" style="display:none;margin-top:20px;padding-top:16px;border-top:2px solid var(--border);">
      <div style="background:#E8F4FD;border:2px solid #3B82F6;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
        <strong>📋 Paso 2:</strong> El propietario de la cuenta debe abrir el link de arriba, autorizar en Google, y <strong>copiar la URL completa a la que fue redirigido</strong> (será algo como <code>http://127.0.0.1:xxxxx/oauth2/callback?code=...</code>).
      </div>
      <label style="font-weight:700;font-size:15px;display:block;margin-bottom:4px;">URL de redirección de Google</label>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">La URL completa que aparece en el navegador después de autorizar</div>
      <input id="gog-redirect-url" type="text" placeholder="http://127.0.0.1:xxxxx/oauth2/callback?code=..."
        style="width:100%;padding:10px 14px;border:2px solid var(--ink);border-radius:6px;font-size:14px;font-family:monospace;background:var(--card);color:var(--text);box-sizing:border-box;" />
      <div style="margin-top:12px;">
        <button class="btn btn-primary" onclick="gogStep2()">✅ Completar conexión</button>
      </div>
      <div id="gog-result2" style="margin-top:12px;display:none;"></div>
    </div>

    <div id="gog-accounts" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);"></div>
  </div>
  ` : `
  <div class="card" style="margin-top:20px;">
    <h2 style="font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:0 0 16px 0;font-size:1.3em;">🔌 Credenciales</h2>
    <form id="connectForm" onsubmit="return false;">`}

      ${fieldsHtml || '<p style="color:var(--muted);">Esta API no requiere credenciales manuales.</p>'}

      <div style="display:flex;gap:12px;margin-top:20px;">
        <button type="submit" class="btn btn-primary" id="connectBtn" onclick="doConnect()">
          🔌 Conectar y testear
        </button>
        <button type="button" class="btn btn-secondary" id="testBtn" onclick="doTest()">
          🧪 Solo testear
        </button>
      </div>
    </form>

    <div id="result"></div>
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);">
    <strong>🔒 Seguridad:</strong> Las credenciales se guardan en <code>brand/${slug}/.env</code> en el servidor local.
    Nunca pasan por Discord ni por ningún servicio externo. La conexión está protegida por HTTPS + Tailscale.
  </div>

<script>
// Copy URL helper
function copyGogUrl() {
  const url = window._gogAuthUrl || document.getElementById('gog-auth-url').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() {
      event.target.textContent = '✅ Copiado';
    });
  } else {
    // Fallback for mobile/insecure contexts
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    event.target.textContent = '✅ Copiado';
  }
}

// Google Workspace OAuth (gog CLI) functions
async function gogStep1() {
  const email = document.getElementById('gog-email').value.trim();
  if (!email || !email.includes('@')) {
    showGogResult('gog-result1', 'error', '❌ Introduce un email válido');
    return;
  }
  const services = [...document.querySelectorAll('.gog-svc:checked')].map(c => c.value).join(',');
  if (!services) {
    showGogResult('gog-result1', 'error', '❌ Selecciona al menos un servicio');
    return;
  }
  showGogResult('gog-result1', 'info', '⏳ Generando link de autorización...');
  try {
    const res = await fetch('/mc/api/gog-auth-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, services })
    });
    const data = await res.json();
    if (data.ok && data.authUrl) {
      window._gogAuthUrl = data.authUrl;
      showGogResult('gog-result1', 'ok',
        '✅ <strong>Link generado.</strong> Envía este link al propietario de la cuenta para que autorice:<br/><br/>' +
        '<div id="gog-auth-url" style="background:var(--bg);padding:8px 12px;border-radius:4px;word-break:break-all;font-size:12px;font-family:monospace;margin:8px 0;user-select:all;cursor:text;">' + data.authUrl + '</div>' +
        '<button class="btn btn-secondary" style="font-size:13px;padding:6px 14px;" onclick="copyGogUrl()">📋 Copiar link</button>'
      );
      document.getElementById('gog-step2').style.display = 'block';
      document.getElementById('gog-step2').dataset.email = email;
    } else {
      showGogResult('gog-result1', 'error', '❌ ' + (data.error || 'Error desconocido'));
    }
  } catch (e) {
    showGogResult('gog-result1', 'error', '❌ Error de red: ' + e.message);
  }
}

async function gogStep2() {
  const email = document.getElementById('gog-step2').dataset.email;
  const authUrl = document.getElementById('gog-redirect-url').value.trim();
  if (!authUrl) {
    showGogResult('gog-result2', 'error', '❌ Pega la URL de redirección');
    return;
  }
  showGogResult('gog-result2', 'info', '⏳ Completando conexión...');
  try {
    const res = await fetch('/mc/api/gog-auth-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, authUrl })
    });
    const data = await res.json();
    if (data.ok) {
      showGogResult('gog-result2', 'ok', '✅ <strong>¡Conectado!</strong> La cuenta ' + email + ' está lista. ' + (data.detail || ''));
      loadGogAccounts();
    } else {
      showGogResult('gog-result2', 'error', '❌ ' + (data.error || 'Error desconocido'));
    }
  } catch (e) {
    showGogResult('gog-result2', 'error', '❌ Error de red: ' + e.message);
  }
}

function showGogResult(id, type, msg) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  if (type === 'ok') { el.style.background = '#E8F8E8'; el.style.border = '2px solid #4A5D23'; el.style.color = '#2D5A1E'; }
  else if (type === 'error') { el.style.background = '#FDE8E8'; el.style.border = '2px solid #C0392B'; el.style.color = '#C0392B'; }
  else { el.style.background = '#FFF8E1'; el.style.border = '2px solid #E5A100'; el.style.color = '#8B6914'; }
  el.style.padding = '12px 16px'; el.style.borderRadius = '6px'; el.style.fontSize = '14px';
  el.innerHTML = msg;
}

async function loadGogAccounts() {
  try {
    const res = await fetch('/mc/api/gog-accounts');
    const data = await res.json();
    const accounts = Array.isArray(data) ? data : (data.accounts || []);
    if (accounts.length > 0) {
      const el = document.getElementById('gog-accounts');
      el.innerHTML = '<div style="font-weight:700;margin-bottom:8px;">📧 Cuentas conectadas:</div>' +
        accounts.map(a => {
          const email = a.email || a.account || a;
          const services = a.services || a.scopes || '';
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;"><span class="dot g"></span><code>' + email + '</code>' +
            (services ? '<span style="font-size:11px;color:var(--muted);">' + services + '</span>' : '') + '</div>';
        }).join('');
    }
  } catch {}
}
// Load accounts on page load
if (document.getElementById('gog-accounts')) loadGogAccounts();

// Load system service account email for Google APIs
(async function() {
  try {
    const res = await fetch('/mc/api/system-sa');
    const data = await res.json();
    if (data.configured && data.email) {
      document.querySelectorAll('.sa-email').forEach(el => {
        el.textContent = data.email;
        el.style.background = '#E8F8E8';
        el.style.padding = '4px 8px';
        el.style.borderRadius = '4px';
        el.style.fontWeight = '700';
        el.style.userSelect = 'all';
      });
      const saInfo = document.getElementById('sa-info');
      if (saInfo) {
        saInfo.innerHTML = '<span style="color:var(--green);font-weight:700;">✅ Service Account configurado:</span> <code style="user-select:all;">' + data.email + '</code>';
        saInfo.style.display = 'block';
      }
    } else {
      const saInfo = document.getElementById('sa-info');
      if (saInfo) {
        saInfo.innerHTML = '⚠️ Service Account no configurado. <a href="/mc/connect/system/google-sa" style="color:var(--rust);font-weight:700;">Configurar →</a>';
        saInfo.style.display = 'block';
      }
    }
  } catch {}
})();

let allExpanded = false;
function toggleStep(i) {
  const body = document.getElementById('body-' + i);
  const toggle = document.getElementById('toggle-' + i);
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggle.textContent = '▼';
  } else {
    body.style.display = 'none';
    toggle.textContent = '▶';
  }
}
function expandAll() {
  allExpanded = !allExpanded;
  document.querySelectorAll('.step-body').forEach((el, i) => {
    el.style.display = allExpanded ? 'block' : 'none';
    const t = document.getElementById('toggle-' + i);
    if (t) t.textContent = allExpanded ? '▼' : '▶';
  });
}

function toggleVis(btn) {
  const input = btn.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁️' : '🙈';
}

function showResult(type, msg) {
  const el = document.getElementById('result');
  el.style.display = 'block';
  if (type === 'ok') {
    el.style.background = '#E8F8E8'; el.style.border = '2px solid #4A5D23'; el.style.color = '#2D5A1E';
  } else if (type === 'error') {
    el.style.background = '#FDE8E8'; el.style.border = '2px solid #C0392B'; el.style.color = '#C0392B';
  } else {
    el.style.background = '#FFF8E1'; el.style.border = '2px solid #E5A100'; el.style.color = '#8B6914';
  }
  el.innerHTML = msg;
}

async function doConnect() {
  const btn = document.getElementById('connectBtn');
  btn.disabled = true; btn.textContent = '⏳ Conectando...';
  showResult('info', '⏳ Guardando credenciales y testeando conexión...');

  const form = document.getElementById('connectForm');
  const inputs = form.querySelectorAll('input');
  const secrets = {};
  const config = {};

  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (!val) return;
    if (inp.dataset.sensitive === 'true') {
      secrets[inp.name] = val;
    } else {
      config[inp.name] = val;
    }
  });

  try {
    const res = await fetch('/mc/api/client-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '${slug}',
        source: '${apiId}',
        type: '${ownership === 'system' ? 'override' : 'datasource'}',
        config,
        secrets
      })
    });
    const data = await res.json();

    if (data.ok && data.testResult) {
      if (data.testResult.status === 'connected' || data.testResult.status === 'ok') {
        showResult('ok', '✅ <strong>¡Conectado!</strong> La API responde correctamente. Ya puedes cerrar esta página.');
      } else if (data.testResult.status === 'error') {
        showResult('error', '❌ <strong>Error de conexión:</strong> ' + (data.testResult.error || 'Verifica las credenciales'));
      } else {
        showResult('info', '⏳ <strong>Guardado.</strong> Estado: ' + data.testResult.status);
      }
    } else if (data.error) {
      showResult('error', '❌ ' + data.error);
    } else {
      showResult('ok', '✅ Guardado. Recarga para ver el estado actualizado.');
    }
  } catch (e) {
    showResult('error', '❌ Error de red: ' + e.message);
  }

  btn.disabled = false; btn.textContent = '🔌 Conectar y testear';
}

async function doTest() {
  const btn = document.getElementById('testBtn');
  btn.disabled = true; btn.textContent = '⏳ Testeando...';
  showResult('info', '⏳ Testeando conexión existente...');

  try {
    const res = await fetch('/mc/api/client-integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: '${slug}', source: '${apiId}' })
    });
    const data = await res.json();

    if (data.ok && data.results && data.results['${apiId}']) {
      const r = data.results['${apiId}'];
      if (r.status === 'connected' || r.status === 'ok') {
        showResult('ok', '✅ <strong>Test exitoso.</strong> La API responde correctamente.');
      } else {
        showResult('error', '❌ <strong>Test fallido:</strong> ' + (r.error || r.status));
      }
    } else if (data.error) {
      showResult('error', '❌ ' + data.error);
    }
  } catch (e) {
    showResult('error', '❌ Error de red: ' + e.message);
  }

  btn.disabled = false; btn.textContent = '🧪 Solo testear';
}
</script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(html);
    return;
  }

  // === PUT handler: save presentations ===
  if (req.method === 'PUT' && url.match(/^\/brand\/[^/]+\/presentations\/[^/]+\.html$/)) {
    const fullPath = path.join(BASE, url.slice(1));
    if (!path.resolve(fullPath).startsWith(path.resolve(BASE)) || url.includes('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10e6) { req.destroy(); } });
    req.on('end', () => {
      try {
        fs.writeFileSync(fullPath, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, size: body.length }));
      } catch (e) {
        res.writeHead(500); res.end('Write failed: ' + e.message);
      }
    });
    return;
  }

  // === PUT handler: save edited docs ===
  if (req.method === 'PUT' && url.startsWith('/docs/')) {
    const rest = url.replace('/docs/', '');
    const parts = rest.split('/').filter(Boolean);
    const rootKey = parts[0];
    if (!rootKey || !DOC_ROOTS[rootKey]) { res.writeHead(404); res.end('Not found'); return; }
    const rootPath = DOC_ROOTS[rootKey];
    const subPath = parts.slice(1).join('/');
    const fullPath = path.join(rootPath, subPath);
    // Security
    if (!path.resolve(fullPath).startsWith(path.resolve(rootPath)) || (!fullPath.endsWith('.md') && !fullPath.endsWith('.html')) || subPath.includes('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5e6) { req.destroy(); } });
    req.on('end', () => {
      try {
        fs.writeFileSync(fullPath, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end('Write failed: ' + e.message);
      }
    });
    return;
  }

  // === API: health check ===
  if (url.startsWith('/api/health-check')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const service = params.get('service') || 'all';
    res.setHeader('Access-Control-Allow-Origin', '*');
    runHealthChecks(service).then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // === API: read api-health.json (cached) ===
  if (url === '/api/api-health') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const data = fs.readFileSync(API_HEALTH_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"lastCheck":null,"services":{}}');
    }
    return;
  }

  // === API: get masked env vars for a service ===
  if (req.method === 'GET' && url.startsWith('/api/env')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const serviceId = params.get('service');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const envVars = parseEnv(readEnvFile());
    const result = {};

    if (serviceId && SERVICE_ENV_MAP[serviceId]) {
      for (const field of SERVICE_ENV_MAP[serviceId]) {
        result[field.key] = { label: field.label, placeholder: field.placeholder, masked: maskKey(envVars[field.key] || ''), hasValue: !!(envVars[field.key]) };
      }
    } else {
      // Return all services with masked values
      for (const [svc, fields] of Object.entries(SERVICE_ENV_MAP)) {
        result[svc] = fields.map(f => ({ key: f.key, label: f.label, masked: maskKey(envVars[f.key] || ''), hasValue: !!(envVars[f.key]) }));
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // === API: save env var ===
  if (req.method === 'POST' && url === '/api/env') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { service, vars } = JSON.parse(body);
        if (!service || !vars || typeof vars !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing service or vars' }));
          return;
        }

        // Validate that vars match expected keys for this service
        const allowed = SERVICE_ENV_MAP[service];
        if (!allowed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown service: ${service}` }));
          return;
        }
        const allowedKeys = new Set(allowed.map(f => f.key));
        const updates = {};
        for (const [k, v] of Object.entries(vars)) {
          if (!allowedKeys.has(k)) continue;
          if (typeof v === 'string' && v.trim()) updates[k] = v.trim();
        }

        if (Object.keys(updates).length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No valid vars to save' }));
          return;
        }

        setEnvVars(updates);

        // Auto health-check the service
        runHealthChecks(service).then(hcResult => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, saved: Object.keys(updates), healthCheck: hcResult }));
        }).catch(err => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, saved: Object.keys(updates), healthCheckError: err.message }));
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: restart gateway ===
  if (url === '/api/restart-gateway') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      execSync('/opt/homebrew/bin/openclaw gateway restart 2>&1', { timeout: 30000, encoding: 'utf-8' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message.slice(0, 200) }));
    }
    return;
  }



  // === API: Client Integrations — catalog ===
  if (req.method === 'GET' && url === '/api/client-integrations/catalog') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const catalogPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'api-catalog.json');
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(catalog));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load catalog: ' + e.message }));
    }
    return;
  }

  // === API: Client Integrations — get merged data ===
  if (req.method === 'GET' && url.startsWith('/api/client-integrations')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = params.get('slug');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!slug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing slug parameter' }));
      return;
    }

    try {
      const catalogPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'api-catalog.json');
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

      // Read client integrations.json (may not exist)
      const intPath = path.join(BASE, 'brand', slug, 'integrations.json');
      let intData = { slug, dataSources: {}, systemOverrides: {} };
      try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}

      // Merge catalog info with client status — ensure every catalog API has an entry
      // Use ownership field: "system" → systemOverrides, "client" → dataSources
      const merged = { slug, dataSources: {}, systemOverrides: {}, updatedAt: intData.updatedAt || null };

      for (const [catKey, catData] of Object.entries(catalog.categories || {})) {
        for (const [apiId, apiMeta] of Object.entries(catData.apis || {})) {
          const ownership = apiMeta.ownership || 'system';
          const isSystem = ownership === 'system';
          const section = isSystem ? 'systemOverrides' : 'dataSources';
          // Check both sections in client data (in case of migration)
          const clientEntry = (intData.systemOverrides || {})[apiId] || (intData.dataSources || {})[apiId] || {};
          merged[section][apiId] = {
            provider: apiMeta.provider,
            status: clientEntry.status || 'not_configured',
            config: clientEntry.config || {},
            envVars: clientEntry.envVars || [],
            lastTestedAt: clientEntry.lastTestedAt || null,
            lastError: clientEntry.lastError || null,
            notes: clientEntry.notes || null,
          };
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(merged));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // === API: Client Integrations — save config + secrets ===
  if (req.method === 'POST' && url === '/api/client-integrations') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, source, type, config, secrets } = JSON.parse(body);
        if (!slug || !source) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug or source' }));
          return;
        }

        const brandDir = path.join(BASE, 'brand', slug);
        if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });

        // Load or create integrations.json
        const intPath = path.join(brandDir, 'integrations.json');
        let intData;
        try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch { intData = { slug, dataSources: {}, systemOverrides: {} }; }
        if (!intData.dataSources) intData.dataSources = {};
        if (!intData.systemOverrides) intData.systemOverrides = {};

        const section = type === 'override' ? 'systemOverrides' : 'dataSources';
        if (!intData[section][source]) intData[section][source] = { provider: source, status: 'not_configured', config: {}, envVars: [] };

        const entry = intData[section][source];

        // Save config (non-sensitive)
        if (config && typeof config === 'object') {
          entry.config = { ...(entry.config || {}), ...config };
        }

        // Save secrets to brand/.env
        if (secrets && typeof secrets === 'object' && Object.keys(secrets).length > 0) {
          const envPath = path.join(brandDir, '.env');
          let envContent = '';
          try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch {}
          const envLines = envContent.split('\n');

          const envVarNames = [];
          for (const [key, value] of Object.entries(secrets)) {
            const envKey = `${slug.toUpperCase().replace(/-/g, '_')}_${source.toUpperCase().replace(/-/g, '_')}_${key}`;
            envVarNames.push(envKey);

            let found = false;
            for (let i = 0; i < envLines.length; i++) {
              if (envLines[i].startsWith(envKey + '=')) {
                envLines[i] = `${envKey}=${value}`;
                found = true;
                break;
              }
            }
            if (!found) envLines.push(`${envKey}=${value}`);
          }

          fs.writeFileSync(envPath, envLines.filter(l => l !== '').join('\n') + '\n', 'utf-8');
          entry.envVars = [...new Set([...(entry.envVars || []), ...envVarNames])];
        }

        entry.status = 'pending';
        intData.updatedAt = new Date().toISOString();
        fs.writeFileSync(intPath, JSON.stringify(intData, null, 2), 'utf-8');

        // Run test-connection.js for this source
        const testScript = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'scripts', 'test-connection.js');
        let testResult = { status: 'pending' };
        try {
          const testOutput = execSync(`/opt/homebrew/bin/node "${testScript}" --slug ${slug} --source ${source}`, { cwd: BASE, timeout: 30000, encoding: 'utf-8' });
          // Script succeeded (exit 0) — re-read integrations.json (script updates it)
          try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
          const updatedEntry = (intData.dataSources || {})[source] || (intData.systemOverrides || {})[source] || {};
          testResult = { status: updatedEntry.status || 'connected', output: testOutput.slice(-300) };
        } catch (e) {
          // Script failed (exit 1) — extract real error from stdout
          const stdout = (e.stdout || '').toString();
          const stderr = (e.stderr || '').toString();
          const errorMatch = stdout.match(/❌ Error — (.+)/);
          const realError = errorMatch ? errorMatch[1].trim() : (stderr.slice(0, 200) || stdout.slice(-200) || e.message.slice(0, 200));
          // Re-read integrations.json (script updates it even on failure)
          try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
          const updatedEntry = (intData.dataSources || {})[source] || (intData.systemOverrides || {})[source] || {};
          entry.status = updatedEntry.status || 'error';
          entry.lastTestedAt = updatedEntry.lastTestedAt || new Date().toISOString();
          entry.lastError = updatedEntry.lastError || realError;
          testResult = { status: 'error', error: realError };
        }

        // Ensure intData is written with latest state
        try { fs.writeFileSync(intPath, JSON.stringify(intData, null, 2), 'utf-8'); } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, testResult }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Client Integrations — test ===
  if (req.method === 'POST' && url === '/api/client-integrations/test') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, source, all } = JSON.parse(body);
        if (!slug) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug' }));
          return;
        }

        const testScript = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'scripts', 'test-connection.js');
        const intPath = path.join(BASE, 'brand', slug, 'integrations.json');
        let intData;
        try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch { intData = { slug, dataSources: {}, systemOverrides: {} }; }

        const results = {};

        // Helper to extract real error from test-connection.js output
        function extractTestError(e) {
          const stdout = (e.stdout || '').toString();
          const stderr = (e.stderr || '').toString();
          const errorMatch = stdout.match(/❌ Error — (.+)/);
          return errorMatch ? errorMatch[1].trim() : (stderr.slice(0, 200) || stdout.slice(-200) || e.message.slice(0, 200));
        }

        function runTest(srcId) {
          try {
            execSync(`/opt/homebrew/bin/node "${testScript}" --slug ${slug} --source ${srcId}`, { cwd: BASE, timeout: 30000, encoding: 'utf-8' });
            // Re-read integrations.json (script updates it)
            try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
            const entry = (intData.dataSources || {})[srcId] || (intData.systemOverrides || {})[srcId] || {};
            return { status: entry.status || 'connected' };
          } catch (e) {
            const realError = extractTestError(e);
            // Re-read integrations.json (script updates it even on failure)
            try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
            const section = (intData.systemOverrides || {})[srcId] ? 'systemOverrides' : 'dataSources';
            if (intData[section] && intData[section][srcId]) {
              intData[section][srcId].lastError = realError;
            }
            return { status: 'error', error: realError };
          }
        }

        if (all) {
          const allSources = { ...(intData.dataSources || {}), ...(intData.systemOverrides || {}) };
          for (const [srcId, srcData] of Object.entries(allSources)) {
            if (srcData.status === 'not_configured') continue;
            results[srcId] = runTest(srcId);
          }
        } else if (source) {
          results[source] = runTest(source);
        }

        intData.updatedAt = new Date().toISOString();
        try {
          const brandDir = path.join(BASE, 'brand', slug);
          if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });
          fs.writeFileSync(intPath, JSON.stringify(intData, null, 2), 'utf-8');
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, results }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: save integration (legacy) ===
  if (req.method === 'POST' && url === '/api/integration') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, serviceId, accountId } = JSON.parse(body);
        if (!slug || !serviceId || !accountId) { res.writeHead(400); res.end('Missing fields'); return; }
        const intFile = path.join(BASE, 'brand', slug, 'integrations.json');
        const data = JSON.parse(fs.readFileSync(intFile, 'utf-8'));
        const svc = data.services.find(s => s.id === serviceId);
        if (!svc) { res.writeHead(404); res.end('Service not found'); return; }
        svc.status = 'connected';
        svc.accountId = accountId;
        svc.lastActivity = new Date().toISOString();
        data.updatedAt = new Date().toISOString();
        fs.writeFileSync(intFile, JSON.stringify(data, null, 2), 'utf-8');
        // Also regenerate MC data
        try { require('child_process').execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: serviceId, status: 'connected' }));
      } catch (e) { res.writeHead(500); res.end('Error: ' + e.message); }
    });
    return;
  }

  // === API: Metrics Chat (wraps mc-chat for metrics-specific thread) ===
  if (req.method === 'POST' && url === '/api/metrics-chat') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 50000) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, message, threadId } = JSON.parse(body);
        if (!slug || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug or message' }));
          return;
        }
        const tid = threadId || `${slug}:metrics`;
        const threadName = `📊 Métricas y Resultados — ${slug}`;

        // Use mc-chat system to relay
        const payload = JSON.stringify({
          slug,
          threadId: tid,
          threadName,
          text: message,
          userId: 'mc-admin',
          userName: 'Admin (MC)',
          linkedTo: 'metrics',
          skill: 'metrics-collector',
        });

        const gatewayUrl = typeof MC_CHAT_GATEWAY !== 'undefined' ? MC_CHAT_GATEWAY : 'http://localhost:18790';
        fetch(`${gatewayUrl}/mc-chat/inbound`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(typeof MC_CHAT_SECRET !== 'undefined' && MC_CHAT_SECRET ? { 'X-MC-Secret': MC_CHAT_SECRET } : {}),
          },
          body: payload,
        }).then(r => r.json()).then(data => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, threadId: tid, reply: 'Mensaje enviado al hilo de métricas. Te respondo por Discord. 💬' }));
        }).catch(err => {
          // Even if gateway fails, acknowledge the message
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, threadId: tid, reply: 'Mensaje recibido. El hilo de métricas se creará en Discord cuando Sancho responda. 💬' }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: metrics data for a client ===
  // === API: Metrics Plan ===
  if (req.method === 'GET' && url.startsWith('/api/metrics-plan')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = req._portalSlug || params.get('slug');
    if (!slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Missing slug"}'); return; }
    const planFile = path.join(BASE, 'brand', slug, 'metrics-plan.json');
    try {
      const plan = JSON.parse(fs.readFileSync(planFile, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(plan));
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"No metrics plan found"}');
    }
    return;
  }

  // ========== CHAT API ==========
  // GET /api/chat/threads?slug=X — list all threads for a client
  if (req.method === 'GET' && url === '/api/chat/threads') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = req._portalSlug || params.get('slug');
    if (!slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Missing slug"}'); return; }
    const chatDir = path.join(BASE, 'brand', slug, 'chat', 'threads');
    const threads = [];
    try {
      if (fs.existsSync(chatDir)) {
        for (const f of fs.readdirSync(chatDir).filter(f => f.endsWith('.json')).sort()) {
          try {
            const t = JSON.parse(fs.readFileSync(path.join(chatDir, f), 'utf-8'));
            const msgs = t.messages || [];
            const last = msgs[msgs.length - 1];
            threads.push({
              id: t.id, name: t.name, status: t.status || 'open',
              linkedTo: t.linkedTo || null, skill: t.skill || null,
              createdAt: t.createdAt, updatedAt: t.updatedAt || t.createdAt,
              messageCount: msgs.length,
              lastMessage: last ? { role: last.role, text: (last.text || '').slice(0, 80), ts: last.ts } : null,
            });
          } catch {}
        }
      }
    } catch {}
    threads.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, threads }));
    return;
  }

  // GET /api/chat/thread/:id?slug=X — get a specific thread with messages
  if (req.method === 'GET' && url.startsWith('/api/chat/thread/')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = req._portalSlug || params.get('slug');
    const threadId = url.replace('/api/chat/thread/', '').split('?')[0];
    if (!slug || !threadId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Missing slug or threadId"}'); return; }
    const threadFile = path.join(BASE, 'brand', slug, 'chat', 'threads', threadId + '.json');
    try {
      const thread = JSON.parse(fs.readFileSync(threadFile, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, thread }));
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"Thread not found"}');
    }
    return;
  }

  // POST /api/chat/thread — create a new thread
  if (req.method === 'POST' && url === '/api/chat/thread') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, name, linkedTo, skill } = JSON.parse(body);
        if (!slug || !name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Missing slug or name"}'); return; }
        const chatDir = path.join(BASE, 'brand', slug, 'chat', 'threads');
        if (!fs.existsSync(chatDir)) fs.mkdirSync(chatDir, { recursive: true });
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const thread = {
          id, name, status: 'open',
          linkedTo: linkedTo || null, skill: skill || null,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          messages: [],
        };
        fs.writeFileSync(path.join(chatDir, id + '.json'), JSON.stringify(thread, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, thread }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /api/chat/send — send a message to a thread
  if (req.method === 'POST' && url === '/api/chat/send') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, threadId, text, role } = JSON.parse(body);
        if (!slug || !threadId || !text) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Missing fields"}'); return; }
        const threadFile = path.join(BASE, 'brand', slug, 'chat', 'threads', threadId + '.json');
        if (!fs.existsSync(threadFile)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"Thread not found"}'); return; }
        const thread = JSON.parse(fs.readFileSync(threadFile, 'utf-8'));
        const msg = { role: role || 'user', text, ts: new Date().toISOString() };
        thread.messages.push(msg);
        thread.updatedAt = msg.ts;
        fs.writeFileSync(threadFile, JSON.stringify(thread, null, 2));

        // Trigger Sancho response via openclaw agent CLI
        if (role !== 'bot') {
          // Build context for Sancho
          const threadContext = thread.linkedTo ? `[Context: working on "${thread.name}" (pilar: ${thread.linkedTo}, skill: ${thread.skill || 'none'}) for client ${slug}]` : `[Context: free chat thread "${thread.name}" for client ${slug}]`;
          const fullMessage = threadContext + '\n\nUsuario dice: ' + text;
          
          // Run openclaw agent async — use spawn with args to avoid shell escaping issues
          const { spawn } = require('child_process');
          const agentEnv = { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:' + (process.env.PATH || '') };
          const agentProc = spawn('/opt/homebrew/bin/openclaw', ['agent', '--agent', 'sancho', '-m', fullMessage], { timeout: 120000, env: agentEnv });
          let agentStdout = '';
          let agentStderr = '';
          agentProc.stdout.on('data', d => { agentStdout += d; });
          agentProc.stderr.on('data', d => { agentStderr += d; });
          agentProc.on('close', (code) => {
            const err = code !== 0 ? { message: agentStderr.slice(0, 200) } : null;
            const stdout = agentStdout;
            const stderr = agentStderr;
            // Original callback logic below:
            try {
              const reply = (stdout || '').trim() || (err ? 'Error: ' + (err.message || '').slice(0, 200) : 'Sin respuesta');
              const reloadThread = JSON.parse(fs.readFileSync(threadFile, 'utf-8'));
              const botMsg = { role: 'bot', text: reply, ts: new Date().toISOString() };
              reloadThread.messages.push(botMsg);
              reloadThread.updatedAt = botMsg.ts;
              fs.writeFileSync(threadFile, JSON.stringify(reloadThread, null, 2));
            } catch(e) { console.error('Chat bot response error:', e.message); }
          });
          
          // Add a "typing" indicator immediately
          const typingMsg = { role: 'bot', text: '🔄 Sancho está pensando...', ts: new Date().toISOString(), typing: true };
          thread.messages.push(typingMsg);
          thread.updatedAt = typingMsg.ts;
          fs.writeFileSync(threadFile, JSON.stringify(thread, null, 2));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: msg }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  // ========== END CHAT API ==========

  // ═══════════════════════════════════════════════════════════════
  // PageSpeed Insights API — free, no API key needed
  // Cache: brand/{slug}/metrics/pagespeed.json (24h TTL)
  // Also saves to weekly metrics daily file as source "pagespeed"
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'GET' && url === '/api/pagespeed') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = params.get('slug');
    const refresh = params.get('refresh') === '1';
    if (!slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug' })); return; }

    const cacheFile = path.join(BASE, 'brand', slug, 'metrics', 'pagespeed.json');
    const metricsDir = path.join(BASE, 'brand', slug, 'metrics');

    // Check cache (24h TTL)
    if (!refresh && fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (cached.fetchedAt && (Date.now() - new Date(cached.fetchedAt).getTime()) < 24 * 60 * 60 * 1000) {
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(cached)); return;
        }
      } catch {}
    }

    // Find client URL
    let clientUrl = null;
    try {
      const clientsFile = path.join(BASE, 'clients.json');
      if (fs.existsSync(clientsFile)) {
        const clients = JSON.parse(fs.readFileSync(clientsFile, 'utf-8'));
        clientUrl = clients[slug]?.url;
      }
    } catch {}
    if (!clientUrl) {
      try {
        const stateFile = path.join(BASE, 'brand', slug, 'foundation-state.json');
        if (fs.existsSync(stateFile)) {
          const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
          clientUrl = state.brand_summary?.url;
        }
      } catch {}
    }
    // Also accept URL as direct parameter
    if (!clientUrl) clientUrl = params.get('url');
    if (!clientUrl) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No URL found for client. Pass ?url= or set url in clients.json / brand_summary' })); return; }

    // Ensure URL has protocol
    if (!clientUrl.startsWith('http')) clientUrl = 'https://' + clientUrl;

    // Persist URL in foundation-state.json brand_summary if not already there
    try {
      const stateFile = path.join(BASE, 'brand', slug, 'foundation-state.json');
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        if (!state.brand_summary) state.brand_summary = {};
        if (!state.brand_summary.url || state.brand_summary.url !== clientUrl) {
          state.brand_summary.url = clientUrl;
          safeWriteFoundationState(stateFile, state);
          console.log(`[pagespeed] Saved URL ${clientUrl} to ${slug}/foundation-state.json`);
        }
      }
    } catch (e) { console.error('[pagespeed] Error saving URL:', e.message); }

    // Fetch from Google PSI API (mobile + desktop)
    const psiBase = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
    const categories = '&category=performance&category=seo&category=accessibility&category=best-practices';
    // Read API key from env or .env file
    let _psiApiKey = process.env.PAGESPEED_API_KEY || '';
    if (!_psiApiKey) {
      try {
        const envFile = path.join(require('os').homedir(), '.openclaw', '.env');
        const envContent = fs.readFileSync(envFile, 'utf-8');
        const match = envContent.match(/^PAGESPEED_API_KEY=(.+)$/m);
        if (match) _psiApiKey = match[1].trim();
      } catch {}
    }
    const psiKey = _psiApiKey ? `&key=${_psiApiKey}` : '';

    const fetchPSI = async (strategy) => {
      const apiUrl = `${psiBase}?url=${encodeURIComponent(clientUrl)}&strategy=${strategy}${categories}${psiKey}`;
      console.log(`[pagespeed] Fetching ${strategy} for ${clientUrl} (key=${psiKey ? 'yes' : 'no'})`);
      const resp = await fetch(apiUrl);
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        console.error(`[pagespeed] PSI ${strategy} HTTP ${resp.status}: ${body.slice(0, 200)}`);
        throw new Error(`PSI ${strategy}: HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const cats = data.lighthouseResult?.categories || {};
      const audits = data.lighthouseResult?.audits || {};
      // Extract opportunities (actionable items with estimated savings)
      const opportunities = [];
      for (const [id, audit] of Object.entries(audits)) {
        if (audit.details?.type === 'opportunity' && audit.details?.overallSavingsMs > 0) {
          opportunities.push({ id, title: audit.title, savings: Math.round(audit.details.overallSavingsMs), description: audit.description?.slice(0, 150) });
        }
      }
      // Extract failed diagnostics
      const diagnostics = [];
      for (const [id, audit] of Object.entries(audits)) {
        if (audit.score !== null && audit.score < 0.5 && audit.details?.type === 'table') {
          diagnostics.push({ id, title: audit.title, score: Math.round(audit.score * 100) });
        }
      }
      return {
        performance: Math.round((cats.performance?.score || 0) * 100),
        seo: Math.round((cats.seo?.score || 0) * 100),
        accessibility: Math.round((cats.accessibility?.score || 0) * 100),
        bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
        lcp: parseFloat(((audits['largest-contentful-paint']?.numericValue || 0) / 1000).toFixed(1)),
        cls: parseFloat((audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3)),
        tbt: Math.round(audits['total-blocking-time']?.numericValue || 0),
        opportunities: opportunities.sort((a,b) => b.savings - a.savings).slice(0, 10),
        diagnostics: diagnostics.slice(0, 10),
      };
    };

    (async () => {
      try {
        // Sequential to avoid rate limits (parallel doubles the burst)
        const mobile = await fetchPSI('mobile');
        const desktop = await fetchPSI('desktop');
        const result = { url: clientUrl, mobile, desktop, fetchedAt: new Date().toISOString() };

        // Save cache
        if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));

        // Save to daily metrics file as "pagespeed" source
        const today = new Date().toISOString().slice(0, 10);
        const dailyFile = path.join(metricsDir, today + '.json');
        try {
          let daily = {};
          if (fs.existsSync(dailyFile)) daily = JSON.parse(fs.readFileSync(dailyFile, 'utf-8'));
          if (!daily.sources) daily.sources = {};
          daily.sources.pagespeed = {
            status: 'ok',
            metrics: [
              { name: 'performance_mobile', value: mobile.performance, date: today },
              { name: 'seo_mobile', value: mobile.seo, date: today },
              { name: 'performance_desktop', value: desktop.performance, date: today },
              { name: 'seo_desktop', value: desktop.seo, date: today },
              { name: 'lcp_mobile', value: mobile.lcp, date: today },
              { name: 'cls_mobile', value: mobile.cls, date: today },
              { name: 'tbt_mobile', value: mobile.tbt, date: today },
            ]
          };
          if (!daily.slug) daily.slug = slug;
          if (!daily.collectedAt) daily.collectedAt = new Date().toISOString();
          fs.writeFileSync(dailyFile, JSON.stringify(daily, null, 2));
        } catch (e) { console.error('[pagespeed] daily file error:', e.message); }

        console.log(`[pagespeed] ${slug}: perf=${mobile.performance}/${desktop.performance} seo=${mobile.seo}/${desktop.seo}`);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
      } catch (e) {
        console.error(`[pagespeed] Error for ${slug}:`, e.message);
        // Return stale cache if available
        if (fs.existsSync(cacheFile)) {
          try { const stale = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')); stale._stale = true; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(stale)); return; } catch {}
        }
        res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message }));
      }
    })();
    return;
  }

  // === API: Trigger metrics collection for a client ===
  if (req.method === 'POST' && url === '/api/metrics-collect') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug } = JSON.parse(body);
        if (!slug) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"Missing slug"}'); return; }
        const collectScript = path.join(BASE, 'skills', 'metrics-collector', 'scripts', 'collect.js');
        if (!fs.existsSync(collectScript)) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"collect.js not found"}'); return; }
        // Run collector asynchronously
        const child = execCb(`/opt/homebrew/bin/node "${collectScript}" --slug ${slug} --all`, { cwd: BASE, timeout: 120000, env: { ...process.env, HOME: process.env.HOME || '/Users/ragi' } }, (err, stdout, stderr) => {
          // Invalidate server-side metrics cache for this slug
          if (global._metricsCache && global._metricsCache[slug]) delete global._metricsCache[slug];
          if (err) {
            console.error(`[metrics-collect] Error for ${slug}:`, stderr || err.message);
          } else {
            console.log(`[metrics-collect] Success for ${slug}:`, stdout.slice(0, 200));
          }
        });
        // Respond immediately — collection runs in background
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `Recolección iniciada para ${slug}. Los datos aparecerán en unos segundos.` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && url.startsWith('/api/metrics')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = params.get('slug');
    if (!slug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing slug parameter' }));
      return;
    }

    // Server-side cache: 5 min TTL per slug
    if (!global._metricsCache) global._metricsCache = {};
    const cached = global._metricsCache[slug];
    const now = Date.now();
    if (cached && (now - cached.ts) < 300000) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'hit' });
      res.end(cached.json);
      return;
    }

    const metricsFile = path.join(BASE, 'brand', slug, 'metrics', 'metrics-data.json');
    const integrationsFile = path.join(BASE, 'brand', slug, 'integrations.json');

    try {
      let metrics = [];
      if (fs.existsSync(metricsFile)) {
        metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
      }

      let integrations = {};
      if (fs.existsSync(integrationsFile)) {
        integrations = JSON.parse(fs.readFileSync(integrationsFile, 'utf-8'));
      }

      const metricsDir = path.join(BASE, 'brand', slug, 'metrics');
      const dailyFiles = [];
      if (fs.existsSync(metricsDir)) {
        const files = fs.readdirSync(metricsDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-30);
        for (const f of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(metricsDir, f), 'utf-8'));
            dailyFiles.push({ date: f.replace('.json', ''), ...data });
          } catch {}
        }
      }

      let metricsPlan = null;
      const planFile = path.join(BASE, 'brand', slug, 'metrics-plan.json');
      if (fs.existsSync(planFile)) {
        try { metricsPlan = JSON.parse(fs.readFileSync(planFile, 'utf-8')); } catch {}
      }

      // Check if manual data is pending for current week
      let manualDataPending = false;
      const manualCadence = metricsPlan && metricsPlan.manualDataCadence ? metricsPlan.manualDataCadence : null;
      if (manualCadence && integrations.dataSources && integrations.dataSources.sheets) {
        // Find Monday of current week
        const now_ = new Date();
        const day = now_.getDay();
        const monday = new Date(now_);
        monday.setDate(monday.getDate() - ((day + 6) % 7));
        const mondayStr = monday.toISOString().slice(0, 10);
        // Check if any daily file this week has sheets source data
        const hasSheetData = dailyFiles.some(d => d.date >= mondayStr && d.sources && d.sources.sheets && d.sources.sheets.status === 'ok' && (d.sources.sheets.metrics || []).length > 0);
        if (!hasSheetData) manualDataPending = true;
      }

      // Filter recommended integrations: exclude already connected
      const ds = integrations.dataSources || {};
      const recommended = (integrations.recommended || []).filter(r => {
        const existing = ds[r.apiId];
        return !existing || existing.status !== 'connected';
      });

      const result = JSON.stringify({
        slug,
        plan: metricsPlan,
        metricsSheet: integrations.metricsSheet || null,
        dataSources: ds,
        rolling: metrics,
        daily: dailyFiles,
        recommended,
        manualDataPending,
        manualDataCadence: manualCadence,
        _cachedAt: new Date().toISOString(),
      });

      // Cache it
      global._metricsCache[slug] = { json: result, ts: now };

      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Cache': 'miss' });
      res.end(result);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // === Doc Viewer: /docs/ ===
  if (url === '/docs' || url === '/docs/') {
    // In portal mode, only show brand
    const roots = req._portalSlug ? { brand: '🏷️' } : { brand: '🏷️', prds: '📋', skills: '⚡', memory: '🧠' };
    const nav = Object.keys(roots).map(k => {
      return `<a href="/mc/docs/${k}/">${roots[k]} ${k}</a>`;
    }).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(page('Documentos', '<a class="back" href="/mc#">← Mission Control</a>', `<h1>📚 Documentos</h1><div class="nav">${nav}</div>`));
    return;
  }

  if (url.startsWith('/docs/')) {
    const rest = url.replace('/docs/', '');
    const parts = rest.split('/').filter(Boolean);
    const rootKey = parts[0];

    // Auto-create brand structure when accessing a client's brand root
    if (rootKey === 'brand' && parts.length >= 2) {
      try { ensureBrandStructure(parts[1]); } catch(e) {}
    }

    // Portal mode: block non-brand docs and other clients' brand dirs
    if (req._portalSlug) {
      if (rootKey !== 'brand') {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      // If accessing brand/{otherSlug}, block it
      if (parts.length >= 2 && parts[1] !== req._portalSlug) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      // If listing /docs/brand/ root, redirect to their slug directly
      if (parts.length === 1) {
        const portalPrefix = req._portalBase ? req._portalBase : '/mc';
        res.writeHead(302, { 'Location': `${portalPrefix}/docs/brand/${req._portalSlug}/` });
        res.end();
        return;
      }
    }
    
    if (!rootKey || !DOC_ROOTS[rootKey]) {
      res.writeHead(404); res.end('Section not found'); return;
    }
    
    const rootPath = DOC_ROOTS[rootKey];
    const subParts = parts.slice(1);
    const subPath = subParts.join('/');
    const fullPath = subPath ? path.join(rootPath, subPath) : rootPath;
    
    // Security: no path traversal
    if (!path.resolve(fullPath).startsWith(path.resolve(rootPath))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    
    try {
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const mcPrefix = req._portalBase || req._adminBase || '/mc';
        const prettyRoot = rootKey.charAt(0).toUpperCase() + rootKey.slice(1);
        const prettyPath = subPath ? subPath.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : prettyRoot;
        const backUrl = subParts.length > 0 ? `${mcPrefix}/docs/${rootKey}/${subParts.slice(0, -1).join('/')}/` : `${mcPrefix}/docs/`;
        const backLabel = subParts.length > 0 ? `← ${subParts.slice(0, -1).pop() || prettyRoot}` : '← Documentos';
        // Pass brandPillars:true when listing brand/{slug} (pillar level)
        const isBrandSlug = rootKey === 'brand' && subParts.length === 1;
        // Detect brand/{slug}/{section} — Foundation section level
        const isBrandSection = rootKey === 'brand' && subParts.length === 2 && PILLAR_FLAT.includes(subParts[1]);
        const content = listDir(fullPath, `${mcPrefix}/docs/${rootKey}/${subPath ? subPath + '/' : ''}`, {
          brandPillars: isBrandSlug,
          brandSection: isBrandSection ? { slug: subParts[0], section: subParts[1] } : null,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(page(prettyPath, `<a class="back" href="${backUrl}">${backLabel}</a>`, `<h1>📂 ${prettyPath}</h1>${content}`));
        return;
      }
      
      if (stat.isFile() && fullPath.endsWith('.md')) {
        const md = fs.readFileSync(fullPath, 'utf-8');
        // Build doc context for link rewriting in brand docs
        const mcPrefix = req._portalBase || req._adminBase || '/mc';
        const brandSlug = (rootKey === 'brand' && subParts.length >= 1) ? subParts[0] : null;
        const docContext = brandSlug ? { slug: brandSlug, docsBase: `${mcPrefix}/docs/brand/${brandSlug}` } : null;
        const html = renderMarkdown(md, docContext);
        const fileName = path.basename(fullPath, '.md');
        const backUrl = `${mcPrefix}/docs/${rootKey}/${subParts.slice(0, -1).join('/')}/`;
        const backLabel = subParts.length > 1 ? subParts.slice(-2, -1)[0] : rootKey;
        const rawEscaped = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(page(fileName, `<a class="back" href="${backUrl}">← ${backLabel}</a>`, `<div>${html}</div>`, { editable: true, rawMd: rawEscaped }));
        return;
      }

      // Serve .html files directly (visual identity guides, reports, etc.)
      if (stat.isFile() && fullPath.endsWith('.html')) {
        const htmlContent = fs.readFileSync(fullPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(htmlContent);
        return;
      }

      // Serve static assets referenced by HTML files (images, CSS, JS, fonts)
      if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const assetMime = MIME[ext] || {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
          '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
          '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.pdf': 'application/pdf',
          '.txt': 'text/plain; charset=utf-8',
        }[ext];
        if (assetMime) {
          const data = fs.readFileSync(fullPath);
          res.writeHead(200, { 'Content-Type': assetMime });
          res.end(data);
          return;
        }
      }
      
      res.writeHead(403); res.end('Not a viewable file');
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // === Serve /brand/ files directly (presentations, etc.) ===
  if (url.startsWith('/brand/') && req.method === 'GET') {
    const fullPath = path.join(BASE, url.slice(1));
    if (!path.resolve(fullPath).startsWith(path.resolve(BASE)) || url.includes('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        const data = fs.readFileSync(fullPath);
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
        return;
      }
      // Directory: redirect to docs viewer
      const rest = url.replace('/brand', '/docs/brand');
      res.writeHead(301, { 'Location': '/mc' + rest });
      res.end();
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }
  if (url === '/brand') {
    res.writeHead(301, { 'Location': '/mc/docs/brand/' });
    res.end();
    return;
  }

  // === Static files (MC dashboard) ===
  const filename = path.basename(url);
  if (!ALLOWED_FILES.includes(filename)) {
    res.writeHead(404); res.end('Not found'); return;
  }

  const filePath = path.join(BASE, filename);
  try {
    let data = fs.readFileSync(filePath);
    const ext = path.extname(filename);
    const ct = MIME[ext] || 'application/octet-stream';
    // For JS files in admin mode, also rewrite /mc/ paths
    if (req._adminBase && ext === '.js') {
      let text = data.toString('utf-8');
      text = text.replace(/\/mc\/(?!admin\/|portal\/)/g, req._adminBase + '/');
      data = Buffer.from(text, 'utf-8');
    }
    const headers = { 'Content-Type': ct };
    if (filename === 'mc-data.js') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

// ========== WS PROXY: Browser ↔ MC Server ↔ Gateway ==========
// Browser can't do device-auth crypto directly. MC Server on localhost
// connects to Gateway (auto-approved) and proxies chat/sessions/agent events.

const { WebSocketServer, WebSocket: WsClient } = require('ws');

const GATEWAY_URL = 'ws://127.0.0.1:18789';
const GATEWAY_AUTH = (() => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(path.dirname(__dirname), '..', 'openclaw.json'), 'utf-8'));
    return cfg.gateway?.auth || {};
  } catch { return {}; }
})();

// Device identity for gateway auth (Ed25519 keypair, persisted)
const DEVICE_STORE_PATH = path.join(path.dirname(__dirname), '..', '.mc-proxy-device.json');
let gwDeviceIdentity = null;

async function getDeviceIdentity() {
  if (gwDeviceIdentity) return gwDeviceIdentity;
  // Try load from disk
  try {
    const stored = JSON.parse(fs.readFileSync(DEVICE_STORE_PATH, 'utf-8'));
    if (stored.privateKeyHex && stored.publicKeyHex && stored.deviceId) {
      gwDeviceIdentity = stored;
      return gwDeviceIdentity;
    }
  } catch {}
  // Generate new keypair
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const privRaw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pubHex = Buffer.from(pubRaw).toString('hex');
  const pubB64url = Buffer.from(pubRaw).toString('base64url');
  // Device ID = SHA-256 of public key
  const idHash = crypto.createHash('sha256').update(pubRaw).digest('hex');
  gwDeviceIdentity = {
    deviceId: idHash,
    publicKeyHex: pubHex,
    publicKeyB64url: pubB64url,
    privateKeyDer: Buffer.from(privRaw).toString('base64'),
    // Store the CryptoKey objects for signing
    _privateKey: kp.privateKey,
    _publicKey: kp.publicKey,
  };
  // Persist (without CryptoKey objects)
  fs.writeFileSync(DEVICE_STORE_PATH, JSON.stringify({
    deviceId: gwDeviceIdentity.deviceId,
    publicKeyHex: gwDeviceIdentity.publicKeyHex,
    publicKeyB64url: gwDeviceIdentity.publicKeyB64url,
    privateKeyDer: gwDeviceIdentity.privateKeyDer,
  }, null, 2));
  console.log('[mc-ws-proxy] Generated device identity:', gwDeviceIdentity.deviceId.slice(0, 12) + '...');
  return gwDeviceIdentity;
}

async function signChallenge(nonce) {
  const dev = await getDeviceIdentity();
  // Import private key if needed (when loaded from disk)
  let privKey = dev._privateKey;
  if (!privKey) {
    const der = Buffer.from(dev.privateKeyDer, 'base64');
    privKey = await crypto.subtle.importKey('pkcs8', der, 'Ed25519', false, ['sign']);
    dev._privateKey = privKey;
  }
  const signedAt = Date.now();
  const scopes = ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'];
  const token = GATEWAY_AUTH.token || '';
  // v2 payload format: v2|deviceId|clientId|clientMode|role|scopes|signedAt|token|nonce
  const payload = ['v2', dev.deviceId, 'cli', 'cli', 'operator', scopes.join(','), String(signedAt), token, nonce].join('|');
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', privKey, new TextEncoder().encode(payload)));
  return {
    id: dev.deviceId,
    publicKey: dev.publicKeyB64url,
    signature: Buffer.from(sig).toString('base64url'),
    signedAt,
    nonce,
  };
}

const wss = new WebSocketServer({ noServer: true });

// Keep a single shared Gateway connection (reused across browser clients)
let gwConn = null;
let gwConnected = false;
let gwMsgSeq = 1;
let gwPendingRequests = {};
let gwBrowserClients = new Set();
let gwReconnectTimer = null;

function gwConnect() {
  if (gwConn && (gwConn.readyState === WsClient.OPEN || gwConn.readyState === WsClient.CONNECTING)) return;

  const params = new URLSearchParams();
  if (GATEWAY_AUTH.token) params.set('auth.token', GATEWAY_AUTH.token);
  else if (GATEWAY_AUTH.password) params.set('auth.password', GATEWAY_AUTH.password);
  params.set('mode', 'webchat');
  params.set('clientName', 'mc-server-proxy');

  const url = GATEWAY_URL + '?' + params.toString();
  gwConn = new WsClient(url, {
    headers: { 'Origin': 'http://127.0.0.1:18789' }
  });

  gwConn.on('open', () => {
    console.log('[mc-ws-proxy] Gateway WS open, waiting for challenge...');
  });

  gwConn.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // Handle connect.challenge — respond with device-signed connect
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const nonce = msg.payload?.nonce;
      console.log('[mc-ws-proxy] Got challenge, signing with device identity...');
      signChallenge(nonce).then(device => {
        const connectReq = {
          type: 'req',
          id: 'connect-' + Date.now(),
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: 'cli', version: '2026.3.23', platform: 'darwin', mode: 'cli' },
            role: 'operator',
            scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'],
            caps: ['tool-events'],
            commands: [],
            permissions: {},
            auth: { ...(GATEWAY_AUTH.token ? { token: GATEWAY_AUTH.token } : {}), ...(GATEWAY_AUTH.password ? { password: GATEWAY_AUTH.password } : {}) },
            locale: 'es-ES',
            userAgent: 'mc-server-proxy/1.0.0',
            device
          }
        };
        gwConn.send(JSON.stringify(connectReq));
      }).catch(err => console.error('[mc-ws-proxy] Sign error:', err.message));
      return;
    }

    // Handle connect response
    if (msg.type === 'res' && msg.id && msg.id.startsWith('connect-')) {
      if (msg.ok) {
        gwConnected = true;
        console.log('[mc-ws-proxy] Gateway connected! Protocol:', msg.payload?.protocol);
        // Notify all browser clients
        for (const bc of gwBrowserClients) {
          bc.send(JSON.stringify({ type: 'mc-proxy', event: 'connected' }));
        }
      } else {
        console.error('[mc-ws-proxy] Connect failed:', JSON.stringify(msg.error));
        gwConnected = false;
      }
      return;
    }

    // Handle hello event (sent after connect-ok)
    if (msg.type === 'event' && msg.event === 'hello') {
      // Already handled above via connect response
      return;
    }

    // JSON-RPC response — route to pending request callback
    if (msg.type === 'res' && msg.id && gwPendingRequests[msg.id]) {
      const p = gwPendingRequests[msg.id];
      delete gwPendingRequests[msg.id];
      // Forward the response to the browser that made the request
      if (p.browserWs && p.browserWs.readyState === WsClient.OPEN) {
        p.browserWs.send(JSON.stringify({ id: p.browserReqId, result: msg.ok ? msg.payload : undefined, error: msg.ok ? undefined : msg.error }));
      }
      return;
    }

    // Events — broadcast to all browser clients
    // Wrap in the format browser expects: { method: 'event', params: { event, payload } }
    if (msg.type === 'event') {
      const fwd = JSON.stringify({ method: 'event', params: { event: msg.event, payload: msg.payload } });
      for (const bc of gwBrowserClients) {
        if (bc.readyState === WsClient.OPEN) bc.send(fwd);
      }
      return;
    }
  });

  gwConn.on('close', (code, reason) => {
    gwConnected = false;
    console.log('[mc-ws-proxy] Gateway disconnected:', code, reason?.toString());
    // Notify browser clients
    for (const bc of gwBrowserClients) {
      if (bc.readyState === WsClient.OPEN) bc.send(JSON.stringify({ type: 'mc-proxy', event: 'disconnected' }));
    }
    // Auto-reconnect
    if (gwReconnectTimer) clearTimeout(gwReconnectTimer);
    gwReconnectTimer = setTimeout(() => gwConnect(), 3000);
  });

  gwConn.on('error', (err) => {
    console.error('[mc-ws-proxy] Gateway error:', err.message);
  });
}

// Handle browser WS connections
wss.on('connection', (ws) => {
  gwBrowserClients.add(ws);
  console.log('[mc-ws-proxy] Browser client connected. Total:', gwBrowserClients.size);

  // Immediately tell browser if we're connected to gateway
  ws.send(JSON.stringify({ type: 'mc-proxy', event: gwConnected ? 'connected' : 'connecting' }));

  // Ensure gateway connection exists
  // WS proxy disabled
  // if (!gwConnected) gwConnect();

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // Browser sends JSON-RPC requests: { jsonrpc, id, method, params }
    if (msg.jsonrpc === '2.0' && msg.method && msg.id != null) {
      if (!gwConnected || !gwConn || gwConn.readyState !== WsClient.OPEN) {
        ws.send(JSON.stringify({ id: msg.id, error: { message: 'Gateway not connected' } }));
        return;
      }

      // Proxy the request to gateway using gateway's req format
      const gwReqId = 'p-' + (gwMsgSeq++);
      gwPendingRequests[gwReqId] = { browserWs: ws, browserReqId: msg.id, ts: Date.now() };

      gwConn.send(JSON.stringify({
        type: 'req',
        id: gwReqId,
        method: msg.method,
        params: msg.params || {}
      }));
      return;
    }
  });

  ws.on('close', () => {
    gwBrowserClients.delete(ws);
    console.log('[mc-ws-proxy] Browser client disconnected. Total:', gwBrowserClients.size);
  });
});

// HTTP upgrade → WS
mcServer.on('upgrade', (req, socket, head) => {
  const url = req.url?.split('?')[0] || '';
  console.log('[mc-ws-proxy] Upgrade request:', url);
  // Accept WS connections at /ws/chat (and variants for admin/portal/tailscale paths)
  if (url.endsWith('/ws/chat')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    console.log('[mc-ws-proxy] Rejecting upgrade for:', url);
    socket.destroy();
  }
});

// Start server
mcServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Mission Control server on http://127.0.0.1:${PORT}`);
  console.log(`WS proxy at ws://127.0.0.1:${PORT}/ws/chat`);
  // WS proxy disabled — using mc-chat channel plugin instead
  // setTimeout(() => gwConnect(), 1000);
});

// ═══════════════════════════════════════════════════════════════
// CRON OUTPUT WATCHER: Extract Discord content → brand/{slug}/recurring-tasks/
// ═══════════════════════════════════════════════════════════════
const CRON_RUNS_DIR = path.join(process.env.HOME || '/tmp', '.openclaw', 'cron', 'runs');
const SESSIONS_DIR = path.join(process.env.HOME || '/tmp', '.openclaw', 'agents', 'sancho', 'sessions');
let _lastProcessedRuns = {};

function slugifyCronName(name, clientSlug) {
  let s = (name || '').toLowerCase();
  // Remove client name/slug suffix (e.g. "— Growth4U", "— Multi-Client")
  s = s.replace(/\s*[—–-]\s*(multi-client|system|global)$/i, '');
  if (clientSlug) {
    const clients = loadClients();
    const client = clients.find(c => c.slug === clientSlug);
    if (client) s = s.replace(new RegExp('\\s*[—–-]\\s*' + client.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'), '');
    s = s.replace(new RegExp('\\s*[—–-]\\s*' + clientSlug.replace(/-/g, '[- ]?') + '$', 'i'), '');
  }
  return s.trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function extractDiscordContent(sessionId, cron, clients) {
  if (!sessionId) return [];
  const sessFile = path.join(SESSIONS_DIR, sessionId + '.jsonl');
  try {
    if (!fs.existsSync(sessFile)) return [];
    const content = fs.readFileSync(sessFile, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const messages = []; // { text, channelId }

    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (d.type !== 'message') continue;
        const msg = d.message || {};
        if (msg.role !== 'assistant') continue;
        const blocks = msg.content;
        if (!Array.isArray(blocks)) continue;
        for (const b of blocks) {
          if (b.type !== 'toolCall' || b.name !== 'message') continue;
          const args = b.arguments || {};
          if (args.action !== 'send') continue;
          if (!args.message || args.message.length < 30) continue;
          // Skip JSON
          if (args.message.trimStart().startsWith('{')) continue;
          messages.push({ text: args.message, channelId: args.channelId || args.target || null });
        }
      } catch {}
    }

    if (messages.length === 0) return [];

    // Determine which client(s) this content belongs to
    const results = [];
    // Try to match messages to clients by content
    for (const client of clients) {
      const slug = client.slug;
      const clientName = (client.name || '').toLowerCase();
      const clientMsgs = messages.filter(m => {
        const head = m.text.slice(0, 300).toLowerCase();
        return head.includes(slug) || head.includes(clientName);
      });
      if (clientMsgs.length > 0) {
        results.push({ slug, content: clientMsgs.map(m => m.text).join('\n\n---\n\n') });
      }
    }

    // If no client matched but we have messages, try to use cron name to determine client
    if (results.length === 0 && messages.length > 0) {
      const cronSlug = _extractSlugFromCron(cron.name, clients);
      if (cronSlug) {
        results.push({ slug: cronSlug, content: messages.map(m => m.text).join('\n\n---\n\n') });
      }
    }

    return results;
  } catch { return []; }
}

function processCronRuns() {
  const clients = loadClients();
  let crons;
  try { crons = _loadCronsFromOpenClaw(); } catch { return; }
  let saved = 0;

  for (const cron of crons) {
    const runFile = path.join(CRON_RUNS_DIR, cron.id + '.jsonl');
    if (!fs.existsSync(runFile)) continue;

    try {
      const fileContent = fs.readFileSync(runFile, 'utf-8').trim();
      const allLines = fileContent.split('\n').filter(Boolean);

      // Process all finished runs (for backfill)
      for (const rawLine of allLines) {
        let run;
        try { run = JSON.parse(rawLine); } catch { continue; }
        if (run.action !== 'finished') continue;
        const runMs = run.runAtMs || run.ts || 0;

        // Skip if already processed
        const key = cron.id + ':' + runMs;
        if (_lastProcessedRuns[key]) continue;

        const date = runMs ? new Date(runMs).toISOString().slice(0, 10) : null;
        if (!date) continue;

        // Check if output already exists for any client
        const cronSlug = _extractSlugFromCron(cron.name, clients);
        if (cronSlug) {
          const taskName = slugifyCronName(cron.name, cronSlug);
          const outFile = path.join(BASE, 'brand', cronSlug, 'recurring-tasks', taskName, date + '.json');
          if (fs.existsSync(outFile)) {
            _lastProcessedRuns[key] = true;
            continue; // already saved
          }
        }

        // Extract Discord content from session
        const discordContent = extractDiscordContent(run.sessionId, cron, clients);
        if (!discordContent || discordContent.length === 0) {
          _lastProcessedRuns[key] = true;
          continue;
        }

        for (const { slug, content: text } of discordContent) {
          const taskName = slugifyCronName(cron.name, slug);
          const dir = path.join(BASE, 'brand', slug, 'recurring-tasks', taskName);
          fs.mkdirSync(dir, { recursive: true });
          const outFile = path.join(dir, date + '.json');
          if (fs.existsSync(outFile)) continue; // don't overwrite
          const output = {
            cronId: cron.id,
            cronName: cron.name,
            slug,
            date,
            runAtMs: runMs,
            status: run.status || 'ok',
            durationMs: run.durationMs || null,
            model: run.model || null,
            content: text,
          };
          fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
          saved++;
          console.log(`[cron-output] Saved ${slug}/${taskName}/${date}.json`);
        }
        _lastProcessedRuns[key] = true;
      }
    } catch (e) { console.error('[cron-output] Error processing', cron.id, e.message); }
  }
  if (saved > 0) console.log(`[cron-output] Total saved: ${saved} outputs`);
}

// Start cron output watcher
setTimeout(() => {
  console.log('[cron-output] Initial scan...');
  processCronRuns();
  setInterval(() => processCronRuns(), 30000);
}, 3000);

// ═══════════════════════════════════════════════════════════════
// FILE WATCHER: foundation-state.json → auto pending-review + task sync
// ═══════════════════════════════════════════════════════════════
// When an agent writes to foundation-state.json, this watcher:
// 1. Detects pillar status changes
// 2. Converts "done"/"generated" → "pending-review" (forces user review)
// 3. Syncs pillar status → P00 task status
// 4. Regenerates mc-data.js
// ═══════════════════════════════════════════════════════════════
const foundationWatchers = {};
const foundationStateCache = {}; // slug → previous state snapshot
const PILLAR_TO_TASK_STATUS = {'approved':'completed','done':'completed','in-progress':'in-progress','not-started':'todo','pending-review':'in-progress','generated':'in-progress'};

function watchFoundationState(slug) {
  const stateFile = path.join(BASE, 'brand', slug, 'foundation-state.json');
  if (!fs.existsSync(stateFile) || foundationWatchers[slug]) return;

  // Cache initial state
  try {
    const initial = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    foundationStateCache[slug] = JSON.parse(JSON.stringify(initial));
  } catch { return; }

  let debounceTimer = null;
  foundationWatchers[slug] = fs.watch(stateFile, () => {
    // Debounce: agents may write multiple times in quick succession
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => onFoundationStateChange(slug, stateFile), 1000);
  });
  console.log(`[foundation-watch] Watching ${slug}/foundation-state.json`);
}

function onFoundationStateChange(slug, stateFile) {
  try {
    const newState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const oldState = foundationStateCache[slug] || {};
    let changed = false;

    for (const [secKey, secData] of Object.entries(newState.sections || {})) {
      const oldSec = (oldState.sections || {})[secKey] || {};
      const oldPillars = oldSec.pillars || {};
      const newPillars = secData.pillars || {};

      for (const [pName, pInfo] of Object.entries(newPillars)) {
        const oldStatus = (oldPillars[pName] || {}).status || 'not-started';
        const newStatus = pInfo.status || 'not-started';

        if (oldStatus === newStatus) continue;

        console.log(`[foundation-watch] ${slug}: ${secKey}/${pName} ${oldStatus} → ${newStatus}`);

        // Auto-convert done/generated → pending-review (force user approval)
        if (['done', 'generated'].includes(newStatus) && !['approved', 'pending-review'].includes(oldStatus)) {
          pInfo.status = 'pending-review';
          pInfo.updated_at = new Date().toISOString();
          console.log(`[foundation-watch] ${slug}: ${secKey}/${pName} auto-set to pending-review`);
          changed = true;
        }

        // Sync to P00 tasks
        const effectiveStatus = pInfo.status; // may have been changed to pending-review above
        const taskStatus = PILLAR_TO_TASK_STATUS[effectiveStatus];
        if (taskStatus) {
          syncPillarToTask(slug, secKey, pName, taskStatus);
        }
      }
    }

    // Write back if we changed any statuses (done→pending-review)
    if (changed) {
      // Temporarily stop watching to avoid triggering ourselves
      if (foundationWatchers[slug]) { foundationWatchers[slug].close(); delete foundationWatchers[slug]; }
      safeWriteFoundationState(stateFile, newState);
      // Regenerate mc-data.js
      try { const { execSync } = require('child_process'); execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch (e) { console.error('[foundation-watch] regenerate error:', e.message); }
      // Re-start watcher
      setTimeout(() => watchFoundationState(slug), 500);
    }

    // Update cache
    foundationStateCache[slug] = JSON.parse(JSON.stringify(newState));
  } catch (e) {
    console.error(`[foundation-watch] Error processing ${slug}:`, e.message);
  }
}

function syncPillarToTask(slug, section, pillar, taskStatus) {
  try {
    const projectsDir = path.join(BASE, 'brand', slug, 'projects');
    if (!fs.existsSync(projectsDir)) return;
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('P00'));
    for (const d of dirs) {
      const tf = path.join(projectsDir, d.name, 'tasks.json');
      if (!fs.existsSync(tf)) continue;
      const td = JSON.parse(fs.readFileSync(tf, 'utf-8'));
      const tasks = Array.isArray(td) ? td : (td.tasks || []);
      // Match by pillar name OR by section name (for fast-foundation aggregate task)
      const match = tasks.find(t => t.pillar === pillar || t.pillar === section);
      if (match && match.status !== taskStatus) {
        console.log(`[foundation-watch] ${slug}: task ${match.id} ${match.status} → ${taskStatus}`);
        match.status = taskStatus;
        if (taskStatus === 'completed') match.completed = new Date().toISOString().slice(0, 10);
        const wd = Array.isArray(td) ? tasks : { ...td, tasks };
        fs.writeFileSync(tf, JSON.stringify(wd, null, 2));
      }
    }
  } catch (e) { console.error(`[foundation-watch] syncPillarToTask error:`, e.message); }
}

// Start watchers for all existing clients
try {
  const brandDir = path.join(BASE, 'brand');
  if (fs.existsSync(brandDir)) {
    for (const slug of fs.readdirSync(brandDir).filter(d => fs.statSync(path.join(brandDir, d)).isDirectory())) {
      watchFoundationState(slug);
    }
  }
} catch (e) { console.error('[foundation-watch] Init error:', e.message); }

// Cleanup stale pending requests every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of Object.entries(gwPendingRequests)) {
    if (now - p.ts > 60000) {
      delete gwPendingRequests[id];
    }
  }
}, 60000);
