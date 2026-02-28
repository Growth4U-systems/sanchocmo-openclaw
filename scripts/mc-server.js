const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18790;
const BASE = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const ALLOWED_FILES = [
  'mission-control.html',
  'mc-data.js',
  'clients.js',
  'skills-data.js',
  'agents-data.js',
];

// Directories accessible via /docs/ viewer

// Foundation pillar order (universal — all clients)
const FOUNDATION_ORDER = [
  // 🏢 La Empresa
  { cat: '🏢 La Empresa', folders: ['company-context', 'business-model', 'budget', 'self-intelligence'] },
  // 🎯 OPE Canvas
  { cat: '🎯 OPE Canvas', folders: ['ope-canvas'] },
  // 📊 El Mercado
  { cat: '📊 El Mercado', folders: ['market', 'competitors', 'swot-analysis'] },
  // 👥 Los Clientes
  { cat: '👥 Los Clientes', folders: ['niche-discovery-100x', 'ecp-validation', 'existing-customer-data'] },
  // 🎯 La Marca
  { cat: '🎯 La Marca', folders: ['positioning', 'pricing', 'brand-voice', 'visual-identity'] },
];
const PILLAR_FLAT = FOUNDATION_ORDER.flatMap(g => g.folders);

const DOC_ROOTS = {
  'brand':  path.join(BASE, 'brand'),
  'prds':   path.join(BASE, '_system', 'prds'),
  'skills': path.join(BASE, 'skills'),
  'memory': path.join(BASE, 'memory'),
};

const STYLE = `<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:wght@400;700&display=swap" rel="stylesheet">
<style>
body{font-family:'Comic Neue',cursive;background:#FFFDF9;color:#1A1A2E;max-width:1200px;margin:40px auto;padding:0 40px;line-height:1.85;font-size:17px;}
h1{font-family:'Bangers';font-size:2.2em,cursive;color:#C45D35;}h2{color:#1E3A5F;margin-top:24px;}h3{color:#C45D35;}h4{color:#5D5348;}
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
th{background:#1A1A2E;color:#F5F0E6;font-family:'Bangers',cursive;letter-spacing:0.5px;}
tr:nth-child(even){background:#FDF8EF;}
code{background:#FDF8EF;padding:2px 6px;border-radius:4px;font-size:13px;border:1px solid #D4C9B0;}
pre{background:#FDF8EF;padding:12px;border:2px solid #1A1A2E;border-radius:6px;overflow-x:auto;font-size:13px;}
pre code{border:none;padding:0;}
blockquote{border-left:4px solid #C45D35;margin:12px 0;padding:8px 16px;background:#FDF8EF;font-style:italic;}
</style>`;

function renderMarkdown(md) {
  // Use marked.js loaded in browser for rendering
  // Server-side: return raw markdown wrapped in a div that client-side marked.js will render
  // Since marked.js runs client-side, we pass the raw markdown and render in browser
  // For server-side rendering, use a simple but robust approach:
  
  // Protect code blocks
  const codeBlocks = [];
  let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim()}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });
  
  // Return markdown in a special div that will be rendered client-side by marked.js
  // But also include a noscript fallback
  const escaped = processed.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  
  // Restore code blocks in escaped version
  let result = escaped.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => codeBlocks[i]);
  
  // Actually, let's do server-side with marked since it's simpler
  // We'll pass raw md to the browser and render there
  return `<div class="md-raw" style="display:none;">${md.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div><div class="md-rendered"></div>
<script>
if (typeof marked !== 'undefined') {
  const raw = document.querySelector('.md-raw');
  const rendered = document.querySelector('.md-rendered');
  if (raw && rendered) {
    marked.setOptions({ breaks: true, gfm: true });
    rendered.innerHTML = marked.parse(raw.textContent);
    raw.style.display = 'none';
    // Style links
    rendered.querySelectorAll('a').forEach(a => { a.style.color = '#C45D35'; a.target = '_blank'; });
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
<style>#edit-area{width:100%;min-height:75vh;font-family:'Comic Neue',monospace;font-size:14px;padding:12px;border:2px solid var(--ink,#1A1A2E);border-radius:6px;background:var(--paper,#FDF8EF);resize:vertical;line-height:1.6;}
.edit-bar{display:flex;gap:10px;align-items:center;margin:10px 0;}.edit-btn{padding:6px 14px;background:var(--paper,#FDF8EF);border:2px solid var(--ink,#1A1A2E);border-radius:6px;cursor:pointer;font-family:'Comic Neue',cursive;font-weight:700;font-size:14px;box-shadow:2px 2px 0 var(--ink,#1A1A2E);}.edit-btn:hover{background:var(--rust,#C45D35);color:var(--paper,#FDF8EF);}</style>
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
  const files = entries.filter(f => f.endsWith('.md')).sort();

  // Detect if this is a brand/{slug} level (pillar listing)
  const isBrandClient = opts.brandPillars || false;

  let html = '';

  if (isBrandClient) {
    // Load foundation-state.json for pillar statuses
    let fState = {};
    try {
      const stateFile = path.join(dirPath, 'foundation-state.json');
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      fState = stateData.pillars || {};
    } catch {}

    const existing = new Set(allDirs);
    for (const group of FOUNDATION_ORDER) {
      html += `<h2 style="margin:24px 0 10px;font-family:'Bangers',cursive;font-size:1.4em;color:#C45D35;">${group.cat}</h2>\n`;
      for (const d of group.folders) {
        const pillarStatus = (fState[d] || {}).status || 'not-started';
        if (existing.has(d)) {
          existing.delete(d);
          const subFiles = (() => { try { return fs.readdirSync(path.join(dirPath, d)).filter(f => f.endsWith('.md')).length; } catch { return 0; } })();
          if (pillarStatus === 'approved') {
            html += `<div class="card"><a href="${urlPrefix}${d}/">✅ ${d}</a><div class="meta">${subFiles} documentos · Validado</div></div>\n`;
          } else {
            html += `<div class="card" style="border-left:4px solid #E5A100;"><a href="${urlPrefix}${d}/">⚠️ ${d}</a><div class="meta" style="color:#B8860B;">${subFiles} documentos · Pendiente de validar</div></div>\n`;
          }
        } else {
          html += `<div class="card" style="opacity:0.45;"><span>⬜ ${d}</span><div class="meta">No existe</div></div>\n`;
        }
      }
    }
    // Any remaining dirs not in Foundation order
    const remaining = [...existing].sort();
    if (remaining.length) {
      html += `<h2 style="margin:24px 0 10px;font-family:'Bangers',cursive;font-size:1.4em;color:#C45D35;">📁 Otros</h2>\n`;
      for (const d of remaining) {
        const subFiles = (() => { try { return fs.readdirSync(path.join(dirPath, d)).filter(f => f.endsWith('.md')).length; } catch { return 0; } })();
        html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
      }
    }
  } else {
    // Default alphabetical listing
    const dirs = allDirs.sort();
    for (const d of dirs) {
      const subFiles = (() => { try { return fs.readdirSync(path.join(dirPath, d)).filter(f => f.endsWith('.md')).length; } catch { return 0; } })();
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

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.startsWith('/mc/')) url = url.slice(3);
  if (url === '/' || url === '/mc') url = '/mission-control.html';

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
    if (!path.resolve(fullPath).startsWith(path.resolve(rootPath)) || !fullPath.endsWith('.md') || subPath.includes('..')) {
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

  // === API: save integration ===
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

  // === Doc Viewer: /docs/ ===
  if (url === '/docs' || url === '/docs/') {
    const nav = Object.keys(DOC_ROOTS).map(k => {
      const icons = { brand: '🏷️', prds: '📋', skills: '⚡', memory: '🧠' };
      return `<a href="/mc/docs/${k}/">${icons[k] || '📂'} ${k}</a>`;
    }).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Documentos', '<a class="back" href="/mc#">← Mission Control</a>', `<h1>📚 Documentos</h1><div class="nav">${nav}</div>`));
    return;
  }

  if (url.startsWith('/docs/')) {
    const rest = url.replace('/docs/', '');
    const parts = rest.split('/').filter(Boolean);
    const rootKey = parts[0];
    
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
        const prettyRoot = rootKey.charAt(0).toUpperCase() + rootKey.slice(1);
        const prettyPath = subPath ? subPath.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : prettyRoot;
        const backUrl = subParts.length > 0 ? `/mc/docs/${rootKey}/${subParts.slice(0, -1).join('/')}/` : '/mc/docs/';
        const backLabel = subParts.length > 0 ? `← ${subParts.slice(0, -1).pop() || prettyRoot}` : '← Documentos';
        // Pass brandPillars:true when listing brand/{slug} (pillar level)
        const isBrandSlug = rootKey === 'brand' && subParts.length === 1;
        const content = listDir(fullPath, `/mc/docs/${rootKey}/${subPath ? subPath + '/' : ''}`, { brandPillars: isBrandSlug });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page(prettyPath, `<a class="back" href="${backUrl}">${backLabel}</a>`, `<h1>📂 ${prettyPath}</h1>${content}`));
        return;
      }
      
      if (stat.isFile() && fullPath.endsWith('.md')) {
        const md = fs.readFileSync(fullPath, 'utf-8');
        const html = renderMarkdown(md);
        const fileName = path.basename(fullPath, '.md');
        const backUrl = `/mc/docs/${rootKey}/${subParts.slice(0, -1).join('/')}/`;
        const backLabel = subParts.length > 1 ? subParts.slice(-2, -1)[0] : rootKey;
        const rawEscaped = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page(fileName, `<a class="back" href="${backUrl}">← ${backLabel}</a>`, `<div>${html}</div>`, { editable: true, rawMd: rawEscaped }));
        return;
      }
      
      res.writeHead(403); res.end('Not a viewable file');
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // === Legacy /brand/ redirect to /docs/brand/ ===
  if (url.startsWith('/brand/') || url === '/brand') {
    const rest = url.replace('/brand', '/docs/brand');
    res.writeHead(301, { 'Location': '/mc' + rest });
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
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filename);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mission Control server on http://127.0.0.1:${PORT}`);
});
